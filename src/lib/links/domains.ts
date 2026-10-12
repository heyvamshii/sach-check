import { TRUSTED_DOMAINS } from "../trusted";

/** Domain knowledge for the link checker: official sites, link shorteners and risky endings. */

// endings where the part before them is not the owner's name ("sbi.co.in" is owned by "sbi")
const TWO_PART_SUFFIXES = new Set(["co.in", "gov.in", "org.in", "net.in", "ac.in", "nic.in", "res.in", "edu.in", "co.uk", "org.uk", "gov.uk", "com.au", "co.jp", "com.br", "com.pk", "com.bd"]);

/** "netbanking.sbi.co.in" -> "sbi.co.in"; "secure-sbi.xyz" -> "secure-sbi.xyz". */
export function registeredDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

export function isSubdomainOf(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return h === domain || h.endsWith(`.${domain}`);
}

/** Organisations scammers pretend to be, with the only domains they really use. Multi-word entries only match message text. */
export const BRANDS: { name: string; words: string[]; domains: string[] }[] = [
  { name: "SBI", words: ["sbi", "onlinesbi", "yono"], domains: ["sbi.co.in", "onlinesbi.sbi", "sbi.bank.in", "sbicard.com", "yonobusiness.sbi"] },
  { name: "HDFC Bank", words: ["hdfc"], domains: ["hdfcbank.com", "hdfc.com", "hdfcbank.bank.in"] },
  { name: "ICICI Bank", words: ["icici"], domains: ["icicibank.com", "icici.bank.in"] },
  { name: "Axis Bank", words: ["axisbank"], domains: ["axisbank.com"] },
  { name: "Kotak", words: ["kotak"], domains: ["kotak.com"] },
  { name: "Paytm", words: ["paytm"], domains: ["paytm.com", "paytmbank.com"] },
  { name: "PhonePe", words: ["phonepe"], domains: ["phonepe.com"] },
  { name: "Google Pay", words: ["gpay", "googlepay", "google pay"], domains: ["google.com"] },
  { name: "Amazon", words: ["amazon"], domains: ["amazon.in", "amazon.com", "amzn.to", "amzn.in"] },
  { name: "Flipkart", words: ["flipkart"], domains: ["flipkart.com", "fkrt.it"] },
  { name: "WhatsApp", words: ["whatsapp"], domains: ["whatsapp.com", "wa.me", "whatsapp.net"] },
  { name: "Facebook", words: ["facebook"], domains: ["facebook.com", "fb.com", "fb.me"] },
  { name: "Instagram", words: ["instagram"], domains: ["instagram.com"] },
  { name: "RBI", words: ["rbi", "reservebank", "reserve bank"], domains: ["rbi.org.in"] },
  { name: "NPCI / UPI", words: ["npci", "bhim"], domains: ["npci.org.in", "bhimupi.org.in"] },
  { name: "IRCTC", words: ["irctc"], domains: ["irctc.co.in"] },
  { name: "Aadhaar (UIDAI)", words: ["aadhaar", "aadhar", "uidai"], domains: ["uidai.gov.in"] },
  { name: "Income Tax Dept.", words: ["incometax", "income tax"], domains: ["incometax.gov.in"] },
  { name: "EPFO", words: ["epfo", "epf", "provident fund"], domains: ["epfindia.gov.in"] },
  { name: "India Post", words: ["indiapost", "india post"], domains: ["indiapost.gov.in"] },
  { name: "Jio", words: ["jio"], domains: ["jio.com"] },
  { name: "Airtel", words: ["airtel"], domains: ["airtel.in", "airtel.com"] },
  { name: "KBC / Sony", words: ["kbc", "kaunbanega"], domains: ["sonyliv.com", "sonypicturesnetworks.com"] },
  { name: "Tata", words: ["tata"], domains: ["tata.com", "tatamotors.com", "tataneu.com"] },
  { name: "WHO", words: ["who-int", "world health organization"], domains: ["who.int"] },
  // global brands that scam messages in India also copy
  { name: "Netflix", words: ["netflix", "ntflx"], domains: ["netflix.com"] },
  { name: "PayPal", words: ["paypal"], domains: ["paypal.com", "paypal.me"] },
  { name: "Apple", words: ["icloud", "appleid"], domains: ["apple.com", "icloud.com"] },
  { name: "Microsoft", words: ["microsoft", "office365", "hotmail"], domains: ["microsoft.com", "live.com", "office.com", "outlook.com"] },
  { name: "DHL", words: ["dhl"], domains: ["dhl.com", "dhl.co.in"] },
  { name: "FedEx", words: ["fedex"], domains: ["fedex.com"] },
  { name: "USPS", words: ["usps"], domains: ["usps.com"] },
  { name: "MetaMask", words: ["metamask"], domains: ["meta.com", "metamask.io"] },
  { name: "Binance", words: ["binance"], domains: ["binance.com"] },
];

/** Free website builders and hosting: fine for hobby sites, never used by banks or government. */
export const FREE_HOSTS = [
  "vercel.app", "pages.dev", "workers.dev", "netlify.app", "web.app", "firebaseapp.com", "github.io", "glitch.me", "weebly.com", "wixsite.com",
  "blogspot.com", "000webhostapp.com", "replit.app", "repl.co", "onrender.com", "herokuapp.com", "ngrok.io", "ngrok-free.app", "webflow.io", "square.site", "godaddysites.com", "sites.google.com", "framer.app", "carrd.co", "duckdns.org",
];

/** A site built on a free platform ("sbi-kyc.pages.dev"), not the platform's own home page ("pages.dev"). */
export function freeHostOf(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  return FREE_HOSTS.find((d) => h !== d && isSubdomainOf(h, d)) ?? null;
}

/**
 * Real companies, but anyone can post content on them: a Google Form, a GitHub page,
 * a wa.me chat with a stranger. Being on these sites says nothing about who made the page.
 */
const USER_CONTENT_HOSTS = [
  "sites.google.com", "docs.google.com", "forms.gle", "drive.google.com", "storage.googleapis.com", "script.google.com", "groups.google.com",
  "github.com", "gist.github.com", "raw.githubusercontent.com", "wa.me", "chat.whatsapp.com", "t.me", "telegram.me",
  "youtube.com", "youtu.be", "linkedin.com", "x.com", "twitter.com", "facebook.com", "fb.me", "instagram.com", "medium.com",
];

export function userContentHostOf(host: string): string | null {
  return freeHostOf(host) ?? USER_CONTENT_HOSTS.find((d) => isSubdomainOf(host, d)) ?? null;
}

/** Government sites in India end in gov.in or nic.in. */
export function isGovernmentHost(host: string): boolean {
  return isSubdomainOf(host, "gov.in") || isSubdomainOf(host, "nic.in");
}

const OTHER_KNOWN_GOOD = ["google.com", "wikipedia.org", "microsoft.com", "apple.com"];

/** A site we recognise as legitimate (an official brand site, government, or a trusted newsroom/fact-checker). */
export function knownGoodSite(host: string): string | null {
  // anyone can publish on sites.google.com, github.com, pages.dev and the like
  if (userContentHostOf(host)) return null;
  for (const brand of BRANDS) if (brand.domains.some((d) => isSubdomainOf(host, d))) return brand.name;
  if (isGovernmentHost(host)) return "an Indian government site";
  const trusted = [...TRUSTED_DOMAINS, ...OTHER_KNOWN_GOOD].find((d) => isSubdomainOf(host, d));
  return trusted ?? null;
}

export const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "is.gd", "rb.gy", "shorturl.at", "tiny.cc", "ow.ly", "buff.ly", "s.id", "t.ly", "rebrand.ly", "shorte.st", "v.gd", "tiny.one", "bitly.ws", "lnkd.in",
]);

export function isShortener(host: string): boolean {
  return SHORTENERS.has(host.toLowerCase().replace(/^www\./, ""));
}

// cheap endings that scam sites use far more often than real businesses
export const RISKY_TLDS = new Set(["xyz", "top", "click", "buzz", "loan", "win", "bid", "icu", "rest", "monster", "cyou", "sbs", "cfd", "fun", "space", "work", "tk", "ml", "ga", "cf", "gq", "vip", "online", "site", "club", "live", "shop", "support", "help"]);

/** Undo the letter swaps used in look-alike names: "amaz0n" -> "amazon", "paytrn" -> "paytm", "sb1" -> "sbi". */
export function unLeetVariants(text: string): string[] {
  const base = text.toLowerCase().replace(/0/g, "o").replace(/3/g, "e").replace(/5/g, "s").replace(/@/g, "a").replace(/rn/g, "m").replace(/vv/g, "w");
  return [...new Set([base.replace(/[1!|]/g, "l"), base.replace(/[1!|]/g, "i")])];
}
