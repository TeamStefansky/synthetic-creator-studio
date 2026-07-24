// Single source of truth for every external integration + how it's gated.
// Server-side only (reads process.env). The /status page renders this so the
// system itself reports what is connected vs. not - always accurate, never a
// stale doc. Keyless integrations are always "connected"; key-gated ones are
// connected only when every required env var is present (the same check each
// adapter uses at runtime, so status matches real behavior).
// Reads process.env - only import from server components / route handlers.

export type ConnCategory =
  | "Brand mentions"
  | "Analysis & signals"
  | "Geopolitics & forecast"
  | "Persistence"
  | "Social (authenticity)"
  | "OSINT enrichment"
  | "Nonprofit registries"
  | "Alerts";

export interface Integration {
  key: string;
  label: string;
  category: ConnCategory;
  /** Empty = keyless (always on). Otherwise ALL must be set to be connected. */
  envVars: string[];
  /** true = any ONE of envVars is enough (e.g. KV vs Upstash). */
  anyOf?: boolean;
  /** connected when ANY one of these groups has ALL its vars present (e.g. a
   *  URL+TOKEN pair). Use for creds that are only usable together. */
  pairs?: string[][];
  /** Where to obtain the key (shown in the not-connected checklist). */
  getUrl?: string;
  /** Link to the source / provider (docs or signup). Shown for every source. */
  href?: string;
  note?: string;
}

export const INTEGRATIONS: Integration[] = [
  // --- Brand mentions ---
  { key: "gdelt", label: "GDELT (global news)", category: "Brand mentions", envVars: [], href: "https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/" },
  { key: "bluesky", label: "Bluesky", category: "Brand mentions", envVars: [], href: "https://docs.bsky.app/" },
  { key: "hackernews", label: "Hacker News", category: "Brand mentions", envVars: [], href: "https://hn.algolia.com/api" },
  { key: "reddit", label: "Reddit", category: "Brand mentions", envVars: [], href: "https://www.reddit.com/dev/api" },
  { key: "guardian", label: "The Guardian", category: "Brand mentions", envVars: ["GUARDIAN_API_KEY"], getUrl: "open-platform.theguardian.com", href: "https://open-platform.theguardian.com/access/" },
  { key: "nyt", label: "New York Times", category: "Brand mentions", envVars: ["NYT_API_KEY"], getUrl: "developer.nytimes.com", href: "https://developer.nytimes.com/" },
  { key: "gnews", label: "GNews", category: "Brand mentions", envVars: ["GNEWS_API_KEY"], getUrl: "gnews.io", href: "https://gnews.io/" },
  { key: "newsapi", label: "NewsAPI.org", category: "Brand mentions", envVars: ["NEWSAPI_KEY"], getUrl: "newsapi.org", href: "https://newsapi.org/" },
  { key: "newsdata", label: "NewsData.io", category: "Brand mentions", envVars: ["NEWSDATA_API_KEY"], getUrl: "newsdata.io", href: "https://newsdata.io/" },
  { key: "mediastack", label: "Mediastack", category: "Brand mentions", envVars: ["MEDIASTACK_API_KEY"], getUrl: "mediastack.com", href: "https://mediastack.com/" },
  { key: "youtube", label: "YouTube (video)", category: "Brand mentions", envVars: ["YOUTUBE_API_KEY"], getUrl: "console.cloud.google.com (YouTube Data API v3)", href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" },
  { key: "x", label: "X / Twitter", category: "Brand mentions", envVars: ["X_BEARER_TOKEN"], getUrl: "developer.x.com (Basic tier+ for search)", href: "https://developer.x.com/en/portal/dashboard", note: "Paid" },
  { key: "rss", label: "RSS feeds", category: "Brand mentions", envVars: ["RSS_FEEDS"], getUrl: "your own comma-separated feed URLs" },

  // --- Analysis & signals ---
  { key: "anthropic", label: "Anthropic (sentiment + narratives)", category: "Analysis & signals", envVars: ["ANTHROPIC_API_KEY"], getUrl: "console.anthropic.com", href: "https://console.anthropic.com/settings/keys" },
  { key: "wikipedia", label: "Wikipedia pageviews (attention)", category: "Analysis & signals", envVars: [], href: "https://wikimedia.org/api/rest_v1/" },
  { key: "gdelt-tone", label: "GDELT tone (news sentiment trend)", category: "Analysis & signals", envVars: [], href: "https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/" },
  { key: "anomaly", label: "Anomaly detection (z-score)", category: "Analysis & signals", envVars: [] },

  // --- Geopolitics & forecast ---
  { key: "ucdp", label: "UCDP (conflict events)", category: "Geopolitics & forecast", envVars: [], href: "https://ucdp.uu.se/apidocs/" },
  { key: "reliefweb", label: "ReliefWeb (humanitarian)", category: "Geopolitics & forecast", envVars: [], href: "https://reliefweb.int/help/api" },
  { key: "usgs", label: "USGS (earthquakes)", category: "Geopolitics & forecast", envVars: [], href: "https://earthquake.usgs.gov/fdsnws/event/1/" },
  { key: "eonet", label: "NASA EONET (natural events)", category: "Geopolitics & forecast", envVars: [], href: "https://eonet.gsfc.nasa.gov/docs/v3" },
  { key: "polymarket", label: "Polymarket (market forecasts)", category: "Geopolitics & forecast", envVars: [], href: "https://docs.polymarket.com/" },
  { key: "metaculus", label: "Metaculus (community forecasts)", category: "Geopolitics & forecast", envVars: [], href: "https://www.metaculus.com/api2/" },
  { key: "worldbank", label: "World Bank (governance)", category: "Geopolitics & forecast", envVars: [], href: "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392" },
  { key: "imf", label: "IMF (GDP growth)", category: "Geopolitics & forecast", envVars: [], href: "https://www.imf.org/external/datamapper/api/help" },
  { key: "acled", label: "ACLED (political violence)", category: "Geopolitics & forecast", envVars: ["ACLED_KEY", "ACLED_EMAIL"], getUrl: "acleddata.com / myACLED", href: "https://acleddata.com/api-documentation/" },
  { key: "swpc", label: "NOAA SWPC (space weather)", category: "Geopolitics & forecast", envVars: [], href: "https://www.swpc.noaa.gov/products-and-data" },
  { key: "opensky", label: "OpenSky Network (aviation)", category: "Geopolitics & forecast", envVars: [], href: "https://openskynetwork.github.io/opensky-api/" },
  { key: "firms", label: "NASA FIRMS (active wildfires)", category: "Geopolitics & forecast", envVars: ["FIRMS_MAP_KEY"], getUrl: "firms.modaps.eosdis.nasa.gov/api/map_key", href: "https://firms.modaps.eosdis.nasa.gov/api/" },

  // --- Persistence ---
  { key: "kv", label: "KV store (cache + monitor history)", category: "Persistence", envVars: ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], pairs: [["KV_REST_API_URL", "KV_REST_API_TOKEN"], ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]], getUrl: "Vercel KV integration, or Upstash Redis (needs BOTH a REST URL and a REST TOKEN)", href: "https://vercel.com/docs/storage/vercel-kv" },

  // --- Social authenticity ---
  { key: "instagram", label: "Instagram (Meta Graph business discovery)", category: "Social (authenticity)", envVars: ["META_GRAPH_TOKEN", "IG_USER_ID"], getUrl: "developers.facebook.com (App Review pending)", href: "https://developers.facebook.com/docs/instagram-api/reference/ig-user/business_discovery" },

  // --- OSINT enrichment ---
  { key: "ipinfo", label: "IPinfo (IP/ASN accuracy)", category: "OSINT enrichment", envVars: ["IPINFO_TOKEN"], getUrl: "ipinfo.io", href: "https://ipinfo.io/signup" },
  { key: "openpagerank", label: "Open PageRank (domain authority)", category: "OSINT enrichment", envVars: ["OPENPAGERANK_KEY"], getUrl: "domcop.com/openpagerank", href: "https://www.domcop.com/openpagerank/" },
  { key: "factcheck", label: "Google Fact Check", category: "OSINT enrichment", envVars: ["GOOGLE_FACTCHECK_KEY"], getUrl: "developers.google.com/fact-check", href: "https://developers.google.com/fact-check/tools/api" },
  { key: "securitytrails", label: "SecurityTrails (historical DNS)", category: "OSINT enrichment", envVars: ["SECURITYTRAILS_API_KEY"], getUrl: "securitytrails.com", href: "https://securitytrails.com/corp/api" },

  // --- Nonprofit registries ---
  { key: "propublica", label: "ProPublica Nonprofit Explorer (US IRS 990)", category: "Nonprofit registries", envVars: [], href: "https://projects.propublica.org/nonprofits/api" },
  { key: "charity-commission", label: "UK Charity Commission", category: "Nonprofit registries", envVars: ["CHARITY_COMMISSION_KEY"], getUrl: "charitycommission.gov.uk API portal", href: "https://register-of-charities.charitycommission.gov.uk/register/api" },

  // --- Alerts ---
  { key: "telegram", label: "Telegram alerts", category: "Alerts", envVars: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALERT_CHAT_ID"], getUrl: "@BotFather", href: "https://core.telegram.org/bots#botfather" },
  { key: "webhook", label: "Slack/webhook alerts", category: "Alerts", envVars: ["ALERT_WEBHOOK_URL"], getUrl: "Slack incoming webhook", href: "https://api.slack.com/messaging/webhooks" },
];

export interface ConnStatus extends Integration {
  keyless: boolean;
  connected: boolean;
  missing: string[];
}

function present(name: string): boolean {
  return !!(process.env[name] && String(process.env[name]).trim());
}

export function connectionStatus(): ConnStatus[] {
  return INTEGRATIONS.map((i) => {
    const keyless = i.envVars.length === 0;
    let connected: boolean;
    let missing: string[] = [];
    if (keyless) {
      connected = true;
    } else if (i.pairs) {
      // connected only when at least one full group (e.g. URL+TOKEN) is present -
      // a lone URL or lone token is NOT usable and must not read as connected.
      connected = i.pairs.some((group) => group.every(present));
      missing = connected ? [] : (i.pairs.find((g) => g.some(present)) || i.pairs[0]).filter((v) => !present(v));
    } else if (i.anyOf) {
      connected = i.envVars.some(present);
      missing = connected ? [] : i.envVars;
    } else {
      missing = i.envVars.filter((v) => !present(v));
      connected = missing.length === 0;
    }
    return { ...i, keyless, connected, missing };
  });
}

export interface ConnSummary {
  total: number;
  connected: number;
  byCategory: { category: ConnCategory; items: ConnStatus[] }[];
}

const CATEGORY_ORDER: ConnCategory[] = [
  "Brand mentions", "Analysis & signals", "Geopolitics & forecast",
  "Nonprofit registries", "Persistence", "Social (authenticity)", "OSINT enrichment", "Alerts",
];

export function connectionSummary(): ConnSummary {
  const all = connectionStatus();
  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    items: all.filter((i) => i.category === category),
  })).filter((g) => g.items.length);
  return { total: all.length, connected: all.filter((i) => i.connected).length, byCategory };
}
