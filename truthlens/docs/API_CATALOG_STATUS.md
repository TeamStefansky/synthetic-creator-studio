# API catalog - integration status

Status of every API from the operator's geopolitics + brand-monitoring catalog
against TruthLens rules (official endpoints only; no scraping/wrapper APIs; a
missing key renders "source not connected", never faked).

## Connected now (keyless - live in every deployment)

| API | Where | Notes |
|---|---|---|
| GDELT DOC 2.0 (articles) | `lib/narrative/sources.ts` (`gdelt`) | News mentions + source country |
| GDELT tone (timelinetone) | `lib/signal-context.ts` | Real news-tone series for the SIGNAL trend panel |
| Wikipedia Pageviews | `lib/signal-context.ts` | Public-attention series (leading indicator) |
| Bluesky public AppView | `sources.ts` (`bluesky`) | Social mentions + account creation dates |
| Hacker News (Algolia) | `sources.ts` (`hackernews`) | Tech-community mentions |
| Reddit public search | `sources.ts` (`reddit`) | Best-effort keyless; may throttle server IPs |

## Connected - needs a free/cheap key (set the env var, done)

| API | Env var | Where |
|---|---|---|
| YouTube Data API v3 | `YOUTUBE_API_KEY` | `sources.ts` (`youtube`) - the "video" signal type |
| NewsData.io | `NEWSDATA_API_KEY` | `sources.ts` (`newsdata`) |
| Mediastack | `MEDIASTACK_API_KEY` | `sources.ts` (`mediastack`) |
| Guardian / NYT / GNews / NewsAPI.org | `GUARDIAN_API_KEY` etc. | already integrated |
| X (Twitter) API v2 | `X_BEARER_TOKEN` | already integrated (Basic tier+ for search) |
| Anthropic Claude | `ANTHROPIC_API_KEY` | server-side sentiment + narrative clustering |
| RSS (incl. Israeli/Arabic outlets) | `RSS_FEEDS` | already integrated; self-controlled feed list |

## Geopolitics situational layer - CONNECTED (`/tools/geopolitics`, `lib/geopolitics.ts`)

| API | Env var | Notes |
|---|---|---|
| UCDP GED | keyless | Academically-validated conflict events |
| ReliefWeb (UN OCHA) | keyless | Humanitarian crisis reports by country |
| USGS Earthquakes | keyless | Significant earthquakes, last 30 days |
| NASA EONET | keyless | Open natural-event tracking (fires, storms, volcanoes) |
| Polymarket (Gamma) | keyless | Real-money probabilities on geopolitical markets |
| Metaculus | keyless | Community forecast probabilities |
| ACLED | `ACLED_KEY` + `ACLED_EMAIL` | Political-violence events (free myACLED registration) |

## Cataloged - not yet integrated (lawful, future work)

| API | Why deferred |
|---|---|
| HDX (Humanitarian Data Exchange) | Bulk dataset catalog (CKAN); belongs in a data-import flow, not a live feed |
| World Bank / IMF | Macro-context per country; belongs in a country-profile panel |
| OpenSanctions | Fits the platform's registry/reference layer (`lib/io-reference`), commercial license needed for production use |
| Kalshi | Regulated forecast market; Polymarket + Metaculus already cover the forecast panel |
| Google Places / Trustpilot | Review monitoring; needs operator's own business profile |
| TikTok Research API | Application/approval process required (academic) |
| Telegram | Public-channel monitoring requires self-hosted MTProto development; Bot API cannot search public channels |

## Declined (violates project rules)

| API | Rule |
|---|---|
| SerpApi / DataForSEO / Serper.dev | Unofficial SERP scraping wrappers - "official endpoints only" (CLAUDE.md data-sources rule); Google offers no official SERP API |
| Brand24 / Mention / Awario | Third-party listening built partly on scraping; TruthLens collects from official sources directly so provenance stays auditable |

Notes:
- "Sentiment analysis" from the catalog is implemented server-side in
  `lib/signal-sentiment.ts` (per-mention labels over collected data; the score
  is computed, never model-given). heBERT/self-hosted can replace it later
  behind the same interface.
- Anomaly detection / forecasting (z-score, Prophet) from the catalog's
  architecture section remains future work on the Monitor's stored series.
