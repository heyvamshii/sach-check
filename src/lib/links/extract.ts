/**
 * Finds every link in a message: full URLs, "www." links, and bare domains such as
 * "sbi-kyc-update.xyz/login" sitting in the middle of a sentence.
 */

export const MAX_LINKS = 5;

export interface FoundLink {
  /** exactly as written in the message */
  raw: string;
  /** with https:// added when missing, ready to analyse */
  url: string;
  /** the sentence around the link, so the reader knows which part of the message it belongs to */
  context: string;
}

// endings that real links use; keeps "Rs.2000" or "e.g." from being read as links
const TLDS =
  "com|in|org|net|info|biz|co|io|me|ly|gl|gd|cc|to|app|dev|xyz|top|click|link|site|online|club|live|shop|store|buzz|loan|win|bid|icu|rest|monster|cyou|sbs|cfd|fun|space|work|tk|ml|ga|cf|gq|ru|cn|pk|bd|uk|us|int|gov|edu|news|tv|pro|vip|today|tech|website|support|help|bank|sbi|page|cloud|world|life|one|art|ws|su|pw|lk|ai|im|cx|mobi|name|asia|digital|network|email|services|host|cam|men|date|review|stream|download|party|trade|cricket|science|loans|money|cash|finance|ink|tel";

const LINK_PATTERN = new RegExp(
  [
    "https?:\\/\\/[^\\s<>\"'`]+",
    "www\\.[^\\s<>\"'`]+",
    // bare domain, optionally with a path: label(s) + known ending + boundary
    `(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${TLDS})(?![a-z0-9-])(?::\\d{2,5})?(?:\\/[^\\s<>"'\`]*)?`,
  ].join("|"),
  "gi",
);

const TRAILING_PUNCTUATION = /[.,!?;:)\]}>'"’”…]+$/u;

function sentenceAround(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const from = Math.max(before.lastIndexOf("\n"), before.search(/[.!?।][^.!?।]*$/u)) + 1;
  const toMatch = after.search(/[.!?।]\s|\n/u);
  const to = toMatch === -1 ? text.length : end + toMatch + 1;
  return text.slice(from, to).replace(/\s+/g, " ").trim().slice(0, 300);
}

export function normalizeLink(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    // a real link has a dotted name or an IPv6 address like [::1]
    if (!url.hostname.includes(".") && !url.hostname.startsWith("[")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** An e-mail address (name@bank.com): the part after "@" is not a link. Full links after "@" still count. */
function isEmailDomain(text: string, start: number, match: string): boolean {
  return start > 0 && text[start - 1] === "@" && !/^(https?:\/\/|www\.)/i.test(match);
}

export function findLinks(text: string, limit = MAX_LINKS): FoundLink[] {
  const found: FoundLink[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0;
    if (isEmailDomain(text, start, match[0])) continue;
    const raw = match[0].replace(TRAILING_PUNCTUATION, "");
    const url = normalizeLink(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    found.push({ raw, url, context: sentenceAround(text, start, start + raw.length) });
    if (found.length >= limit) break;
  }
  return found;
}

/** How many distinct links a message has, including any beyond the checking limit. */
export function countLinks(text: string): number {
  return findLinks(text, Number.POSITIVE_INFINITY).length;
}

/** The message with its links taken out, so claim-checking only sees the words. */
export function stripLinks(text: string): string {
  return text
    .replace(LINK_PATTERN, (match, offset: number, whole: string) => (isEmailDomain(whole, offset, match) ? match : " "))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
