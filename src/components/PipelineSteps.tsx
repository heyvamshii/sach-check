import type { StepKey, StepState } from "@/hooks/useChecker";

type Props = {
  steps: Record<StepKey, StepState>;
};

const ROWS: { key: StepKey; model: string; title: string; what: string }[] = [
  { key: "read", model: "Model 1", title: "Read the image", what: "Vision model or Tesseract OCR pulls out the text" },
  { key: "extract", model: "Model 2a", title: "Find the claims", what: "Picks out statements that can be checked" },
  { key: "classify", model: "Model 2b", title: "Sort by topic", what: "Health, political, financial or other" },
  { key: "search", model: "Model 3", title: "Search trusted sources", what: "Fact-checkers, official sites, newsrooms" },
  { key: "forensics", model: "Model 4", title: "Check the image", what: "Edited areas, hidden file data, AI-made" },
  { key: "judge", model: "Model 5", title: "Give the verdict", what: "Weighs the evidence, cites sources" },
];

const DOT: Record<StepState["status"], string> = {
  waiting: "border-rule bg-transparent",
  running: "border-wire bg-wire pulse-dot",
  done: "border-ink bg-ink",
  skipped: "border-rule bg-paper-deep",
  failed: "border-false bg-false",
};

const STATUS_LABEL: Record<StepState["status"], string> = {
  waiting: "waiting",
  running: "working…",
  done: "done",
  skipped: "not needed",
  failed: "failed",
};

export function PipelineSteps({ steps }: Props) {
  return (
    <ol className="relative space-y-4 border-l border-rule pl-6" aria-label="Pipeline progress">
      {ROWS.map(({ key, model, title, what }) => {
        const state = steps[key];
        const isSkipped = state.status === "skipped";
        return (
          <li key={key} className={`relative ${isSkipped ? "opacity-45" : ""}`}>
            <span className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 ${DOT[state.status]}`} aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="kicker">{model}</span>
              <span className="font-semibold">{title}</span>
              <span className="text-xs text-muted">· {STATUS_LABEL[state.status]}</span>
            </div>
            <p className="text-sm text-muted">{what}</p>
            {state.engine && (
              <p className="mt-0.5 text-xs text-ink-soft">
                <span className="font-mono">{state.engine}</span>
                {state.detail ? <span className="text-muted"> · {state.detail}</span> : null}
              </p>
            )}
            {!state.engine && state.detail && <p className="mt-0.5 text-xs text-muted">{state.detail}</p>}
          </li>
        );
      })}
    </ol>
  );
}
