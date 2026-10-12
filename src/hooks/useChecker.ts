"use client";

import { useCallback, useRef, useState } from "react";
import { loadImage, rgbaToDataUrl, type LoadedImage } from "@/lib/client/image";
import { readTextInBrowser } from "@/lib/client/ocr";
import { computeEla, decodeJpeg, type ElaResult, type RgbaImage } from "@/lib/forensics/ela";
import { type MetadataReport, readMetadata } from "@/lib/forensics/metadata";
import { looksLikeScreenshot } from "@/lib/forensics/score";
import type { ApiResponse, CheckResult, StepTrace } from "@/lib/types";

export type StepKey = "read" | "extract" | "classify" | "search" | "forensics" | "links" | "judge";
export type StepStatus = "waiting" | "running" | "done" | "skipped" | "failed";

export interface StepState {
  status: StepStatus;
  engine?: string;
  detail?: string;
}

export interface ImageAnalysis {
  image: LoadedImage;
  ela: Omit<ElaResult, "heatmap"> | null;
  heatmapUrl: string | null;
  metadata: MetadataReport;
  isScreenshot: boolean;
  readText: string;
}

const MIN_OCR_CONFIDENCE = 55;

const IDLE_STEPS: Record<StepKey, StepState> = {
  read: { status: "waiting" },
  extract: { status: "waiting" },
  classify: { status: "waiting" },
  search: { status: "waiting" },
  forensics: { status: "waiting" },
  links: { status: "waiting" },
  judge: { status: "waiting" },
};

async function postJson<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { success: false, data: null, error: "Couldn't reach the server. Check your internet connection." };
  }
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return { success: false, data: null, error: `Server error (${response.status}). Please try again.` };
  }
}

/** ELA is heavy; yield first so the "running" state paints. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

// beyond this, decoding the JPEG ourselves freezes phones, so use the browser's resized pixels
const MAX_JPEG_DECODE_PIXELS = 4_000_000;

/**
 * ELA depends on exact pixel values, and browsers decode JPEGs slightly differently.
 * Decoding JPEGs with the same library as the evaluation keeps results identical to the measured ones.
 */
function pixelsForEla(image: LoadedImage): RgbaImage {
  const isJpeg = image.bytes[0] === 0xff && image.bytes[1] === 0xd8;
  if (isJpeg && image.width * image.height <= MAX_JPEG_DECODE_PIXELS) {
    try {
      return decodeJpeg(image.bytes);
    } catch {
      // fall through to the canvas pixels
    }
  }
  const { data, width, height } = image.pixels;
  return { data, width, height };
}

async function analyseImage(image: LoadedImage): Promise<Omit<ImageAnalysis, "readText">> {
  await nextFrame();
  const metadata = await readMetadata(image.bytes);
  const { data, width, height } = image.pixels;
  const isScreenshot = looksLikeScreenshot(data, width, height);
  const { heatmap, ...ela } = computeEla(pixelsForEla(image));
  return { image, ela, heatmapUrl: rgbaToDataUrl(heatmap, ela.width, ela.height), metadata, isScreenshot };
}

type SetStep = (key: StepKey, state: StepState) => void;

async function readImage(image: LoadedImage, file: Blob, aiReadingOn: boolean, setStep: SetStep): Promise<string> {
  if (aiReadingOn) {
    setStep("read", { status: "running", detail: "Groq vision model is reading the image…" });
    const response = await postJson<{ text: string; engine: string }>("/api/ocr", { image: image.dataUrl });
    if (response.success && response.data) {
      setStep("read", { status: "done", engine: response.data.engine, detail: `${response.data.text.length} characters read` });
      return response.data.text;
    }
    // any failure (offline, too big, quota) falls through to the free in-browser reader
  }
  const engine = "Tesseract (in your browser)";
  setStep("read", { status: "running", engine, detail: "Loading language models…" });
  try {
    const { text, confidence } = await readTextInBrowser(file, (label, progress) => setStep("read", { status: "running", engine, detail: `${label} ${Math.round(progress * 100)}%` }));
    // photos without words make Tesseract "see" junk; only trust confident readings
    const usable = confidence >= MIN_OCR_CONFIDENCE && text.split(/\s+/).filter((w) => w.length > 1).length >= 4;
    setStep("read", { status: "done", engine, detail: usable ? `${text.length} characters read` : "no readable text" });
    return usable ? text : "";
  } catch {
    setStep("read", { status: "failed", engine, detail: "couldn't load the text reader (offline?)" });
    return "";
  }
}

function traceDetail(t: StepTrace): string {
  return `${(t.ms / 1000).toFixed(1)} s${t.ai ? "" : " · basic mode"}${t.note ? ` · ${t.note}` : ""}`;
}

const SERVER_STEPS: StepKey[] = ["extract", "classify", "search", "links", "judge"];

export function useChecker(aiReadingOn: boolean) {
  const [steps, setSteps] = useState<Record<StepKey, StepState>>(IDLE_STEPS);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const run = useCallback(
    async (input: { text: string; file: Blob | null }) => {
      const id = ++runId.current;
      const isCurrent = () => id === runId.current;
      // a run that was cleared or replaced must not touch the screen any more
      const setStep: SetStep = (key, state) => {
        if (isCurrent()) setSteps((prev) => ({ ...prev, [key]: state }));
      };
      setRunning(true);
      setError(null);
      setResult(null);
      setAnalysis(null);
      setSteps({ ...IDLE_STEPS, read: { status: input.file ? "waiting" : "skipped" }, forensics: { status: input.file ? "waiting" : "skipped" } });
      try {
        let text = input.text.trim();
        if (input.file) {
          const image = await loadImage(input.file);
          setStep("forensics", { status: "running", engine: "ELA + file metadata", detail: "Looking for edited areas…" });
          const [forensics, readText] = await Promise.all([analyseImage(image), readImage(image, input.file, aiReadingOn, setStep)]);
          if (!isCurrent()) return;
          setAnalysis({ ...forensics, readText });
          setStep("forensics", {
            status: "done",
            engine: "ELA + file metadata",
            detail: forensics.isScreenshot ? "screenshot: edit check skipped" : `standout ratio ${forensics.ela?.ratio.toFixed(2)}`,
          });
          text = [text, readText].filter(Boolean).join("\n");
        }
        if (text.length < 10) {
          SERVER_STEPS.forEach((k) => setStep(k, { status: "skipped" }));
          if (!input.file) setError("Please paste a longer message (at least a sentence).");
          return;
        }
        SERVER_STEPS.forEach((k) => setStep(k, { status: "running" }));
        const response = await postJson<CheckResult>("/api/check", { text });
        if (!isCurrent()) return;
        if (!response.success || !response.data) throw new Error(response.error ?? "Check failed.");
        const traced = new Set<StepKey>(response.data.steps.map((t) => t.step));
        response.data.steps.forEach((t) => setStep(t.step, { status: "done", engine: t.engine, detail: traceDetail(t) }));
        SERVER_STEPS.filter((k) => !traced.has(k)).forEach((k) => setStep(k, { status: "skipped" }));
        setResult(response.data);
      } catch (err) {
        if (!isCurrent()) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setSteps((prev) => Object.fromEntries(Object.entries(prev).map(([k, s]) => [k, s.status === "running" ? { status: "failed" } : s])) as Record<StepKey, StepState>);
      } finally {
        if (isCurrent()) setRunning(false);
      }
    },
    [aiReadingOn],
  );

  const reset = useCallback(() => {
    runId.current++;
    setSteps(IDLE_STEPS);
    setRunning(false);
    setResult(null);
    setAnalysis(null);
    setError(null);
  }, []);

  return { steps, running, result, analysis, error, run, reset };
}
