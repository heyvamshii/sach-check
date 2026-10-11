/**
 * Points your Telegram bot at the deployed app. Run once after deploying to Vercel:
 *
 *   npx tsx scripts/set-telegram-webhook.ts https://your-app.vercel.app
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.local.
 */
import { join } from "node:path";
import { hasRealKey } from "../src/lib/config";
import { loadEnv } from "./loadEnv";

loadEnv(join(import.meta.dirname, ".."));

async function main() {
  const siteUrl = process.argv[2]?.replace(/\/$/, "");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!siteUrl?.startsWith("https://")) throw new Error("Pass your deployed https:// URL, e.g. https://sach-check.vercel.app");
  if (!hasRealKey(token) || !hasRealKey(secret)) throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local first.");

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${siteUrl}/api/telegram`, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true }),
  });
  console.log("setWebhook:", await response.json());
  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  console.log("webhook info:", await info.json());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
