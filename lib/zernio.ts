// Zernio publishing API client.
// Server-side only — uses ZERNIO_API_KEY from .env.local. Never exposed to the
// client; the browser calls our /api/zernio/* routes which call Zernio.

const BASE = "https://zernio.com/api/v1";

export interface ZernioProfile {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  isDefault?: boolean;
}

export interface ZernioAccount {
  _id: string;
  platform: string; // twitter, instagram, facebook, whatsapp, telegram, linkedin, ...
  // Zernio returns this either as a string id or as a populated `{_id,name}` object.
  profileId: string | { _id: string; name?: string };
  username?: string;
  displayName?: string;
  enabled?: boolean;
  isActive?: boolean;
}

export interface ZernioPlatformPost {
  platform: string;
  accountId: string;
  customContent?: string;
}

export interface ZernioPostBody {
  content: string;
  publishNow?: boolean;
  scheduledFor?: string; // ISO 8601
  isDraft?: boolean;
  timezone?: string;
  platforms: ZernioPlatformPost[];
  profileId?: string;
  title?: string;
  tags?: string[];
  hashtags?: string[];
  visibility?: "public" | "unlisted" | "private";
}

export interface ZernioPost {
  _id: string;
  status: string;
  scheduledFor?: string;
  platforms: { platform: string; accountId: string; status: string; postUrl?: string }[];
}

export class ZernioError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function key(): string {
  const k = process.env.ZERNIO_API_KEY;
  if (!k) throw new Error("ZERNIO_API_KEY is not set in .env.local");
  return k;
}

async function fetchZ<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* keep raw text */
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Zernio ${res.status}`;
    throw new ZernioError(res.status, body, msg);
  }
  return body as T;
}

export async function listProfiles(): Promise<ZernioProfile[]> {
  const r = await fetchZ<{ profiles: ZernioProfile[] }>("/profiles");
  return r.profiles ?? [];
}

export async function listAccounts(profileId?: string): Promise<ZernioAccount[]> {
  const q = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
  const r = await fetchZ<{ accounts: ZernioAccount[] }>(`/accounts${q}`);
  return r.accounts ?? [];
}

export async function createPost(body: ZernioPostBody): Promise<ZernioPost> {
  return fetchZ<ZernioPost>("/posts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface ZernioPostSummary {
  _id: string;
  title?: string;
  content?: string;
  status: string;
  scheduledFor?: string;
  createdAt?: string;
  platforms?: { platform: string; status: string; postUrl?: string }[];
}

export async function listPosts(opts?: { limit?: number }): Promise<ZernioPostSummary[]> {
  const limit = opts?.limit ?? 20;
  const r = await fetchZ<{ posts: ZernioPostSummary[] }>(`/posts?page=1&limit=${limit}`);
  return r.posts ?? [];
}

/**
 * Map a content-stage channel name to one or more Zernio platform identifiers.
 * Our content stage produces one draft per channel; this picks the right
 * Zernio platform string for that draft. Returns null when there's no mapping
 * (e.g. blog/email aren't social platforms).
 */
export function channelToZernioPlatform(channel: string): string | null {
  switch (channel.toLowerCase()) {
    case "linkedin":
      return "linkedin";
    case "x":
    case "twitter":
      return "twitter";
    case "instagram":
      return "instagram";
    case "facebook":
    case "facebook page":
      return "facebook";
    case "whatsapp":
      return "whatsapp";
    case "telegram":
      return "telegram";
    case "threads":
      return "threads";
    case "bluesky":
      return "bluesky";
    case "tiktok":
      return "tiktok";
    case "youtube":
      return "youtube";
    case "pinterest":
      return "pinterest";
    case "reddit":
      return "reddit";
    case "discord":
      return "discord";
    default:
      return null;
  }
}

/** Best-effort match: pick the first connected, enabled account for a given platform. */
export function pickAccount(accounts: ZernioAccount[], platform: string): ZernioAccount | null {
  return (
    accounts.find(
      (a) => a.platform === platform && a.enabled !== false && a.isActive !== false,
    ) ?? null
  );
}
