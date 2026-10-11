/**
 * Runs the 50 known claims in data/claims.json through the real pipeline and scores the verdicts.
 * Uses whatever keys are in .env.local; with none, it measures basic mode.
 *
 * Run:  npx tsx scripts/eval-claims.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readKeys, serviceStatus } from "../src/lib/config";
import { checkText } from "../src/lib/pipeline";
import type { Category, Verdict } from "../src/lib/types";
import { loadEnv } from "./loadEnv";

interface LabelledClaim {
  id: number;
  label: Verdict;
  category: Category;
  lang: string;
  text: string;
}

interface Row {
  id: number;
  lang: string;
  label: Verdict;
  verdict: Verdict;
  correct: boolean;
  category: Category;
  categoryCorrect: boolean;
  sources: number;
}

const ROOT = join(import.meta.dirname, "..");
loadEnv(ROOT);

const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 2500); // stay inside free-tier rate limits
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// "Misleading" counts as a correct warning for a false claim, and vice versa
const isFalseLike = (v: Verdict) => v === "False" || v === "Misleading";

async function main() {
  const claims = JSON.parse(readFileSync(join(ROOT, "data", "claims.json"), "utf8")) as LabelledClaim[];
  const keys = readKeys();
  const status = serviceStatus();
  const mode = keys.groq ? "AI" : "basic";
  console.log(`Evaluating ${claims.length} claims in ${mode} mode`, status);

  const rows: Row[] = [];
  for (const claim of claims) {
    const result = await checkText(claim.text, { keys });
    const first = result.results[0];
    const verdict: Verdict = first?.verdict ?? "Unverified";
    const category = first?.claim.category ?? "other";
    const correct = claim.label === "True" ? verdict === "True" : isFalseLike(verdict);
    rows.push({ id: claim.id, lang: claim.lang, label: claim.label, verdict, correct, category, categoryCorrect: category === claim.category, sources: first?.evidence.length ?? 0 });
    console.log(`${String(claim.id).padStart(2)} ${claim.label.padEnd(10)} -> ${verdict.padEnd(10)} ${correct ? "✓" : "✗"}  ${claim.text.slice(0, 60)}`);
    await sleep(PAUSE_MS);
  }

  const count = (pred: (r: Row) => boolean) => rows.filter(pred).length;
  const falseClaims = rows.filter((r) => r.label !== "True");
  const trueClaims = rows.filter((r) => r.label === "True");
  const summary = {
    mode,
    services: status,
    claims: rows.length,
    correct: count((r) => r.correct),
    accuracy: Number((count((r) => r.correct) / rows.length).toFixed(2)),
    fakeCaught: falseClaims.filter((r) => isFalseLike(r.verdict)).length,
    fakeTotal: falseClaims.length,
    trueConfirmed: trueClaims.filter((r) => r.verdict === "True").length,
    trueTotal: trueClaims.length,
    // the worst mistake: telling someone a fake claim is true
    fakeCalledTrue: falseClaims.filter((r) => r.verdict === "True").length,
    // the opposite mistake: "debunking" real news
    trueCalledFake: trueClaims.filter((r) => isFalseLike(r.verdict)).length,
    unverified: count((r) => r.verdict === "Unverified"),
    categoryAccuracy: Number((count((r) => r.categoryCorrect) / rows.length).toFixed(2)),
    rows,
    generatedAt: new Date().toISOString().slice(0, 10),
  };
  mkdirSync(join(ROOT, "public", "data"), { recursive: true });
  writeFileSync(join(ROOT, "public", "data", `eval-claims-${mode}.json`), JSON.stringify(summary, null, 2));
  console.log({ ...summary, rows: undefined });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
