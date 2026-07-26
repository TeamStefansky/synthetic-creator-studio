// Simple shared-password access gate. Opt-in: active ONLY when SITE_PASSWORD is set
// on the deployment (without it the app is open, so local dev / an unconfigured
// deploy is never locked out — an honest "not configured" state, never a fake gate).
// The cookie stores a SHA-256 token of the password (+ a fixed app salt), never the
// raw password. Uses Web Crypto so it works in both the Edge middleware and Node
// route handlers. This is a lightweight team gate, not per-user authentication.

export const AUTH_COOKIE = "tl_auth";
const SALT = "truthlens-gate:v1:";

// Owner-chosen default access password. Overridable per-deployment with
// SITE_PASSWORD (recommended for real secrecy — this default is visible in the
// repo). The gate is therefore always ON.
const DEFAULT_PASSWORD = "291986";

/** The active access password: SITE_PASSWORD if set, else the owner default. */
export function accessPassword(): string {
  return process.env.SITE_PASSWORD || DEFAULT_PASSWORD;
}

/** The gate is always enabled (there is always an access password). */
export function gateEnabled(): boolean {
  return true;
}

/** The opaque cookie token for a given password (hex SHA-256; never the password). */
export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The token the cookie must equal to be authenticated. */
export async function expectedToken(): Promise<string | null> {
  return authToken(accessPassword());
}
