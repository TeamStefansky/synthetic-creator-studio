# Aurora Dark — Token Plan & Conform Notes (Phase 0)

The plan to make TruthLens the same family as the Aurora Dark reference. **Nothing
below is implemented yet** — this is the contract to confirm at the gate.

## Token-implementation approach (idiomatic for this stack)
Single source of truth in **two coordinated layers**, no third styling system:
1. **`tailwind.config.ts` `theme.extend`** — colors (by role), fontFamily, borderRadius,
   fontSize (display scale), keyframes. This is what `.tsx` classes consume.
2. **`app/globals.css` `:root`** — the same values as CSS custom properties, for the
   `@layer components` utilities and any raw CSS. Tailwind reads the hex; CSS reads the vars.
3. **NEW `lib/design-tokens.ts`** — the gradient stops + status/cluster hexes as JS constants,
   so **canvas/SVG data-viz** (`NetworkGraph`, `ScoreGauge`, `MiniMap`) stop hardcoding hex.
4. A **grep guard** (npm script) flags raw `#hex`/`px` outside these three files.

## Color role map (current → Aurora)
| Aurora role token | Value | Replaces (current) |
|---|---|---|
| `bg` | `#050506` | `bg-base #070a12` |
| `surface` | `#131314` | `bg-card #0f1422` |
| `surface-2` | `#1E1E20` | `bg-elev #161d2e` |
| `surface-sunken` | `#0C0C0D` | *(new — inputs/tracks)* |
| `text` | `#EBEBEB` | body `#e5e7eb`, `gray-100/200` |
| `text-secondary` | `#9A9A9F` | `gray-400` |
| `text-muted` | `#5E5E64` | `gray-500/600` |
| `border` | `#232324` | `white/[0.06–0.10]` |
| `border-strong` | `#37373A` | `white/25` |
| `primary` (+hover/active) | `#7F49E1` / `#6E3BD0` / `#5D32A7` | `brand #6366f1`, all `indigo-*`/`violet-*` |
| `primary-glow` | `rgba(127,73,225,.40)` | current indigo glow |
| gradient `--gradient-brand` | `120°, #E1804A→#A25DA7→#7F49E1` | `.btn` indigo gradient, `gradient-text` |
| `warm` | `#E1804A` | — |
| `badge` | `#F5D742` | inline `yellow-*` |

## Type scale (add display + mono; keep body)
| Token | Aurora spec | Notes |
|---|---|---|
| font-display | **Space Grotesk** → system fallback | NEW — load via `<link>` |
| font-body | **Inter** | already loaded ✅ |
| font-mono | **JetBrains Mono** | NEW — for `.label`/metrics |
| hero / display / h1 / h2 | 60 / 44 / 34 / 26 (display, 700/600) | introduce; **apply restrained** on dense analyst pages |
| h3 / body / small / label | 20 / 15 / 13 / 12(mono) | label becomes mono-uppercase |

## Radius ramp (current → Aurora)
`sm 10 · md 14 · lg 20 · xl 26 · full 999`. Map: cards → `lg` (was rounded-2xl 16),
buttons/inputs → `md` (14), tiles → `sm/md`, pills → `full`.

## Component rebuild (tokens only — states preserved)
- **Button:** primary = `--gradient-brand` + glow (**one per view**); secondary = surface +
  `border-strong`; ghost = transparent + primary text. (Retune existing `.btn`/`.btn-ghost`.)
- **Card:** `surface` + `radius-lg` + hairline; hover → `surface-2`; **drop backdrop-blur +
  heavy shadow** (depth by surface steps). Featured card = full gradient fill.
- **Input/field:** `surface-sunken` bg, `border`, focus ring `0 0 0 3px primary-glow`.
- **Pill toggle / tabs / badge (yellow mono) / icon tile (gradient) / two-tone heading**
  (one gradient word) — per the system.
- **ConfidenceBadge / VerdictBadge:** keep semantics; retune to status tokens.

## Shell change (biggest structural item)
Top-nav → **icon-led left sidebar**: gradient-filled tile per primary item, active nav =
gradient + glow, soft off-white labels, heavily rounded. One shell, every page. Must stay
responsive (collapses to a top bar / drawer on mobile). **Behavior/routes unchanged.**

## Signature moments & data-viz
- Two-tone gradient heading on each page hero (one gradient word).
- **Radial tick gauge** (48 ticks, gradient arc) for headline metrics — candidate to replace
  `ScoreGauge`'s semicircle on Site Report / risk score.
- **Milestone progress curve** where there's a timeline (e.g. Social Analyze stages, watch trend).
- Gradient stays ~2–3%: logo, active nav, one CTA, icon tiles, one featured item.

## Accessibility additions (required)
Add `@media (prefers-reduced-motion: reduce)` disabling `fade-up`/`float`/`blink`; verify
contrast ≥4.5 body / ≥3 UI on the new near-black + retuned risk hues (esp. text on the
gradient → pure white only there); visible focus ring on every control; targets ≥24×24.

## Proposed conform order (after tokens + components + shell land)
1. Home / Site Report (`/`, `/report`) — hero + ScoreGauge + operator graph
2. Check (`/check`) + Post/Log/Email tools
3. Brand Watch (`/platform`) + Monitor
4. Social Analyze result + **InfluenceNetworkGraph** + AuthenticityPanel + CIB
5. History / Checks / About / embed
One commit per batch, before/after screenshots, grep-clean per batch.

## Open decisions for the gate (need your call)
- **Q1 — Risk colors.** risk-legit/unknown/high are *functional* traffic-light semantics (the
  whole product is risk bands), distinct from the decorative gradient. **Recommend:** keep the 3
  risk *roles*, retune to Aurora status hues (success `#22C55E`, warning `#F5A623`, danger
  `#F0454F`) for family fit, and keep them out of the "gradient 2–3%" budget. Confirm.
- **Q2 — Sidebar shell.** Convert top-nav → icon sidebar with gradient tiles (Aurora signature)?
  It's the biggest structural change. Confirm, or keep a retuned top-nav.
- **Q3 — Display type intensity.** Full Aurora scale (hero 60) can overwhelm dense analyst
  tables. **Recommend:** full scale on marketing/hero surfaces (home, tool intros), a **restrained
  step** (h1 28–34) on data-dense report screens. Confirm.
- **Q4 — Replace ScoreGauge with the radial tick gauge?** Signature win, but it changes a
  familiar viz. Confirm swap vs. keep-and-retune.
- **Q5 — FROZEN check.** Confirm the restyle may re-layout but must not reword the Disclaimer /
  "not a verdict" / "actor UNDETERMINED" / "earliest observed" strings, and ethics tests stay green.
