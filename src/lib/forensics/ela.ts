import jpeg from "jpeg-js";

/**
 * Error Level Analysis (ELA). Re-save the image as JPEG and measure how much
 * each part changes. A patch pasted in from another picture has a different
 * compression history, so it changes by a different amount than the rest.
 * Runs the same way in the browser and in Node.
 *
 * Measured on generated photos (scripts/eval-forensics.ts): it works on fresh
 * edits, but not once WhatsApp has re-compressed the whole image.
 */

export const ELA_QUALITY = 75;
const BLOCK = 8; // JPEG works in 8x8 blocks
const WINDOW = 13; // blocks; averaging over ~100 px stops sharp edges from looking like edits
const HEAT_GAIN = 10;

export interface RgbaImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ElaResult {
  /** 0..1, how strongly one area stands out from the rest */
  score: number;
  /** raw standout ratio behind the score (for evaluation) */
  ratio: number;
  /** RGBA heatmap the same size as the input, for display */
  heatmap: Uint8ClampedArray;
  width: number;
  height: number;
  /** the area that stands out most, in pixels */
  hotBox: { x: number; y: number; width: number; height: number } | null;
}

/** Per-pixel error from one re-compression (largest change across R, G, B). */
export function errorMap(image: RgbaImage, quality = ELA_QUALITY): Float32Array {
  const { width, height } = image;
  const encoded = jpeg.encode({ data: image.data as Uint8Array, width, height }, quality);
  const decoded = jpeg.decode(encoded.data, { useTArray: true, formatAsRGBA: true });
  const errors = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    errors[p] = Math.max(
      Math.abs(image.data[i] - decoded.data[i]),
      Math.abs(image.data[i + 1] - decoded.data[i + 1]),
      Math.abs(image.data[i + 2] - decoded.data[i + 2]),
    );
  }
  return errors;
}

export interface Grid {
  cols: number;
  rows: number;
  values: Float32Array;
}

export function blockMeans(errors: Float32Array, width: number, height: number): Grid {
  const cols = Math.floor(width / BLOCK);
  const rows = Math.floor(height / BLOCK);
  const values = new Float32Array(cols * rows);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let sum = 0;
      for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
        for (let x = bx * BLOCK; x < (bx + 1) * BLOCK; x++) sum += errors[y * width + x];
      }
      values[by * cols + bx] = sum / (BLOCK * BLOCK);
    }
  }
  return { cols, rows, values };
}

/** Moving average over a size x size window; edges repeat the nearest block. */
export function boxBlur(grid: Grid, size = WINDOW): Grid {
  const { cols, rows, values } = grid;
  const half = Math.floor(size / 2);
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  const out = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) sum += values[clamp(y + dy, rows) * cols + clamp(x + dx, cols)];
      }
      out[y * cols + x] = sum / (size * size);
    }
  }
  return { cols, rows, values: out };
}

function median(values: Float32Array): number {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.floor(sorted.length / 2)];
}

/** Strongest area divided by a typical area. Around 1.5-2.5 is normal. */
export function standoutRatio(smoothed: Grid): number {
  let max = 0;
  for (const v of smoothed.values) max = Math.max(max, v);
  return max / (median(smoothed.values) + 0.05);
}

// ratio -> 0..1 score. RATIO_CUTOFF comes from the tuning photos (scripts/eval-forensics.ts)
export const RATIO_CUTOFF = 2.44;
const RATIO_SPAN = 2;

export function ratioToScore(ratio: number): number {
  // 0.5 exactly at the cut-off, rising to 1 at cut-off + span
  return Math.min(1, Math.max(0, 0.5 + (ratio - RATIO_CUTOFF) / (2 * RATIO_SPAN)));
}

function hotBox(smoothed: Grid): ElaResult["hotBox"] {
  let max = 0;
  for (const v of smoothed.values) max = Math.max(max, v);
  if (max <= 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  smoothed.values.forEach((v, i) => {
    if (v < max * 0.85) return;
    const x = i % smoothed.cols;
    const y = Math.floor(i / smoothed.cols);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  const half = Math.floor(WINDOW / 2);
  const x0 = Math.max(0, minX - half);
  const y0 = Math.max(0, minY - half);
  const x1 = Math.min(smoothed.cols - 1, maxX + half);
  const y1 = Math.min(smoothed.rows - 1, maxY + half);
  return { x: x0 * BLOCK, y: y0 * BLOCK, width: (x1 - x0 + 1) * BLOCK, height: (y1 - y0 + 1) * BLOCK };
}

/** Colour ramp for the heatmap: black -> red -> amber -> white. */
function heatColor(value: number): [number, number, number] {
  const v = Math.min(255, value);
  if (v < 85) return [v * 3, 0, 0];
  if (v < 170) return [255, (v - 85) * 3, 0];
  return [255, 255, (v - 170) * 3];
}

export function computeEla(image: RgbaImage, quality = ELA_QUALITY): ElaResult {
  const { width, height } = image;
  const errors = errorMap(image, quality);
  const smoothed = boxBlur(blockMeans(errors, width, height));
  const ratio = standoutRatio(smoothed);

  const heatmap = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const [r, g, b] = heatColor(errors[p] * HEAT_GAIN);
    heatmap[p * 4] = r;
    heatmap[p * 4 + 1] = g;
    heatmap[p * 4 + 2] = b;
    heatmap[p * 4 + 3] = 255;
  }
  return { score: ratioToScore(ratio), ratio, heatmap, width, height, hotBox: hotBox(smoothed) };
}

/** Decode a JPEG file (Node scripts and tests). */
export function decodeJpeg(bytes: Uint8Array): RgbaImage {
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { data: decoded.data, width: decoded.width, height: decoded.height };
}
