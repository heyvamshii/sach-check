import { describe, expect, it } from "vitest";
import { fakeFetch } from "../testUtils";
import { gatherEvidence, rankEvidence } from "./gather";
import { decodeEntities, type Found, parseFactCheck, parseNewsRss, parseTavily, searchFactCheck, searchNews, searchTavily } from "./sources";

const RSS = `<?xml version="1.0"?><rss><channel><title>x</title>
<item><title>RBI’s new Rs 2000 notes do not have a Nano-GPS chip - The Indian Express</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Wed, 09 Nov 2016 08:00:00 GMT</pubDate><source url="https://indianexpress.com">The Indian Express</source></item>
<item><title>Tom &amp; Jerry chip &#39;rumour&#39; - Random Blog</title><link>https://news.google.com/rss/articles/def</link><pubDate>not a date</pubDate><source url="https://randomblog.example">Random Blog</source></item>
<item><title></title><link>https://x</link></item>
</channel></rss>`;

describe("parseNewsRss", () => {
  it("reads headline, publisher, date and trust from Google News", () => {
    const items = parseNewsRss(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ source: "news", title: "RBI’s new Rs 2000 notes do not have a Nano-GPS chip", publisher: "The Indian Express", date: "2016-11-09", trusted: true });
    expect(items[1]).toMatchObject({ title: "Tom & Jerry chip 'rumour'", trusted: false, date: undefined });
  });

  it("decodes entities and CDATA", () => {
    expect(decodeEntities("<![CDATA[a &amp; b]]> &#8377;")).toBe("a & b ₹");
  });
});

describe("parseFactCheck", () => {
  it("flattens claim reviews and skips ones without a link", () => {
    const items = parseFactCheck({
      claims: [
        {
          text: "2000 note has GPS chip",
          claimReview: [
            { publisher: { name: "PIB Fact Check" }, url: "https://pib.gov.in/x", title: "Fake GPS chip claim", textualRating: "Fake", reviewDate: "2016-11-10T00:00:00Z" },
            { publisher: { site: "altnews.in" }, url: "https://altnews.in/y", textualRating: "False" },
            { title: "no url" },
          ],
        },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ source: "factcheck", publisher: "PIB Fact Check", rating: "Fake", date: "2016-11-10", trusted: true });
    expect(items[1]).toMatchObject({ publisher: "altnews.in", title: "2000 note has GPS chip" });
    expect(parseFactCheck({})).toEqual([]);
  });
});

describe("parseTavily", () => {
  it("maps web results and marks trusted domains", () => {
    const items = parseTavily({
      results: [
        { title: "WHO myth busters", url: "https://www.who.int/myths", content: "Hot water does not kill the virus", published_date: "2020-03-01T00:00" },
        { title: "Blog", url: "https://blog.example/a" },
        { url: "https://no-title.example" },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ source: "web", publisher: "who.int", trusted: true, date: "2020-03-01" });
    expect(items[1].trusted).toBe(false);
  });
});

describe("search functions", () => {
  it("call the right endpoints and throw on HTTP errors", async () => {
    const fetchImpl = fakeFetch([
      { match: (u) => u.includes("factchecktools"), respond: () => Response.json({ claims: [] }) },
      { match: (u) => u.includes("news.google.com"), respond: () => new Response(RSS) },
      { match: (u) => u.includes("tavily"), respond: () => new Response("quota", { status: 432 }) },
    ]);
    await expect(searchFactCheck("q", "KEY", fetchImpl)).resolves.toEqual([]);
    expect(fetchImpl.calls[0]).toContain("key=KEY");
    await expect(searchNews("2000 chip", fetchImpl)).resolves.toHaveLength(2);
    expect(fetchImpl.calls[1]).toContain("gl=IN");
    await expect(searchTavily("q", "KEY", fetchImpl)).rejects.toThrow("Tavily HTTP 432");
  });
});

describe("rankEvidence", () => {
  const item = (title: string, extra: Partial<Found> = {}): Found => ({ source: "news", title, url: `https://x.example/${title}`, publisher: "X", trusted: false, ...extra });

  it("puts fact-checks first, then trusted sources, removes duplicates and numbers them", () => {
    const ranked = rankEvidence([
      item("Plain news"),
      item("Trusted news", { trusted: true }),
      item("Trusted  news!", { trusted: true }),
      item("Fact check", { source: "factcheck", trusted: true }),
    ]);
    expect(ranked.map((e) => [e.id, e.title])).toEqual([
      [1, "Fact check"],
      [2, "Trusted news"],
      [3, "Plain news"],
    ]);
  });

  it("respects the limit", () => {
    expect(rankEvidence(Array.from({ length: 20 }, (_, i) => item(`n${i}`)), 5)).toHaveLength(5);
  });
});

describe("gatherEvidence", () => {
  it("uses only keyless sources when there are no keys, and survives a failing source", async () => {
    let call = 0;
    const fetchImpl = fakeFetch([{ match: (u) => u.includes("news.google.com"), respond: () => (call++ === 0 ? new Response(RSS) : new Response("down", { status: 503 })) }]);
    const result = await gatherEvidence("2000 note chip", {}, fetchImpl);
    expect(result.used).toEqual(["Google News"]);
    expect(result.errors).toHaveLength(1);
    expect(result.evidence).toHaveLength(2);
    expect(fetchImpl.calls.some((u) => u.includes("factchecktools") || u.includes("tavily"))).toBe(false);
  });

  it("adds the keyed sources when keys are set", async () => {
    const fetchImpl = fakeFetch([
      { match: (u) => u.includes("factchecktools"), respond: () => Response.json({ claims: [{ text: "c", claimReview: [{ url: "https://pib.gov.in/a", textualRating: "Fake" }] }] }) },
      { match: (u) => u.includes("news.google.com"), respond: () => new Response("<rss></rss>") },
      { match: (u) => u.includes("tavily"), respond: () => Response.json({ results: [{ title: "t", url: "https://who.int/t" }] }) },
    ]);
    const result = await gatherEvidence("q", { factCheck: "k1", tavily: "k2" }, fetchImpl);
    expect(result.used).toEqual(["Google Fact Check", "Google News", "Tavily"]);
    expect(result.evidence[0].source).toBe("factcheck");
  });
});

describe("rankEvidence with a query", () => {
  it("puts on-topic results above off-topic trusted ones", () => {
    const off: Found = { source: "web", title: "Auction regime of Odisha mines", url: "https://mines.gov.in/a", publisher: "mines.gov.in", trusted: true };
    const on: Found = { source: "news", title: "Rs 2000 note has no GPS chip", url: "https://x.example/b", publisher: "Blog", trusted: false };
    expect(rankEvidence([off, on], 8, "Rs 2000 note GPS chip")[0].title).toBe("Rs 2000 note has no GPS chip");
  });
});
