/** Sources we treat as trustworthy: Indian fact-checkers, official bodies and major newsrooms. */

export const FACT_CHECKERS = [
  "pib.gov.in",
  "factcheck.pib.gov.in",
  "altnews.in",
  "boomlive.in",
  "factly.in",
  "newschecker.in",
  "vishvasnews.com",
  "factchecker.in",
  "thequint.com",
  "indiatoday.in",
  "newsmeter.in",
  "logicallyfacts.com",
  "afp.com",
  "factcheck.afp.com",
];

export const OFFICIAL = ["who.int", "mohfw.gov.in", "icmr.gov.in", "rbi.org.in", "eci.gov.in", "npci.org.in", "isro.gov.in", "gov.in", "nic.in"];

export const NEWSROOMS = [
  "thehindu.com",
  "indianexpress.com",
  "hindustantimes.com",
  "timesofindia.indiatimes.com",
  "ndtv.com",
  "livemint.com",
  "business-standard.com",
  "economictimes.indiatimes.com",
  "deccanherald.com",
  "scroll.in",
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
];

export const TRUSTED_DOMAINS = [...FACT_CHECKERS, ...OFFICIAL, ...NEWSROOMS];

// publisher names as they appear in Google News, for results whose link is a Google redirect
const TRUSTED_NAMES = [
  "pib",
  "press information bureau",
  "alt news",
  "boom",
  "factly",
  "newschecker",
  "vishvas news",
  "the quint",
  "india today",
  "newsmeter",
  "afp",
  "the hindu",
  "the indian express",
  "hindustan times",
  "times of india",
  "ndtv",
  "mint",
  "livemint",
  "business standard",
  "the economic times",
  "deccan herald",
  "scroll",
  "reuters",
  "associated press",
  "ap news",
  "bbc",
  "world health organization",
  "reserve bank of india",
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isTrustedUrl(url: string): boolean {
  const host = hostOf(url);
  return Boolean(host) && TRUSTED_DOMAINS.some((domain) => matchesDomain(host, domain));
}

export function isTrustedPublisher(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return TRUSTED_NAMES.some((trusted) => lower === trusted || lower.startsWith(`${trusted} `));
}

export function isFactChecker(urlOrName: string): boolean {
  const host = hostOf(urlOrName);
  if (host) return FACT_CHECKERS.some((domain) => matchesDomain(host, domain));
  const lower = urlOrName.toLowerCase();
  return ["pib", "alt news", "boom", "factly", "newschecker", "vishvas", "quint", "afp", "fact check"].some((n) => lower.includes(n));
}
