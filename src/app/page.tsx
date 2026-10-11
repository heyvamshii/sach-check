import { Checker } from "@/components/Checker";
import { HowItWorks } from "@/components/HowItWorks";
import { Masthead } from "@/components/Masthead";

export default function Home() {
  return (
    <>
      <Masthead active="check" />
      <main>
        <Checker />
        <HowItWorks />
      </main>
      <footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted sm:px-6">
        SachCheck is a student project. AI can be wrong: always open the sources before you forward anything.
      </footer>
    </>
  );
}
