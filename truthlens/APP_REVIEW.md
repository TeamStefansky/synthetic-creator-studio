# Meta App Review - TruthLens

App ID: `1566011568209587` · Business ID: `140270513307944` · Live site: https://synthetic-creator-studio.vercel.app/

## Use case (one paragraph)

TruthLens is a defensive monitoring tool for brands and organizations targeted by fake news, impersonation, and coordinated inauthentic behavior. With Facebook Login, a customer connects the Facebook Pages and the linked Instagram professional account **they already manage**, and TruthLens reads them (Pages list, post engagement counts, Instagram profile) to establish a monitoring baseline - so anomalies such as engagement spikes, copycat profiles, and impersonation attempts can be surfaced as indicators with evidence. The app is **read-only**: it never publishes, posts, comments, messages, runs ads, or takes any action on the user's behalf, and it does not generate synthetic media or impersonate anyone. Tokens are exchanged and held server-side only.

## Permissions requested (exactly these, nothing more)

| Permission | Where a reviewer sees it used |
|---|---|
| `public_profile` | "Connected as {name}" header on **/tools/meta** |
| `pages_show_list` | "Managed Facebook Pages" panel on **/tools/meta** (reads `/me/accounts`) |
| `pages_read_engagement` | "Page posts & engagement" panel - recent posts with reaction / comment / share counts |
| `instagram_basic` | "Linked Instagram professional account" panel - username, id, profile picture, follower/media counts |

Each panel in the UI carries a visible tag naming the permission that powers it.

## Step-by-step tester path (for the screencast)

1. Open https://synthetic-creator-studio.vercel.app/login
2. Click **Continue with Facebook** (below the access-password field).
3. Meta's own OAuth dialog appears, requesting exactly: `public_profile`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`. Grant them (select at least one managed Page with a linked Instagram professional account).
4. You are redirected to **/tools/meta** ("Meta Assets"), which immediately shows:
   - the connected profile (public_profile),
   - the list of Pages you manage (pages_show_list),
   - recent posts of the selected Page with reactions / comments / shares counts (pages_read_engagement),
   - the linked Instagram professional account profile (instagram_basic).
5. Optional: click **Disconnect** to clear the server-held token.

Note for testing: the test user must manage at least one Facebook Page (ideally with a linked Instagram professional account) for panels 2-4 to have data; empty states are shown honestly otherwise.

## Valid OAuth Redirect URIs

Add BOTH in Meta App Dashboard → Facebook Login → Settings → Valid OAuth Redirect URIs:

```
https://synthetic-creator-studio.vercel.app/api/auth/facebook/callback
http://localhost:3000/api/auth/facebook/callback
```

## Configuration (environment variables only - no secrets in code)

```
FACEBOOK_APP_ID=1566011568209587
FACEBOOK_APP_SECRET=<from App Dashboard - set in Vercel env only>
FACEBOOK_REDIRECT_URI=            # optional; derived from the request origin when unset
```

## Data handling

- OAuth code → token exchange happens **server-side** with the app secret; the user token is stored in an httpOnly cookie and is never readable by client JavaScript. Page access tokens from `/me/accounts` are used server-side per request and are never included in any API response.
- Graph calls are **read-only** (`/me`, `/me/accounts`, `/{page-id}/posts` with engagement summaries, `instagram_business_account` fields). There is no write endpoint anywhere in the app.
- No server-to-server or system-user calls are made; every Graph call uses the token of the logged-in user's session.
- Disconnect (in-app) deletes the token immediately. TruthLens presents indicators with evidence and confidence levels - never verdicts.
