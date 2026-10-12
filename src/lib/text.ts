/** Small text helpers shared by evidence ranking and the rule-based judge. */

/** Rough stemming so "charging", "chargeable" and "charge" match. */
export function stem(word: string): string {
  let w = word;
  for (let i = 0; i < 2 && w.length > 4; i++) w = w.replace(/(ability|able|ing|ed|s|e)$/, "");
  return w;
}

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/₹\s*/g, " rs ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 || /\d/.test(w))
      .map(stem),
  );
}

/** Does a headline talk about the same thing as the claim? (shares at least 2 keywords) */
export function isRelevant(title: string, query: string): boolean {
  if (!query.trim()) return true;
  const wanted = tokens(query);
  const shared = [...tokens(title)].filter((w) => wanted.has(w)).length;
  return shared >= Math.min(2, wanted.size);
}

/** Search engines mostly ignore "₹"; "₹2000" becomes "Rs 2000". */
export function searchQuery(query: string): string {
  return query
    .replace(/₹\s*/g, "Rs ")
    .replace(/[^\p{L}\p{M}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SHORT_QUERY_WORDS = 5;

/** Google News only returns articles containing every word, so long queries find nothing. */
export function shortQuery(query: string): string {
  return query.split(/\s+/).slice(0, SHORT_QUERY_WORDS).join(" ");
}
