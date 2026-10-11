/**
 * Measures how much of the text in the generated forward screenshots each OCR engine reads correctly.
 * Tesseract always runs (free, local). The Groq vision model runs too when GROQ_API_KEY is set.
 *
 * Run:  npx tsx scripts/eval-ocr.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWorker } from "tesseract.js";
import { modelsFor, readKeys } from "../src/lib/config";
import { readImageText } from "../src/lib/vision";
import { loadEnv } from "./loadEnv";

interface Truth {
  file: string;
  lang: string;
  text: string;
}

const ROOT = join(import.meta.dirname, "..");
loadEnv(ROOT);

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();

/** Character-level similarity: 1 - edit distance / length. */
export function charAccuracy(expected: string, actual: string): number {
  const a = [...normalize(expected)];
  const b = [...normalize(actual)];
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.max(0, 1 - prev[b.length] / a.length);
}

// the screenshot includes a chat header and timestamp the truth leaves out; score only the message
function messageOnly(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/family group|amma|forwarded|\d{1,2}:\d{2}\s*(am|pm)/i.test(line))
    .join("\n");
}

async function main() {
  const truth = JSON.parse(readFileSync(join(ROOT, "data", "ocr", "truth.json"), "utf8")) as Truth[];
  // keep the downloaded language files out of the project folder
  const worker = await createWorker(["eng", "hin", "tel"], 1, { cachePath: join(ROOT, "node_modules", ".cache", "tesseract") });
  const { groq } = readKeys();
  const rows = [];
  for (const item of truth) {
    const bytes = readFileSync(join(ROOT, item.file));
    const tesseract = messageOnly((await worker.recognize(bytes)).data.text);
    let vision: string | null = null;
    if (groq) {
      const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
      vision = await readImageText(dataUrl, groq, modelsFor("vision"))
        .then((r) => messageOnly(r.text))
        .catch(() => null);
    }
    const row = {
      file: item.file.split("/").pop(),
      lang: item.lang,
      tesseract: Number(charAccuracy(item.text, tesseract).toFixed(2)),
      vision: vision === null ? null : Number(charAccuracy(item.text, vision).toFixed(2)),
    };
    rows.push(row);
    console.log(row);
  }
  await worker.terminate();
  const mean = (values: number[]) => (values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null);
  const summary = {
    images: rows.length,
    tesseract: mean(rows.map((r) => r.tesseract)),
    vision: mean(rows.flatMap((r) => (r.vision === null ? [] : [r.vision]))),
    rows,
    generatedAt: new Date().toISOString().slice(0, 10),
  };
  mkdirSync(join(ROOT, "public", "data"), { recursive: true });
  writeFileSync(join(ROOT, "public", "data", "eval-ocr.json"), JSON.stringify(summary, null, 2));
  console.log({ ...summary, rows: undefined });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
