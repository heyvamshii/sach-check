import { describe, expect, it } from "vitest";
import { DeadlineError, withDeadline } from "./deadline";
import { decodeEntities } from "./evidence/sources";
import { clientIp, fail, ok, readJson } from "./http";
import { createRateLimiter } from "./rateLimit";
import { downloadFile, formatReply, isStartCommand, parseUpdate, safeEqual, sendMessage } from "./telegram";
import { fakeFetch, groqReply } from "./testUtils";
import { hostOf, isFactChecker, isTrustedPublisher, isTrustedUrl } from "./trusted";
import type { CheckResult } from "./types";
import { parseJudgement } from "./verdict";
import { dataUrlBytes, isImageDataUrl, readImageText } from "./vision";

describe("trusted sources", () => {
  it("recognises trusted domains, subdomains and publisher names", () => {
    expect(isTrustedUrl("https://www.thehindu.com/news/x")).toBe(true);
    expect(isTrustedUrl("https://factcheck.pib.gov.in/x")).toBe(true);
    expect(isTrustedUrl("https://notthehindu.com/x")).toBe(false);
    expect(isTrustedUrl("not a url")).toBe(false);
    expect(isTrustedPublisher("The Indian Express")).toBe(true);
    expect(isTrustedPublisher("Random Blog")).toBe(false);
    expect(isFactChecker("https://www.altnews.in/a")).toBe(true);
    expect(isFactChecker("BOOM Live")).toBe(true);
    expect(hostOf("https://www.who.int/x")).toBe("who.int");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([limiter.check("a", 0), limiter.check("a", 1), limiter.check("a", 2), limiter.check("b", 2), limiter.check("a", 1001)]).toEqual([true, true, false, true, true]);
  });
});

describe("http helpers", () => {
  it("wraps responses in the standard envelope", async () => {
    await expect(ok({ a: 1 }).json()).resolves.toEqual({ success: true, data: { a: 1 }, error: null });
    const failed = fail(400, "bad");
    expect(failed.status).toBe(400);
    await expect(failed.json()).resolves.toEqual({ success: false, data: null, error: "bad" });
  });

  it("reads the client IP and tolerates bad JSON", async () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x"))).toBe("local");
    await expect(readJson(new Request("http://x", { method: "POST", body: "{bad" }))).resolves.toBeUndefined();
  });
});

describe("vision", () => {
  it("validates image data URLs and estimates size", () => {
    expect(isImageDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isImageDataUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(dataUrlBytes("data:image/png;base64,AAAA")).toBe(3);
  });

  it("returns an empty string when the model sees no text", async () => {
    const fetchImpl = fakeFetch([{ match: () => true, respond: () => groqReply("NO_TEXT") }]);
    await expect(readImageText("data:image/png;base64,AAAA", "k", ["vision"], fetchImpl)).resolves.toEqual({ text: "", model: "vision" });
  });
});

describe("telegram", () => {
  it("picks the text and the largest photo from a message", () => {
    const parsed = parseUpdate({
      message: {
        chat: { id: 7 },
        caption: "check this",
        photo: [
          { file_id: "small", width: 90, height: 90 },
          { file_id: "big", width: 1280, height: 960 },
        ],
      },
    });
    expect(parsed).toEqual({ chatId: 7, text: "check this", fileId: "big" });
    expect(parseUpdate({ message: { chat: { id: 1 }, document: { file_id: "d", mime_type: "image/png" } } })?.fileId).toBe("d");
    expect(parseUpdate({ message: { chat: { id: 1 } } })).toBeNull();
    expect(parseUpdate({})).toBeNull();
  });

  it("formats a plain-text reply with verdict, sources and image signals", () => {
    const check: CheckResult = {
      results: [
        {
          claim: { text: "₹2000 note has a GPS chip", query: "q", category: "financial" },
          verdict: "False",
          confidence: "high",
          explanation: "PIB says it's fake.",
          citations: [1],
          evidence: [{ id: 1, source: "factcheck", title: "t", url: "https://pib.gov.in/x", publisher: "PIB", trusted: true }],
        },
      ],
      steps: [],
      warnings: [],
    };
    const reply = formatReply(check, { level: "Medium", points: 1, signals: [{ kind: "warning", text: "Edited with Snapseed." }] });
    expect(reply).toContain("❌ FALSE (high confidence)");
    expect(reply).toContain("• PIB: https://pib.gov.in/x");
    expect(reply).toContain("Image suspicion: MEDIUM");
    expect(formatReply({ results: [], steps: [], warnings: [] }, null)).toContain("couldn't find a checkable claim");
  });

  it("compares secrets safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });

  it("sends messages and downloads files through the Bot API", async () => {
    const fetchImpl = fakeFetch([
      { match: (u) => u.includes("/sendMessage"), respond: () => Response.json({ ok: true }) },
      { match: (u) => u.includes("/getFile"), respond: () => Response.json({ result: { file_path: "photos/a.jpg", file_size: 3 } }) },
      { match: (u) => u.includes("/file/bot"), respond: () => new Response(new Uint8Array([1, 2, 3])) },
    ]);
    await sendMessage("T", 1, "hi", fetchImpl);
    await expect(downloadFile("T", "id", fetchImpl)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    const tooBig = fakeFetch([{ match: () => true, respond: () => Response.json({ result: { file_path: "p", file_size: 99_000_000 } }) }]);
    await expect(downloadFile("T", "id", tooBig)).rejects.toThrow("too large");
  });
});

describe("safeguards from code review", () => {
  it("withDeadline rejects slow work and passes fast work through", async () => {
    await expect(withDeadline(new Promise((r) => setTimeout(() => r("late"), 50)), 5)).rejects.toBeInstanceOf(DeadlineError);
    await expect(withDeadline(Promise.resolve("fast"), 50)).resolves.toBe("fast");
  });

  it("recognises /start in its Telegram variants", () => {
    expect(["/start", "/start@SachCheckBot", "/help now"].map(isStartCommand)).toEqual([true, true, true]);
    expect(isStartCommand("/started a rumour")).toBe(false);
  });

  it("doesn't let a bad numeric entity break a whole news feed", () => {
    expect(decodeEntities("a &#9999999999; b")).toBe("a &#9999999999; b");
  });

  it("strips links out of the judge's explanation", () => {
    const judged = parseJudgement({ verdict: "False", explanation: "Fake. Claim prize at https://evil.example/x or www.evil.example now" }, []);
    expect(judged.explanation).toBe("Fake. Claim prize at or now");
  });
});
