"use client";

const STYLES: Record<string, string> = {
  linkedin: "bg-ch-linkedin/15 text-ch-linkedin border-ch-linkedin/40",
  x: "bg-white/10 text-white border-white/40",
  twitter: "bg-white/10 text-white border-white/40",
  instagram: "bg-ch-instagram/15 text-ch-instagram border-ch-instagram/40",
  facebook: "bg-ch-linkedin/15 text-ch-linkedin border-ch-linkedin/40",
  whatsapp: "bg-success/15 text-success border-success/40",
  telegram: "bg-info/15 text-info border-info/40",
  blog: "bg-ch-blog/15 text-ch-blog border-ch-blog/40",
  email: "bg-ch-email/15 text-ch-email border-ch-email/40",
};

export function ChannelBadge({ channel }: { channel: string }) {
  const cls = STYLES[channel] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide ${cls}`}>
      {channel}
    </span>
  );
}
