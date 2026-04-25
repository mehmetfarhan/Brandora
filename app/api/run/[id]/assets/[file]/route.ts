// GET /api/run/[id]/assets/[file] — serve a brand asset stored under
// .runs/<id>/assets/<file>. Auth-gated by proxy.ts (everything under /api/
// except /api/auth/*).

import path from "node:path";
import { promises as fs } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT_TO_CT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export async function GET(
  _: Request,
  ctx: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await ctx.params;
  // Defensive: reject path-traversal attempts.
  if (!file || file.includes("/") || file.includes("..") || file.startsWith(".")) {
    return new Response("bad request", { status: 400 });
  }
  if (!id || /[^A-Za-z0-9_\-.]/.test(id)) {
    return new Response("bad request", { status: 400 });
  }
  const root = path.resolve(process.cwd(), ".runs", id, "assets");
  const target = path.resolve(root, file);
  if (!target.startsWith(root + path.sep)) {
    return new Response("bad request", { status: 400 });
  }
  try {
    const buf = await fs.readFile(target);
    const ext = path.extname(file).slice(1).toLowerCase();
    const ct = EXT_TO_CT[ext] ?? "application/octet-stream";
    // SECURITY: a fresh agent run could have downloaded an attacker-controlled
    // SVG. Sanitise by serving SVGs with the strictest CSP we can; the proxy.ts
    // gate already requires auth before reaching this route.
    const headers: Record<string, string> = {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(buf.length),
      "X-Content-Type-Options": "nosniff",
    };
    if (ext === "svg") {
      headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
    }
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
