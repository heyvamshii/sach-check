import { describe, expect, it } from "vitest";
import { classifyAi, classifyBasic, toCategory } from "./classify";
import { fakeFetch, groqReply } from "./testUtils";

describe("classifyBasic", () => {
  it.each([
    ["Drinking hot water every 15 minutes kills the corona virus", "health"],
    ["RBI will stop accepting ₹10 coins from Monday", "financial"],
    ["UNESCO declared Jana Gana Mana the best national anthem", "political"],
    ["NASA says six days of darkness are coming", "other"],
    ["गर्म पानी पीने से बीमारी ठीक होती है", "health"],
    ["కొత్త 2000 రూపాయల నోటు", "financial"],
  ])("%s -> %s", (text, expected) => {
    expect(classifyBasic(text)).toBe(expected);
  });

  it("does not treat the English word 'who' as the WHO", () => {
    expect(classifyBasic("People who forward this will win")).toBe("other");
  });
});

describe("toCategory", () => {
  it("accepts known labels in any case and maps the rest to other", () => {
    expect(toCategory(" Health ")).toBe("health");
    expect(toCategory("sports")).toBe("other");
    expect(toCategory(42)).toBe("other");
  });
});

describe("classifyAi", () => {
  it("uses the model's labels and fills gaps with keywords", async () => {
    const fetchImpl = fakeFetch([{ match: () => true, respond: () => groqReply({ categories: ["political"] }) }]);
    const result = await classifyAi(["Modi won the election", "RBI bans coins"], "key", ["small-model"], fetchImpl);
    expect(result).toEqual({ categories: ["political", "financial"], model: "small-model" });
  });
});
