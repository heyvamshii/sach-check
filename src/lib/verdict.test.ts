import { describe, expect, it } from "vitest";
import { fakeFetch, groqReply } from "./testUtils";
import type { Claim, Evidence } from "./types";
import { isRelevant, judgeAi, judgeBasic, normalizeRating, parseJudgement, stem } from "./verdict";

function ev(partial: Partial<Evidence> & { id: number; title: string }): Evidence {
  return { source: "news", url: `https://example.com/${partial.id}`, publisher: "Example", trusted: false, ...partial };
}

const CLAIM: Claim = { text: "The ₹2000 note has a GPS chip", query: "2000 note gps chip", category: "financial" };

describe("normalizeRating", () => {
  it.each([
    ["False", "False"],
    ["Fake", "False"],
    ["Pants on Fire", "False"],
    ["Partly False", "Misleading"],
    ["Missing context", "Misleading"],
    ["Mostly True", "True"],
    ["Correct", "True"],
    ["झूठ", "False"],
    ["Satire", "Misleading"],
    ["Unproven", "Unverified"],
    [undefined, "Unverified"],
  ])("%s -> %s", (rating, expected) => {
    expect(normalizeRating(rating)).toBe(expected);
  });
});

describe("isRelevant", () => {
  it("needs two shared keywords with the claim", () => {
    expect(isRelevant("RBI's new Rs 2000 notes do not have a Nano-GPS chip", "2000 note gps chip")).toBe(true);
    expect(isRelevant("A relentless purveyor of misinformation", "2000 note gps chip")).toBe(false);
    expect(isRelevant("anything", "")).toBe(true);
  });
});

describe("judgeBasic", () => {
  it("follows fact-checker ratings when present", () => {
    const result = judgeBasic([ev({ id: 1, title: "x", rating: "False", source: "factcheck" }), ev({ id: 2, title: "y", rating: "Fake", source: "factcheck" })]);
    expect(result).toMatchObject({ verdict: "False", confidence: "high", citations: [1, 2] });
  });

  it("goes with the majority rating at medium confidence when checkers disagree", () => {
    const result = judgeBasic([ev({ id: 1, title: "a", rating: "False" }), ev({ id: 2, title: "b", rating: "False" }), ev({ id: 3, title: "c", rating: "Misleading" })]);
    expect(result).toMatchObject({ verdict: "False", confidence: "medium", citations: [1, 2] });
  });

  it("reads debunking headlines from trusted outlets about the same claim", () => {
    const result = judgeBasic(
      [
        ev({ id: 1, title: "RBI's new Rs 2000 notes do not have a Nano-GPS chip", trusted: true }),
        ev({ id: 2, title: "Rishi Bagree: a relentless purveyor of misinformation", trusted: true }),
        ev({ id: 3, title: "No, the 2000 note has no GPS chip", publisher: "Some blog" }),
      ],
      CLAIM.query,
    );
    expect(result).toMatchObject({ verdict: "False", confidence: "low", citations: [1] });
  });

  it("calls it misleading when debunks say so", () => {
    const result = judgeBasic([ev({ id: 1, title: "Old video of 2000 note gps chip shared with misleading claim", trusted: true })], CLAIM.query);
    expect(result.verdict).toBe("Misleading");
  });

  it("says Unverified when nothing clearly settles it", () => {
    expect(judgeBasic([ev({ id: 1, title: "RBI releases 2000 note gps chip details", trusted: true })], CLAIM.query).verdict).toBe("Unverified");
    expect(judgeBasic([]).explanation).toMatch(/No fact-checks/);
  });
});

describe("parseJudgement", () => {
  const evidence = [ev({ id: 1, title: "a" }), ev({ id: 2, title: "b" })];

  it("keeps valid fields and drops citations that don't exist", () => {
    expect(parseJudgement({ verdict: "False", confidence: "high", explanation: " Debunked by PIB. ", citations: [1, 9, "2"] }, evidence)).toEqual({
      verdict: "False",
      confidence: "high",
      explanation: "Debunked by PIB.",
      citations: [1, 2],
    });
  });

  it("lowers confidence for an uncited verdict and repairs bad values", () => {
    expect(parseJudgement({ verdict: "Fake!!", confidence: "very" }, evidence)).toEqual({ verdict: "Unverified", confidence: "low", explanation: "No explanation given.", citations: [] });
    expect(parseJudgement({ verdict: "True", confidence: "high", citations: [] }, evidence).confidence).toBe("low");
  });
});

describe("judgeAi", () => {
  it("sends the claim and numbered evidence, and parses the reply", async () => {
    let prompt = "";
    const fetchImpl = fakeFetch([
      {
        match: () => true,
        respond: (_u, init) => {
          prompt = String(init?.body);
          return groqReply({ verdict: "False", confidence: "medium", explanation: "PIB says fake.", citations: [1] });
        },
      },
    ]);
    const evidence = [ev({ id: 1, title: "PIB: GPS chip claim is fake", rating: "Fake", snippet: "s", date: "2016-11-10", trusted: true })];
    const { judgement, model } = await judgeAi(CLAIM, evidence, "key", ["judge-model"], fetchImpl, "2026-10-12");
    expect(model).toBe("judge-model");
    expect(judgement.verdict).toBe("False");
    expect(prompt).toContain("[1] PIB: GPS chip claim is fake");
    expect(prompt).toContain("fact-checker rating: Fake");
    expect(prompt).toContain("Today: 2026-10-12");
  });

  it("tells the model when there is no evidence", async () => {
    let prompt = "";
    const fetchImpl = fakeFetch([{ match: () => true, respond: (_u, init) => ((prompt = String(init?.body)), groqReply({ verdict: "Unverified" })) }]);
    await judgeAi(CLAIM, [], "key", ["m"], fetchImpl);
    expect(prompt).toContain("(no evidence found)");
  });
});

describe("stem", () => {
  it("lets different word forms match", () => {
    expect(stem("charging")).toBe(stem("chargeable"));
    expect(stem("notes")).toBe("note");
    expect(stem("gps")).toBe("gps");
  });

  it("makes WhatsApp charging debunks count as relevant", () => {
    expect(isRelevant("Viral messages claiming WhatsApp will become chargeable are false", "whatsapp start charging 499 month")).toBe(true);
  });
});

describe("judgeBasic on real events", () => {
  it("doesn't call a well-reported event false because of fact-checks about related fakes", () => {
    const query = "chandrayaan 3 landed moon south pole";
    const result = judgeBasic(
      [
        ev({ id: 1, title: "Chandrayaan-3 landed near Moon south pole, India makes history", trusted: true }),
        ev({ id: 2, title: "Chandrayaan-3 lander touches down on the Moon's south pole", trusted: true }),
        ev({ id: 3, title: "Fake video of Chandrayaan-3 landing on Moon goes viral", trusted: true }),
      ],
      query,
    );
    expect(result.verdict).toBe("Unverified");
    expect(result.citations).toEqual([3, 1, 2]);
  });
});
