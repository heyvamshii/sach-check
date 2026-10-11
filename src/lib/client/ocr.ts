"use client";

import type Tesseract from "tesseract.js";

/**
 * Free, keyless OCR that runs in the browser (Tesseract). Used when the Groq vision model
 * isn't available. Language models (English, Hindi, Telugu) download once, then stay cached.
 */

export type ProgressHandler = (label: string, progress: number) => void;

let workerPromise: Promise<Tesseract.Worker> | null = null;
let progressHandler: ProgressHandler | null = null;

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker(["eng", "hin", "tel"], 1, {
        logger: (m) => progressHandler?.(m.status, m.progress),
      });
    })().catch((error: unknown) => {
      workerPromise = null; // allow a retry after a network failure
      throw error;
    });
  }
  return workerPromise;
}

export async function readTextInBrowser(image: Blob, onProgress: ProgressHandler): Promise<{ text: string; confidence: number }> {
  progressHandler = onProgress;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return { text: data.text.trim(), confidence: data.confidence };
  } finally {
    progressHandler = null;
  }
}
