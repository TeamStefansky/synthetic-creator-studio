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

## ✅ Already wired — just add a key

| Source | Env var(s) | Cost | Get the key |
|---|---|---|---|
| **GDELT** (global news/web) | *(none — always on)* | Free | https://www.gdeltproject.org |
| **X / Twitter** | `X_BEARER_TOKEN` | Free tier can't search; **Basic ~$100/mo**, Pro higher | https://developer.x.com → Projects & Apps → Keys → *Bearer Token* |
| **NewsAPI.org** | `NEWSAPI_KEY` | Free (100 req/day, dev only); paid for production | https://newsapi.org/register |
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

## 🔧 Additional sources I can add a connector for

### Social networks

| Source | Cost | Notes | Sign up |
|---|---|---|---|
| **Bluesky (AT Protocol)** | **Free** | Public search, no paid tier. Best free social source. | App password: https://bsky.app → Settings → App Passwords · docs https://docs.bsky.app |
| **Reddit** | **Free** (rate-limited) | OAuth client id/secret; good for subreddit + keyword monitoring | https://www.reddit.com/prefs/apps · docs https://www.reddit.com/dev/api |
| **Mastodon** | **Free** | Per-instance public timeline/search API | e.g. https://mastodon.social/settings/applications · docs https://docs.joinmastodon.org |
| **YouTube Data API v3** | Free quota (10k units/day) | Search videos/comments by keyword | https://console.cloud.google.com → enable *YouTube Data API v3* · docs https://developers.google.com/youtube/v3 |
| **TikTok Research API** | Free but **vetted/application-only** | Restricted to approved researchers | https://developers.tiktok.com/products/research-api/ |
| **Meta Content Library** (FB/Instagram) | **Restricted** (researchers) | CrowdTangle replacement; heavy approval | https://developers.facebook.com/products/content-library-and-api/ |

### News & web

| Source | Cost | Notes | Sign up |
|---|---|---|---|
| **The Guardian** | **Free** | Full-article API, generous free tier | https://open-platform.theguardian.com/access/ |
| **New York Times** | **Free** | Article search API | https://developer.nytimes.com |
| **GNews** | Free (100 req/day) | Simple news search | https://gnews.io |
| **NewsData.io** | Free tier | Multilingual news + archive | https://newsdata.io |
| **Mediastack** | Free tier | Live news feed | https://mediastack.com |
| **Brave Search API** | Free tier | Web + news search | https://brave.com/search/api/ |
| **Event Registry / NewsAPI.ai** | Paid | Rich entity/event tagging | https://eventregistry.org |
| **SerpAPI** | Paid | Google News/results scraping | https://serpapi.com |

---

## Recommended order (best value first)

1. **GDELT** — already on, free. ✅
2. **Bluesky** + **Reddit** — free, real social signal → high value. 🔧 (ask to build)
3. **The Guardian** + **NYT** + **GNews** — free, real news. 🔧
4. **NewsAPI** — add `NEWSAPI_KEY` (free dev tier). ✅
5. **X/Twitter** — add `X_BEARER_TOKEN` once you buy Basic ($100/mo). ✅
6. **YouTube** — free quota. 🔧
7. **Telegram (MTProto)** — real, free, but setup-heavy. 🔧

To add any 🔧 source: say which one(s), and a connector gets written; then it
becomes "add the key" like the ✅ rows above.
