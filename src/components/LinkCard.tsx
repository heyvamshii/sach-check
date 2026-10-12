import type { LinkResult, LinkVerdict, Relation } from "@/lib/types";

type Props = {
  link: LinkResult;
  index: number;
  total: number;
};

const STYLE: Record<LinkVerdict, { color: string; advice: string }> = {
  Dangerous: { color: "text-false", advice: "Don't open this link or enter any details." },
  Suspicious: { color: "text-misleading", advice: "Warning signs. Think twice before opening it." },
  Misleading: { color: "text-misleading", advice: "A real site, but it doesn't back up what the message says." },
  Unknown: { color: "text-unverified", advice: "No clear signs either way. Don't share personal or bank details on it." },
  Safe: { color: "text-true", advice: "A known, legitimate website." },
};

const RELATED_LABEL: Record<Relation, string> = {
  yes: "Matches the message's topic",
  no: "Not about what the message says",
  unclear: "Can't tell if it matches the message",
};

const SIGNAL_MARK = { danger: "▲", warning: "▲", good: "✓", info: "●" } as const;
const SIGNAL_COLOR = { danger: "text-false", warning: "text-misleading", good: "text-true", info: "text-muted" } as const;

/** The sentence from the message, with the link highlighted where it appears. */
function ContextLine({ context, raw }: { context: string; raw: string }) {
  const at = context.indexOf(raw);
  if (at === -1) return <>{context}</>;
  return (
    <>
      {context.slice(0, at)}
      <mark className="bg-paper-deep px-0.5 font-mono text-[0.9em] text-ink">{raw}</mark>
      {context.slice(at + raw.length)}
    </>
  );
}

export function LinkCard({ link, index, total }: Props) {
  const style = STYLE[link.verdict];
  const relatedTone = link.related === "no" ? "text-misleading" : link.related === "yes" ? "text-true" : "text-muted";
  return (
    <article className="rise border border-ink bg-card p-5 shadow-[6px_6px_0_var(--ink)] sm:p-7" style={{ animationDelay: `${index * 90}ms` }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="kicker">{total > 1 ? `Link ${index + 1} of ${total}` : "Link"} · Model 5</p>
          {/* shown as text on purpose: never make a possibly harmful link clickable */}
          <p className="mt-2 break-all font-mono text-lg leading-snug sm:text-xl">{link.raw}</p>
          {link.finalUrl && (
            <p className="mt-1 break-all text-sm text-ink-soft">
              really goes to <span className="font-mono">{link.finalUrl}</span>
            </p>
          )}
        </div>
        <div className={`stamp text-2xl sm:text-3xl ${style.color}`} role="img" aria-label={`Link verdict: ${link.verdict}`}>
          {link.verdict}
        </div>
      </div>

      {link.context && link.context !== link.raw && (
        <blockquote className="mt-4 border-l-2 border-rule pl-3 text-sm italic text-ink-soft">
          “<ContextLine context={link.context} raw={link.raw} />”
        </blockquote>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.4fr]">
        <div>
          <p className={`font-semibold ${style.color}`}>{style.advice}</p>
          <p className="mt-2 text-ink-soft">{link.explanation}</p>
          <dl className="mt-3 space-y-1 text-xs">
            {link.impersonates && (
              <div>
                <dt className="inline text-muted">Pretends to be: </dt>
                <dd className="inline font-semibold text-false">{link.impersonates}</dd>
              </div>
            )}
            {link.officialSite && (
              <div>
                <dt className="inline text-muted">Official site of: </dt>
                <dd className="inline font-semibold text-true">{link.officialSite}</dd>
              </div>
            )}
            <div>
              <dt className="inline text-muted">Related to the message: </dt>
              <dd className={`inline font-semibold ${relatedTone}`}>{RELATED_LABEL[link.related]}</dd>
            </div>
          </dl>
        </div>
        <div>
          <p className="kicker mb-1">What we found</p>
          <ul className="space-y-1.5">
            {link.signals.map((signal) => (
              <li key={signal.text} className="flex gap-2 text-sm">
                <span className={SIGNAL_COLOR[signal.kind]} aria-hidden>
                  {SIGNAL_MARK[signal.kind]}
                </span>
                <span className={signal.kind === "info" ? "text-ink-soft" : "text-ink"}>{signal.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-rule pt-2 font-mono text-[11px] text-muted">checked with: {link.checkedWith.join(" · ")}</p>
        </div>
      </div>
    </article>
  );
}
