import Link from "next/link";
import { BusinessForm } from "@/components/BusinessForm";

const PHASES = [
  {
    n: "01",
    title: "Research & Discovery",
    bullets: [
      "Research the business from public sources",
      "Identify what the business does and its niche",
      "Find the brand voice and tone",
      "Identify the target audience",
    ],
  },
  {
    n: "02",
    title: "Strategy & Planning",
    bullets: [
      "Discover content themes and pillars",
      "Decide suitable distribution channels (where, when, why)",
      "Build a content calendar with posting cadence",
    ],
  },
  {
    n: "03",
    title: "Content Generation",
    bullets: [
      "Generate content for items on the calendar",
      "Tailor content to each channel's format",
    ],
  },
];

const RUBRIC = [
  { name: "Self-Verification", w: 25, hint: "Critic + revision after every stage. Fact-check on every cited URL." },
  { name: "Content Quality", w: 25, hint: "Per-channel lint, brand-voice critic, automatic revision." },
  { name: "Research Depth", w: 20, hint: "Web search + fetch via Anthropic server tools." },
  { name: "Pipeline Completeness", w: 20, hint: "Research → Strategy → Calendar → Content, all stitched." },
  { name: "Tech", w: 5, hint: "Next.js 16, Anthropic SDK, prompt caching, SSE streaming." },
  { name: "Demo", w: 5, hint: "You're looking at it." },
];

export default function Home() {
  return (
    <main className="flex flex-col">
      <Header />
      <Hero />
      <PhaseGrid />
      <RubricBlock />
      <FormBlock />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="px-6 sm:px-10 py-6 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent live-dot" />
        <span>Pipeline</span>
        <span className="text-muted-foreground font-normal text-sm">/ The Agent Lab</span>
      </Link>
      <nav className="hidden sm:flex items-center gap-5 text-sm text-muted-foreground">
        <a href="#how" className="hover:text-foreground">How it works</a>
        <a href="#rubric" className="hover:text-foreground">Why it scores</a>
        <a href="#run" className="hover:text-foreground">Run it</a>
        <Link href="/channels" className="hover:text-foreground">Channels</Link>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="px-6 sm:px-10 pt-12 pb-16 sm:pt-20 sm:pb-24 max-w-6xl mx-auto w-full">
      <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">One agent. Three phases. End-to-end.</p>
      <h1 className="mt-4 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
        From a business name<br />
        to <span className="text-accent">published-ready content</span>.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
        Drop in a business and watch a single autonomous agent research it, plan a strategy, build a
        calendar, and write channel-native content — verifying its own work at every step.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href="#run"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold hover:brightness-110"
        >
          Run a live demo →
        </a>
        <a
          href="#how"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card/60 px-5 py-2.5 text-sm hover:border-accent/60"
        >
          See the pipeline
        </a>
      </div>
    </section>
  );
}

function PhaseGrid() {
  return (
    <section id="how" className="px-6 sm:px-10 pb-20 max-w-6xl mx-auto w-full">
      <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
        {PHASES.map((p) => (
          <article key={p.n} className="rounded-xl border border-border bg-card p-6">
            <div className="text-xs font-mono text-muted-foreground">{p.n}</div>
            <h3 className="mt-2 text-xl font-semibold">{p.title}</h3>
            <ul className="mt-4 space-y-1.5">
              {p.bullets.map((b) => (
                <li key={b} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="text-accent">›</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function RubricBlock() {
  return (
    <section id="rubric" className="px-6 sm:px-10 pb-20 max-w-6xl mx-auto w-full">
      <h2 className="text-2xl font-semibold tracking-tight">Built to the rubric</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Half the score lives in self-verification and content quality. Every stage runs through a
        critic; every research source is re-fetched and fact-checked before strategy uses it.
      </p>
      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {RUBRIC.map((r) => (
          <div key={r.name} className="rounded-lg border border-border bg-card p-4 flex items-start gap-4">
            <div className="text-2xl font-mono text-accent w-12 shrink-0">{r.w}%</div>
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{r.hint}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FormBlock() {
  return (
    <section id="run" className="px-6 sm:px-10 pb-24 max-w-3xl mx-auto w-full">
      <h2 className="text-2xl font-semibold tracking-tight">Run the agent</h2>
      <p className="mt-2 text-muted-foreground">
        Enter a business and hit start. You&rsquo;ll be redirected to the live run view where the
        whole pipeline streams in real-time.
      </p>
      <div className="mt-6">
        <BusinessForm />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-auto px-6 sm:px-10 py-8 border-t border-border text-sm text-muted-foreground flex items-center justify-between">
      <span>The Agent Lab · Amman 2026</span>
      <span className="font-mono text-xs">claude · web_search · web_fetch · prompt cache · SSE</span>
    </footer>
  );
}
