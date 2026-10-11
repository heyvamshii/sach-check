/** Server-only: Groq's OpenAI-compatible chat API, with fallback across models. */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 15_000;
// these statuses mean "this model can't answer right now", so try the next one
const TRY_NEXT_MODEL = new Set([400, 404, 413, 429, 503]);

export type FetchLike = typeof fetch;

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user";
  content: string | ContentPart[];
}

export interface ChatOptions {
  apiKey: string;
  models: string[];
  messages: ChatMessage[];
  json?: boolean;
  maxTokens?: number;
  fetchImpl?: FetchLike;
}

export interface ChatResult {
  content: string;
  model: string;
}

export class GroqHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function callModel(model: string, options: ChatOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: options.messages,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
      temperature: 0.1,
      max_completion_tokens: options.maxTokens ?? 1200,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new GroqHttpError(response.status);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty reply");
  return content;
}

/** Try each model in order (Groq retires models over time). */
export async function chat(options: ChatOptions): Promise<ChatResult> {
  const errors: string[] = [];
  for (const model of options.models) {
    try {
      return { content: await callModel(model, options), model };
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : "unknown error"}`);
      if (error instanceof GroqHttpError && !TRY_NEXT_MODEL.has(error.status)) break;
    }
  }
  throw new Error(errors.join("; "));
}

/** Like `chat`, but parses the reply as a JSON object. */
export async function chatJson(options: Omit<ChatOptions, "json">): Promise<{ data: Record<string, unknown>; model: string }> {
  const { content, model } = await chat({ ...options, json: true });
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("reply is not a JSON object");
  return { data: parsed as Record<string, unknown>, model };
}

/** "openai/gpt-oss-20b" -> "gpt-oss-20b", for display. */
export function shortModelName(model: string): string {
  return model.split("/").pop() ?? model;
}
