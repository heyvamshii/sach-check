import type { MetadataReport } from "./metadata";

/** Combine the image checks into one plain-English suspicion level. These are signals, not proof. */

export type Suspicion = "Low" | "Medium" | "High";

export interface Signal {
  kind: "warning" | "info";
  text: string;
}

export interface AiDetection {
  /** probability (0..1) that the picture is AI-generated or a deepfake */
  fakeProbability: number;
  label: string;
}

export interface ImageVerdict {
  level: Suspicion;
  points: number;
  signals: Signal[];
}

export function scoreImage(input: { elaScore: number | null; metadata: MetadataReport | null; ai: AiDetection | null; isScreenshot: boolean }): ImageVerdict {
  const { elaScore, metadata, ai, isScreenshot } = input;
  const signals: Signal[] = [];
  let points = 0;

  if (metadata?.aiMarker) {
    points += 3;
    signals.push({ kind: "warning", text: `Hidden file data says ${metadata.aiMarker}.` });
  }
  if (metadata?.editedWith) {
    points += 1;
    signals.push({ kind: "warning", text: `The file was saved by editing software (${metadata.editedWith}).` });
  }

  if (elaScore !== null && !isScreenshot) {
    if (elaScore >= 0.75) {
      points += 2;
      signals.push({ kind: "warning", text: "One area of the photo has a very different compression pattern from the rest, which often happens when something is pasted in." });
    } else if (elaScore >= 0.5) {
      points += 1;
      signals.push({ kind: "warning", text: "One area of the photo compresses a little differently from the rest. This can mean editing, but busy textures can cause it too." });
    } else {
      signals.push({ kind: "info", text: "Compression looks even across the photo. No sign of pasted-in areas." });
    }
  }
  if (isScreenshot) {
    signals.push({ kind: "info", text: "This looks like a screenshot, so the edit check (ELA) is skipped: text and app icons always light it up." });
  }

  if (ai) {
    const pct = Math.round(ai.fakeProbability * 100);
    if (ai.fakeProbability >= 0.8) {
      points += 2;
      signals.push({ kind: "warning", text: `The AI-image detector thinks this is ${pct}% likely to be AI-made or a deepfake (${ai.label}).` });
    } else if (ai.fakeProbability >= 0.6) {
      points += 1;
      signals.push({ kind: "warning", text: `The AI-image detector leans towards AI-made (${pct}%). It is often wrong on compressed WhatsApp images.` });
    } else {
      signals.push({ kind: "info", text: `The AI-image detector leans towards a real photo (${100 - pct}% real).` });
    }
  }

  if (metadata && !metadata.camera && !metadata.aiMarker) {
    signals.push({ kind: "info", text: "No camera details in the file. Normal for WhatsApp images, which remove them." });
  } else if (metadata?.camera) {
    signals.push({ kind: "info", text: `Taken with: ${metadata.camera}.` });
  }

  const level: Suspicion = points >= 3 ? "High" : points >= 1 ? "Medium" : "Low";
  return { level, points, signals };
}

/** Screenshots are mostly flat colour with sharp text; photos are not. */
export function looksLikeScreenshot(data: Uint8Array | Uint8ClampedArray, width: number, height: number): boolean {
  const step = Math.max(1, Math.floor((width * height) / 20000));
  const counts = new Map<number, number>();
  let samples = 0;
  for (let p = 0; p < width * height; p += step) {
    const i = p * 4;
    // bucket colours coarsely (4 bits per channel)
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    samples++;
  }
  const top3 = [...counts.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  return top3 / samples > 0.6;
}
