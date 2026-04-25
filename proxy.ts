// Edge proxy (Next.js 16; previously "middleware"): gates protected routes
// behind a valid session cookie.
//
// Public routes: /, /login, /api/auth/*, _next/*, favicon, og.
// Everything else (including /run/*, /channels, /api/run/*, /api/zernio/*)
// requires a valid `brandora_session` cookie.
//
// Cookie verification mirrors lib/auth.ts but uses Web Crypto so it runs in
// the Edge runtime. The cookie format is `<base64url(payload)>.<base64url(hmacSha256(payload))>`
// where payload is `<username>|<issuedAtMs>`.

import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "brandora_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/_next/",
  "/favicon",
  "/og",
];

function isPublic(path: string): boolean {
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

function fromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const std = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(std);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function constEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

async function verifyToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const secret = process.env.BRANDORA_SESSION_SECRET;
  if (!secret) return null;

  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const payloadB64 = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);

  let payload: Uint8Array;
  let sig: Uint8Array;
  try {
    payload = fromB64url(payloadB64);
    sig = fromB64url(sigB64);
  } catch {
    return null;
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedBuf = await crypto.subtle.sign("HMAC", key, payload as BufferSource);
  const expected = new Uint8Array(expectedBuf);
  if (!constEq(sig, expected)) return null;

  const text = new TextDecoder().decode(payload);
  const sep = text.indexOf("|");
  if (sep === -1) return null;
  const user = text.slice(0, sep);
  const iat = Number(text.slice(sep + 1));
  if (!Number.isFinite(iat) || Date.now() - iat > SESSION_TTL_MS) return null;
  return user;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const user = await verifyToken(token);
  if (user) return NextResponse.next();

  // API routes get 401 JSON; pages redirect to /login with ?next=.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
  return NextResponse.redirect(url);
}

export const config = {
  // Apply to everything except static assets handled at the edge.
  matcher: ["/((?!_next/static|_next/image|favicon|og).*)"],
};
