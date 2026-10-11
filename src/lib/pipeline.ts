import { classifyAi, classifyBasic } from "./classify";
import { extractClaimsAi, extractClaimsBasic, type RawClaim } from "./claims";
import { type Keys, modelsFor } from "./config";
import { gatherEvidence, type GatherResult } from "./evidence/gather";
import { type FetchLike, shortModelName } from "./groq";
import type { Category, CheckResult, Claim, ClaimResult, StepTrace } from "./types";
import { judgeAi, judgeBasic, type Judgement } from "./verdict";

/**
 * The text pipeline: extract claims -> classify -> search evidence -> judge.
 * Each AI step falls back to a rule-based version, so the app still works with no keys.
 */

export const MAX_TEXT_LENGTH = 4000;

export interface PipelineDeps {
  keys: Keys;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  gather?: (query: string, keys: Keys, fetchImpl?: FetchLike) => Promise<GatherResult>;
  log?: (message: string) => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await run();
  return { value, ms: Date.now() - start };
}

async function extractStep(text: string, deps: PipelineDeps, warnings: string[]): Promise<{ claims: RawClaim[]; trace: StepTrace }> {
  const { keys, fetchImpl, env, log } = deps;
  if (keys.groq) {
    try {
      const { value, ms } = await timed(() => extractClaimsAi(text, keys.groq as string, modelsFor("extract", env), fetchImpl));
      return { claims: value.claims, trace: { step: "extract", engine: shortModelName(value.model), ai: true, ms } };
    } catch (error) {
      log?.(`[extract] Groq failed: ${errorText(error)}`);
      warnings.push("AI claim extraction failed, so basic sentence rules were used.");
    }
  }
  const { value, ms } = await timed(async () => extractClaimsBasic(text));
  return { claims: value, trace: { step: "extract", engine: "sentence rules", ai: false, ms } };
}

async function classifyStep(claims: RawClaim[], deps: PipelineDeps, warnings: string[]): Promise<{ categories: Category[]; trace: StepTrace }> {
  const { keys, fetchImpl, env, log } = deps;
  if (keys.groq && claims.length > 0) {
    try {
      const texts = claims.map((c) => c.text);
      const { value, ms } = await timed(() => classifyAi(texts, keys.groq as string, modelsFor("classify", env), fetchImpl));
      return { categories: value.categories, trace: { step: "classify", engine: shortModelName(value.model), ai: true, ms } };
    } catch (error) {
      log?.(`[classify] Groq failed: ${errorText(error)}`);
      warnings.push("AI classification failed, so keyword matching was used.");
    }
  }
  const { value, ms } = await timed(async () => claims.map((c) => classifyBasic(`${c.text} ${c.query}`)));
  return { categories: value, trace: { step: "classify", engine: "keyword matching", ai: false, ms } };
}

async function judgeOne(claim: Claim, gathered: GatherResult, deps: PipelineDeps): Promise<{ judgement: Judgement; engine: string; ai: boolean; failed: boolean }> {
  const { keys, fetchImpl, env, log } = deps;
  if (keys.groq) {
    try {
      const { judgement, model } = await judgeAi(claim, gathered.evidence, keys.groq, modelsFor("judge", env), fetchImpl);
      return { judgement, engine: shortModelName(model), ai: true, failed: false };
    } catch (error) {
      log?.(`[judge] Groq failed: ${errorText(error)}`);
      return { judgement: judgeBasic(gathered.evidence, claim.query), engine: "rating rules", ai: false, failed: true };
    }
  }
  return { judgement: judgeBasic(gathered.evidence, claim.query), engine: "rating rules", ai: false, failed: false };
}

export async function checkText(input: string, deps: PipelineDeps): Promise<CheckResult> {
  const text = input.slice(0, MAX_TEXT_LENGTH);
  const warnings: string[] = [];
  if (!deps.keys.groq) warnings.push("Running in basic mode (no Groq key): rule-based steps are used instead of AI models.");

  const extracted = await extractStep(text, deps, warnings);
  if (extracted.claims.length === 0) {
    return { results: [], steps: [extracted.trace], warnings: [...warnings, "No checkable claim was found in this message."] };
  }

  const classified = await classifyStep(extracted.claims, deps, warnings);
  const claims: Claim[] = extracted.claims.map((c, i) => ({ ...c, category: classified.categories[i] ?? "other" }));

  const gather = deps.gather ?? gatherEvidence;
  const search = await timed(() => Promise.all(claims.map((c) => gather(c.query, deps.keys, deps.fetchImpl))));
  const sourcesUsed = [...new Set(search.value.flatMap((g) => g.used))];
  const searchErrors = [...new Set(search.value.flatMap((g) => g.errors))];
  searchErrors.forEach((e) => deps.log?.(`[search] ${e}`));
  if (sourcesUsed.length === 0) warnings.push("Every evidence source failed (are you offline?), so verdicts may be Unverified.");

  const judged = await timed(() => Promise.all(claims.map((c, i) => judgeOne(c, search.value[i], deps))));
  if (judged.value.some((j) => j.failed)) warnings.push("AI judge failed for some claims, so rating rules were used.");

  const results: ClaimResult[] = claims.map((claim, i) => ({ claim, ...judged.value[i].judgement, evidence: search.value[i].evidence }));
  const judgeEngines = [...new Set(judged.value.map((j) => j.engine))].join(" + ");
  const steps: StepTrace[] = [
    extracted.trace,
    classified.trace,
    { step: "search", engine: sourcesUsed.join(" + ") || "none", ai: false, ms: search.ms, note: searchErrors.length ? `${searchErrors.length} source(s) failed` : undefined },
    { step: "judge", engine: judgeEngines, ai: judged.value.every((j) => j.ai), ms: judged.ms },
  ];
  return { results, steps, warnings };
}
