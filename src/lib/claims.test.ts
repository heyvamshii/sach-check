import { describe, expect, it } from "vitest";
import { cleanForward, extractClaimsAi, extractClaimsBasic, mergeContinuations, parseClaimsJson, splitSentences, toQuery, unwrapLines } from "./claims";
import { bodyOf, fakeFetch, groqReply } from "./testUtils";

describe("cleanForward", () => {
  it("removes WhatsApp boilerplate, links, emojis and share requests", () => {
    const text = "Forwarded many times\n*BREAKING* 🔥 RBI will ban ₹10 coins from Monday. Please share with all groups!\nhttps://bit.ly/x\nJai Hind";
    const cleaned = cleanForward(text);
    expect(cleaned).toContain("RBI will ban ₹10 coins from Monday.");
    expect(cleaned).not.toMatch(/Forwarded|https|🔥|Jai Hind|share with/i);
  });
});

describe("splitSentences", () => {
  it("splits on full stops, Hindi danda and new lines, dropping fragments", () => {
    expect(splitSentences("RBI will ban coins from Monday. Ok.\nबैंक कल से बंद रहेंगे पूरे हफ्ते। हाँ")).toEqual([
      "RBI will ban coins from Monday.",
      "बैंक कल से बंद रहेंगे पूरे हफ्ते।",
    ]);
  });
});

describe("mergeContinuations", () => {
  it("attaches follow-on sentences to the claim they describe", () => {
    expect(mergeContinuations(["The note has a chip.", "It can be tracked anywhere.", "Banks are closed."])).toEqual([
      "The note has a chip. It can be tracked anywhere.",
      "Banks are closed.",
    ]);
  });
});

describe("toQuery", () => {
  it("keeps keywords and drops filler words", () => {
    expect(toQuery("The new ₹2000 note has a GPS nano chip inside!")).toBe("new ₹2000 note gps nano chip inside");
  });
});

describe("extractClaimsBasic", () => {
  it("returns the most claim-like sentence first and merges continuations", () => {
    const claims = extractClaimsBasic(
      "Good morning friends! The new ₹2000 note has a GPS nano chip inside. It can be tracked 120 metres underground. Please share with all groups 🙏",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].text).toBe("The new ₹2000 note has a GPS nano chip inside. It can be tracked 120 metres underground.");
    expect(claims[0].query).toBe("new ₹2000 note gps nano chip inside");
  });

  it("falls back to the whole cleaned text when there are no full sentences", () => {
    expect(extractClaimsBasic("free laptops")).toEqual([{ text: "free laptops", query: "free laptops" }]);
  });

  it("returns nothing for pure noise", () => {
    expect(extractClaimsBasic("🙏🙏🙏\nForwarded many times")).toEqual([]);
  });
});

describe("parseClaimsJson", () => {
  it("keeps valid claims, fills a missing query and caps the count", () => {
    const claims = parseClaimsJson({
      claims: [{ text: " RBI bans ₹10 coins ", query: "RBI ban 10 rupee coins" }, { text: "Hot water kills corona virus" }, { text: "" }, "bad", { text: "a" }, { text: "b" }],
    });
    expect(claims).toHaveLength(3);
    expect(claims[0]).toEqual({ text: "RBI bans ₹10 coins", query: "RBI ban 10 rupee coins" });
    expect(claims[1].query).toBe("hot water kills corona virus");
  });

  it("handles a reply without a claims list", () => {
    expect(parseClaimsJson({ nothing: true })).toEqual([]);
  });
});

describe("extractClaimsAi", () => {
  it("sends the forward to Groq and parses the claims", async () => {
    const fetchImpl = fakeFetch([{ match: (u) => u.includes("groq"), respond: () => groqReply({ claims: [{ text: "Claim one", query: "claim one" }] }) }]);
    const result = await extractClaimsAi("some forward", "key", ["model-a"], fetchImpl);
    expect(result).toEqual({ claims: [{ text: "Claim one", query: "claim one" }], model: "model-a" });
  });

  it("passes the forward inside the user message", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = fakeFetch([{ match: () => true, respond: (_u, init) => ((sent = bodyOf(init)), groqReply({ claims: [] })) }]);
    await extractClaimsAi("UNIQUE-FORWARD", "key", ["m"], fetchImpl);
    expect(JSON.stringify(sent.messages)).toContain("UNIQUE-FORWARD");
  });
});

describe("unwrapLines", () => {
  it("joins screenshot lines that carry on, keeps real breaks", () => {
    expect(unwrapLines("WhatsApp will start charging Rs 499 per\nmonth from tomorrow.\nForward this to 10 people")).toBe(
      "WhatsApp will start charging Rs 499 per month from tomorrow.\nForward this to 10 people",
    );
    expect(unwrapLines("सावधान! RBI ने 10 रुपये के सिक्के\nबंद कर दिए हैं।")).toBe("सावधान! RBI ने 10 रुपये के सिक्के बंद कर दिए हैं।");
  });
});
