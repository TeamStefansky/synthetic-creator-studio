# Data sources & API connections

How to expand monitoring in narrative-intel. Two kinds of source:

- **✅ Wired** — a connector already exists. Add the API key as an environment
  variable on the Render service and the connector switches from mock/off to
  live automatically. No code change.
- **🔧 Needs a connector** — the source is supported by an API, but a connector
  must be written first (small, well-scoped task). Ask and it gets built, then
  it becomes a "just add a key" source.

> Prices/tiers below are approximate and change often — always confirm on the
> provider's page. "Free" usually means a rate-limited developer tier.

---

## How to add ANY key (the universal step)

Every wired source is enabled the same way:

1. Render dashboard → service **`narrative-intel`** → left menu **Environment**.
2. **Add Environment Variable** → enter the **Key** and **Value** from the tables below.
3. **Save Changes** → Render redeploys (~2 min). The connector is now live.
4. In the dashboard (Intelligence tab) type keywords → **Detect**.

To require nothing, GDELT already runs for free.

---

## ✅ Free & keyless — already live, nothing to do

These run with **no signup and no key** (real keyword search):

| Source | What it covers |
|---|---|
| **GDELT** | global online news/web |
| **Bluesky** | live social network (public search) |
| **Hacker News** | tech/news discussion (Algolia API) |
| **Reddit** | public post search (best-effort keyless; add OAuth for reliability) |
| **Mastodon** | an instance's public timeline, keyword-filtered (default `mastodon.social`, set `MASTODON_INSTANCE`) |

Reddit is more reliable with a free OAuth app — set `REDDIT_CLIENT_ID` +
`REDDIT_CLIENT_SECRET` (create an app at https://www.reddit.com/prefs/apps).

## ✅ Wired — add a (mostly free) key to activate

All of these have a connector already; drop the key into Render and they go live.

| Source | Env var(s) | Cost | Get the key |
|---|---|---|---|
| **The Guardian** | `GUARDIAN_API_KEY` | Free | https://open-platform.theguardian.com/access/ |
| **New York Times** | `NYT_API_KEY` | Free | https://developer.nytimes.com |
| **GNews** | `GNEWS_API_KEY` | Free (100/day) | https://gnews.io |
| **NewsData.io** | `NEWSDATA_API_KEY` | Free tier | https://newsdata.io |
| **Mediastack** | `MEDIASTACK_API_KEY` | Free tier | https://mediastack.com |
| **Brave Search** | `BRAVE_API_KEY` | Free tier | https://brave.com/search/api/ |
| **YouTube** | `YOUTUBE_API_KEY` | Free quota (10k units/day) | https://console.cloud.google.com → enable *YouTube Data API v3* |
| **NewsAPI.org** | `NEWSAPI_KEY` | Free (100 req/day, dev) | https://newsapi.org/register |
| **X / Twitter** | `X_BEARER_TOKEN` | Free tier can't search; **Basic ~$100/mo** | https://developer.x.com → Projects & Apps → Keys → *Bearer Token* |
| **RSS** (any feed) | `RSS_FEEDS` (comma-separated URLs) | Free | Copy feed URLs from any news site (e.g. `https://feeds.bbci.co.uk/news/rss.xml`) |

**X/Twitter tiers (important):** the **Free** tier does **not** allow searching
tweets — you need at least **Basic (~$100/month)** for `search/recent`. Sign up,
create a Project + App, and copy the **Bearer Token** into `X_BEARER_TOKEN`.

---

## 🔧 Telegram (special case)

- **Bot API** (`TELEGRAM_BOT_TOKEN` via https://t.me/BotFather) — free, but a bot
  **cannot search public channels**; it only sees messages sent to it. Not enough
  for monitoring.
- **MTProto / user session** (Telethon) — free, real. Needs `api_id` + `api_hash`
  from https://my.telegram.org, a phone-number login, and the session must
  **join** each channel you want to read. This is the real path and needs a
  connector + credentials configured. Ask to have it built.

---

## 🔧 Not built yet (ask and a connector gets written)

| Source | Cost | Notes | Sign up |
|---|---|---|---|
| **Telegram (MTProto)** | Free | Real channel reads; needs `api_id`/`api_hash` + phone login + joining channels | https://my.telegram.org |
| **TikTok Research API** | Free but **vetted/application-only** | Restricted to approved researchers | https://developers.tiktok.com/products/research-api/ |
| **Meta Content Library** (FB/IG) | **Restricted** (researchers) | CrowdTangle replacement; heavy approval | https://developers.facebook.com/products/content-library-and-api/ |
| **Event Registry / NewsAPI.ai** | Paid | Rich entity/event tagging | https://eventregistry.org |
| **SerpAPI** | Paid | Google News/results scraping | https://serpapi.com |

---

## Recommended order (best value first)

1. **GDELT + Bluesky + Hacker News + Reddit + Mastodon** — already on, free, keyless. ✅
2. **The Guardian + NYT + GNews** — grab the free keys, add them. ✅
3. **NewsAPI** — add `NEWSAPI_KEY` (free dev tier). ✅
4. **YouTube** — free quota, add `YOUTUBE_API_KEY`. ✅
5. **X/Twitter** — add `X_BEARER_TOKEN` once you buy Basic ($100/mo). ✅
6. **Telegram (MTProto)** — real, free, but setup-heavy. 🔧 (ask to build)

To add any 🔧 source: say which one(s) and a connector gets written; then it
becomes "add the key" (or keyless) like the ✅ rows above.
