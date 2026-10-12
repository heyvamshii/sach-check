import Link from "next/link";

type Props = {
  active: "check" | "results";
};

export function Masthead({ active }: Props) {
  const linkClass = (isActive: boolean) =>
    `border-b-2 pb-0.5 transition-colors ${isActive ? "border-ink text-ink" : "border-transparent text-muted hover:border-rule hover:text-ink"}`;
  return (
    <header className="border-b-4 border-double border-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-4 text-xs text-muted sm:px-6">
        <span>Free · no sign-up · English, हिंदी, తెలుగు</span>
        <nav aria-label="Main" className="flex gap-5 font-medium">
          <Link href="/" className={linkClass(active === "check")}>
            Check a forward
          </Link>
          <Link href="/#how" className={linkClass(false)}>
            How it works
          </Link>
          <Link href="/results" className={linkClass(active === "results")}>
            Test results
          </Link>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-5 pt-3 sm:px-6">
        <Link href="/" className="inline-block">
          <h1 className="font-display text-5xl font-extrabold leading-none tracking-tight sm:text-7xl">
            Sach<span className="text-false">Check</span>
          </h1>
        </Link>
        <p className="mt-2 max-w-2xl font-display text-lg italic text-ink-soft sm:text-xl">
          The fact desk for WhatsApp forwards. Six AI models check claims and links against trusted sources and look for signs of editing.
        </p>
      </div>
    </header>
  );
}
