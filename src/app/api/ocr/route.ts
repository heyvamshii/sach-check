import { z } from "zod";
import { modelsFor, readKeys } from "@/lib/config";
import { shortModelName } from "@/lib/groq";
import { clientIp, fail, ok, readJson } from "@/lib/http";
import { createRateLimiter } from "@/lib/rateLimit";
import { dataUrlBytes, isImageDataUrl, MAX_IMAGE_BYTES, readImageText } from "@/lib/vision";

const RequestSchema = z.object({ image: z.string().max(6_000_000) });
const limiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

export const maxDuration = 45;

/**
 * Reads text from an image with a Groq vision model.
 * Answers 503 when no key is set; the page then reads the text in the browser with Tesseract instead.
 */
export async function POST(request: Request): Promise<Response> {
  const { groq } = readKeys();
  if (!groq) return fail(503, "AI image reading is off (no Groq key).");
  if (!limiter.check(clientIp(request))) return fail(429, "Too many images in a minute. Please wait a moment.");

  const parsed = RequestSchema.safeParse(await readJson(request));
  if (!parsed.success || !isImageDataUrl(parsed.data.image)) return fail(400, "Send { image: <PNG/JPEG/WebP data URL> }.");
  if (dataUrlBytes(parsed.data.image) > MAX_IMAGE_BYTES) return fail(413, "Image is too large (max 4 MB).");

  try {
    const { text, model } = await readImageText(parsed.data.image, groq, modelsFor("vision"));
    return ok({ text, engine: shortModelName(model) });
  } catch (error) {
    console.error("[ocr] Groq vision failed:", error instanceof Error ? error.message : error);
    return fail(502, "AI image reading failed.");
  }
}
