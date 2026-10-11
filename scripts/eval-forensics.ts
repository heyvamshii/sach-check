/**
 * Measures how well Error Level Analysis spots edited photos.
 * The cut-off is chosen on the "tune" photos only, then checked on the unseen "test" photos,
 * separately for fresh edits and for edits that WhatsApp has re-compressed.
 *
 * Run:  npx tsx scripts/eval-forensics.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeEla, decodeJpeg } from "../src/lib/forensics/ela";

interface Label {
  file: string;
  edited: boolean;
  case: "fresh" | "whatsapp";
}

interface Scored extends Label {
  ratio: number;
}

const ROOT = join(import.meta.dirname, "..");

function scoreSplit(split: string): Scored[] {
  const dir = join(ROOT, "data", "forensics", split);
  const labels = JSON.parse(readFileSync(join(dir, "labels.json"), "utf8")) as Label[];
  return labels.map((label) => ({ ...label, ratio: computeEla(decodeJpeg(readFileSync(join(dir, label.file)))).ratio }));
}

const accuracyAt = (rows: Scored[], cutoff: number) => rows.filter((r) => r.ratio >= cutoff === r.edited).length / rows.length;
const round = (n: number, digits = 2) => Number(n.toFixed(digits));

function report(rows: Scored[], cutoff: number) {
  const flagged = (r: Scored) => r.ratio >= cutoff;
  return {
    photos: rows.length,
    accuracy: round(accuracyAt(rows, cutoff)),
    editedCaught: rows.filter((r) => r.edited && flagged(r)).length,
    editedMissed: rows.filter((r) => r.edited && !flagged(r)).length,
    originalsCleared: rows.filter((r) => !r.edited && !flagged(r)).length,
    originalsWronglyFlagged: rows.filter((r) => !r.edited && flagged(r)).length,
  };
}

const tune = scoreSplit("tune").filter((r) => r.case === "fresh");
const test = scoreSplit("test");

// try every observed ratio as a cut-off; keep the most accurate one on the tuning photos
const candidates = [...new Set(tune.map((r) => r.ratio))].sort((a, b) => a - b);
const cutoff = candidates.reduce((best, c) => (accuracyAt(tune, c) > accuracyAt(tune, best) ? c : best), candidates[0]);

const summary = {
  method: "Error Level Analysis: re-save at JPEG quality 75, average over ~100 px windows, compare the strongest area to a typical one",
  cutoff: round(cutoff),
  tuneAccuracy: round(accuracyAt(tune, cutoff)),
  fresh: report(test.filter((r) => r.case === "fresh"), cutoff),
  whatsapp: report(test.filter((r) => r.case === "whatsapp"), cutoff),
  generatedAt: new Date().toISOString().slice(0, 10),
};

mkdirSync(join(ROOT, "public", "data"), { recursive: true });
writeFileSync(join(ROOT, "public", "data", "eval-forensics.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
