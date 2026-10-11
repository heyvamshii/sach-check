"use client";

/** Browser-only helpers to turn an uploaded file into pixels and a data URL. */

const MAX_SIDE_ANALYSIS = 1200; // keeps ELA fast in the browser
const MAX_SIDE_UPLOAD = 1600; // keeps the vision request under Groq's size limit

export interface LoadedImage {
  bytes: Uint8Array;
  type: string;
  previewUrl: string;
  /** original size before any scaling */
  width: number;
  height: number;
  /** pixels at analysis size */
  pixels: ImageData;
  /** JPEG/PNG data URL at upload size, for the vision model */
  dataUrl: string;
}

function drawScaled(bitmap: ImageBitmap, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function loadImage(file: Blob): Promise<LoadedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG or WebP).");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is over 15 MB. Please pick a smaller one.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bitmap = await createImageBitmap(file);
  try {
    const analysis = drawScaled(bitmap, MAX_SIDE_ANALYSIS);
    const pixels = analysis.getContext("2d")!.getImageData(0, 0, analysis.width, analysis.height);
    const upload = drawScaled(bitmap, MAX_SIDE_UPLOAD);
    const dataUrl = file.type === "image/png" ? upload.toDataURL("image/png") : upload.toDataURL("image/jpeg", 0.9);
    return { bytes, type: file.type, previewUrl: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height, pixels, dataUrl };
  } finally {
    bitmap.close();
  }
}

/** Paint an RGBA buffer into a data URL (used for the ELA heatmap). */
export function rgbaToDataUrl(data: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas.toDataURL("image/png");
}
