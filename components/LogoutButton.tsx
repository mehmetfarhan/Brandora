"use client";

import { useState } from "react";

export function LogoutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      onClick={async () => {
        setPending(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          window.location.assign("/login");
        }
      }}
      disabled={pending}
      className={
        className ??
        "rounded-md border border-border bg-card hover:border-accent/60 text-xs font-medium px-2.5 py-1.5 disabled:opacity-50"
      }
    >
      {pending ? "signing out…" : "logout"}
    </button>
  );
}
