import { chatJson, type FetchLike } from "./groq";
import { CATEGORIES, type Category } from "./types";

/** Step 2 (Model 2b): label each claim as health, political, financial or other. */

// English words need word boundaries; Hindi/Telugu words are matched as plain substrings
function keywordPattern(english: string, local: string): RegExp {
  return new RegExp(`\\b(?:${english})\\b|${local}`, "i");
}

const KEYWORDS: Record<Exclude<Category, "other">, RegExp> = {
  health: keywordPattern(
    "cure[sd]?|vaccines?|virus|covid|corona|cancer|diseases?|doctors?|hospitals?|medicines?|immunity|diabetes|heart|fever|ayurved\\w*|drink(?:ing)?|hot water|lemon|garlic|turmeric|haldi|health|world health|icmr|aiims|infections?|tablets?|dengue|malaria|kidney|blood",
    "पानी|इलाज|बीमारी|दवा|వైద్యం|ఆరోగ్యం",
  ),
  financial: keywordPattern(
    "rs\\.?\\s?\\d+|rbi|banks?|notes?|coins?|currency|upi|atm|loans?|tax|gst|income|accounts?|salary|pension|lottery|money|rupees?|payments?|paytm|charges?|fees?|price|petrol|diesel|gold|bitcoin|crypto|epfo",
    "₹|पैसा|बैंक|नोट|రూపాయ",
  ),
  political: keywordPattern(
    "ministers?|pm|prime minister|cm|chief minister|modi|rahul|gandhi|bjp|congress|aap|elections?|votes?|voting|evm|parliament|lok sabha|rajya sabha|government|govt|party|mla|mp|president|supreme court|law|bill|ban(?:ned)?|protest|army|pakistan|china|unesco|national anthem",
    "सरकार|चुनाव|मोदी|ప్రభుత్వం|ఎన్నిక",
  ),
};

/** Keyword classifier, used when no Groq key is set. Ties go to the earlier category. */
export function classifyBasic(text: string): Category {
  let best: Category = "other";
  let bestHits = 0;
  for (const [category, pattern] of Object.entries(KEYWORDS) as [Category, RegExp][]) {
    const hits = text.match(new RegExp(pattern.source, "gi"))?.length ?? 0;
    if (hits > bestHits) {
      best = category;
      bestHits = hits;
    }
  }
  return best;
}

export function toCategory(value: unknown): Category {
  const lower = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (CATEGORIES as readonly string[]).includes(lower) ? (lower as Category) : "other";
}

const CLASSIFY_PROMPT = `Classify each numbered claim into exactly one category: "health", "political", "financial" or "other".
health = medicine, diseases, cures, food and body. political = government, leaders, elections, laws, national pride.
financial = money, banks, notes and coins, taxes, schemes, prices, payments. Use "other" for everything else.
Return JSON only: {"categories": ["health", ...]} with one entry per claim, in order.`;

export async function classifyAi(
  claims: string[],
  apiKey: string,
  models: string[],
  fetchImpl?: FetchLike,
): Promise<{ categories: Category[]; model: string }> {
  const numbered = claims.map((claim, i) => `${i + 1}. ${claim}`).join("\n");
  const { data, model } = await chatJson({
    apiKey,
    models,
    fetchImpl,
    maxTokens: 200,
    messages: [
      { role: "system", content: CLASSIFY_PROMPT },
      { role: "user", content: numbered },
    ],
  });
  const raw = Array.isArray(data.categories) ? data.categories : [];
  // fill any gaps the model left with the keyword classifier
  const categories = claims.map((claim, i) => (i < raw.length ? toCategory(raw[i]) : classifyBasic(claim)));
  return { categories, model };
}
