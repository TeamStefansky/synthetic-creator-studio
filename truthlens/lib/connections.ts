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
  | "Alerts";

export interface Integration {
  key: string;
  label: string;
  category: ConnCategory;
  /** Empty = keyless (always on). Otherwise ALL must be set to be connected. */
  envVars: string[];
  /** true = any ONE of envVars is enough (e.g. KV vs Upstash). */
  anyOf?: boolean;
  /** Where to obtain the key (shown in the not-connected checklist). */
  getUrl?: string;
  note?: string;
}

export const INTEGRATIONS: Integration[] = [
  // --- Brand mentions ---
  { key: "gdelt", label: "GDELT (global news)", category: "Brand mentions", envVars: [] },
  { key: "bluesky", label: "Bluesky", category: "Brand mentions", envVars: [] },
  { key: "hackernews", label: "Hacker News", category: "Brand mentions", envVars: [] },
  { key: "reddit", label: "Reddit", category: "Brand mentions", envVars: [] },
  { key: "guardian", label: "The Guardian", category: "Brand mentions", envVars: ["GUARDIAN_API_KEY"], getUrl: "open-platform.theguardian.com" },
  { key: "nyt", label: "New York Times", category: "Brand mentions", envVars: ["NYT_API_KEY"], getUrl: "developer.nytimes.com" },
  { key: "gnews", label: "GNews", category: "Brand mentions", envVars: ["GNEWS_API_KEY"], getUrl: "gnews.io" },
  { key: "newsapi", label: "NewsAPI.org", category: "Brand mentions", envVars: ["NEWSAPI_KEY"], getUrl: "newsapi.org" },
  { key: "newsdata", label: "NewsData.io", category: "Brand mentions", envVars: ["NEWSDATA_API_KEY"], getUrl: "newsdata.io" },
  { key: "mediastack", label: "Mediastack", category: "Brand mentions", envVars: ["MEDIASTACK_API_KEY"], getUrl: "mediastack.com" },
  { key: "youtube", label: "YouTube (video)", category: "Brand mentions", envVars: ["YOUTUBE_API_KEY"], getUrl: "console.cloud.google.com (YouTube Data API v3)" },
  { key: "x", label: "X / Twitter", category: "Brand mentions", envVars: ["X_BEARER_TOKEN"], getUrl: "developer.x.com (Basic tier+ for search)", note: "Paid" },
  { key: "rss", label: "RSS feeds", category: "Brand mentions", envVars: ["RSS_FEEDS"], getUrl: "your own comma-separated feed URLs" },

  // --- Analysis & signals ---
  { key: "anthropic", label: "Anthropic (sentiment + narratives)", category: "Analysis & signals", envVars: ["ANTHROPIC_API_KEY"], getUrl: "console.anthropic.com" },
  { key: "wikipedia", label: "Wikipedia pageviews (attention)", category: "Analysis & signals", envVars: [] },
  { key: "gdelt-tone", label: "GDELT tone (news sentiment trend)", category: "Analysis & signals", envVars: [] },
  { key: "anomaly", label: "Anomaly detection (z-score)", category: "Analysis & signals", envVars: [] },

  // --- Geopolitics & forecast ---
  { key: "ucdp", label: "UCDP (conflict events)", category: "Geopolitics & forecast", envVars: [] },
  { key: "reliefweb", label: "ReliefWeb (humanitarian)", category: "Geopolitics & forecast", envVars: [] },
  { key: "usgs", label: "USGS (earthquakes)", category: "Geopolitics & forecast", envVars: [] },
  { key: "eonet", label: "NASA EONET (natural events)", category: "Geopolitics & forecast", envVars: [] },
  { key: "polymarket", label: "Polymarket (market forecasts)", category: "Geopolitics & forecast", envVars: [] },
  { key: "metaculus", label: "Metaculus (community forecasts)", category: "Geopolitics & forecast", envVars: [] },
  { key: "worldbank", label: "World Bank (governance)", category: "Geopolitics & forecast", envVars: [] },
  { key: "imf", label: "IMF (GDP growth)", category: "Geopolitics & forecast", envVars: [] },
  { key: "acled", label: "ACLED (political violence)", category: "Geopolitics & forecast", envVars: ["ACLED_KEY", "ACLED_EMAIL"], getUrl: "acleddata.com / myACLED" },

  // --- Persistence ---
  { key: "kv", label: "KV store (cache + monitor history)", category: "Persistence", envVars: ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], anyOf: true, getUrl: "Vercel KV integration, or Upstash Redis" },

  // --- Social authenticity ---
  { key: "instagram", label: "Instagram (Meta Graph business discovery)", category: "Social (authenticity)", envVars: ["META_GRAPH_TOKEN", "IG_USER_ID"], getUrl: "developers.facebook.com (App Review pending)" },

  // --- OSINT enrichment ---
  { key: "ipinfo", label: "IPinfo (IP/ASN accuracy)", category: "OSINT enrichment", envVars: ["IPINFO_TOKEN"], getUrl: "ipinfo.io" },
  { key: "openpagerank", label: "Open PageRank (domain authority)", category: "OSINT enrichment", envVars: ["OPENPAGERANK_KEY"], getUrl: "domcop.com/openpagerank" },
  { key: "factcheck", label: "Google Fact Check", category: "OSINT enrichment", envVars: ["GOOGLE_FACTCHECK_KEY"], getUrl: "developers.google.com/fact-check" },
  { key: "securitytrails", label: "SecurityTrails (historical DNS)", category: "OSINT enrichment", envVars: ["SECURITYTRAILS_API_KEY"], getUrl: "securitytrails.com" },

  // --- Alerts ---
  { key: "telegram", label: "Telegram alerts", category: "Alerts", envVars: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALERT_CHAT_ID"], getUrl: "@BotFather" },
  { key: "webhook", label: "Slack/webhook alerts", category: "Alerts", envVars: ["ALERT_WEBHOOK_URL"], getUrl: "Slack incoming webhook" },
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
  "Persistence", "Social (authenticity)", "OSINT enrichment", "Alerts",
];

export function connectionSummary(): ConnSummary {
  const all = connectionStatus();
  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    items: all.filter((i) => i.category === category),
  })).filter((g) => g.items.length);
  return { total: all.length, connected: all.filter((i) => i.connected).length, byCategory };
}
