import { chatJson, type FetchLike } from "./groq";
import { isRelevant } from "./text";
import { isFactChecker } from "./trusted";
import type { Claim, Confidence, Evidence, Verdict } from "./types";
import { VERDICTS } from "./types";

export { isRelevant, stem } from "./text";

/** Step 4 (Model 5): weigh the evidence and give a verdict. */

export interface Judgement {
  verdict: Verdict;
  confidence: Confidence;
  explanation: string;
  citations: number[];
}

const FALSE_WORDS = /\b(false|fake|hoax|incorrect|wrong|fabricated|baseless|no evidence|pants on fire|not true|untrue|scam|debunk\w*|misinformation|rumou?r)\b|फर्जी|झूठ|తప్పు|నకిలీ/i;
const MISLEADING_WORDS = /\b(misleading|partly|partially|half true|mixed|missing context|out of context|exaggerat\w*|old (video|image|photo)|edited|altered|satire|distort\w*)\b|भ्रामक/i;
const TRUE_WORDS = /\b(true|correct|accurate|mostly true|real|genuine|confirmed)\b/i;

/** Map a fact-checker's free-text rating ("Fake", "Partly False", ...) onto our four verdicts. */
export function normalizeRating(rating: string | undefined): Verdict {
  if (!rating) return "Unverified";
  if (MISLEADING_WORDS.test(rating)) return "Misleading";
  if (FALSE_WORDS.test(rating)) return "False";
  if (TRUE_WORDS.test(rating)) return "True";
  return "Unverified";
}

// headline phrasing fact-checkers use when debunking ("No, RBI is not...", "Viral claim that ... is fake")
const DEBUNK_HEADLINE = new RegExp(`^(no,|fact ?check:?\\s*(no|fake|false))|${FALSE_WORDS.source}|do(es)? not|did not|didn't|doesn't|isn't|aren't`, "i");

/** Rule-based verdict from ratings and headlines, used when no Groq key is set. */
export function judgeBasic(evidence: Evidence[], query = ""): Judgement {
  const rated = evidence.filter((e) => e.rating && normalizeRating(e.rating) !== "Unverified");
  if (rated.length > 0) {
    const counts = new Map<Verdict, number[]>();
    for (const e of rated) {
      const v = normalizeRating(e.rating);
      counts.set(v, [...(counts.get(v) ?? []), e.id]);
    }
    const [verdict, ids] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const agree = ids.length;
    return {
      verdict,
      confidence: agree >= 2 && agree === rated.length ? "high" : "medium",
      explanation: `${agree} fact-check${agree > 1 ? "s" : ""} rated a matching claim as "${rated.find((e) => e.id === ids[0])?.rating}".`,
      citations: ids.slice(0, 4),
    };
  }

  const relevantTrusted = evidence.filter((e) => (e.trusted || isFactChecker(e.publisher)) && isRelevant(e.title, query));
  const debunks = relevantTrusted.filter((e) => DEBUNK_HEADLINE.test(e.title) || MISLEADING_WORDS.test(e.title));
  const misleading = debunks.filter((e) => MISLEADING_WORDS.test(e.title));
  // real events also attract fact-checks of related fake videos; if most trusted coverage
  // is ordinary reporting, the debunks are probably about something else
  const reporting = relevantTrusted.length - debunks.length;
  if (debunks.length > 0 && reporting > debunks.length) {
    return {
      verdict: "Unverified",
      confidence: "low",
      explanation: `Trusted outlets report on this topic (${reporting} articles), and some fact-checks debunk related claims. Basic mode can't tell which applies here; open the sources.`,
      citations: [...debunks, ...relevantTrusted.filter((e) => !debunks.includes(e))].slice(0, 4).map((e) => e.id),
    };
  }
  if (debunks.length > 0) {
    const verdict: Verdict = misleading.length > debunks.length / 2 ? "Misleading" : "False";
    const used = verdict === "Misleading" ? misleading : debunks;
    return {
      verdict,
      confidence: used.length >= 2 ? "medium" : "low",
      explanation: `${used.length} trusted source${used.length > 1 ? "s" : ""} published headlines calling this claim ${verdict === "False" ? "false or fake" : "misleading"}. Open the sources to confirm they discuss the same claim.`,
      citations: used.slice(0, 4).map((e) => e.id),
    };
  }

  return {
    verdict: "Unverified",
    confidence: "low",
    explanation:
      evidence.length > 0
        ? "Related news was found, but nothing that clearly confirms or debunks this exact claim. Treat it with caution and don't forward it yet."
        : "No fact-checks or trusted news about this claim were found. That doesn't make it true; it may be new or made up.",
    citations: [],
  };
}

function formatEvidence(evidence: Evidence[]): string {
  if (evidence.length === 0) return "(no evidence found)";
  return evidence
    .map((e) =>
      [
        `[${e.id}] ${e.title}`,
        `    publisher: ${e.publisher}${e.trusted ? " (trusted)" : ""}${e.date ? `, ${e.date}` : ""}`,
        e.rating ? `    fact-checker rating: ${e.rating}` : "",
        e.snippet ? `    snippet: ${e.snippet}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

const JUDGE_PROMPT = `You are a careful fact-checker for Indian WhatsApp forwards. Return JSON only.
Decide if the claim is "True", "False", "Misleading" or "Unverified", using ONLY the numbered evidence.
- Ratings from fact-checkers (PIB Fact Check, Alt News, BOOM, Factly, Vishvas News, AFP...) carry the most weight, but only if they are about the same claim.
- "Misleading" = partly true, exaggerated, missing context, or an old event presented as new.
- If the evidence does not directly address the claim, answer "Unverified". Never guess from general knowledge.
- explanation: 1-2 short sentences in plain, simple English that a non-expert understands.
- citations: ids of the evidence items you relied on.
Shape: {"verdict": string, "confidence": "low"|"medium"|"high", "explanation": string, "citations": number[]}`;

export function parseJudgement(data: Record<string, unknown>, evidence: Evidence[]): Judgement {
  const verdict = (VERDICTS as readonly string[]).includes(String(data.verdict)) ? (data.verdict as Verdict) : "Unverified";
  const ids = new Set(evidence.map((e) => e.id));
  const citations = (Array.isArray(data.citations) ? data.citations : []).map(Number).filter((id) => ids.has(id)).slice(0, 5);
  let confidence: Confidence = ["low", "medium", "high"].includes(String(data.confidence)) ? (data.confidence as Confidence) : "low";
  // a verdict with nothing to back it up can't be confident
  if (verdict !== "Unverified" && citations.length === 0) confidence = "low";
  // links only ever come from the evidence list, never from model text (guards against injected phishing links)
  const raw = typeof data.explanation === "string" ? data.explanation.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/\s+/g, " ").trim() : "";
  const explanation = raw ? raw.slice(0, 500) : "No explanation given.";
  return { verdict, confidence, explanation, citations };
}

export async function judgeAi(
  claim: Claim,
  evidence: Evidence[],
  apiKey: string,
  models: string[],
  fetchImpl?: FetchLike,
  today = new Date().toISOString().slice(0, 10),
): Promise<{ judgement: Judgement; model: string }> {
  const { data, model } = await chatJson({
    apiKey,
    models,
    fetchImpl,
    maxTokens: 700,
    messages: [
      { role: "system", content: JUDGE_PROMPT },
      { role: "user", content: `Today: ${today}\nClaim (${claim.category}): ${claim.text}\n\nEvidence:\n${formatEvidence(evidence)}` },
    ],
  });
  return { judgement: parseJudgement(data, evidence), model };
}
