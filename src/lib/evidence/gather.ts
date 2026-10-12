import type { Keys } from "../config";
import type { FetchLike } from "../groq";
import { isRelevant, searchQuery, shortQuery } from "../text";
import { isFactChecker } from "../trusted";
import type { Evidence } from "../types";
import { type Found, searchFactCheck, searchNews, searchTavily } from "./sources";

export const MAX_EVIDENCE = 8;

export interface GatherResult {
  evidence: Evidence[];
  /** names of the sources that answered */
  used: string[];
  errors: string[];
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** On-topic first, then fact-checks, trusted sources and fact-checker headlines; duplicates removed. */
export function rankEvidence(found: Found[], limit = MAX_EVIDENCE, query = ""): Evidence[] {
  const weight = (item: Found): number =>
    (query && isRelevant(`${item.title} ${item.snippet ?? ""}`, query) ? 5 : 0) +
    (item.source === "factcheck" ? 4 : 0) +
    (item.trusted ? 2 : 0) +
    (isFactChecker(item.url) || isFactChecker(item.publisher) ? 1 : 0);
  const seen = new Set<string>();
  return found
    .map((item, order) => ({ item, order, weight: weight(item) }))
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .filter(({ item }) => {
      const key = normalizeTitle(item.title);
      if (seen.has(key) || seen.has(item.url)) return false;
      seen.add(key);
      seen.add(item.url);
      return true;
    })
    .slice(0, limit)
    .map(({ item }, index) => ({ ...item, id: index + 1 }));
}

/** Ask every available source at once; one failing source never sinks the others. */
export async function gatherEvidence(rawQuery: string, keys: Keys, fetchImpl: FetchLike = fetch): Promise<GatherResult> {
  const query = searchQuery(rawQuery);
  const jobs: { name: string; run: () => Promise<Found[]> }[] = [
    ...(keys.factCheck ? [{ name: "Google Fact Check", run: () => searchFactCheck(query, keys.factCheck as string, fetchImpl) }] : []),
    { name: "Google News", run: () => searchNews(query, fetchImpl) },
    { name: "Google News (fact-checks)", run: () => searchNews(`${shortQuery(query)} fact check`, fetchImpl) },
    ...(shortQuery(query) !== query ? [{ name: "Google News (short)", run: () => searchNews(shortQuery(query), fetchImpl) }] : []),
    ...(keys.tavily ? [{ name: "Tavily", run: () => searchTavily(query, keys.tavily as string, fetchImpl) }] : []),
  ];
  const settled = await Promise.allSettled(jobs.map((job) => job.run()));
  const used: string[] = [];
  const errors: string[] = [];
  const found: Found[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      used.push(jobs[i].name);
      found.push(...outcome.value);
    } else {
      errors.push(`${jobs[i].name}: ${outcome.reason instanceof Error ? outcome.reason.message : "failed"}`);
    }
  });
  return { evidence: rankEvidence(found, MAX_EVIDENCE, query), used: [...new Set(used.map((n) => n.replace(/ \(.*\)$/, "")))], errors };
}
