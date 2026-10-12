import type { ServiceStatus } from "./types";

/** Server-only: reads keys from the environment (.env.local locally, Vercel settings in production). */

const PLACEHOLDER = /^(your_|<|changeme|xxx)/i;

export function hasRealKey(value: string | undefined): value is string {
  const trimmed = value?.trim();
  return Boolean(trimmed && trimmed.length >= 10 && !PLACEHOLDER.test(trimmed));
}

export interface Keys {
  groq?: string;
  factCheck?: string;
  tavily?: string;
  /** Google Safe Browsing; the Fact Check key works too once the API is switched on in the same project */
  safeBrowsing?: string;
}

function realOrUndefined(value: string | undefined): string | undefined {
  return hasRealKey(value) ? value.trim() : undefined;
}

export function readKeys(env: NodeJS.ProcessEnv = process.env): Keys {
  return {
    groq: realOrUndefined(env.GROQ_API_KEY),
    factCheck: realOrUndefined(env.GOOGLE_FACTCHECK_API_KEY),
    tavily: realOrUndefined(env.TAVILY_API_KEY),
    safeBrowsing: realOrUndefined(env.GOOGLE_SAFE_BROWSING_API_KEY) ?? realOrUndefined(env.GOOGLE_FACTCHECK_API_KEY),
  };
}

export function serviceStatus(env: NodeJS.ProcessEnv = process.env): ServiceStatus {
  const keys = readKeys(env);
  return {
    groq: Boolean(keys.groq),
    factCheck: Boolean(keys.factCheck),
    tavily: Boolean(keys.tavily),
    safeBrowsing: Boolean(keys.safeBrowsing),
    telegram: hasRealKey(env.TELEGRAM_BOT_TOKEN),
  };
}

/** Each step gets its own model, so the pipeline really is multi-model. Env vars override the first choice. */
export function modelsFor(step: "extract" | "classify" | "judge" | "vision" | "links", env: NodeJS.ProcessEnv = process.env): string[] {
  const defaults: Record<typeof step, string[]> = {
    extract: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"],
    classify: ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    judge: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
    links: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"],
    // the page falls back to Tesseract in the browser when this is busy
    vision: ["qwen/qwen3.8-27b"],
  };
  const override = env[`GROQ_${step.toUpperCase()}_MODEL`]?.trim();
  return [...new Set([...(override ? [override] : []), ...defaults[step]])];
}
