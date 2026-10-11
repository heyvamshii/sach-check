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

/** Which model or tool handled each pipeline step, shown to the user. */
export interface StepTrace {
  step: "extract" | "classify" | "search" | "judge";
  engine: string;
  ai: boolean;
  ms: number;
  note?: string;
}

export interface CheckResult {
  results: ClaimResult[];
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
  telegram: boolean;
}
