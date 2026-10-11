import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { Masthead } from "@/components/Masthead";

export const metadata: Metadata = { title: "Test results · SachCheck" };

interface ClaimRow {
  id: number;
  lang: string;
  label: string;
  verdict: string;
  correct: boolean;
}

interface ClaimEval {
  mode: string;
  claims: number;
  correct: number;
  fakeCaught: number;
  fakeTotal: number;
  trueConfirmed: number;
  trueTotal: number;
  fakeCalledTrue: number;
  trueCalledFake?: number;
  unverified: number;
  categoryAccuracy: number;
  rows: ClaimRow[];
  generatedAt: string;
}

interface ForensicsCase {
  photos: number;
  accuracy: number;
  editedCaught: number;
  editedMissed: number;
  originalsCleared: number;
  originalsWronglyFlagged: number;
}

interface ForensicsEval {
  fresh: ForensicsCase;
  whatsapp: ForensicsCase;
  generatedAt: string;
}

interface OcrEval {
  images: number;
  tesseract: number | null;
  vision: number | null;
}

async function load<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), "public", "data", name), "utf8")) as T;
  } catch {
    return null;
  }
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Math.round(n * 100)}%`);

function Stat({ big, label, tone = "ink" }: { big: string; label: string; tone?: "ink" | "true" | "false" }) {
  const color = { ink: "text-ink", true: "text-true", false: "text-false" }[tone];
  return (
    <div className="border-t-2 border-ink pt-2">
      <p className={`font-display text-4xl font-extrabold ${color}`}>{big}</p>
      <p className="mt-1 text-sm text-ink-soft">{label}</p>
    </div>
  );
}

function ClaimColumn({ title, data, missingHint }: { title: string; data: ClaimEval | null; missingHint: string }) {
  return (
    <div className="border border-ink bg-card p-6 shadow-[6px_6px_0_var(--ink)]">
      <p className="kicker">{title}</p>
      {data ? (
        <>
          <p className="mt-2 font-display text-5xl font-extrabold">
            {data.correct}
            <span className="text-2xl text-muted"> / {data.claims} right</span>
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <Stat big={`${data.fakeCaught}/${data.fakeTotal}`} label="fake claims caught" tone="true" />
            <Stat big={`${data.trueConfirmed}/${data.trueTotal}`} label="true claims confirmed" />
            <Stat big={String(data.fakeCalledTrue)} label="fake claims wrongly called true (the worst mistake)" tone={data.fakeCalledTrue > 0 ? "false" : "true"} />
            <Stat big={String(data.trueCalledFake ?? "–")} label="true claims wrongly called fake" tone={data.trueCalledFake ? "false" : "true"} />
            <Stat big={String(data.unverified)} label={`answered "Unverified"`} />
          </div>
          <p className="mt-4 text-xs text-muted">Topic sorting right: {pct(data.categoryAccuracy)} · run on {data.generatedAt}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">{missingHint}</p>
      )}
    </div>
  );
}

export default async function ResultsPage() {
  const [basic, ai, forensics, ocr] = await Promise.all([
    load<ClaimEval>("eval-claims-basic.json"),
    load<ClaimEval>("eval-claims-AI.json"),
    load<ForensicsEval>("eval-forensics.json"),
    load<OcrEval>("eval-ocr.json"),
  ]);
  const rows = (ai ?? basic)?.rows ?? [];

  return (
    <>
      <Masthead active="results" />
      <main className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6">
        <section>
          <p className="kicker">Test 1 · Fact-check verdicts</p>
          <h2 className="mt-1 max-w-3xl font-display text-3xl font-extrabold sm:text-4xl">50 forwards with known answers: 30 fake or misleading, 20 true</h2>
          <p className="mt-3 max-w-3xl text-ink-soft">
            Claims that Indian fact-checkers (PIB, Alt News, BOOM, Factly) have already checked, plus well-known true facts, in English, Hindi and Telugu. Each one goes through the full
            pipeline. Calling a fake claim &quot;Misleading&quot; counts as caught.
          </p>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <ClaimColumn title="Basic mode (no keys)" data={basic} missingHint="Not run yet: npm run eval:claims" />
            <ClaimColumn title="AI mode (Groq models + Fact Check API)" data={ai} missingHint="Add the Groq key to .env.local, then run: npm run eval:claims" />
          </div>
          {rows.length > 0 && (
            <details className="mt-6 text-sm">
              <summary className="cursor-pointer font-semibold">See every claim ({ai ? "AI" : "basic"} mode)</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left">
                  <thead>
                    <tr className="border-b-2 border-ink">
                      <th className="py-1.5 pr-3">#</th>
                      <th className="py-1.5 pr-3">Language</th>
                      <th className="py-1.5 pr-3">Real answer</th>
                      <th className="py-1.5 pr-3">SachCheck said</th>
                      <th className="py-1.5">Right?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-rule">
                        <td className="py-1.5 pr-3 font-mono">{r.id}</td>
                        <td className="py-1.5 pr-3">{r.lang}</td>
                        <td className="py-1.5 pr-3">{r.label}</td>
                        <td className="py-1.5 pr-3">{r.verdict}</td>
                        <td className={`py-1.5 font-semibold ${r.correct ? "text-true" : "text-false"}`}>{r.correct ? "✓" : "✗"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>

        <section>
          <p className="kicker">Test 2 · Reading text from images</p>
          <h2 className="mt-1 font-display text-3xl font-extrabold">How much of the text is read correctly</h2>
          <div className="mt-6 grid max-w-2xl grid-cols-2 gap-6">
            <Stat big={pct(ocr?.tesseract)} label="Tesseract (free, runs in your browser)" />
            <Stat big={ocr?.vision === null || !ocr ? "–" : pct(ocr.vision)} label="Groq vision model (needs the Groq key)" />
          </div>
          <p className="mt-4 max-w-3xl text-sm text-muted">
            On {ocr?.images ?? 6} generated WhatsApp screenshots (English, Hindi, Telugu). These are clean images, so real phone screenshots will score lower.
          </p>
        </section>

        <section>
          <p className="kicker">Test 3 · Spotting edited photos</p>
          <h2 className="mt-1 max-w-3xl font-display text-3xl font-extrabold">Edit detection works on fresh edits, and mostly stops working after WhatsApp</h2>
          {forensics ? (
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              {(
                [
                  ["Freshly edited photos", forensics.fresh],
                  ["After WhatsApp re-compresses them", forensics.whatsapp],
                ] as const
              ).map(([title, c]) => (
                <div key={title} className="border border-ink bg-card p-6">
                  <p className="kicker">{title}</p>
                  <p className="mt-2 font-display text-5xl font-extrabold">{pct(c.accuracy)}</p>
                  <p className="text-sm text-muted">sorted correctly, out of {c.photos} photos (50% = guessing)</p>
                  <p className="mt-3 text-sm text-ink-soft">
                    Edited photos caught: {c.editedCaught} of {c.editedCaught + c.editedMissed} · originals wrongly flagged: {c.originalsWronglyFlagged} of{" "}
                    {c.originalsCleared + c.originalsWronglyFlagged}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Not run yet: npm run eval:forensics</p>
          )}
          <p className="mt-4 max-w-3xl text-sm text-ink-soft">
            Generated photos with a patch pasted in from another picture, compared with untouched ones. The cut-off was picked on a separate set of photos. When WhatsApp re-saves an image
            it compresses everything again, which wipes out most traces of editing. That&apos;s why SachCheck calls image results &quot;signals&quot;, never proof.
          </p>
        </section>
      </main>
    </>
  );
}
