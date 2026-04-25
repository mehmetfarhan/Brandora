// Brand-asset downloader.
//
// Takes the BrandAsset[] entries the research agent emitted (URLs +
// metadata) and saves the binary content to .runs/<id>/assets/<file> so
// they can be reused in publishing or as references for image/video
// generation. Failure-tolerant: a 403 / unsupported-type for one URL
// doesn't break the others.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { BrandAsset } from "./types";

const RUNS_DIR = path.resolve(process.cwd(), ".runs");
/** Per-asset hard cap: 12 MB. Anything larger is skipped to keep .runs/ sane. */
const MAX_BYTES_PER_FILE = 12 * 1024 * 1024;
/** Total bytes across all assets in one run. */
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
/** Per-request timeout. */
const TIMEOUT_MS = 25_000;

const EXT_FROM_CT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

function extFor(ct: string, url: string): string {
  const m = ct.split(";")[0].trim().toLowerCase();
  if (EXT_FROM_CT[m]) return EXT_FROM_CT[m];
  // Fallback: derive from URL pathname.
  try {
    const u = new URL(url);
    const e = path.extname(u.pathname).slice(1).toLowerCase();
    if (e && /^[a-z0-9]{2,5}$/.test(e)) return e;
  } catch {
    // ignore
  }
  return "bin";
}

function isAllowedContentType(ct: string): boolean {
  const m = ct.split(";")[0].trim().toLowerCase();
  return m.startsWith("image/") || m.startsWith("video/");
}

function safeFilename(url: string, ext: string): string {
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  return `${hash}.${ext}`;
}

export async function downloadAssets(
  runId: string,
  assets: BrandAsset[],
  onProgress?: (saved: BrandAsset, index: number) => void,
): Promise<BrandAsset[]> {
  if (!assets || assets.length === 0) return [];
  const dir = path.join(RUNS_DIR, runId, "assets");
  await fs.mkdir(dir, { recursive: true });

  const results: BrandAsset[] = [];
  let totalBytes = 0;

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const out: BrandAsset = { ...a };
    if (!a?.url || typeof a.url !== "string" || !/^https?:\/\//i.test(a.url)) {
      out.error = "invalid url";
      results.push(out);
      onProgress?.(out, i);
      continue;
    }

    try {
      const ctrl = AbortSignal.timeout(TIMEOUT_MS);
      const r = await fetch(a.url, {
        redirect: "follow",
        signal: ctrl,
        headers: {
          "User-Agent": "BrandoraBot/1.0 (+research)",
          Accept: "image/*,video/*,*/*;q=0.8",
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get("content-type") ?? "";
      if (!isAllowedContentType(ct)) {
        // Some servers serve images with octet-stream — accept by URL extension.
        const ext = extFor(ct, a.url);
        const isImageExt = /^(png|jpe?g|gif|webp|svg|ico|avif|mp4|mov|webm)$/.test(ext);
        if (!isImageExt) throw new Error(`unsupported content-type: ${ct || "unknown"}`);
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length === 0) throw new Error("empty response");
      if (buf.length > MAX_BYTES_PER_FILE) throw new Error(`too large: ${buf.length} bytes`);
      if (totalBytes + buf.length > MAX_TOTAL_BYTES) {
        throw new Error("budget exhausted (total bytes cap)");
      }
      const ext = extFor(ct, a.url);
      const filename = safeFilename(a.url, ext);
      await fs.writeFile(path.join(dir, filename), buf);
      totalBytes += buf.length;
      out.filename = filename;
      out.contentType = ct.split(";")[0].trim() || `image/${ext}`;
      out.bytes = buf.length;
      out.publicPath = `/api/run/${runId}/assets/${filename}`;
    } catch (e) {
      out.error = (e as Error).message ?? String(e);
    }
    results.push(out);
    onProgress?.(out, i);
  }

  return results;
}
