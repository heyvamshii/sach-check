import { chat, type FetchLike } from "./groq";

/** Step 0 (Model 1): read the text inside a forwarded image with a Groq vision model. */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Groq's limit for base64 images
const DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

const OCR_PROMPT = `Copy out all the text you can read in this image, exactly as written, keeping line breaks.
The text may be English, Hindi, Telugu or another Indian language; keep the original script.
Skip app interface text such as the chat name, "Forwarded", times and battery.
If there is no readable text, reply with exactly: NO_TEXT`;

export function isImageDataUrl(value: string): boolean {
  return DATA_URL.test(value);
}

export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

export async function readImageText(
  imageDataUrl: string,
  apiKey: string,
  models: string[],
  fetchImpl?: FetchLike,
): Promise<{ text: string; model: string }> {
  const { content, model } = await chat({
    apiKey,
    models,
    fetchImpl,
    maxTokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });
  const text = content.trim();
  return { text: text === "NO_TEXT" ? "" : text, model };
}
