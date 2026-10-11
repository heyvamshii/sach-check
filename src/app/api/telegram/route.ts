import { after } from "next/server";
import { hasRealKey, modelsFor, readKeys } from "@/lib/config";
import { CHECK_DEADLINE_MS, DeadlineError, withDeadline } from "@/lib/deadline";
import { readMetadata } from "@/lib/forensics/metadata";
import { type ImageVerdict, scoreImage } from "@/lib/forensics/score";
import { checkText } from "@/lib/pipeline";
import { createRateLimiter } from "@/lib/rateLimit";
import { downloadFile, formatReply, isStartCommand, parseUpdate, safeEqual, sendMessage, type TelegramUpdate } from "@/lib/telegram";
import type { CheckResult } from "@/lib/types";
import { MAX_IMAGE_BYTES, readImageText } from "@/lib/vision";

export const maxDuration = 60;

const limiter = createRateLimiter({ limit: 6, windowMs: 60_000 });

function mimeOf(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

/**
 * On Telegram only the file metadata is checked. Telegram re-compresses photos, which
 * hides editing traces, so the ELA edit check and the deepfake detector run only on the website.
 */
async function analyseImage(bytes: Uint8Array): Promise<ImageVerdict> {
  return scoreImage({ elaScore: null, metadata: await readMetadata(bytes), ai: null, isScreenshot: false });
}

async function readText(bytes: Uint8Array, groqKey: string | undefined, notes: string[]): Promise<string> {
  if (!groqKey) {
    notes.push("Reading text from images needs the Groq key, so the text in this image wasn't checked.");
    return "";
  }
  const mime = mimeOf(bytes);
  if (!mime || bytes.length > MAX_IMAGE_BYTES) {
    notes.push("I couldn't read the text in this image (unsupported type or over 4 MB). Try sending it as a photo.");
    return "";
  }
  try {
    const { text } = await readImageText(`data:${mime};base64,${Buffer.from(bytes).toString("base64")}`, groqKey, modelsFor("vision"));
    return text;
  } catch (error) {
    console.error("[telegram] vision failed:", error instanceof Error ? error.message : error);
    notes.push("I couldn't read the text in this image right now, so only the image was checked.");
    return "";
  }
}

async function handle(update: TelegramUpdate, token: string): Promise<void> {
  const parsed = parseUpdate(update);
  if (!parsed) return;
  const { chatId, fileId } = parsed;
  if (!limiter.check(String(chatId))) {
    await sendMessage(token, chatId, "Too many checks in a minute. Please wait a moment.");
    return;
  }
  if (isStartCommand(parsed.text)) {
    await sendMessage(token, chatId, "Forward me a WhatsApp message or image and I'll fact-check it against trusted sources.");
    return;
  }
  await sendMessage(token, chatId, "🔎 Checking… this takes about 10–20 seconds.");

  const keys = readKeys();
  const notes: string[] = [];
  let text = parsed.text;
  let image: ImageVerdict | null = null;

  if (fileId) {
    const bytes = await downloadFile(token, fileId);
    image = await analyseImage(bytes);
    const read = await readText(bytes, keys.groq, notes);
    text = [text, read].filter(Boolean).join("\n");
    notes.push("For the full edit check and deepfake detector, open the image on the SachCheck website.");
  }

  let check: CheckResult | null = null;
  if (text.length >= 10) check = await withDeadline(checkText(text, { keys, log: (m) => console.error(m) }), CHECK_DEADLINE_MS);
  else if (!image) notes.push("Please send a longer message: I need a full claim to check.");
  await sendMessage(token, chatId, formatReply(check, image, notes));
}

/** Telegram calls this for every message sent to the bot. */
export async function POST(request: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!hasRealKey(token) || !hasRealKey(secret)) return new Response("Telegram bot is not configured", { status: 503 });
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(given, secret)) return new Response("Forbidden", { status: 403 });

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  // answer Telegram straight away; do the slow work after the response
  after(() =>
    handle(update, token).catch(async (error: unknown) => {
      console.error("[telegram] failed:", error instanceof Error ? error.message : error);
      const chatId = update.message?.chat.id;
      const message = error instanceof DeadlineError ? "Sorry, that took too long. Please try again in a minute." : "Sorry, something went wrong while checking. Please try again.";
      if (chatId) await sendMessage(token, chatId, message).catch(() => undefined);
    }),
  );
  return new Response("ok");
}
