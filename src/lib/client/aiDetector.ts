"use client";

import type { AiDetection } from "../forensics/score";

/**
 * Free AI-image / deepfake detector that runs inside the browser (no account, no key).
 * Model: prithivMLmods/AI-vs-Deepfake-vs-Real-ONNX (ViT, Apache-2.0), 4-bit, ~57 MB, downloaded once.
 */

export const AI_MODEL_ID = "prithivMLmods/AI-vs-Deepfake-vs-Real-ONNX";

type Classifier = (input: string, options: { top_k: number }) => Promise<{ label: string; score: number }[]>;

let classifierPromise: Promise<Classifier> | null = null;

function getClassifier(onProgress: (progress: number) => void): Promise<Classifier> {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.allowLocalModels = false; // fetch straight from the Hugging Face Hub (no /models/ 404s)
      const classifier = await pipeline("image-classification", AI_MODEL_ID, {
        dtype: "q4",
        progress_callback: (event: { status?: string; progress?: number }) => {
          if (event.status === "progress" && typeof event.progress === "number") onProgress(event.progress / 100);
        },
      });
      return classifier as unknown as Classifier;
    })().catch((error: unknown) => {
      classifierPromise = null;
      throw error;
    });
  }
  return classifierPromise;
}

/** Labels are "Artificial", "Deepfake" and "Real"; anything not Real counts as fake. */
export function toDetection(scores: { label: string; score: number }[]): AiDetection {
  const fake = scores.filter((s) => s.label.toLowerCase() !== "real");
  const fakeProbability = Math.min(1, fake.reduce((sum, s) => sum + s.score, 0));
  const top = [...scores].sort((a, b) => b.score - a.score)[0];
  return { fakeProbability, label: top ? `top guess: ${top.label}` : "no result" };
}

export async function detectAiImage(imageUrl: string, onProgress: (progress: number) => void): Promise<AiDetection> {
  const classifier = await getClassifier(onProgress);
  return toDetection(await classifier(imageUrl, { top_k: 3 }));
}
