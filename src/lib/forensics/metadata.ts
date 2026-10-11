import exifr from "exifr";

/** Hidden file data (EXIF/XMP) and AI-generator markers. Works in the browser and in Node. */

export interface MetadataReport {
  camera: string | null;
  software: string | null;
  editedWith: string | null;
  /** e.g. "C2PA content credentials say AI-generated", "made with Stable Diffusion" */
  aiMarker: string | null;
  hasMetadata: boolean;
}

const EDITORS =
  /photoshop|gimp|snapseed|picsart|canva|lightroom|pixlr|facetune|meitu|affinity|paint\.net|photopea|remini|faceapp|inshot|vsco|befunky|fotor/i;

// text markers that AI image tools write into files
const AI_MARKERS: [RegExp, string][] = [
  [/trainedAlgorithmicMedia/i, "the file is labelled as AI-generated (IPTC digital source type)"],
  [/compositeWithTrainedAlgorithmicMedia/i, "the file is labelled as partly AI-generated"],
  [/Stable Diffusion|sd-webui|ComfyUI|"sampler"|Steps: \d+, Sampler/i, "made with Stable Diffusion"],
  [/Midjourney/i, "made with Midjourney"],
  [/DALL[·-]?E|OpenAI/i, "made with DALL-E / OpenAI"],
  [/Adobe Firefly|Firefly/i, "made with Adobe Firefly"],
  [/Imagen|Google AI|SynthID/i, "made with a Google AI image tool"],
  [/Meta AI|Imagine with Meta/i, "made with Meta AI"],
];

/** Scan the first and last part of the file as text; markers live in headers or trailing chunks. */
export function findAiMarker(bytes: Uint8Array): string | null {
  const span = 256 * 1024;
  const head = bytes.subarray(0, span);
  const tail = bytes.length > span ? bytes.subarray(bytes.length - span) : new Uint8Array();
  const decoder = new TextDecoder("latin1");
  const text = decoder.decode(head) + decoder.decode(tail);
  for (const [pattern, label] of AI_MARKERS) if (pattern.test(text)) return label;
  if (/c2pa/i.test(text) && /trainedAlgorithmic|generative|ai[_ ]generated/i.test(text)) return "C2PA content credentials mention AI generation";
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null;
}

export async function readMetadata(bytes: Uint8Array): Promise<MetadataReport> {
  let tags: Record<string, unknown> = {};
  try {
    tags = ((await exifr.parse(bytes, { tiff: true, xmp: true, iptc: true, ifd0: {}, exif: true })) as Record<string, unknown>) ?? {};
  } catch {
    tags = {};
  }
  const make = str(tags.Make);
  const model = str(tags.Model);
  const software = str(tags.Software) ?? str(tags.CreatorTool) ?? str(tags.ProcessingSoftware);
  const camera = make || model ? [make, model].filter(Boolean).join(" ") : null;
  return {
    camera,
    software,
    editedWith: software && EDITORS.test(software) ? software : null,
    aiMarker: findAiMarker(bytes),
    hasMetadata: Object.keys(tags).length > 0,
  };
}
