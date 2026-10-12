export const CATEGORIES = ["health", "political", "financial", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const VERDICTS = ["True", "False", "Misleading", "Unverified"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type Confidence = "low" | "medium" | "high";

/** One factual statement pulled out of a forward. */
export interface Claim {
  /** the claim as written (may be Hindi, Telugu, ...) */
  text: string;
  /** short English search query for the claim */
  query: string;
  category: Category;
}

export type EvidenceSource = "factcheck" | "news" | "web";

export interface Evidence {
  id: number;
  source: EvidenceSource;
  title: string;
  url: string;
  publisher: string;
  /** a fact-checker's own rating, e.g. "False" or "Misleading" */
  rating?: string;
  date?: string;
  snippet?: string;
  trusted: boolean;
}

export interface ClaimResult {
  claim: Claim;
  verdict: Verdict;
  confidence: Confidence;
  explanation: string;
  /** ids from `evidence` that the verdict relies on */
  citations: number[];
  evidence: Evidence[];
}

export const LINK_VERDICTS = ["Dangerous", "Suspicious", "Misleading", "Unknown", "Safe"] as const;
/** Most to least severe. "Misleading" = the site is fine, but it doesn't say what the message claims. */
export type LinkVerdict = (typeof LINK_VERDICTS)[number];

export type Relation = "yes" | "no" | "unclear";

export interface LinkSignal {
  kind: "danger" | "warning" | "good" | "info";
  text: string;
}

/** The verdict for one link found in a message. */
export interface LinkResult {
  /** as written in the message */
  raw: string;
  url: string;
  /** where a shortened link really leads */
  finalUrl?: string;
  host: string;
  /** the sentence the link sits in */
  context: string;
  verdict: LinkVerdict;
  /** is the link about the same thing as the message? */
  related: Relation;
  /** e.g. "SBI" when the site pretends to be SBI */
  impersonates?: string;
  /** the official organisation, when this is its real site */
  officialSite?: string;
  explanation: string;
  signals: LinkSignal[];
  /** tools that checked it, e.g. ["rules", "Google Safe Browsing", "Tavily page read", "gpt-oss-20b"] */
  checkedWith: string[];
}

/** Which model or tool handled each pipeline step, shown to the user. */
export interface StepTrace {
  step: "extract" | "classify" | "search" | "links" | "judge";
  engine: string;
  ai: boolean;
  ms: number;
  note?: string;
}

export interface CheckResult {
  results: ClaimResult[];
  links: LinkResult[];
  steps: StepTrace[];
  warnings: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface ServiceStatus {
  groq: boolean;
  factCheck: boolean;
  tavily: boolean;
  safeBrowsing: boolean;
  telegram: boolean;
}
