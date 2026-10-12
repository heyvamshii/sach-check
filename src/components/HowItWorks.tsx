const MODELS = [
  { n: "1", name: "Image reader", tool: "Groq Qwen3.8 27B (vision) · Tesseract OCR as free fallback", job: "Reads the text inside screenshots, in English, Hindi or Telugu." },
  { n: "2", name: "Claim finder + sorter", tool: "Groq gpt-oss-20b · Qwen3.8 27B", job: "Pulls out the checkable claims and tags each one as health, political, money or other." },
  { n: "3", name: "Evidence search", tool: "Google Fact Check API · Google News · Tavily", job: "Looks for fact-checks by PIB, Alt News, BOOM, Factly and reports from trusted newsrooms." },
  { n: "4", name: "Image forensics", tool: "Error Level Analysis · EXIF/C2PA check · ViT deepfake detector", job: "Looks for pasted-in areas, editing software and AI-generation markers." },
  { n: "5", name: "Link checker", tool: "Link rules · Google Safe Browsing · Tavily page read · gpt-oss-20b", job: "Finds every link, even mid-sentence, and flags scam sites, fake bank pages and links that don't back up the message." },
  { n: "6", name: "Judge", tool: "Groq gpt-oss-120b", job: "Weighs only the evidence found and gives a verdict with sources, or says Unverified." },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-ink bg-paper-deep">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="kicker">How it works</p>
        <h2 className="mt-1 max-w-3xl font-display text-3xl font-extrabold sm:text-4xl">Each model does one job. The judge only trusts evidence.</h2>
        <ol className="mt-8 grid gap-px border border-ink bg-ink sm:grid-cols-2 lg:grid-cols-3">
          {MODELS.map((m) => (
            <li key={m.n} className="bg-card p-5">
              <span className="font-display text-5xl font-extrabold text-false">{m.n}</span>
              <h3 className="mt-2 font-semibold">{m.name}</h3>
              <p className="mt-1 text-sm text-ink-soft">{m.job}</p>
              <p className="mt-3 border-t border-rule pt-2 font-mono text-[11px] leading-relaxed text-muted">{m.tool}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 grid gap-6 text-sm text-ink-soft md:grid-cols-3">
          <p>
            <strong className="text-ink">Free to run.</strong> Every service has a free tier, and nothing is stored. With no keys at all, rule-based steps and Google News still give a basic check.
          </p>
          <p>
            <strong className="text-ink">Works from WhatsApp.</strong> Install the app on Android (browser menu → Add to Home screen), then use WhatsApp&apos;s Share button and pick SachCheck.
          </p>
          <p>
            <strong className="text-ink">Honest limits.</strong> Image forensics are signals, not proof: WhatsApp re-compresses images, which hides most editing traces. Very new claims may have no coverage yet.
          </p>
        </div>
      </div>
    </section>
  );
}
