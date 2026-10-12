import { type Keys, modelsFor } from "../config";
import { type FetchLike, shortModelName } from "../groq";
import type { Evidence, LinkResult, LinkSignal, LinkVerdict, Relation, StepTrace } from "../types";
import { countLinks, findLinks, MAX_LINKS } from "./extract";
import { type AiLinkVerdict, combineVerdicts, judgeLinksAi, type LinkEvidence } from "./judge";
import { checkSafeBrowsing, expandShortLink, readPages, relevantExcerpt } from "./remote";
import { analyzeLink, type RuleReport } from "./rules";

/** Model 5: finds every link in the message and decides, link by link, whether it's safe, a scam, or misleading. */

const MAX_PAGES_READ = 3;
const LINKED_PAGE_SNIPPET = 1500;

export interface LinkCheckResult {
  links: LinkResult[];
  trace: StepTrace | null;
  notes: string[];
  /** official pages linked in the message that we read and that check out; extra evidence for the claim judge */
  linkedPages: Omit<Evidence, "id">[];
}

export interface LinkCheckDeps {
  keys: Keys;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function ruleExplanation(verdict: LinkVerdict, signals: LinkSignal[], officialSite?: string, threat?: string): string {
  if (threat) return `Google Safe Browsing lists this site as ${threat}. Don't open it.`;
  const first = (kind: LinkSignal["kind"]) => signals.find((s) => s.kind === kind)?.text;
  switch (verdict) {
    case "Dangerous":
      return `Strong signs of a scam link. ${first("danger") ?? first("warning") ?? ""} Don't open it or enter any details.`.trim();
    case "Suspicious":
      return `Warning signs: ${(first("danger") ?? first("warning") ?? "").replace(/\.$/, "")}. Be careful before opening it.`;
    case "Safe":
      return `This is the real website of ${officialSite ?? "a known organisation"}. Still check that the page says what the message claims.`;
    default:
      return "No obvious warning signs, but this isn't a website we recognise. Don't enter personal or bank details on it.";
  }
}

/** When the rules and the AI clearly disagree (one says yes, the other no), say we can't tell rather than pick one. */
export function combineRelated(rule: Relation, ai: Relation | undefined): Relation {
  if (!ai || ai === "unclear") return rule;
  if (rule === "unclear" || rule === ai) return ai;
  return "unclear";
}

/** One odd link must never sink the whole check: fall back to "Unknown". */
function safeAnalyze(url: string, message: string, log?: (message: string) => void): RuleReport {
  try {
    return analyzeLink(url, message);
  } catch (error) {
    log?.(`[links] rules failed on a link: ${errorText(error)}`);
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {
      // keep the raw text
    }
    return { host, domain: host, points: 0, verdict: "Unknown", signals: [{ kind: "info", text: "This link is written in an unusual way, so it couldn't be fully checked." }], related: "unclear" };
  }
}

/** Tavily may tidy a URL slightly; match on host + path. */
function pageFor(pages: Map<string, string>, url: string): string | undefined {
  if (pages.has(url)) return pages.get(url);
  const key = (u: string) => {
    try {
      const p = new URL(u);
      return `${p.hostname.replace(/^www\./, "")}${p.pathname.replace(/\/$/, "")}`;
    } catch {
      return u;
    }
  };
  const wanted = key(url);
  for (const [pageUrl, text] of pages) if (key(pageUrl) === wanted) return text;
  return undefined;
}

export async function checkLinks(message: string, deps: LinkCheckDeps): Promise<LinkCheckResult> {
  const found = findLinks(message);
  const total = countLinks(message);
  if (found.length === 0) return { links: [], trace: null, notes: [], linkedPages: [] };
  const { keys, fetchImpl, env, log } = deps;
  const start = Date.now();
  const notes: string[] = total > MAX_LINKS ? [`This message has ${total} links; only the first ${MAX_LINKS} were checked. Treat the others with caution.`] : [];
  const checkedWith = new Set<string>(["link rules"]);

  // 1. un-shorten bit.ly-style links (only the shortening service is contacted)
  const finals = await Promise.all(
    found.map((link) =>
      expandShortLink(link.url, fetchImpl).catch((error: unknown) => {
        log?.(`[links] expand failed: ${errorText(error)}`);
        return null;
      }),
    ),
  );
  if (finals.some(Boolean)) checkedWith.add("link expander");

  // 2. rule checks on where each link really goes
  const evidence: LinkEvidence[] = found.map((link, i) => {
    const target = finals[i] ?? link.url;
    const rules = safeAnalyze(target, message, log);
    if (finals[i]) {
      rules.signals.unshift({ kind: "info", text: `This is a shortened link. It really opens ${new URL(target).hostname}.` });
    }
    return { url: link.url, finalUrl: finals[i] ?? undefined, context: link.context, rules };
  });

  // 3. Google Safe Browsing (known phishing and malware sites)
  if (keys.safeBrowsing) {
    const urls = [...new Set(evidence.flatMap((e) => [e.url, ...(e.finalUrl ? [e.finalUrl] : [])]))];
    try {
      const result = await checkSafeBrowsing(urls, keys.safeBrowsing, fetchImpl);
      if (result.status === "ok") {
        checkedWith.add("Google Safe Browsing");
        for (const e of evidence) e.threat = result.threats.get(e.finalUrl ?? "") ?? result.threats.get(e.url);
      } else if (result.status === "off") {
        notes.push("Google Safe Browsing isn't switched on for this Google key yet, so links were checked without it.");
      } else {
        notes.push("Google Safe Browsing didn't answer, so links were checked without it.");
      }
    } catch (error) {
      log?.(`[links] Safe Browsing failed: ${errorText(error)}`);
      notes.push("Google Safe Browsing didn't answer, so links were checked without it.");
    }
  }

  // 4. read the pages that aren't already known scams, to see if they say what the message claims
  if (keys.tavily) {
    const toRead = evidence.filter((e) => !e.threat && e.rules.verdict !== "Dangerous").slice(0, MAX_PAGES_READ);
    try {
      const pages = await readPages(toRead.map((e) => e.finalUrl ?? e.url), keys.tavily, fetchImpl);
      for (const e of toRead) {
        const text = pageFor(pages, e.finalUrl ?? e.url);
        if (text) e.page = relevantExcerpt(text, message);
      }
      if (pages.size > 0) checkedWith.add("Tavily page read");
    } catch (error) {
      log?.(`[links] page read failed: ${errorText(error)}`);
    }
  }

  // 5. AI decision across all the evidence
  let aiVerdicts: (AiLinkVerdict | null)[] = evidence.map(() => null);
  let engine = "link rules";
  if (keys.groq) {
    try {
      const { verdicts, model } = await judgeLinksAi(message, evidence, keys.groq, modelsFor("links", env), fetchImpl);
      aiVerdicts = verdicts;
      engine = shortModelName(model);
      checkedWith.add(engine);
    } catch (error) {
      log?.(`[links] Groq failed: ${errorText(error)}`);
      notes.push("AI link check failed, so link rules were used.");
    }
  }

  const links: LinkResult[] = evidence.map((e, i) => {
    const ai = aiVerdicts[i];
    const verdict = combineVerdicts(e, ai);
    const signals: LinkSignal[] = [...(e.threat ? [{ kind: "danger" as const, text: `Google Safe Browsing lists this site as ${e.threat}.` }] : []), ...e.rules.signals];
    // the AI's wording only fits when its verdict is the one we show
    const explanation = ai?.explanation && ai.verdict === verdict ? ai.explanation : ruleExplanation(verdict, signals, e.rules.officialSite, e.threat);
    return {
      raw: found[i].raw,
      url: e.url,
      finalUrl: e.finalUrl,
      host: new URL(e.finalUrl ?? e.url).hostname,
      context: e.context,
      verdict,
      related: combineRelated(e.rules.related, ai?.related),
      impersonates: e.rules.impersonates,
      officialSite: e.rules.officialSite,
      explanation,
      signals,
      checkedWith: [...checkedWith],
    };
  });

  const linkedPages = evidence.flatMap((e, i): Omit<Evidence, "id">[] =>
    links[i].verdict === "Safe" && e.rules.officialSite && e.page
      ? [{ source: "web", title: `Page linked in the message (${e.rules.officialSite})`, url: e.finalUrl ?? e.url, publisher: e.rules.officialSite, snippet: e.page.slice(0, LINKED_PAGE_SNIPPET), trusted: true }]
      : [],
  );

  const trace: StepTrace = { step: "links", engine: [...checkedWith].join(" + "), ai: engine !== "link rules", ms: Date.now() - start, note: `${links.length} link${links.length > 1 ? "s" : ""}` };
  return { links, trace, notes, linkedPages };
}
