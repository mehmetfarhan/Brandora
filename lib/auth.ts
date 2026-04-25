// Session auth (single hardcoded user).
//
// Cookie format: `<base64url(payload)>.<base64url(hmacSha256(payload))>`
// where payload is `<username>|<issuedAtMs>`. We sign with BRANDORA_SESSION_SECRET.
//
// This module uses node:crypto and is meant for API route handlers (Node
// runtime). The companion middleware.ts re-implements verify() with Web
// Crypto so it can run in Edge.

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "brandora_session";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 7 * ONE_DAY_MS;

function secret(): string {
  const s = process.env.BRANDORA_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("BRANDORA_SESSION_SECRET is missing or too short in .env.local");
  }
  return s;
}

function b64url(buf: Buffer | Uint8Array | string): string {
  const b = Buffer.isBuffer(buf) ? buf : typeof buf === "string" ? Buffer.from(buf) : Buffer.from(buf);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function checkCredentials(user: string, pass: string): boolean {
  const u = process.env.BRANDORA_USERNAME ?? "";
  const p = process.env.BRANDORA_PASSWORD ?? "";
  if (!u || !p) return false;
  // Constant-time-ish compare to avoid trivial timing leaks.
  const ub = Buffer.from(user);
  const pb = Buffer.from(pass);
  const tb = Buffer.from(u);
  const xb = Buffer.from(p);
  if (ub.length !== tb.length || pb.length !== xb.length) return false;
  return timingSafeEqual(ub, tb) && timingSafeEqual(pb, xb);
}

export function issueToken(username: string): string {
  const payload = `${username}|${Date.now()}`;
  const sig = createHmac("sha256", secret()).update(payload).digest();
  return `${b64url(payload)}.${b64url(sig)}`;
}

/** Returns username if the token is valid and unexpired, else null. */
export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const payloadB64 = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);
  let payload: Buffer;
  let sig: Buffer;
  try {
    payload = fromB64url(payloadB64);
    sig = fromB64url(sigB64);
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret()).update(payload).digest();
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(sig, expected)) return null;
  const text = payload.toString("utf8");
  const sep = text.indexOf("|");
  if (sep === -1) return null;
  const user = text.slice(0, sep);
  const iat = Number(text.slice(sep + 1));
  if (!Number.isFinite(iat) || Date.now() - iat > SESSION_TTL_MS) return null;
  return user;
}

export async function getSessionUser(): Promise<string | null> {
  const c = await cookies();
  return verifyToken(c.get(COOKIE_NAME)?.value ?? null);
}
