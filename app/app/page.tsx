import Link from "next/link";
import { BusinessForm } from "@/components/BusinessForm";
import { LogoutButton } from "@/components/LogoutButton";
import { getSessionUser } from "@/lib/auth";
import { listRuns } from "@/lib/runs";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  // Middleware already gates this, but we re-check so we can show the username.
  const user = (await getSessionUser()) ?? "operator";
  const runs = listRuns().slice(0, 8);
  return (
    <main className="flex flex-col">
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-border bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="font-semibold tracking-tight">
            Brandora
          </Link>
          <span className="text-muted-foreground text-sm">/ control room</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/channels" className="text-muted-foreground hover:text-foreground">
            channels
          </Link>
          <span className="text-muted-foreground">{user}</span>
          <LogoutButton />
        </div>
      </header>

      <section className="px-6 sm:px-10 py-10 max-w-4xl mx-auto w-full">
        <h1 className="text-3xl font-bold tracking-tight">Run the agent</h1>
        <p className="mt-2 text-muted-foreground">
          Drop a business in. The agent researches it, plans a strategy, builds a calendar, writes
          channel-native content, and lets you push to your connected social accounts.
        </p>
        <div className="mt-6">
          <BusinessForm />
        </div>
      </section>

      <section className="px-6 sm:px-10 pb-16 max-w-4xl mx-auto w-full">
        <h2 className="text-xl font-semibold tracking-tight">Recent runs</h2>
        {runs.length === 0 ? (
          <div className="mt-3 text-sm text-muted-foreground">No runs yet.</div>
        ) : (
          <ul className="mt-3 grid gap-2">
            {runs.map((r) => {
              const stages = (["research", "strategy", "calendar", "content"] as const)
                .map((k) => (r.stages[k]?.status === "completed" ? "✓" : "·"))
                .join(" ");
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-3"
                >
                  <Link href={`/run/${r.id}`} className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.input.name}</div>
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      {r.id} · {stages}
                    </div>
                  </Link>
                  <span
                    className={`text-[10px] font-mono uppercase ${
                      r.status === "completed"
                        ? "text-success"
                        : r.status === "failed"
                        ? "text-danger"
                        : "text-accent"
                    }`}
                  >
                    {r.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
