"use client";

import { useEffect, useState } from "react";
import { useChecker } from "@/hooks/useChecker";
import { registerServiceWorker, type SharedItem, takeSharedItem } from "@/lib/client/share";
import type { ApiResponse, ServiceStatus } from "@/lib/types";
import { ImageReport } from "./ImageReport";
import { LinkCard } from "./LinkCard";
import { InputPanel } from "./InputPanel";
import { PipelineSteps } from "./PipelineSteps";
import { VerdictCard } from "./VerdictCard";

const SERVICE_LABELS: { key: keyof ServiceStatus; label: string; offNote: string }[] = [
  { key: "groq", label: "Groq AI models", offNote: "basic rules used instead" },
  { key: "factCheck", label: "Google Fact Check", offNote: "skipped" },
  { key: "tavily", label: "Tavily web search", offNote: "skipped" },
  { key: "safeBrowsing", label: "Google Safe Browsing", offNote: "skipped" },
];

function ServiceChips({ status }: { status: ServiceStatus | null }) {
  if (!status) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Services">
      <li className="text-ink-soft">
        <span className="text-true">●</span> Google News search
      </li>
      {SERVICE_LABELS.map(({ key, label, offNote }) => (
        <li key={key} className={status[key] ? "text-ink-soft" : "text-muted"}>
          <span className={status[key] ? "text-true" : "text-rule"}>●</span> {label}
          {!status[key] && <span> ({offNote})</span>}
        </li>
      ))}
    </ul>
  );
}

async function loadShared(shared: string): Promise<{ item: SharedItem | null; notice: string | null }> {
  if (shared === "retry" || shared === "failed") {
    return { item: null, notice: "The share didn't come through. Please share it again; it works from the second time on." };
  }
  const item = await takeSharedItem();
  return { item, notice: item ? "Received from the Share menu. Press “Check this forward”." : null };
}

export function Checker() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { steps, running, result, analysis, error, run, reset } = useChecker(Boolean(status?.groq));

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then((r) => r.json() as Promise<ApiResponse<ServiceStatus>>)
      .then((body) => body.data && setStatus(body.data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // something shared from WhatsApp via the Android Share menu (installed app)
  useEffect(() => {
    registerServiceWorker();
    const shared = new URLSearchParams(window.location.search).get("shared");
    if (!shared) return;
    window.history.replaceState(null, "", "/");
    loadShared(shared)
      .then((outcome) => {
        if (outcome.item) {
          setText(outcome.item.text);
          setFile(outcome.item.file);
          setFileName(outcome.item.file ? "shared image" : null);
        }
        setNotice(outcome.notice);
      })
      .catch(() => undefined);
  }, []);

  const hasOutput = Boolean(result || analysis || error);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid gap-10 py-8 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
        <section aria-label="Input">
          {notice && <p className="mb-4 border-l-4 border-wire bg-card px-4 py-2 text-sm">{notice}</p>}
          <InputPanel
            isRunning={running}
            text={text}
            file={file}
            fileName={fileName}
            onTextChange={setText}
            onFileChange={(f, name) => {
              setFile(f);
              setFileName(name);
            }}
            onSubmit={() => run({ text, file })}
          />
        </section>
        <aside aria-label="Pipeline" className="lg:border-l lg:border-rule lg:pl-10">
          <p className="kicker mb-1">On the desk</p>
          <h2 className="mb-5 font-display text-2xl font-semibold">Six models, one verdict</h2>
          <PipelineSteps steps={steps} />
          <div className="mt-6 border-t border-rule pt-3">
            <ServiceChips status={status} />
          </div>
        </aside>
      </div>

      {hasOutput && (
        <section aria-label="Results" aria-live="polite" className="space-y-8 border-t-4 border-double border-ink pb-12 pt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-3xl font-extrabold">The verdict</h2>
            <button type="button" onClick={reset} className="text-sm text-muted underline underline-offset-2 hover:text-ink">
              Clear
            </button>
          </div>
          {error && <p className="border-l-4 border-false bg-card px-4 py-3 text-false">{error}</p>}
          {result?.warnings.map((w) => (
            <p key={w} className="border-l-4 border-misleading bg-card px-4 py-2 text-sm text-ink-soft">
              {w}
            </p>
          ))}
          {result?.results.map((r, i) => <VerdictCard key={`${r.claim.text}-${i}`} result={r} index={i} total={result.results.length} />)}
          {result && result.links.length > 0 && (
            <div className="space-y-6">
              <h3 className="font-display text-2xl font-extrabold">Links in this message</h3>
              {result.links.map((link, i) => (
                <LinkCard key={link.url} link={link} index={i} total={result.links.length} />
              ))}
            </div>
          )}
          {analysis && <ImageReport analysis={analysis} />}
          {analysis && !analysis.readText && !result && <p className="text-sm text-muted">No text was found in the image, so only the image check was done.</p>}
        </section>
      )}
    </div>
  );
}
