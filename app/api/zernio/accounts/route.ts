// GET /api/zernio/accounts — list connected Zernio social accounts.
// Optional `?profileId=...` to filter by profile.

import { NextRequest, NextResponse } from "next/server";
import { listAccounts, listProfiles, ZernioError } from "@/lib/zernio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!process.env.ZERNIO_API_KEY) {
    return NextResponse.json(
      { error: "ZERNIO_API_KEY is not configured. Add it to .env.local." },
      { status: 503 },
    );
  }
  const profileId = req.nextUrl.searchParams.get("profileId") ?? undefined;
  try {
    const [profiles, accounts] = await Promise.all([listProfiles(), listAccounts(profileId)]);
    return NextResponse.json({ profiles, accounts });
  } catch (e) {
    if (e instanceof ZernioError) {
      return NextResponse.json({ error: e.message, body: e.body }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
