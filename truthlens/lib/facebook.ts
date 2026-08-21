// Meta (Facebook) Login + Graph API - server-side only. Standard OAuth 2.0
// authorization-code flow: the browser is sent to Meta's own permission dialog,
// the callback exchanges the code for a user access token ON THE SERVER using
// FACEBOOK_APP_SECRET, and the token lives in an httpOnly cookie - it is never
// exposed to client JavaScript and never persisted anywhere else.
//
// Scope discipline: exactly the four review permissions and nothing more -
//   public_profile          → who connected (name + id)
//   pages_show_list         → the Pages the user manages (/me/accounts)
//   pages_read_engagement   → posts + reaction/comment/share counts of those Pages
//   instagram_basic         → the linked Instagram professional account profile
// Read/monitor only. No publish, ads, or messaging permission is ever requested,
// and no write endpoint is ever called.
//
// Configuration is env-only (never commit secrets):
//   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_REDIRECT_URI (optional - when
//   unset the redirect URI is derived from the request origin, so localhost and
//   the Vercel domain both work with one deployment).
// Unconfigured → the login route reports "not configured" honestly (rule 7).

export const FB_TOKEN_COOKIE = "tl_fb";
export const FB_STATE_COOKIE = "tl_fb_state";

/** Exactly the permissions under review - never widen this list. */
export const FB_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
] as const;

export function fbGraphVersion(): string {
  return process.env.META_GRAPH_VERSION || "v23.0";
}

export function fbAppId(): string {
  return (process.env.FACEBOOK_APP_ID || "").trim();
}

export function fbAppSecret(): string {
  return (process.env.FACEBOOK_APP_SECRET || "").trim();
}

/** Facebook Login is configured only when BOTH env vars are present. */
export function fbConfigured(): boolean {
  return Boolean(fbAppId() && fbAppSecret());
}

/**
 * The OAuth redirect URI. FACEBOOK_REDIRECT_URI wins when set; otherwise it is
 * derived from the request origin (`https://<host>/api/auth/facebook/callback`),
 * so the same code serves the Vercel domain and http://localhost:3000. Whatever
 * value ends up used MUST also be whitelisted in the Meta App Dashboard under
 * Facebook Login → Settings → Valid OAuth Redirect URIs.
 */
export function fbRedirectUri(requestOrigin: string): string {
  const fromEnv = (process.env.FACEBOOK_REDIRECT_URI || "").trim();
  return fromEnv || `${requestOrigin.replace(/\/$/, "")}/api/auth/facebook/callback`;
}

/** The Meta permission dialog URL (the real dialog - no shortcut around it). */
export function fbAuthorizeUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: fbAppId(),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: FB_SCOPES.join(","),
  });
  return `https://www.facebook.com/${fbGraphVersion()}/dialog/oauth?${p.toString()}`;
}

const GRAPH = () => `https://graph.facebook.com/${fbGraphVersion()}`;

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${GRAPH()}${path}?${qs.toString()}`, { cache: "no-store" });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const msg = json?.error?.message || `Graph API error (HTTP ${res.status})`;
    const err: any = new Error(msg);
    err.fbCode = json?.error?.code;
    throw err;
  }
  return json as T;
}

/** Server-side code → user access token exchange (uses the app secret). */
export async function fbExchangeCode(code: string, redirectUri: string): Promise<string> {
  const j = await graphGet<{ access_token: string }>("/oauth/access_token", {
    client_id: fbAppId(),
    client_secret: fbAppSecret(),
    redirect_uri: redirectUri,
    code,
  });
  if (!j.access_token) throw new Error("Meta did not return an access token.");
  // Upgrade to a long-lived token (~60 days) so a review session survives; on
  // failure the short-lived token still works for the immediate session.
  try {
    const l = await graphGet<{ access_token: string }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: fbAppId(),
      client_secret: fbAppSecret(),
      fb_exchange_token: j.access_token,
    });
    return l.access_token || j.access_token;
  } catch {
    return j.access_token;
  }
}

// ---- Graph reads (one per reviewed permission) -------------------------------

export type FbProfile = { id: string; name: string; picture?: string };

/** public_profile → who connected. */
export async function fbMe(token: string): Promise<FbProfile> {
  const j = await graphGet<any>("/me", { access_token: token, fields: "id,name,picture{url}" });
  return { id: j.id, name: j.name, picture: j.picture?.data?.url };
}

export type FbPage = {
  id: string;
  name: string;
  category?: string;
  link?: string;
  picture?: string;
  /** Page access token returned by /me/accounts - kept server-side only. */
  access_token?: string;
  instagram?: FbIgAccount | null;
};

export type FbIgAccount = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
};

/**
 * pages_show_list → the Pages the user manages, via /me/accounts.
 * instagram_basic → each Page's linked Instagram professional account (the
 * `instagram_business_account` field resolves only with that permission).
 */
export async function fbPages(token: string): Promise<FbPage[]> {
  const j = await graphGet<any>("/me/accounts", {
    access_token: token,
    fields:
      "id,name,category,link,picture{url},access_token," +
      "instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}",
    limit: "25",
  });
  return (j.data || []).map((p: any): FbPage => ({
    id: p.id,
    name: p.name,
    category: p.category,
    link: p.link,
    picture: p.picture?.data?.url,
    access_token: p.access_token,
    instagram: p.instagram_business_account
      ? {
          id: p.instagram_business_account.id,
          username: p.instagram_business_account.username,
          name: p.instagram_business_account.name,
          profile_picture_url: p.instagram_business_account.profile_picture_url,
          followers_count: p.instagram_business_account.followers_count,
          media_count: p.instagram_business_account.media_count,
        }
      : null,
  }));
}

export type FbPost = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  reactions: number;
  comments: number;
  shares: number;
};

/**
 * pages_read_engagement → recent posts of a managed Page with reaction /
 * comment / share counts. Reads with the Page token from /me/accounts.
 */
export async function fbPagePosts(pageId: string, pageToken: string): Promise<FbPost[]> {
  const j = await graphGet<any>(`/${pageId}/posts`, {
    access_token: pageToken,
    fields:
      "id,message,created_time,permalink_url,shares," +
      "reactions.summary(true).limit(0),comments.summary(true).limit(0)",
    limit: "10",
  });
  return (j.data || []).map((p: any): FbPost => ({
    id: p.id,
    message: p.message,
    created_time: p.created_time,
    permalink_url: p.permalink_url,
    reactions: p.reactions?.summary?.total_count ?? 0,
    comments: p.comments?.summary?.total_count ?? 0,
    shares: p.shares?.count ?? 0,
  }));
}
