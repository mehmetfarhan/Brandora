// POST /api/zernio/publish — publish one content item to one Zernio account.
//
// Body:
//   {
//     runId: string,       // run we're publishing from
//     itemId: string,      // calendar/content item id
//     accountId?: string,  // optional override; defaults to first matching account
//     publishNow?: boolean // default true; false uses scheduledFor=item.date
//   }
//
// We re-read the run state.json on the server and pull the matching content
// item; the client never sends the draft text, so a stale tab can't post old
// content.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  channelToZernioPlatform,
  createPost,
  listAccounts,
  pickAccount,
  ZernioError,
} from "@/lib/zernio";
import { getRun } from "@/lib/runs";
import type { ContentItem, ContentOutput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  runId: z.string().min(1),
  itemId: z.string().min(1),
  accountId: z.string().optional(),
  publishNow: z.boolean().optional(),
  profileId: z.string().optional(),
});

export async function POST(req: Request) {
  if (!process.env.ZERNIO_API_KEY) {
    return NextResponse.json(
      { error: "ZERNIO_API_KEY is not configured. Add it to .env.local." },
      { status: 503 },
    );
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { runId, itemId, profileId } = parsed.data;
  const publishNow = parsed.data.publishNow ?? true;

  const run = getRun(runId);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  const content = run.stages.content?.output as ContentOutput | undefined;
  const item: ContentItem | undefined = content?.items.find((i) => i.id === itemId);
  if (!item) {
    return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  }

  const platform = channelToZernioPlatform(item.channel);
  if (!platform) {
    return NextResponse.json(
      { error: `Channel "${item.channel}" cannot be auto-published (no Zernio platform mapping).` },
      { status: 400 },
    );
  }

  // Resolve an accountId if the caller didn't pin one.
  let accountId = parsed.data.accountId;
  if (!accountId) {
    try {
      const accounts = await listAccounts(profileId);
      const acct = pickAccount(accounts, platform);
      if (!acct) {
        return NextResponse.json(
          {
            error: `No connected ${platform} account found in your Zernio profile. Connect one at https://zernio.com/dashboard then retry.`,
          },
          { status: 400 },
        );
      }
      accountId = acct._id;
    } catch (e) {
      if (e instanceof ZernioError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  }

  // Compose the post. Use the lint-clean `final` text. For X threads, Zernio
  // takes the whole content and threads naturally — we just send the joined text.
  const body = {
    content: item.final,
    publishNow,
    scheduledFor: publishNow ? undefined : (item.date ? `${item.date}T09:00:00Z` : undefined),
    platforms: [{ platform, accountId }],
    profileId,
    title: item.hook,
    hashtags: extractHashtags(item.final),
    visibility: "public" as const,
  };

  try {
    const post = await createPost(body);
    return NextResponse.json({ ok: true, postId: post._id, post });
  } catch (e) {
    if (e instanceof ZernioError) {
      return NextResponse.json({ error: e.message, body: e.body }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/#([A-Za-z0-9_]+)/g)) out.add(m[1]);
  return [...out].slice(0, 10);
}
