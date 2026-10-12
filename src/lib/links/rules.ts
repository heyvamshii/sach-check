import { stem, tokens } from "../text";
import { stripLinks } from "./extract";
import type { LinkSignal, LinkVerdict, Relation } from "../types";
import { BRANDS, freeHostOf, isGovernmentHost, isShortener, isSubdomainOf, knownGoodSite, registeredDomain, RISKY_TLDS, unLeetVariants, userContentHostOf } from "./domains";

/** Rule-based link checks. They need no keys and no network, so they always run. */

export interface RuleReport {
  host: string;
  domain: string;
  points: number;
  verdict: LinkVerdict;
  signals: LinkSignal[];
  impersonates?: string;
  officialSite?: string;
  related: Relation;
}

const SCAM_WORDS = [
  "kyc", "reward", "rewards", "lottery", "prize", "winner", "claim", "free", "gift", "offer", "bonus", "cashback", "verify", "verification",
  "update", "login", "signin", "secure", "blocked", "suspend", "suspended", "refund", "recharge", "yojana", "subsidy", "register", "otp", "lucky", "jackpot", "loan",
];
const SCAM_WORD_POINTS_MAX = 2;
const GOVERNMENT_WORDS = /\b(government|govt|sarkar|yojana|scheme|ministry|pradhan mantri|pm [a-z]+ yojana)\b|सरकार|योजना|ప్రభుత్వ|పథకం/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
// URL words that say nothing about the topic
const URL_NOISE = new Set(["www", "http", "https", "html", "htm", "php", "aspx", "index", "page", "home", "com", "org", "net", "amp", "utm", "source", "medium"]);

const DANGEROUS_AT = 4;
const SUSPICIOUS_AT = 2;

// shorter brand words ("jio", "epf", "sbi") must match a whole word, or "jiosaavn" and "epfl" would count
const MIN_PARTIAL_BRAND_WORD = 4;

function brandWordIn(label: string, word: string): boolean {
  return unLeetVariants(label).some((l) => l === word || (word.length >= MIN_PARTIAL_BRAND_WORD && (l.startsWith(word) || l.endsWith(word))));
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // broken %-escapes ("/%E0%A4") must not crash the check
    return text;
  }
}

/** A brand whose name appears in the address although the site is not that brand's. */
function impersonatedBrand(host: string): string | undefined {
  const labels = host.toLowerCase().replace(/^www\./, "").split(/[.-]/);
  for (const brand of BRANDS) {
    if (brand.domains.some((d) => isSubdomainOf(host, d))) return undefined;
    if (labels.some((label) => brand.words.some((word) => brandWordIn(label, word)))) return brand.name;
  }
  return undefined;
}

/** Brands the message itself talks about ("Dear SBI customer..."). */
function brandsInMessage(message: string): typeof BRANDS {
  const lower = message.toLowerCase();
  return BRANDS.filter((b) => b.words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(lower)) || lower.includes(b.name.toLowerCase()));
}

export function urlWords(url: URL): Set<string> {
  const host = url.hostname.replace(/^www\./, "").split(".").slice(0, -1).join(" ");
  const path = safeDecode(url.pathname + url.search).replace(/[\/_\-=&?.+]/g, " ");
  return new Set([...tokens(`${host} ${path}`)].filter((w) => w.length >= 3 && !URL_NOISE.has(w) && !/^\d+$/.test(w)));
}

function relatedness(url: URL, message: string, isOfficialForMessage: boolean): Relation {
  if (isOfficialForMessage) return "yes";
  const words = urlWords(url);
  const messageWords = tokens(message);
  return [...words].some((w) => messageWords.has(w)) ? "yes" : "unclear";
}

export function analyzeLink(rawUrl: string, fullMessage: string): RuleReport {
  // judge the message by its words, not by the links inside it ("visit incometax.gov.in" doesn't mention income tax)
  const message = stripLinks(fullMessage);
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  const domain = registeredDomain(host);
  const tld = domain.split(".").pop() ?? "";
  const signals: LinkSignal[] = [];
  let points = 0;
  const add = (n: number, kind: LinkSignal["kind"], text: string) => {
    points += n;
    signals.push({ kind, text });
  };

  // tricks that hide where a link really goes
  if (url.username || url.password) add(3, "danger", "The address contains '@', a trick that hides the real website after it.");
  if (IPV4.test(host) || host.startsWith("[")) add(3, "danger", "It points to a bare number (IP address) instead of a website name. Real banks and government sites never do this.");
  if (host.includes("xn--")) add(3, "danger", "The name uses look-alike foreign letters (punycode) to copy a real website's name.");

  const official = knownGoodSite(host);
  const mentioned = brandsInMessage(message);
  const messageWantsGov = GOVERNMENT_WORDS.test(message);

  if (official && points === 0) {
    signals.push({ kind: "good", text: `This is the real website of ${official}.` });
    const ownerBrand = BRANDS.find((b) => b.domains.some((d) => isSubdomainOf(host, d)));
    let related = relatedness(url, message, Boolean(ownerBrand && mentioned.includes(ownerBrand)));
    // a specific organisation's site that the message never mentions: e.g. the tax site under an electricity-bill message
    if (related === "unclear" && ownerBrand && message.trim()) {
      related = "no";
      signals.push({ kind: "warning", text: `The message never mentions ${ownerBrand.name}, so this link may have nothing to do with what it claims.` });
    }
    return { host, domain, points: 0, verdict: "Safe", signals, officialSite: official, related };
  }

  if (isShortener(host)) add(1, "warning", "It's a shortened link, which hides the real website until you open it.");
  const platform = userContentHostOf(host);
  if (platform && !freeHostOf(host)) {
    signals.push({ kind: "info", text: `This is on ${platform}, where anyone can post. The page isn't official just because the site is well known.` });
  }
  const freeHost = freeHostOf(host);
  if (freeHost) add(2, "warning", `It's hosted on a free website builder (${freeHost}). Real banks, shops and government sites never use these.`);

  const impersonates = impersonatedBrand(host);
  if (impersonates) add(4, "danger", `The address uses the name "${impersonates}", but it is not ${impersonates}'s official website.`);

  const pretendsToBeMentioned = mentioned.find((b) => !b.domains.some((d) => isSubdomainOf(host, d)));
  if (pretendsToBeMentioned && !impersonates && !isShortener(host)) {
    add(2, "warning", `The message mentions ${pretendsToBeMentioned.name}, but this link is not ${pretendsToBeMentioned.name}'s website (${pretendsToBeMentioned.domains[0]}).`);
  }
  if (messageWantsGov && !isGovernmentHost(host) && !isShortener(host)) {
    add(2, "warning", "The message talks about a government scheme, but real government websites end in .gov.in or .nic.in, and this one doesn't.");
  }

  if (RISKY_TLDS.has(tld)) add(2, "warning", `It ends in ".${tld}", a cheap domain ending that scam sites use a lot.`);
  if (url.protocol === "http:") add(1, "warning", "It isn't a secure (https) link.");
  if ((domain.match(/-/g) ?? []).length >= 2) add(1, "warning", "The website name is stuffed with hyphens, a common pattern in fake sites.");
  if (host.split(".").length > 4) add(1, "warning", "The address has an unusually long chain of sub-names, often used to look like a real site.");

  const words = urlWords(url);
  const scamWords = SCAM_WORDS.filter((w) => words.has(stem(w)) || host.includes(w));
  if (scamWords.length > 0) {
    const n = Math.min(SCAM_WORD_POINTS_MAX, scamWords.length);
    add(n, "warning", `The address contains bait words: ${scamWords.slice(0, 4).map((w) => `"${w}"`).join(", ")}.`);
  }

  const verdict: LinkVerdict = points >= DANGEROUS_AT ? "Dangerous" : points >= SUSPICIOUS_AT ? "Suspicious" : "Unknown";
  if (verdict === "Unknown") signals.push({ kind: "info", text: "No obvious warning signs, but this isn't a website we recognise." });
  const target = impersonates ?? pretendsToBeMentioned?.name ?? (messageWantsGov && !isGovernmentHost(host) ? "a government website" : undefined);
  return { host, domain, points, verdict, signals, impersonates: target, related: relatedness(url, message, false) };
}
