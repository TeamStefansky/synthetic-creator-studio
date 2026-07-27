#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/Users/teamstefansky/Projects/newsradar}"
cd "$ROOT"

mkdir -p \
  apps/web/app \
  apps/web/src/components \
  apps/web/src/i18n \
  apps/web/src/styles \
  apps/web/public/brand \
  scripts \
  workers

# ── apps/web package ──────────────────────────────────────────
cat > apps/web/package.json <<'EOF'
{
  "name": "@newsradar/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@newsradar/core": "workspace:*",
    "next": "^15.1.0",
    "next-intl": "^3.26.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "~5.6.3"
  }
}
EOF

cat > apps/web/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "allowJs": false,
    "noEmit": true,
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"],
      "@newsradar/core": ["../../packages/core/src/index.ts"],
      "@newsradar/core/*": ["../../packages/core/src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > apps/web/next.config.ts <<'EOF'
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@newsradar/core"],
};

export default withNextIntl(nextConfig);
EOF

cat > apps/web/next-env.d.ts <<'EOF'
/// <reference types="next" />
/// <reference types="next/image-types/global" />
EOF

cat > apps/web/src/i18n/request.ts <<'EOF'
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  const locale = "he";
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
EOF

mkdir -p apps/web/messages
cat > apps/web/messages/he.json <<'EOF'
{
  "appName": "NewsRadar",
  "tagline": "מודיעין שוק ארגוני"
}
EOF

cat > apps/web/messages/en.json <<'EOF'
{
  "appName": "NewsRadar",
  "tagline": "Organizational market intelligence"
}
EOF

# ── Components ────────────────────────────────────────────────
cat > apps/web/src/components/Bidi.tsx <<'EOF'
import type { ReactNode } from "react";
import { composeMeta } from "@newsradar/core";

type BidiProps = {
  parts?: string[];
  children?: ReactNode;
};

export function Bidi({ parts, children }: BidiProps) {
  if (parts) {
    return <>{composeMeta(parts)}</>;
  }
  return <>{children}</>;
}
EOF

cat > apps/web/src/components/DatelineStrip.module.css <<'EOF'
.strip {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 400;
  line-height: var(--lh-caption);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  color: var(--ink-300);
  border-block-start: var(--rule-heavy);
  padding-block-start: var(--sp-2);
  margin-block-end: var(--sp-3);
}

.emphasis {
  color: var(--ink-900);
  font-weight: 500;
}
EOF

cat > apps/web/src/components/DatelineStrip.tsx <<'EOF'
import { composeMeta } from "@newsradar/core";
import styles from "./DatelineStrip.module.css";

type DatelineStripProps = {
  parts: string[];
  emphasisIndex?: number;
};

export function DatelineStrip({ parts, emphasisIndex }: DatelineStripProps) {
  const text = composeMeta(parts);
  if (emphasisIndex == null || emphasisIndex < 0 || emphasisIndex >= parts.length) {
    return <div className={styles.strip}>{text}</div>;
  }
  const rendered = parts.map((part, index) => {
    const segment = composeMeta([part]).replace(/^ · | · $/g, "") || part;
    const node =
      index === emphasisIndex ? (
        <span key={index} className={styles.emphasis}>
          {segment}
        </span>
      ) : (
        <span key={index}>{segment}</span>
      );
    return (
      <span key={`wrap-${index}`}>
        {index > 0 ? " · " : null}
        {node}
      </span>
    );
  });
  return <div className={styles.strip}>{rendered}</div>;
}
EOF

cat > apps/web/src/components/SourceStrip.module.css <<'EOF'
.strip {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-family: var(--font-sans-he);
  font-size: var(--fs-small);
  line-height: var(--lh-small);
  color: var(--ink-500);
}

.favicon {
  width: var(--sp-4);
  height: var(--sp-4);
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--ink-100);
}

.name {
  color: var(--ink-900);
  font-weight: 500;
}

.arrow {
  margin-inline-start: auto;
  color: var(--ink-300);
  text-decoration: none;
}

.arrow:hover {
  color: var(--signal-600);
}
EOF

cat > apps/web/src/components/SourceStrip.tsx <<'EOF'
import { composeMeta } from "@newsradar/core";
import styles from "./SourceStrip.module.css";

type SourceStripProps = {
  sourceName: string;
  countryCode: string;
  relativeTime: string;
  href: string;
  faviconUrl?: string;
};

export function SourceStrip({
  sourceName,
  countryCode,
  relativeTime,
  href,
  faviconUrl,
}: SourceStripProps) {
  const meta = composeMeta([countryCode, relativeTime]);
  return (
    <div className={styles.strip}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.favicon}
        src={faviconUrl ?? "/brand/stem-logo-ink.png"}
        alt=""
        width={16}
        height={16}
      />
      <span className={styles.name}>{sourceName}</span>
      <span>{meta}</span>
      <a className={styles.arrow} href={href} target="_blank" rel="noreferrer" aria-label="Open source">
        ↗
      </a>
    </div>
  );
}
EOF

cat > apps/web/src/components/SentimentTriangle.module.css <<'EOF'
.triangle {
  width: var(--sentiment-triangle-size);
  height: var(--sentiment-triangle-size);
  opacity: var(--sentiment-overlay-opacity);
}

.positive {
  fill: var(--sentiment-positive);
}

.neutral {
  fill: var(--sentiment-neutral);
}

.negative {
  fill: var(--sentiment-negative);
}

@media print {
  .positive {
    fill: var(--ink-900);
  }
  .neutral {
    fill: none;
    stroke: var(--ink-900);
    stroke-width: 2;
    stroke-dasharray: 4 2;
  }
  .negative {
    fill: none;
    stroke: var(--ink-900);
    stroke-width: 2;
  }
}
EOF

cat > apps/web/src/components/SentimentTriangle.tsx <<'EOF'
import styles from "./SentimentTriangle.module.css";

export type SentimentLabel = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

type SentimentTriangleProps = {
  sentiment: SentimentLabel | null;
};

export function SentimentTriangle({ sentiment }: SentimentTriangleProps) {
  if (sentiment == null) {
    return null;
  }
  const tone =
    sentiment === "POSITIVE"
      ? styles.positive
      : sentiment === "NEGATIVE"
        ? styles.negative
        : styles.neutral;
  return (
    <svg
      className={`${styles.triangle} ${tone}`}
      viewBox="0 0 36 36"
      aria-hidden="true"
      role="presentation"
    >
      <polygon points="0,0 36,0 0,36" />
    </svg>
  );
}
EOF

cat > apps/web/src/components/Wordmark.module.css <<'EOF'
.wordmark {
  display: inline-flex;
  align-items: center;
  min-block-size: 24px;
  padding: var(--sp-4);
}

.wordmark img {
  display: block;
  height: 24px;
  width: auto;
}
EOF

cat > apps/web/src/components/Wordmark.tsx <<'EOF'
import styles from "./Wordmark.module.css";

type WordmarkProps = {
  variant: "white" | "ink" | "signal";
};

const SRC: Record<WordmarkProps["variant"], string> = {
  white: "/brand/stem-logo-white.png",
  ink: "/brand/stem-logo-ink.png",
  signal: "/brand/stem-logo-signal.png",
};

export function Wordmark({ variant }: WordmarkProps) {
  return (
    <span className={styles.wordmark}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SRC[variant]} alt="STEM" height={24} />
    </span>
  );
}
EOF

cat > apps/web/src/components/SentimentTriangle.test.tsx <<'EOF'
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SentimentTriangle } from "./SentimentTriangle";

describe("SentimentTriangle", () => {
  it("renders no DOM node when sentiment is null", () => {
    const html = renderToStaticMarkup(<SentimentTriangle sentiment={null} />);
    expect(html).toBe("");
  });

  it("renders an svg when sentiment is present", () => {
    const html = renderToStaticMarkup(<SentimentTriangle sentiment="POSITIVE" />);
    expect(html).toContain("<svg");
    expect(html).toContain("0,0 36,0 0,36");
  });
});
EOF

cat > apps/web/app/globals.css <<'EOF'
@import "../src/styles/tokens.css";

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--paper-reader);
  color: var(--ink-900);
  font-family: var(--font-sans-he);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}

a {
  color: var(--signal-600);
}

main {
  max-inline-size: 1280px;
  margin-inline: auto;
  padding: var(--sp-8) var(--sp-6);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: var(--border-strong);
  margin-block-end: var(--sp-8);
  padding-block-end: var(--sp-4);
}

.heroTitle {
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  line-height: var(--lh-h1);
  letter-spacing: var(--track-tight);
  font-weight: 600;
  margin: 0 0 var(--sp-4);
}

.card {
  background: var(--surface);
  border: var(--border);
  border-radius: var(--radius-md);
  padding: var(--sp-6);
}

.preview {
  position: relative;
  margin-block-start: var(--sp-6);
  border: var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--ink-100);
  min-block-size: 160px;
}

.previewTriangle {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
}
EOF

cat > apps/web/app/layout.tsx <<'EOF'
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import {
  Frank_Ruhl_Libre,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Hebrew,
  Newsreader,
} from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display-loaded",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const plexHebrew = IBM_Plex_Sans_Hebrew({
  subsets: ["hebrew"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-he-loaded",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700"],
  variable: "--font-serif-he-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NewsRadar",
  description: "Organizational market intelligence",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      dir={locale === "he" ? "rtl" : "ltr"}
      className={`${newsreader.variable} ${plexSans.variable} ${plexHebrew.variable} ${plexMono.variable} ${frankRuhl.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
EOF

cat > apps/web/app/page.tsx <<'EOF'
import { DatelineStrip } from "@/components/DatelineStrip";
import { SentimentTriangle } from "@/components/SentimentTriangle";
import { SourceStrip } from "@/components/SourceStrip";
import { Wordmark } from "@/components/Wordmark";
import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations();
  return (
    <main>
      <header className="header">
        <Wordmark variant="ink" />
        <strong>{t("appName")}</strong>
      </header>
      <h1 className="heroTitle">{t("tagline")}</h1>
      <DatelineStrip
        parts={["REUTERS", "GB", "14:32 UTC", "9 SOURCES", "4 LANGUAGES"]}
        emphasisIndex={2}
      />
      <section className="card">
        <SourceStrip
          sourceName="רויטרס"
          countryCode="GB"
          relativeTime="לפני 12 דק׳"
          href="https://www.reuters.com"
        />
        <div className="preview">
          <div className="previewTriangle">
            <SentimentTriangle sentiment="NEGATIVE" />
          </div>
        </div>
      </section>
    </main>
  );
}
EOF

# Fix page.tsx — useTranslations is client-only; use getTranslations server-side
cat > apps/web/app/page.tsx <<'EOF'
import { DatelineStrip } from "@/components/DatelineStrip";
import { SentimentTriangle } from "@/components/SentimentTriangle";
import { SourceStrip } from "@/components/SourceStrip";
import { Wordmark } from "@/components/Wordmark";
import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations();
  return (
    <main>
      <header className="header">
        <Wordmark variant="ink" />
        <strong>{t("appName")}</strong>
      </header>
      <h1 className="heroTitle">{t("tagline")}</h1>
      <DatelineStrip
        parts={["REUTERS", "GB", "14:32 UTC", "9 SOURCES", "4 LANGUAGES"]}
        emphasisIndex={2}
      />
      <section className="card">
        <SourceStrip
          sourceName="רויטרס"
          countryCode="GB"
          relativeTime="לפני 12 דק׳"
          href="https://www.reuters.com"
        />
        <div className="preview">
          <div className="previewTriangle">
            <SentimentTriangle sentiment="NEGATIVE" />
          </div>
        </div>
      </section>
    </main>
  );
}
EOF

# Bind loaded fonts into tokens via layout class hooks
cat >> apps/web/app/globals.css <<'EOF'

html {
  --font-display: var(--font-display-loaded), Georgia, serif;
  --font-sans: var(--font-sans-loaded), system-ui, sans-serif;
  --font-sans-he: var(--font-sans-he-loaded), var(--font-sans-loaded), system-ui, sans-serif;
  --font-mono: var(--font-mono-loaded), ui-monospace, monospace;
  --font-serif-he: var(--font-serif-he-loaded), Georgia, serif;
}
EOF

# ── lint:tokens scanner ──────────────────────────────────────
cat > scripts/lint-tokens.mjs <<'EOF'
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WEB = path.join(ROOT, "apps/web");
const ALLOW_PX = new Set(["0", "1", "0.5"]);
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RAW_PX = /(?<![\w-])(\d+(?:\.\d+)?)px\b/g;
const FONT_FAMILY = /font-family\s*:\s*[^;]+;/g;

const SKIP = new Set(["tokens.css", "next-env.d.ts"]);

/** @type {{file:string,line:number,kind:string,value:string,hint:string}[]} */
const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(css|module\.css|tsx?|jsx?)$/.test(entry.name) && !SKIP.has(entry.name)) {
      scan(full);
    }
  }
}

function scan(file) {
  const rel = path.relative(ROOT, file);
  if (rel.endsWith("tokens.css")) return;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, idx) => {
    if (line.includes("lint-tokens-allow")) return;
    for (const match of line.matchAll(HEX)) {
      violations.push({
        file: rel,
        line: idx + 1,
        kind: "raw-hex",
        value: match[0],
        hint: "use a token from apps/web/src/styles/tokens.css (e.g. var(--ink-900))",
      });
    }
    for (const match of line.matchAll(RAW_PX)) {
      if (ALLOW_PX.has(match[1])) continue;
      // allow next/font size props and SVG viewBox contexts loosely via comment
      if (line.includes("viewBox") || line.includes("height={") || line.includes("width={")) {
        continue;
      }
      violations.push({
        file: rel,
        line: idx + 1,
        kind: "raw-px",
        value: match[0],
        hint: "use spacing/type tokens (e.g. var(--sp-4), var(--fs-body))",
      });
    }
    if (FONT_FAMILY.test(line) && !line.includes("var(--font-")) {
      FONT_FAMILY.lastIndex = 0;
      violations.push({
        file: rel,
        line: idx + 1,
        kind: "raw-font",
        value: line.trim(),
        hint: "use var(--font-sans) / var(--font-mono) / var(--font-display)",
      });
    }
  });
}

walk(WEB);

if (violations.length) {
  for (const v of violations) {
    console.error(`${v.file}:${v.line} [${v.kind}] ${v.value} → ${v.hint}`);
  }
  console.error(`\nlint:tokens failed with ${violations.length} violation(s)`);
  process.exit(1);
}

console.log("lint:tokens passed");
EOF

# ── eslint + prettier + vitest ────────────────────────────────
cat > eslint.config.js <<'EOF'
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "legacy/**",
      "scripts/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
EOF

cat > prettier.config.cjs <<'EOF'
module.exports = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
};
EOF

cat > vitest.config.ts <<'EOF'
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/web/**/*.test.ts",
      "apps/web/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
      "@newsradar/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
});
EOF

cat > workers/package.json <<'EOF'
{
  "name": "@newsradar/workers",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "typecheck": "echo 'workers stub — Phase 3+'"
  }
}
EOF

# Ensure brand assets in public
cp -f brand/*.png apps/web/public/brand/ 2>/dev/null || true

# Fix DatelineStrip CSS — 11px is required by design for dateline; allow via token addition
# Add --fs-dateline to tokens if missing
if ! grep -q -- '--fs-dateline' apps/web/src/styles/tokens.css; then
  perl -i -pe 's/(--fs-caption: 12px;)/--fs-dateline: 11px;\n  $1/' apps/web/src/styles/tokens.css
fi
perl -i -pe 's/font-size: 11px;/font-size: var(--fs-dateline);/' apps/web/src/components/DatelineStrip.module.css

echo "phase0 scaffold files written"
