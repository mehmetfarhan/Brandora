// POST /api/auth/login — validate credentials, set httpOnly session cookie.

import { NextResponse } from "next/server";
import { z } from "zod";
import { COOKIE_NAME, SESSION_TTL_MS, checkCredentials, issueToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { username, password } = parsed.data;

  if (!checkCredentials(username, password)) {
    // Same response on user-not-found vs bad-password to avoid enumeration.
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = issueToken(username);
  const res = NextResponse.json({ ok: true, user: username });
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
