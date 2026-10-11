import type { ClaimResult, Evidence, Verdict } from "@/lib/types";

type Props = {
  result: ClaimResult;
  index: number;
  total: number;
};

const STYLE: Record<Verdict, { color: string; word: string; advice: string }> = {
  False: { color: "text-false", word: "False", advice: "Don't forward this." },
  Misleading: { color: "text-misleading", word: "Misleading", advice: "Partly true or missing context. Don't forward it as-is." },
  True: { color: "text-true", word: "True", advice: "Trusted sources back this up." },
  Unverified: { color: "text-unverified", word: "Unverified", advice: "Not enough evidence either way. Wait before forwarding." },
};

const CATEGORY_LABEL = { health: "Health", political: "Political", financial: "Money", other: "Other" };
const SOURCE_LABEL = { factcheck: "Fact-check", news: "News", web: "Web" };

function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function EvidenceRow({ item, isCited }: { item: Evidence; isCited: boolean }) {
  return (
    <li className={`flex gap-3 border-t border-rule py-2.5 first:border-t-0 ${isCited ? "" : "opacity-70"}`}>
      <span className="mt-0.5 w-6 shrink-0 font-mono text-xs text-muted">[{item.id}]</span>
      <div className="min-w-0">
        <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-rule underline-offset-2 hover:decoration-ink">
          {item.title}
        </a>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
          <span className={item.trusted ? "font-semibold text-ink-soft" : ""}>
            {item.publisher}
            {item.trusted ? " ✓" : ""}
          </span>
          <span>· {SOURCE_LABEL[item.source]}</span>
          {item.date && <span>· {item.date}</span>}
          {item.rating && <span className="font-semibold text-false">· rated “{item.rating}”</span>}
          {isCited && <span className="font-semibold text-wire">· used for verdict</span>}
        </p>
      </div>
    </li>
  );
}

export function VerdictCard({ result, index, total }: Props) {
  const style = STYLE[result.verdict];
  const cited = new Set(result.citations);
  return (
    <article className="rise border border-ink bg-card p-5 shadow-[6px_6px_0_var(--ink)] sm:p-7" style={{ animationDelay: `${index * 90}ms` }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="kicker">
            {total > 1 ? `Claim ${index + 1} of ${total} · ` : "Claim · "}
            {CATEGORY_LABEL[result.claim.category]}
          </p>
          <blockquote className="mt-2 font-display text-xl leading-snug sm:text-2xl">“{result.claim.text}”</blockquote>
        </div>
        <div className={`stamp text-2xl sm:text-3xl ${style.color}`} role="img" aria-label={`Verdict: ${style.word}`}>
          {style.word}
        </div>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.4fr]">
        <div>
          <p className={`font-semibold ${style.color}`}>{style.advice}</p>
          <p className="mt-2 text-ink-soft">{result.explanation}</p>
          <p className="mt-3 text-xs text-muted">
            Confidence: <span className="font-semibold uppercase text-ink-soft">{result.confidence}</span>
          </p>
        </div>
        <div>
          <p className="kicker mb-1">Evidence ({result.evidence.length})</p>
          {result.evidence.length === 0 ? (
            <p className="text-sm text-muted">No fact-checks or trusted news found for this claim.</p>
          ) : (
            <ul>
              {result.evidence.map((item) => (
                <EvidenceRow key={item.id} item={item} isCited={cited.has(item.id)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
