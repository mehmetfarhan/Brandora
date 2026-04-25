import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { listAccounts, listPosts, listProfiles } from "@/lib/zernio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface LoadResult {
  ok: boolean;
  error?: string;
  profiles: Awaited<ReturnType<typeof listProfiles>>;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  posts: Awaited<ReturnType<typeof listPosts>>;
}

async function load(): Promise<LoadResult> {
  if (!process.env.ZERNIO_API_KEY) {
    return {
      ok: false,
      error: "ZERNIO_API_KEY is not set in .env.local",
      profiles: [],
      accounts: [],
      posts: [],
    };
  }
  try {
    const [profiles, accounts, posts] = await Promise.all([
      listProfiles(),
      listAccounts(),
      listPosts({ limit: 20 }),
    ]);
    return { ok: true, profiles, accounts, posts };
  } catch (e) {
    return { ok: false, error: (e as Error).message, profiles: [], accounts: [], posts: [] };
  }
}

const PLATFORM_COLOR: Record<string, string> = {
  facebook: "text-ch-linkedin border-ch-linkedin/40",
  whatsapp: "text-success border-success/40",
  telegram: "text-info border-info/40",
  linkedin: "text-ch-linkedin border-ch-linkedin/40",
  instagram: "text-ch-instagram border-ch-instagram/40",
  twitter: "text-foreground border-white/40",
  x: "text-foreground border-white/40",
};

export default async function ChannelsPage() {
  const data = await load();
  return (
    <main className="flex flex-col">
      <header className="px-6 sm:px-10 py-6 flex items-center justify-between border-b border-border bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground">
            ←
          </Link>
          <span className="font-semibold tracking-tight">Channels &amp; Publishing</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://zernio.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-accent hover:underline underline-offset-2"
          >
            open Zernio dashboard ↗
          </a>
          <LogoutButton className="rounded-md border border-border bg-card hover:border-accent/60 text-xs font-medium px-2.5 py-1.5" />
        </div>
      </header>

      <section className="px-6 sm:px-10 py-8 max-w-6xl mx-auto w-full">
        <h1 className="text-3xl font-bold tracking-tight">Where you publish</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          These are the social accounts connected via your Zernio API key. Drafts produced by the
          agent can be one-click published to the matching platform from the run page.
        </p>

        {!data.ok ? (
          <ErrorBlock error={data.error} />
        ) : (
          <>
            <ProfilesAccounts profiles={data.profiles} accounts={data.accounts} />
            <Posts posts={data.posts} />
            <Mapping />
          </>
        )}
      </section>
    </main>
  );
}

function ErrorBlock({ error }: { error?: string }) {
  return (
    <div className="mt-8 rounded-xl border border-danger/40 bg-danger/10 p-6">
      <div className="font-medium text-danger">Couldn&rsquo;t reach Zernio</div>
      <div className="mt-2 text-sm text-danger/80 break-all">{error}</div>
      <div className="mt-3 text-sm text-muted-foreground">
        Make sure <code className="text-foreground">ZERNIO_API_KEY</code> is set in{" "}
        <code className="text-foreground">.env.local</code> and the dev server picked it up.
      </div>
    </div>
  );
}

function ProfilesAccounts({
  profiles,
  accounts,
}: {
  profiles: LoadResult["profiles"];
  accounts: LoadResult["accounts"];
}) {
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Connected accounts</h2>
        <span className="text-sm text-muted-foreground">
          {accounts.length} account{accounts.length === 1 ? "" : "s"} · {profiles.length} profile
          {profiles.length === 1 ? "" : "s"}
        </span>
      </div>
      {accounts.length === 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No accounts connected yet.{" "}
          <a
            className="text-accent hover:underline underline-offset-2"
            href="https://zernio.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Open Zernio
          </a>{" "}
          to connect Facebook, WhatsApp, Telegram, LinkedIn, X, and others.
        </div>
      ) : (
        <ul className="mt-4 grid sm:grid-cols-2 gap-3">
          {accounts.map((a) => {
            const cls = PLATFORM_COLOR[a.platform] ?? "text-muted-foreground border-border";
            const profileName =
              typeof a.profileId === "object" && a.profileId !== null && "name" in a.profileId
                ? (a.profileId as { name?: string }).name
                : profiles.find((p) => p._id === (a.profileId as string))?.name ?? "—";
            return (
              <li
                key={a._id}
                className="rounded-lg border border-border bg-card p-4 flex items-start gap-4"
              >
                <span
                  className={`mt-0.5 inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide ${cls}`}
                >
                  {a.platform}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{a.displayName || a.username || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.username && a.username !== a.displayName ? `@${a.username} · ` : ""}
                    profile: {profileName}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono uppercase ${
                    a.enabled !== false && a.isActive !== false ? "text-success" : "text-warning"
                  }`}
                >
                  {a.enabled !== false && a.isActive !== false ? "active" : "inactive"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Posts({ posts }: { posts: LoadResult["posts"] }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold tracking-tight">Recent publishes</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pulled from Zernio. Includes posts created by this agent and anything else on your account.
      </p>
      {posts.length === 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing published yet. Run the agent and click <em>publish via Zernio</em> on a content card.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {posts.map((p) => (
            <li
              key={p._id}
              className="rounded-lg border border-border bg-card p-4 flex items-start gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{p.title || "(untitled)"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                  {(p.content || "").slice(0, 200)}
                </div>
                <div className="mt-1.5 text-xs font-mono text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                  <span>id {p._id.slice(-8)}</span>
                  {p.createdAt && <span>{new Date(p.createdAt).toLocaleString()}</span>}
                  {p.scheduledFor && (
                    <span>scheduled {new Date(p.scheduledFor).toLocaleString()}</span>
                  )}
                  {(p.platforms ?? []).map((pl, i) => (
                    <span key={i} className="text-foreground">
                      {pl.platform}:{pl.status}
                      {pl.postUrl ? (
                        <>
                          {" "}
                          <a
                            className="text-accent hover:underline underline-offset-2"
                            href={pl.postUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            view
                          </a>
                        </>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
              <span
                className={`shrink-0 text-[10px] font-mono uppercase ${
                  p.status === "published"
                    ? "text-success"
                    : p.status === "failed"
                    ? "text-danger"
                    : "text-muted-foreground"
                }`}
              >
                {p.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Mapping() {
  const rows: { ours: string; zernio: string; note: string }[] = [
    { ours: "facebook", zernio: "facebook", note: "Posts to your Facebook page (no personal feeds)." },
    { ours: "whatsapp", zernio: "whatsapp", note: "Posts to a WhatsApp Channel — broadcast only." },
    { ours: "telegram", zernio: "telegram", note: "Posts to a Telegram channel where the bot is an admin." },
    { ours: "linkedin", zernio: "linkedin", note: "Personal profile or org page (depending on account)." },
    { ours: "x / twitter", zernio: "twitter", note: "Single tweet or thread (split on `\\n---\\n`)." },
    { ours: "instagram", zernio: "instagram", note: "Caption + first image (no carousel yet)." },
    { ours: "blog · email", zernio: "—", note: "Not auto-publishable; copy from the content card." },
  ];
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold tracking-tight">How channels map</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Content drafts are tailored per channel. When you click <em>publish via Zernio</em>, we map
        the channel to a connected account.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b border-border">
            <tr>
              <th className="py-2 px-4 font-medium">Our channel</th>
              <th className="py-2 px-4 font-medium">Zernio platform</th>
              <th className="py-2 px-4 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ours} className="border-b border-border/50 last:border-0">
                <td className="py-2 px-4 font-mono">{r.ours}</td>
                <td className="py-2 px-4 font-mono">{r.zernio}</td>
                <td className="py-2 px-4 text-muted-foreground">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
