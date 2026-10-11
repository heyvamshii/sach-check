import { describe, expect, it } from "vitest";
import { hasRealKey, modelsFor, readKeys, serviceStatus } from "./config";
import { chat, chatJson, shortModelName } from "./groq";
import { bodyOf, fakeFetch, groqReply } from "./testUtils";

describe("chat", () => {
  it("moves on to the next model when one is retired or rate-limited", async () => {
    const tried: string[] = [];
    const fetchImpl = fakeFetch([
      {
        match: () => true,
        respond: (_u, init) => {
          const { model } = bodyOf(init) as { model: string };
          tried.push(model);
          return model === "good" ? groqReply("hello") : new Response("gone", { status: 404 });
        },
      },
    ]);
    await expect(chat({ apiKey: "k", models: ["old", "good"], messages: [{ role: "user", content: "hi" }], fetchImpl })).resolves.toEqual({ content: "hello", model: "good" });
    expect(tried).toEqual(["old", "good"]);
  });

  it("stops on a bad key instead of trying every model", async () => {
    const fetchImpl = fakeFetch([{ match: () => true, respond: () => new Response("no", { status: 401 }) }]);
    await expect(chat({ apiKey: "k", models: ["a", "b"], messages: [], fetchImpl })).rejects.toThrow("a: HTTP 401");
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("sets JSON mode and low reasoning for gpt-oss models", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = fakeFetch([{ match: () => true, respond: (_u, init) => ((body = bodyOf(init)), groqReply({ a: 1 })) }]);
    await chatJson({ apiKey: "k", models: ["openai/gpt-oss-20b"], messages: [], fetchImpl });
    expect(body).toMatchObject({ response_format: { type: "json_object" }, reasoning_effort: "low" });
  });

  it("rejects empty replies and non-object JSON", async () => {
    const empty = fakeFetch([{ match: () => true, respond: () => Response.json({ choices: [] }) }]);
    await expect(chat({ apiKey: "k", models: ["m"], messages: [], fetchImpl: empty })).rejects.toThrow("empty reply");
    const list = fakeFetch([{ match: () => true, respond: () => groqReply("[1,2]") }]);
    await expect(chatJson({ apiKey: "k", models: ["m"], messages: [], fetchImpl: list })).rejects.toThrow("not a JSON object");
  });
});

describe("config", () => {
  it("ignores placeholder keys", () => {
    expect(hasRealKey("your_groq_api_key_here")).toBe(false);
    expect(hasRealKey("short")).toBe(false);
    expect(hasRealKey("gsk_abcdefghijklmnop")).toBe(true);
  });

  it("reads keys and reports status without exposing them", () => {
    const env = { GROQ_API_KEY: "gsk_abcdefghijklmnop", TAVILY_API_KEY: "your_tavily_key", TELEGRAM_BOT_TOKEN: "123:abcdefghijk" } as unknown as NodeJS.ProcessEnv;
    expect(readKeys(env)).toEqual({ groq: "gsk_abcdefghijklmnop", factCheck: undefined, tavily: undefined });
    expect(serviceStatus(env)).toEqual({ groq: true, factCheck: false, tavily: false, telegram: true });
  });

  it("lets an env var choose the first model for a step", () => {
    expect(modelsFor("judge", { GROQ_JUDGE_MODEL: "my-model" } as unknown as NodeJS.ProcessEnv)[0]).toBe("my-model");
    expect(modelsFor("classify", {} as NodeJS.ProcessEnv)[0]).toBe("llama-3.1-8b-instant");
  });

  it("shortens model names for display", () => {
    expect(shortModelName("openai/gpt-oss-20b")).toBe("gpt-oss-20b");
  });
});
