/**
 * Measures the link checker on 40 labelled messages (20 scam links, 20 real official/news links).
 * Scores (1) finding the links inside the text and (2) the rule-based verdict, which needs no
 * keys and no network, so the numbers are exactly repeatable.
 *
 * Part 2 is an independent real-world test the rules were not written against:
 *  - live phishing links from the public OpenPhish feed (we only read the list, never open the sites)
 *  - the 300 most popular real websites from the Tranco list (data/tranco-top300.txt, tranco-list.eu)
 *
 * Run:  npx tsx scripts/eval-links.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findLinks } from "../src/lib/links/extract";
import { analyzeLink } from "../src/lib/links/rules";

interface LabelledMessage {
  id: number;
  label: "scam" | "safe";
  links: string[];
  text: string;
}

const ROOT = join(import.meta.dirname, "..");
const messages = JSON.parse(readFileSync(join(ROOT, "data", "links.json"), "utf8")) as LabelledMessage[];

const flagged = (verdict: string) => verdict === "Dangerous" || verdict === "Suspicious";

const rows = messages.map((m) => {
  const found = findLinks(m.text);
  const foundAll = m.links.every((l) => found.some((f) => f.raw === l)) && found.length === m.links.length;
  const verdict = found[0] ? analyzeLink(found[0].url, m.text).verdict : "none";
  const correct = m.label === "scam" ? flagged(verdict) : !flagged(verdict);
  if (!correct || !foundAll) console.log(`✗ #${m.id} ${m.label} -> ${verdict}${foundAll ? "" : ` (found ${found.map((f) => f.raw).join(", ")})`}`);
  return { id: m.id, label: m.label, verdict, correct, foundAll };
});

const scams = rows.filter((r) => r.label === "scam");
const safes = rows.filter((r) => r.label === "safe");
async function realWorld() {
  const PHISHING_FEED = "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt";
  let phishing: string[] = [];
  try {
    const response = await fetch(PHISHING_FEED, { signal: AbortSignal.timeout(30_000) });
    phishing = (await response.text()).split(/\r?\n/).filter((u) => /^https?:\/\//.test(u));
  } catch {
    console.log("OpenPhish feed unreachable; skipping the real-world phishing test");
  }
  const popular = readFileSync(join(ROOT, "data", "tranco-top300.txt"), "utf8").split(/\r?\n/).filter(Boolean);
  const verdictOf = (url: string) => {
    try {
      return analyzeLink(url, "").verdict;
    } catch {
      return "invalid";
    }
  };
  const phishingVerdicts = phishing.map(verdictOf).filter((v) => v !== "invalid");
  const popularVerdicts = popular.map((d) => verdictOf(`https://${d}/`));
  return {
    phishingTotal: phishingVerdicts.length,
    phishingFlagged: phishingVerdicts.filter(flagged).length,
    popularTotal: popularVerdicts.length,
    popularWronglyFlagged: popularVerdicts.filter(flagged).length,
    popularFlaggedExamples: popular.filter((_, i) => flagged(popularVerdicts[i])).slice(0, 10),
  };
}

async function main() {
const summary = {
  method: "Link rules only (no keys, no network): look-alike names, fake official sites, bait words, risky endings, IP addresses, '@' tricks",
  messages: rows.length,
  linksFound: rows.filter((r) => r.foundAll).length,
  scamsFlagged: scams.filter((r) => flagged(r.verdict)).length,
  scamsTotal: scams.length,
  scamsDangerous: scams.filter((r) => r.verdict === "Dangerous").length,
  safeCleared: safes.filter((r) => !flagged(r.verdict)).length,
  safeTotal: safes.length,
  safeRecognisedAsOfficial: safes.filter((r) => r.verdict === "Safe").length,
  accuracy: Number((rows.filter((r) => r.correct).length / rows.length).toFixed(2)),
  realWorld: await realWorld(),
  rows,
  generatedAt: new Date().toISOString().slice(0, 10),
};

mkdirSync(join(ROOT, "public", "data"), { recursive: true });
writeFileSync(join(ROOT, "public", "data", "eval-links.json"), JSON.stringify(summary, null, 2));
console.log({ ...summary, rows: undefined });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
