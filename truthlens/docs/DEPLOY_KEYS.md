# Deployment keys - checklist

The live, always-accurate view is the in-app **Connections** page (`/status`) and
`GET /api/status` - they read this deployment's real environment. This file is a
human checklist. Add vars in Vercel → Project → Settings → Environment Variables
(scope Production + Preview), then Redeploy.

## Connected in production (as of this session)

- `ANTHROPIC_API_KEY` — sentiment + narrative clustering (SIGNAL analysis) ✅
- `GUARDIAN_API_KEY` — Guardian news ✅
- `NYT_API_KEY` — New York Times ✅
- `X_BEARER_TOKEN` — X/Twitter mentions ✅
- `GOOGLE_FACTCHECK_KEY` — fact-check reputation layer ✅
- `SIGHTENGINE_API_USER` + `SIGHTENGINE_API_SECRET` — AI-image detection ✅
- `META_GRAPH_TOKEN` + `IG_USER_ID` + `PLATFORM_PROVIDER` — Instagram business discovery
  (keys set; live once Meta App Review is approved) ✅
- `NARRATIVE_API_URL` — external narrative-intel platform ✅

Plus everything keyless, always on: GDELT (+ tone), Bluesky, Hacker News, Reddit,
Wikipedia pageviews, UCDP, ReliefWeb, USGS, NASA EONET, Polymarket, Metaculus,
World Bank, IMF, RDAP/DNS/SSL/IP, Wayback, crt.sh, OTX, HackerTarget.

## Not connected yet — recommended next (high value, free)

- `YOUTUBE_API_KEY` — adds the **video** signal type to SIGNAL — console.cloud.google.com (YouTube Data API v3)
- `NEWSDATA_API_KEY` — global news breadth + source country — newsdata.io
- `MEDIASTACK_API_KEY` — extra global news wire — mediastack.com
- `GNEWS_API_KEY` — Google-News-based feed — gnews.io
- `NEWSAPI_KEY` — NewsAPI.org dev tier — newsapi.org
- `RSS_FEEDS` — comma-separated feed URLs (incl. Israeli/Arabic outlets) — your choice
- `ACLED_KEY` + `ACLED_EMAIL` — political-violence events in Geopolitics — acleddata.com / myACLED

## Not connected yet — persistence (recommended for the Monitor)

- **KV store** — without it, cache + Monitor history/anomaly do not persist across requests.
  Add the **Vercel KV** integration (injects `KV_REST_API_URL` + `KV_REST_API_TOKEN`),
  or Upstash (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`).

## Not connected yet — optional enrichment / alerts

- `IPINFO_TOKEN` — higher IP/ASN accuracy — ipinfo.io
- `OPENPAGERANK_KEY` — domain-authority signal — domcop.com/openpagerank
- `SECURITYTRAILS_API_KEY` — extra historical DNS (OTX/HackerTarget already work keyless) — securitytrails.com
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALERT_CHAT_ID` — Telegram escalation alerts — @BotFather
- `ALERT_WEBHOOK_URL` — Slack/webhook alerts — Slack incoming webhook
- `CRON_SECRET` — protect the scheduled `/api/monitor` endpoint

## Minimum for a fully "live" SIGNAL demo
Already met (Anthropic connected). Adding `YOUTUBE_API_KEY` + `NEWSDATA_API_KEY`
broadens coverage; adding the KV store makes trends/anomalies persist between scans.
