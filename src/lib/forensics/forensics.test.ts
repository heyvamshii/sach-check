import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";
import { toDetection } from "../client/aiDetector";
import { blockMeans, boxBlur, computeEla, decodeJpeg, ratioToScore, RATIO_CUTOFF, standoutRatio } from "./ela";
import { findAiMarker, readMetadata } from "./metadata";
import { looksLikeScreenshot, scoreImage } from "./score";

/** Deterministic noisy "photo" so tests don't depend on files. */
function photo(width: number, height: number, seed: number): Uint8Array {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const base = 90 + 60 * Math.sin(x / 40) + 40 * Math.cos(y / 30);
      data[i] = base + rand() * 20;
      data[i + 1] = base * 0.8 + rand() * 20;
      data[i + 2] = base * 0.6 + rand() * 20;
      data[i + 3] = 255;
    }
  }
  return data;
}

function roundtrip(data: Uint8Array, width: number, height: number, quality: number): Uint8Array {
  return jpeg.decode(jpeg.encode({ data, width, height }, quality).data, { useTArray: true, formatAsRGBA: true }).data;
}

describe("ELA helpers", () => {
  it("averages errors per 8x8 block and blurs over a window", () => {
    const errors = new Float32Array(16 * 8).fill(2);
    const grid = blockMeans(errors, 16, 8);
    expect(grid).toMatchObject({ cols: 2, rows: 1 });
    expect([...grid.values]).toEqual([2, 2]);
    expect([...boxBlur(grid, 3).values]).toEqual([2, 2]);
  });

  it("standout ratio is about 1 for an even picture and high for one hot area", () => {
    const flat = { cols: 4, rows: 4, values: new Float32Array(16).fill(1) };
    expect(standoutRatio(flat)).toBeCloseTo(1, 1);
    const hot = { cols: 4, rows: 4, values: new Float32Array(16).fill(1).map((v, i) => (i === 5 ? 10 : v)) };
    expect(standoutRatio(hot)).toBeGreaterThan(5);
  });

  it("maps the ratio to a 0..1 score with 0.5 at the tuned cut-off", () => {
    expect(ratioToScore(RATIO_CUTOFF)).toBe(0.5);
    expect(ratioToScore(0)).toBe(0);
    expect(ratioToScore(100)).toBe(1);
  });
});

describe("computeEla", () => {
  it("scores a photo with a pasted-in patch higher than an untouched one", () => {
    const w = 256;
    const h = 192;
    const original = roundtrip(roundtrip(photo(w, h, 1), w, h, 65), w, h, 92);
    const edited = roundtrip(photo(w, h, 1), w, h, 65);
    const donor = photo(w, h, 99);
    for (let y = 60; y < 140; y++) for (let x = 80; x < 180; x++) for (let c = 0; c < 4; c++) edited[(y * w + x) * 4 + c] = donor[(y * w + x) * 4 + c];
    const editedFinal = roundtrip(edited, w, h, 92);

    const a = computeEla({ data: original, width: w, height: h });
    const b = computeEla({ data: editedFinal, width: w, height: h });
    expect(b.ratio).toBeGreaterThan(a.ratio);
    expect(b.heatmap).toHaveLength(w * h * 4);
    expect(b.hotBox).not.toBeNull();
  });

  it("decodes JPEG bytes", () => {
    const bytes = jpeg.encode({ data: photo(16, 16, 3), width: 16, height: 16 }, 90).data;
    expect(decodeJpeg(bytes)).toMatchObject({ width: 16, height: 16 });
  });
});

describe("metadata", () => {
  const enc = new TextEncoder();

  it("finds AI-generator markers in the file bytes", () => {
    expect(findAiMarker(enc.encode("xxx<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"))).toMatch(/AI-generated/);
    expect(findAiMarker(enc.encode("parameters: Steps: 20, Sampler: Euler a"))).toBe("made with Stable Diffusion");
    expect(findAiMarker(enc.encode("plain jpeg bytes"))).toBeNull();
  });

  it("reads a file with no EXIF without failing", async () => {
    const bytes = jpeg.encode({ data: photo(16, 16, 4), width: 16, height: 16 }, 90).data;
    await expect(readMetadata(bytes)).resolves.toMatchObject({ camera: null, editedWith: null, aiMarker: null });
  });
});

describe("scoreImage", () => {
  const clean = { camera: null, software: null, editedWith: null, aiMarker: null, hasMetadata: false };

  it("is Low when nothing stands out", () => {
    expect(scoreImage({ elaScore: 0.2, metadata: clean, ai: null, isScreenshot: false }).level).toBe("Low");
  });

  it("is High when an AI marker and an AI detector agree", () => {
    const result = scoreImage({ elaScore: 0.2, metadata: { ...clean, aiMarker: "made with Midjourney" }, ai: { fakeProbability: 0.9, label: "top guess: Artificial" }, isScreenshot: false });
    expect(result.level).toBe("High");
    expect(result.points).toBe(5);
  });

  it("is Medium for editing software or a mild ELA signal, and skips ELA for screenshots", () => {
    expect(scoreImage({ elaScore: 0.6, metadata: clean, ai: null, isScreenshot: false }).level).toBe("Medium");
    expect(scoreImage({ elaScore: null, metadata: { ...clean, editedWith: "Snapseed" }, ai: null, isScreenshot: false }).level).toBe("Medium");
    const shot = scoreImage({ elaScore: 0.99, metadata: { ...clean, camera: "Pixel 7" }, ai: { fakeProbability: 0.65, label: "x" }, isScreenshot: true });
    expect(shot.level).toBe("Medium");
    expect(shot.signals.some((s) => s.text.includes("screenshot"))).toBe(true);
    expect(shot.signals.some((s) => s.text.includes("Pixel 7"))).toBe(true);
  });

  it("detects screenshots from flat colours", () => {
    const flat = new Uint8Array(100 * 100 * 4).fill(240);
    expect(looksLikeScreenshot(flat, 100, 100)).toBe(true);
    expect(looksLikeScreenshot(photo(100, 100, 5), 100, 100)).toBe(false);
  });
});

describe("toDetection", () => {
  it("adds up the non-real labels", () => {
    expect(toDetection([{ label: "Artificial", score: 0.5 }, { label: "Deepfake", score: 0.2 }, { label: "Real", score: 0.3 }])).toEqual({ fakeProbability: 0.7, label: "top guess: Artificial" });
    expect(toDetection([]).label).toBe("no result");
  });
});
