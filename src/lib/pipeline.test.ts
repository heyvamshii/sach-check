import { describe, expect, it } from "vitest";
import type { GatherResult } from "./evidence/gather";
import { checkText } from "./pipeline";
import { bodyOf, fakeFetch, groqReply } from "./testUtils";

const FORWARD = "The new ₹2000 note has a GPS nano chip inside. It can be tracked 120 metres underground. Please share!";

const debunk: GatherResult = {
  evidence: [{ id: 1, source: "news", title: "RBI's new 2000 note has no GPS chip, it's fake", url: "https://indianexpress.com/a", publisher: "The Indian Express", trusted: true }],
  used: ["Google News"],
  errors: [],
};
const gather = async () => debunk;

describe("checkText without keys (basic mode)", () => {
  it("runs every step with rule-based engines", async () => {
    const result = await checkText(FORWARD, { keys: {}, gather });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ verdict: "False", claim: { category: "financial" } });
    expect(result.steps.map((s) => [s.step, s.ai])).toEqual([
      ["extract", false],
      ["classify", false],
      ["search", false],
      ["judge", false],
    ]);
    expect(result.warnings[0]).toMatch(/basic mode/);
  });

  it("stops early when there is nothing to check", async () => {
    const result = await checkText("🙏🙏🙏", { keys: {}, gather });
    expect(result.results).toEqual([]);
    expect(result.warnings).toContain("No checkable claim or link was found in this message.");
  });

  it("warns when every evidence source failed", async () => {
    const result = await checkText(FORWARD, { keys: {}, gather: async () => ({ evidence: [], used: [], errors: ["Google News: offline"] }) });
    expect(result.warnings.some((w) => w.includes("Every evidence source failed"))).toBe(true);
    expect(result.results[0].verdict).toBe("Unverified");
  });
});

describe("checkText with a Groq key", () => {
  it("uses a different model for each AI step", async () => {
    const fetchImpl = fakeFetch([
      {
        match: (u) => u.includes("groq"),
        respond: (_u, init) => {
          const { model } = bodyOf(init) as { model: string };
          if (model === "openai/gpt-oss-20b") return groqReply({ claims: [{ text: "₹2000 note has a GPS chip", query: "2000 note gps chip" }] });
          if (model === "qwen/qwen3.8-27b") return groqReply({ categories: ["financial"] });
          return groqReply({ verdict: "False", confidence: "high", explanation: "Debunked.", citations: [1] });
        },
      },
    ]);
    const result = await checkText(FORWARD, { keys: { groq: "key" }, gather, fetchImpl, env: {} as NodeJS.ProcessEnv });
    expect(result.steps.map((s) => s.engine)).toEqual(["gpt-oss-20b", "qwen3.8-27b", "Google News", "gpt-oss-120b"]);
    expect(result.results[0]).toMatchObject({ verdict: "False", confidence: "high", citations: [1] });
    expect(result.warnings).toEqual([]);
  });

  it("falls back to rules, step by step, when Groq is down", async () => {
    const logs: string[] = [];
    const fetchImpl = fakeFetch([{ match: () => true, respond: () => new Response("down", { status: 500 }) }]);
    const result = await checkText(FORWARD, { keys: { groq: "key" }, gather, fetchImpl, env: {} as NodeJS.ProcessEnv, log: (m) => logs.push(m) });
    expect(result.steps.map((s) => s.engine)).toEqual(["sentence rules", "keyword matching", "Google News", "rating rules"]);
    expect(result.warnings).toHaveLength(3);
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(result.results[0].verdict).toBe("False");
  });
});
