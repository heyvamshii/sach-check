import type { FetchLike } from "./groq";
import type { ImageVerdict } from "./forensics/score";
import type { CheckResult, Verdict } from "./types";

/** Server-only helpers for the optional Telegram bot (free, no approval needed). */

export interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSize[];
    document?: { file_id: string; mime_type?: string; file_size?: number };
  };
}

const MAX_DOWNLOAD = 8 * 1024 * 1024;
const MARK: Record<Verdict, string> = { True: "✅ TRUE", False: "❌ FALSE", Misleading: "⚠️ MISLEADING", Unverified: "❔ UNVERIFIED" };

export function isStartCommand(text: string): boolean {
  return /^\/(start|help)(@\w+)?(\s|$)/i.test(text.trim());
}

/** Pick what to check from a message: its text and/or the best image. */
export function parseUpdate(update: TelegramUpdate): { chatId: number; text: string; fileId: string | null } | null {
  const message = update.message;
  if (!message) return null;
  const text = (message.text ?? message.caption ?? "").trim();
  const photo = message.photo?.length ? [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0] : null;
  const doc = message.document?.mime_type?.startsWith("image/") ? message.document : null;
  const fileId = photo?.file_id ?? doc?.file_id ?? null;
  if (!text && !fileId) return null;
  return { chatId: message.chat.id, text, fileId };
}

export function formatReply(check: CheckResult | null, image: ImageVerdict | null, notes: string[] = []): string {
  const parts: string[] = [];
  if (check) {
    if (check.results.length === 0) parts.push("I couldn't find a checkable claim in this message.");
    check.results.forEach((r, i) => {
      const lines = [`${check.results.length > 1 ? `Claim ${i + 1}: ` : ""}${MARK[r.verdict]} (${r.confidence} confidence)`, `“${r.claim.text}”`, r.explanation];
      const cited = r.evidence.filter((e) => r.citations.includes(e.id)).slice(0, 3);
      if (cited.length) lines.push("Sources:", ...cited.map((e) => `• ${e.publisher}: ${e.url}`));
      parts.push(lines.join("\n"));
    });
  }
  if (image) {
    const warnings = image.signals.filter((s) => s.kind === "warning").map((s) => `• ${s.text}`);
    parts.push([`🖼 Image suspicion: ${image.level.toUpperCase()}`, ...(warnings.length ? warnings : ["• No warning signs in the file's hidden data. The edit check doesn't run on Telegram, so this is not proof the image is real."])].join("\n"));
  }
  parts.push(...notes);
  parts.push("Checked by SachCheck: AI can be wrong, so open the sources before you forward.");
  return parts.join("\n\n").slice(0, 4000);
}

export async function sendMessage(token: string, chatId: number, text: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage HTTP ${response.status}`);
}

export async function downloadFile(token: string, fileId: string, fetchImpl: FetchLike = fetch): Promise<Uint8Array> {
  const meta = await fetchImpl(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(10_000) });
  if (!meta.ok) throw new Error(`Telegram getFile HTTP ${meta.status}`);
  const body = (await meta.json()) as { result?: { file_path?: string; file_size?: number } };
  const path = body.result?.file_path;
  if (!path) throw new Error("Telegram returned no file path");
  if ((body.result?.file_size ?? 0) > MAX_DOWNLOAD) throw new Error("image too large");
  const file = await fetchImpl(`https://api.telegram.org/file/bot${token}/${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!file.ok) throw new Error(`Telegram file HTTP ${file.status}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Telegram doesn't always report file_size, so check the real size too
  if (bytes.length > MAX_DOWNLOAD) throw new Error("image too large");
  return bytes;
}

/** Constant-time comparison for the webhook secret. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
