/** Presentation helpers: relative time, language names, country flags. */

const LANG_NAMES: Record<string, string> = {
  en: "English",
  he: "Hebrew",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
  de: "German",
  ru: "Russian",
  uk: "Ukrainian",
  pl: "Polish",
  it: "Italian",
  pt: "Portuguese",
  zh: "Chinese",
  ja: "Japanese",
  tr: "Turkish",
  fa: "Persian",
};

/** ISO 639-1 -> human name (falls back to upper-cased code). */
export function languageName(code: string | null | undefined): string {
  if (!code) return "another language";
  return LANG_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/** Languages that render right-to-left. */
const RTL_LANGS = new Set(["he", "ar", "fa", "ur"]);

export function isRtl(code: string | null | undefined): boolean {
  return !!code && RTL_LANGS.has(code.toLowerCase());
}

/** ISO 3166-1 alpha-2 -> flag emoji. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🏳️";
  const base = 0x1f1e6;
  const chars = code
    .toUpperCase()
    .split("")
    .map((c) => base + (c.charCodeAt(0) - 65));
  if (chars.some((n) => n < base || n > base + 25)) return "🏳️";
  return String.fromCodePoint(...chars);
}

export function countryLabel(code: string | null | undefined): string {
  if (!code) return "";
  return `${countryFlag(code)} ${code.toUpperCase()}`;
}

/** Compact relative time like "2h ago", "3d ago", "just now". */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return "";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "14:30" 24h clock in the viewer's locale. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function fullDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const NINETY_MIN_MS = 90 * 60 * 1000;

export function isStale(generatedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!generatedAt) return false;
  const d = new Date(generatedAt);
  if (Number.isNaN(d.getTime())) return false;
  return now.getTime() - d.getTime() > NINETY_MIN_MS;
}
