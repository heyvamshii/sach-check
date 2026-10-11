import { z } from "zod";
import { readKeys } from "@/lib/config";
import { CHECK_DEADLINE_MS, DeadlineError, withDeadline } from "@/lib/deadline";
import { clientIp, fail, ok, readJson } from "@/lib/http";
import { checkText, MAX_TEXT_LENGTH } from "@/lib/pipeline";
import { createRateLimiter } from "@/lib/rateLimit";

const RequestSchema = z.object({ text: z.string().trim().min(10).max(MAX_TEXT_LENGTH) });
// each check makes ~4 Groq calls; this keeps one visitor inside the free quota
const limiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

// several models and searches in a row; keep Vercel from cutting it off
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!limiter.check(clientIp(request))) return fail(429, "Too many checks in a minute. Please wait a moment and try again.");

  const parsed = RequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, `Send { "text": string } with 10 to ${MAX_TEXT_LENGTH} characters.`);

  try {
    const result = await withDeadline(checkText(parsed.data.text, { keys: readKeys(), log: (m) => console.error(m) }), CHECK_DEADLINE_MS);
    return ok(result);
  } catch (error) {
    console.error("[check] failed:", error instanceof Error ? error.message : error);
    if (error instanceof DeadlineError) return fail(504, "The check took too long (the free AI services may be busy). Please try again.");
    return fail(500, "Something went wrong while checking. Please try again.");
  }
}
