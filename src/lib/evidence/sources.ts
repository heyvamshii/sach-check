import type { FetchLike } from "../groq";
import { hostOf, isTrustedPublisher, isTrustedUrl, TRUSTED_DOMAINS } from "../trusted";
import type { Evidence } from "../types";

/** Step 3 (Model 3, search half): free evidence sources. Each returns [] on failure; ids are assigned later. */

export type Found = Omit<Evidence, "id">;

const TIMEOUT_MS = 10_000;

// ---------- Google Fact Check Tools API (free key) ----------

interface ClaimReview {
  publisher?: { name?: string; site?: string };
  url?: string;
  title?: string;
  reviewDate?: string;
  textualRating?: string;
}

interface FactCheckResponse {
  claims?: { text?: string; claimant?: string; claimReview?: ClaimReview[] }[];
}

export function parseFactCheck(body: FactCheckResponse): Found[] {
  return (body.claims ?? []).flatMap((claim) =>
    (claim.claimReview ?? []).flatMap((review): Found[] => {
      if (!review.url) return [];
      const publisher = review.publisher?.name || review.publisher?.site || hostOf(review.url);
      return [
        {
          source: "factcheck",
          title: review.title || claim.text || "Fact-check",
          url: review.url,
          publisher,
          rating: review.textualRating,
          date: review.reviewDate?.slice(0, 10),
          snippet: claim.text ? `Claim reviewed: ${claim.text}`.slice(0, 300) : undefined,
          trusted: true,
        },
      ];
    }),
  );
}

export async function searchFactCheck(query: string, apiKey: string, fetchImpl: FetchLike = fetch): Promise<Found[]> {
  const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("key", apiKey);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Fact Check API HTTP ${response.status}`);
  return parseFactCheck((await response.json()) as FactCheckResponse);
}

// ---------- Google News RSS (no key needed) ----------

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

export function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (match, code: string) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    });
}

function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decodeEntities(match[1]).trim() : "";
}

export function parseNewsRss(xml: string, limit = 8): Found[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, limit).flatMap((item): Found[] => {
    const rawTitle = tag(item, "title");
    const link = tag(item, "link");
    if (!rawTitle || !link) return [];
    const publisher = tag(item, "source") || rawTitle.split(" - ").pop() || "News";
    const sourceUrl = item.match(/<source url="([^"]+)"/)?.[1] ?? "";
    const title = rawTitle.endsWith(` - ${publisher}`) ? rawTitle.slice(0, -(publisher.length + 3)) : rawTitle;
    const pubDate = tag(item, "pubDate");
    const date = pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString().slice(0, 10) : undefined;
    return [
      {
        source: "news",
        title,
        url: link,
        publisher,
        date,
        trusted: isTrustedPublisher(publisher) || (sourceUrl ? isTrustedUrl(sourceUrl) : false),
      },
    ];
  });
}

export async function searchNews(query: string, fetchImpl: FetchLike = fetch): Promise<Found[]> {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-IN");
  url.searchParams.set("gl", "IN");
  url.searchParams.set("ceid", "IN:en");
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SachCheck student project)" },
  });
  if (!response.ok) throw new Error(`Google News HTTP ${response.status}`);
  return parseNewsRss(await response.text());
}

// ---------- Tavily web search (free tier key) ----------

interface TavilyResponse {
  results?: { title?: string; url?: string; content?: string; published_date?: string }[];
}

export function parseTavily(body: TavilyResponse): Found[] {
  return (body.results ?? []).flatMap((result): Found[] => {
    if (!result.url || !result.title) return [];
    return [
      {
        source: "web",
        title: result.title,
        url: result.url,
        publisher: hostOf(result.url),
        snippet: result.content?.slice(0, 400),
        date: result.published_date?.slice(0, 10),
        trusted: isTrustedUrl(result.url),
      },
    ];
  });
}

export async function searchTavily(query: string, apiKey: string, fetchImpl: FetchLike = fetch): Promise<Found[]> {
  const response = await fetchImpl("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 6, include_domains: TRUSTED_DOMAINS }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`);
  return parseTavily((await response.json()) as TavilyResponse);
}
