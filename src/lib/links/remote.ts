import type { FetchLike } from "../groq";
import { tokens } from "../text";
import { isShortener } from "./domains";

/** Network checks for links. Each one fails softly: a failure means "no extra information", never a crash. */

const TIMEOUT_MS = 8_000;
const MAX_HOPS = 3;

/**
 * Where does a shortened link (bit.ly/...) really go? We only ever contact the shortening
 * services themselves and read their redirect header; we never open the destination site,
 * so a malicious link can't make our server visit it.
 */
export async function expandShortLink(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const parsed = new URL(current);
    if (!isShortener(parsed.hostname) || !/^https?:$/.test(parsed.protocol)) return hop === 0 ? null : current;
    const response = await fetchImpl(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return hop === 0 ? null : current;
    const next = new URL(location, current);
    // only follow web addresses; a javascript:, data: or file: target ends the trail here
    if (next.protocol !== "https:" && next.protocol !== "http:") return hop === 0 ? null : current;
    current = next.toString();
  }
  return current;
}

export type SafeBrowsingResult = { status: "ok"; threats: Map<string, string> } | { status: "off" | "error"; threats: Map<string, string> };

const THREAT_LABELS: Record<string, string> = {
  MALWARE: "malware",
  SOCIAL_ENGINEERING: "phishing / scam",
  UNWANTED_SOFTWARE: "unwanted software",
  POTENTIALLY_HARMFUL_APPLICATION: "harmful app",
};

/** Google Safe Browsing: Google's list of known phishing and malware sites (free key). */
export async function checkSafeBrowsing(urls: string[], apiKey: string, fetchImpl: FetchLike = fetch): Promise<SafeBrowsingResult> {
  const response = await fetchImpl("https://safebrowsing.googleapis.com/v4/threatMatches:find", {
    method: "POST",
    // key in a header, not the URL, so it can't end up in request logs
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      client: { clientId: "sachcheck", clientVersion: "1.0" },
      threatInfo: {
        threatTypes: Object.keys(THREAT_LABELS),
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: urls.map((url) => ({ url })),
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 403 = the Safe Browsing API isn't switched on for this Google Cloud project yet
  if (response.status === 403) return { status: "off", threats: new Map() };
  if (!response.ok) return { status: "error", threats: new Map() };
  const body = (await response.json()) as { matches?: { threatType?: string; threat?: { url?: string } }[] };
  const threats = new Map<string, string>();
  for (const match of body.matches ?? []) {
    if (match.threat?.url) threats.set(match.threat.url, THREAT_LABELS[match.threatType ?? ""] ?? "unsafe");
  }
  return { status: "ok", threats };
}

const PAGE_EXCERPT_CHARS = 1800;

/** Turn a page's markdown into plain text and keep the paragraphs that talk about the message's topic. */
export function relevantExcerpt(content: string, message: string, maxChars = PAGE_EXCERPT_CHARS): string {
  const clean = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`|]+/g, " ");
  const wanted = tokens(message);
  const paragraphs = clean
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.split(" ").length >= 6);
  const scored = paragraphs.map((p, index) => ({ p, index, score: [...tokens(p)].filter((w) => wanted.has(w)).length }));
  // the opening paragraph usually carries the announcement itself, so it always goes in first
  const ranked = [...scored].sort((a, b) => (a.index === 0 ? -1 : b.index === 0 ? 1 : b.score - a.score || a.index - b.index));
  const picked: typeof scored = [];
  let length = 0;
  for (const item of ranked) {
    if (length + item.p.length > maxChars) continue;
    picked.push(item);
    length += item.p.length;
  }
  // back in page order, so it reads naturally
  return picked
    .sort((a, b) => a.index - b.index)
    .map((item) => item.p)
    .join("\n")
    .slice(0, maxChars);
}

/** Read pages through Tavily (their servers fetch the page, not ours). Returns url -> page text. */
export async function readPages(urls: string[], apiKey: string, fetchImpl: FetchLike = fetch): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  if (urls.length === 0) return pages;
  const response = await fetchImpl("https://api.tavily.com/extract", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Tavily extract HTTP ${response.status}`);
  const body = (await response.json()) as { results?: { url?: string; raw_content?: string }[] };
  for (const result of body.results ?? []) {
    if (result.url && result.raw_content) pages.set(result.url, result.raw_content);
  }
  return pages;
}
