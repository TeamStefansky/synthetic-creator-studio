// scripts/ig-token.ts - OPERATOR-RUN helper (NOT part of the app runtime or the
// build). Turns a short-lived Facebook user token into the two values the
// Instagram Business Discovery adapter needs:
//
//     IG_USER_ID        - your linked IG Business/Creator account id
//     META_GRAPH_TOKEN  - a long-lived Page access token (effectively non-expiring
//                         while permissions/password are unchanged)
//
// It only reads official Graph endpoints and prints the result to your terminal.
// It NEVER writes a token to disk and NEVER commits anything (rules 5, 7 & 8:
// official APIs, no faked capability, secrets stay out of the repo). The token is
// MASKED by default; pass --reveal to print the full value when you are ready to
// paste it into Vercel.
//
// Prerequisites (see the setup guide): your IG account is Business/Creator and
// linked to a Facebook Page; you generated a short-lived User token in the Graph
// API Explorer with: instagram_basic, pages_show_list, pages_read_engagement,
// business_management.
//
// Usage (env vars keep secrets out of your shell history):
//   FB_APP_ID=... FB_APP_SECRET=... FB_SHORT_TOKEN=... npx tsx scripts/ig-token.ts
//   add --reveal to print the full Page token (otherwise it is masked)
//
// Or with flags:
//   npx tsx scripts/ig-token.ts --app-id 123 --app-secret abc --token EAAB... --reveal

const GRAPH_VERSION = (process.env.META_GRAPH_VERSION || "v22.0").trim();
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

interface Page { id: string; name?: string; access_token?: string }
interface IgLink { id: string; username?: string }

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const REVEAL = process.argv.includes("--reveal");

const APP_ID = process.env.FB_APP_ID || arg("--app-id");
const APP_SECRET = process.env.FB_APP_SECRET || arg("--app-secret");
const SHORT_TOKEN = process.env.FB_SHORT_TOKEN || arg("--token");

function mask(tok: string): string {
  if (REVEAL) return tok;
  if (tok.length <= 12) return "*".repeat(tok.length);
  return `${tok.slice(0, 6)}...${tok.slice(-4)}  (masked - re-run with --reveal to show)`;
}

async function graph<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok || body?.error) {
    const e = body?.error || {};
    throw new Error(`Graph error${e.code != null ? ` [${e.code}]` : ""}: ${e.message || res.status}`);
  }
  return body as T;
}

function fail(msg: string): never {
  console.error(`\n  x  ${msg}\n`);
  process.exit(1);
}

async function main() {
  if (!APP_ID || !APP_SECRET || !SHORT_TOKEN) {
    fail(
      "Missing input. Provide FB_APP_ID, FB_APP_SECRET, FB_SHORT_TOKEN (env or flags).\n" +
      "     App ID/Secret: developers.facebook.com -> your app -> Settings -> Basic\n" +
      "     Short token:   developers.facebook.com/tools/explorer (Get User Access Token)",
    );
  }

  // 1) Short-lived user token -> long-lived (~60 day) user token.
  console.log("\n  1/3  Exchanging for a long-lived user token...");
  const exch = await graph<{ access_token: string }>(
    `${BASE}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(APP_ID)}` +
    `&client_secret=${encodeURIComponent(APP_SECRET)}` +
    `&fb_exchange_token=${encodeURIComponent(SHORT_TOKEN)}`,
  ).catch((e) => fail(String(e.message || e)));
  const longUserToken = exch.access_token;
  if (!longUserToken) fail("No long-lived token returned (check the App ID/Secret and that the short token is still valid).");

  // 2) List the Pages this user manages, each with its long-lived Page token.
  console.log("  2/3  Fetching your Pages and their long-lived Page tokens...");
  const pages: Page[] = [];
  let next: string | null =
    `${BASE}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(longUserToken)}`;
  for (let guard = 0; next && guard < 10; guard++) {
    const page: { data?: Page[]; paging?: { next?: string } } = await graph(next);
    if (Array.isArray(page.data)) pages.push(...page.data);
    next = page.paging?.next || null;
  }
  if (!pages.length) {
    fail("No Pages found for this user. Business Discovery needs an IG Business/Creator account linked to a Facebook Page you manage.");
  }

  // 3) For each Page, resolve the linked IG Business/Creator account id.
  console.log("  3/3  Resolving the linked Instagram Business/Creator account...\n");
  let found = 0;
  for (const p of pages) {
    let ig: IgLink | undefined;
    try {
      const r = await graph<{ instagram_business_account?: IgLink }>(
        `${BASE}/${p.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(p.access_token || longUserToken)}`,
      );
      ig = r.instagram_business_account;
    } catch { /* a Page with no IG link - skip quietly */ }

    if (!ig?.id || !p.access_token) continue;
    found++;
    console.log(`  Page: ${p.name || "(unnamed)"}  (${p.id})`);
    console.log(`    IG_USER_ID        = ${ig.id}${ig.username ? `   (@${ig.username})` : ""}`);
    console.log(`    META_GRAPH_TOKEN  = ${mask(p.access_token)}`);
    console.log("");
  }

  if (!found) {
    fail(
      "Found Page(s) but none has a linked Instagram Business/Creator account.\n" +
      "     Link your IG account to a Page (Instagram app -> Settings -> Account type and tools),\n" +
      "     then re-run. Personal/private IG accounts are not supported by the API.",
    );
  }

  console.log("  ------------------------------------------------------------------");
  console.log("  Put these in Vercel -> Settings -> Environment Variables, then Redeploy:");
  console.log("");
  console.log("    PLATFORM_PROVIDER = official");
  console.log("    IG_USER_ID        = <from above>");
  console.log("    META_GRAPH_TOKEN  = <from above>");
  console.log("");
  console.log("  SECRET: META_GRAPH_TOKEN is a credential. Do not commit it, paste it");
  console.log("  into chats/screenshots, or store it anywhere but Vercel env vars.");
  if (!REVEAL) console.log("  (Re-run with --reveal to print the full token when you are ready to copy it.)");
  console.log("");
}

main().catch((e) => fail(String(e?.message || e)));
