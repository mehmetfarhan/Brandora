import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (user) {
    redirect(sp.next && sp.next.startsWith("/") ? sp.next : "/app");
  }
  return (
    <main className="flex flex-col min-h-[100dvh]">
      <header className="px-6 sm:px-10 py-6">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← back to landing
        </Link>
      </header>
      <section className="flex-1 flex items-center justify-center px-6 sm:px-10 py-12">
        <div className="w-full max-w-md">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sign in</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Brandora</h1>
          <p className="mt-2 text-muted-foreground">
            Single-user access. Use your operator credentials to run the agent and publish.
          </p>
          <div className="mt-8">
            <LoginForm next={sp.next} />
          </div>
        </div>
      </section>
    </main>
  );
}
