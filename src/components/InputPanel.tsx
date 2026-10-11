"use client";

import { useRef, useState } from "react";
import { IMAGE_SAMPLES, TEXT_SAMPLES } from "@/lib/samples";

type Props = {
  isRunning: boolean;
  text: string;
  file: Blob | null;
  fileName: string | null;
  onTextChange: (text: string) => void;
  onFileChange: (file: Blob | null, name: string | null) => void;
  onSubmit: () => void;
};

export function InputPanel({ isRunning, text, file, fileName, onTextChange, onFileChange, onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const canSubmit = !isRunning && (text.trim().length >= 10 || file !== null);

  async function handleImageSample(src: string, label: string) {
    setSampleError(null);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error();
      onFileChange(await response.blob(), label);
      onTextChange("");
    } catch {
      setSampleError("Couldn't load that sample.");
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFileChange(dropped, dropped.name);
  }

  function handlePaste(event: React.ClipboardEvent) {
    const pasted = [...event.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (pasted) {
      event.preventDefault();
      onFileChange(pasted, "pasted image");
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="space-y-4"
    >
      <label htmlFor="forward" className="kicker block">
        Paste the forward
      </label>
      <textarea
        id="forward"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onPaste={handlePaste}
        rows={6}
        maxLength={4000}
        placeholder="Paste a WhatsApp message here, in English, Hindi, Telugu or a mix…"
        className="w-full resize-y border border-ink bg-card p-4 text-base leading-relaxed placeholder:text-muted focus:outline-none focus-visible:shadow-[4px_4px_0_var(--wire)]"
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-wrap items-center gap-3 border border-dashed p-4 transition-colors ${isDragging ? "border-wire bg-card" : "border-ink-soft"}`}
      >
        <button type="button" onClick={() => inputRef.current?.click()} className="border border-ink bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper">
          {file ? "Change image" : "Add an image"}
        </button>
        <span className="text-sm text-muted">{file ? `📎 ${fileName ?? "image"}` : "or drop / paste a screenshot or photo"}</span>
        {file && (
          <button type="button" onClick={() => onFileChange(null, null)} className="ml-auto text-sm text-muted underline underline-offset-2 hover:text-false">
            Remove
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            onFileChange(chosen, chosen?.name ?? null);
            event.target.value = "";
          }}
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-ink px-6 py-3.5 font-display text-xl font-semibold text-paper shadow-[4px_4px_0_var(--false)] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
      >
        {isRunning ? "Checking…" : "Check this forward"}
      </button>

      <div className="space-y-2 pt-1">
        <p className="kicker">Or try a sample</p>
        <div className="flex flex-wrap gap-2">
          {TEXT_SAMPLES.map((sample) => (
            <button
              key={sample.label}
              type="button"
              disabled={isRunning}
              onClick={() => {
                onTextChange(sample.text);
                onFileChange(null, null);
              }}
              className="border border-rule bg-card px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              “{sample.label}”
            </button>
          ))}
          {IMAGE_SAMPLES.map((sample) => (
            <button
              key={sample.src}
              type="button"
              disabled={isRunning}
              onClick={() => handleImageSample(sample.src, sample.label)}
              className="border border-rule bg-paper-deep px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              🖼 {sample.label}
            </button>
          ))}
        </div>
        {sampleError && <p className="text-xs text-false">{sampleError}</p>}
      </div>
    </form>
  );
}
