import { chatJson, type FetchLike } from "./groq";

/** Step 1 (Model 2a): pull the checkable claims out of a forward. */

export const MAX_CLAIMS = 3;
const MAX_QUERY_WORDS = 10;

export interface RawClaim {
  text: string;
  query: string;
}

// lines that are WhatsApp noise, not claims
const NOISE_LINE =
  /^(forwarded( many times)?|fwd:?|please (share|forward)|share (this|with)|forward (this|to)|jai hind|good morning|must read|read till end|send (this|to)|copied|as received)\b/i;
const URL_PATTERN = /https?:\/\/\S+|www\.\S+/gi;
const SHARE_PHRASE = /\b(?:please\s+)?(?:share|forward|send)\s+(?:this|it|to|with|in)\b[^.!?]*[.!?]?/gi;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

const STOPWORDS = new Set(
  "a an the is are was were be been being am do does did has have had will would shall should can could may might must of in on at to for from by with about as into than then that this these those it its it's and or but if so not no yes all any every each your you we our they their he she his her them us i me my very just also only more most please share forward news message friends groups people everyone now today".split(
    " ",
  ),
);

// words that make a sentence look like a factual claim rather than chatter
const CLAIM_HINTS =
  /\b(will|has|have|is|are|was|declared|announced|confirmed|cure[sd]?|kills?|ban(ned)?|free|government|govt|rbi|who|minister|scheme|note|vaccine|virus|cancer|law|rule|fine|tax|bank|account|chip|deadline|from (today|tomorrow)|new)\b|\d/i;

const NOISE_LINE_MAX_WORDS = 6;

export function cleanForward(text: string): string {
  return text
    .replace(URL_PATTERN, " ")
    .replace(EMOJI, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[*_~]+/g, "").trim())
    // drop short noise lines ("Forwarded many times"); strip the noise opener from longer ones
    .filter((line) => line && /[\p{L}\p{N}]/u.test(line) && !(NOISE_LINE.test(line) && line.split(/\s+/).length <= NOISE_LINE_MAX_WORDS))
    .map((line) => line.replace(NOISE_LINE, "").replace(/^[\s!,.:-]+/, ""))
    .join("\n")
    .replace(SHARE_PHRASE, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Screenshots wrap one sentence over several lines. Join a line to the next when it has no
 * closing punctuation and the next line carries on (starts lowercase, with a digit, or in Hindi/Telugu).
 */
export function unwrapLines(text: string): string {
  return text.replace(/([^.!?।:\n])[ \t]*\n[ \t]*(?=[a-z0-9₹ऀ-ॿఀ-౿])/gu, "$1 ");
}

export function splitSentences(text: string): string[] {
  return unwrapLines(text)
    .split(/(?<=[.!?।])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);
}

/** English keywords for a search engine. Non-Latin words are kept, since news search handles them. */
export function toQuery(sentence: string): string {
  const words = sentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s₹%]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  return words.slice(0, MAX_QUERY_WORDS).join(" ");
}

function scoreSentence(sentence: string): number {
  const words = sentence.split(/\s+/).length;
  let score = CLAIM_HINTS.test(sentence) ? 2 : 0;
  if (/\d/.test(sentence)) score += 1;
  if (words >= 6 && words <= 40) score += 1;
  if (/\?$/.test(sentence)) score -= 2;
  return score;
}

// a sentence starting like this continues the previous claim ("It can be tracked...")
const CONTINUATION = /^(it|this|that|they|these|those|he|she|its|their|also|and|but|so)\b/i;
const BASIC_MAX_CLAIMS = 2;

/** Join follow-on sentences to the sentence they describe. */
export function mergeContinuations(sentences: string[]): string[] {
  return sentences.reduce<string[]>((merged, sentence) => {
    if (merged.length > 0 && CONTINUATION.test(sentence)) {
      return [...merged.slice(0, -1), `${merged[merged.length - 1]} ${sentence}`];
    }
    return [...merged, sentence];
  }, []);
}

/** Rule-based extraction, used when no Groq key is set or Groq fails. Conservative: at most 2 claims. */
export function extractClaimsBasic(text: string): RawClaim[] {
  const sentences = mergeContinuations(splitSentences(cleanForward(text)));
  if (sentences.length === 0) {
    const fallback = cleanForward(text).slice(0, 300);
    return fallback ? [{ text: fallback, query: toQuery(fallback) }] : [];
  }
  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, BASIC_MAX_CLAIMS)
    // a second claim must look clearly factual on its own
    .filter((item, i) => i === 0 || item.score >= 4)
    .sort((a, b) => a.index - b.index);
  return ranked.map(({ sentence }) => ({ text: sentence, query: toQuery(sentence.split(/(?<=[.!?।])\s+/u)[0]) }));
}

const EXTRACT_PROMPT = `You help fact-check WhatsApp forwards from India. Return JSON only.
Find the checkable factual claims in the message (at most ${MAX_CLAIMS}). Ignore greetings, opinions, prayers and "please share" requests.
The message may be in English, Hindi, Telugu or a mix. Keep "text" in the original language, quoted or closely paraphrased.
"query" is a short English news-search query of 3-6 key words (names, numbers, the key object), most important words first, e.g. "Rs 2000 note GPS chip". Use "Rs" instead of "₹".
Shape: {"claims": [{"text": string, "query": string}]}. If there is nothing checkable, return {"claims": []}.`;

export function parseClaimsJson(data: Record<string, unknown>): RawClaim[] {
  const list = Array.isArray(data.claims) ? data.claims : [];
  return list
    .flatMap((item): RawClaim[] => {
      if (!item || typeof item !== "object") return [];
      const { text, query } = item as Record<string, unknown>;
      if (typeof text !== "string" || !text.trim()) return [];
      const cleanText = text.trim().slice(0, 400);
      const cleanQuery = typeof query === "string" && query.trim() ? query.trim().slice(0, 120) : toQuery(cleanText);
      return [{ text: cleanText, query: cleanQuery }];
    })
    .slice(0, MAX_CLAIMS);
}

export async function extractClaimsAi(
  text: string,
  apiKey: string,
  models: string[],
  fetchImpl?: FetchLike,
): Promise<{ claims: RawClaim[]; model: string }> {
  const { data, model } = await chatJson({
    apiKey,
    models,
    fetchImpl,
    maxTokens: 800,
    messages: [
      { role: "system", content: EXTRACT_PROMPT },
      { role: "user", content: `Message:\n"""\n${text}\n"""` },
    ],
  });
  return { claims: parseClaimsJson(data), model };
}
