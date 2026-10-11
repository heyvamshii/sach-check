"use client";

import { useState } from "react";
import type { ImageAnalysis } from "@/hooks/useChecker";
import { detectAiImage } from "@/lib/client/aiDetector";
import { type AiDetection, scoreImage, type Suspicion } from "@/lib/forensics/score";

type Props = {
  analysis: ImageAnalysis;
};

const LEVEL_STYLE: Record<Suspicion, { color: string; fill: string; width: string; note: string }> = {
  Low: { color: "text-true", fill: "bg-true", width: "w-1/4", note: "No clear signs of editing. This is not proof that it's real." },
  Medium: { color: "text-misleading", fill: "bg-misleading", width: "w-3/5", note: "Some signs worth a closer look." },
  High: { color: "text-false", fill: "bg-false", width: "w-full", note: "Several strong signs of editing or AI generation." },
};

export function ImageReport({ analysis }: Props) {
  const [view, setView] = useState<"photo" | "heatmap">("photo");
  const [ai, setAi] = useState<AiDetection | null>(null);
  const [aiState, setAiState] = useState<{ status: "idle" | "loading" | "error"; progress: number }>({ status: "idle", progress: 0 });

  const elaScore = analysis.isScreenshot ? null : (analysis.ela?.score ?? null);
  const verdict = scoreImage({ elaScore, metadata: analysis.metadata, ai, isScreenshot: analysis.isScreenshot });
  const style = LEVEL_STYLE[verdict.level];
  const box = analysis.ela?.hotBox;
  // the hot box is measured on the ELA image, which may be larger than the preview pixels
  const width = analysis.ela?.width ?? analysis.image.pixels.width;
  const height = analysis.ela?.height ?? analysis.image.pixels.height;

  async function handleDetect() {
    setAiState({ status: "loading", progress: 0 });
    try {
      const detection = await detectAiImage(analysis.image.previewUrl, (progress) => setAiState({ status: "loading", progress }));
      setAi(detection);
      setAiState({ status: "idle", progress: 1 });
    } catch {
      setAiState({ status: "error", progress: 0 });
    }
  }

  const showBox = view === "heatmap" && box && !analysis.isScreenshot && (analysis.ela?.score ?? 0) >= 0.5;

  return (
    <section className="rise border border-ink bg-card p-5 shadow-[6px_6px_0_var(--ink)] sm:p-7" aria-label="Image check">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="kicker">Image check · Model 4</p>
        <p className={`font-display text-2xl font-extrabold ${style.color}`}>Suspicion: {verdict.level}</p>
      </div>
      <div className="mt-2 h-2 w-full bg-paper-deep" role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={Math.min(3, verdict.points)} aria-label="Suspicion level">
        <div className={`h-full ${style.fill} ${style.width} transition-all duration-500`} />
      </div>
      <p className="mt-2 text-sm text-ink-soft">{style.note}</p>

      <div className="mt-5 grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="mb-2 flex gap-1 text-sm" role="tablist" aria-label="Image view">
            {(["photo", "heatmap"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`border px-3 py-1 font-medium transition-colors ${view === v ? "border-ink bg-ink text-paper" : "border-rule text-muted hover:border-ink hover:text-ink"}`}
              >
                {v === "photo" ? "Image" : "Edit heatmap (ELA)"}
              </button>
            ))}
          </div>
          <div className="relative overflow-hidden border border-rule bg-paper-deep">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob/data URLs */}
            <img src={view === "photo" || !analysis.heatmapUrl ? analysis.image.previewUrl : analysis.heatmapUrl} alt={view === "photo" ? "Uploaded image" : "Error level heatmap"} className="block h-auto w-full" />
            {showBox && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-white mix-blend-difference"
                style={{ left: `${(box.x / width) * 100}%`, top: `${(box.y / height) * 100}%`, width: `${(box.width / width) * 100}%`, height: `${(box.height / height) * 100}%` }}
                aria-hidden
              />
            )}
          </div>
          {view === "heatmap" && (
            <p className="mt-2 text-xs text-muted">Bright areas changed most when the image was re-saved. A bright patch with sharp edges can mean something was pasted in. Text and sharp edges are always bright.</p>
          )}
        </div>

        <div>
          <p className="kicker mb-2">What we found</p>
          <ul className="space-y-2">
            {verdict.signals.map((signal) => (
              <li key={signal.text} className="flex gap-2 text-sm">
                <span className={signal.kind === "warning" ? "text-false" : "text-muted"} aria-hidden>
                  {signal.kind === "warning" ? "▲" : "●"}
                </span>
                <span className={signal.kind === "warning" ? "text-ink" : "text-ink-soft"}>{signal.text}</span>
              </li>
            ))}
          </ul>

          {!ai && (
            <div className="mt-5 border-t border-rule pt-4">
              <p className="text-sm font-semibold">Deepfake / AI-image detector</p>
              <p className="mt-1 text-xs text-muted">A free AI model that runs in your browser. It downloads about 57 MB once, then it&apos;s cached.</p>
              <button
                type="button"
                onClick={handleDetect}
                disabled={aiState.status === "loading"}
                className="mt-3 border border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper disabled:cursor-wait disabled:opacity-60"
              >
                {aiState.status === "loading" ? `Loading model… ${Math.round(aiState.progress * 100)}%` : "Run AI-image detector"}
              </button>
              {aiState.status === "error" && <p className="mt-2 text-xs text-false">Couldn&apos;t load the detector. Check your internet connection and try again.</p>}
            </div>
          )}
          {analysis.readText && (
            <details className="mt-5 border-t border-rule pt-4 text-sm">
              <summary className="cursor-pointer font-semibold">Text read from the image</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-ink-soft">{analysis.readText}</pre>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
