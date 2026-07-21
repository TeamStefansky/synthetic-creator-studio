# TruthLens — Design Audit (Phase 0)

Current state vs. the **Aurora Dark** target (`design-system-portable.md`). No screens
touched yet — this is the gate before any token/component work.

## Stack (detected)
- **Next.js 14.2.35 (App Router) · React 18.3 · TypeScript · Tailwind 3.4.15.**
- Tokens live in **two places today**: `tailwind.config.ts` (`theme.extend.colors` + keyframes)
  and `app/globals.css` (`:root`, `@layer components/utilities`, raw hex). Plus many raw
  literals inline in `.tsx`.
- **Dark-only already** (`color-scheme: dark`, near-black bg). ✅ matches Aurora intent.
- Fonts: **Inter only**, via `<link>` in `app/layout.tsx`. No display font, no mono font.
- **Shell: a TOP nav bar** (`components/Nav.tsx` inside `app/layout.tsx` `<header>`), horizontal
  links. Aurora's signature shell is an **icon-led sidebar with gradient tiles** → shell change.
- 12 screens (`app/**/page.tsx`), 22 components, 3 data-viz (`ScoreGauge`, `NetworkGraph`, `MiniMap`).

## What exists now (scripted, ranked by frequency)

### Color roles — current Tailwind theme (`tailwind.config.ts`)
| Role | Current | Aurora target | Gap |
|---|---|---|---|
| bg / canvas | `bg-base #070a12` | `#050506` | slightly bluer/lighter → go near-pure-black |
| surface / card | `bg-card #0f1422` | `surface #131314` | bluer → neutralize |
| raised / hover | `bg-elev #161d2e` | `surface-2 #1E1E20` | bluer → neutralize |
| sunken (inputs) | *(none)* | `surface-sunken #0C0C0D` | **missing token** |
| primary / brand | `brand #6366f1`, `brand-soft #818cf8` | `primary #7F49E1` (purple) | indigo → electric purple |
| gradient | indigo→violet, **vertical** (`#6d70f2→#4f46e5` in `.btn`; white→`#b9c0ff` in `.gradient-text`) | **120° orange→magenta→purple** `#E1804A→#A25DA7→#7F49E1` | wrong hue + direction + used too broadly |
| text | body `#e5e7eb` / `text-gray-200` | `#EBEBEB` | ✅ already soft off-white |
| text secondary/muted | `gray-400` (102×) / `gray-500` (103×) | `#9A9A9F` / `#5E5E64` | map gray-scale → 2 role tokens |
| risk-legit | `#34d399` | (status success `#22C55E`) | functional traffic-light — see gate Q1 |
| risk-unknown | `#fbbf24` | (status warning `#F5A623`) | " |
| risk-high | `#fb7185` | (status danger `#F0454F`) | " |
| badge (yellow) | *(inline `yellow-*`)* | `badge #F5D742` | promote to a token |

### Color usage (top Tailwind classes)
`text-gray-500` ×103 · `text-gray-400` ×102 · `border-white/*` ×71 · `text-gray-200` ×58 ·
`text-risk-high` ×54 · `text-indigo-400` ×38 · `bg-white/*` ×34 · `text-gray-*` (100/300/600) ~72 ·
`text-white` ×27 · risk-legit/unknown families ~60 · `from-indigo-500`/`to-violet-600` ×7 each.
→ **~600 color-class sites** to migrate to role tokens; `indigo-*`/`violet-*` (~50) are the
current "brand" and must become Aurora primary/gradient.

### Raw hex literals in code (`.ts`/`.tsx`) — ~60 distinct
Concentrated in **canvas/SVG data-viz** that can't use Tailwind classes:
`NetworkGraph.tsx` (cluster palette `#818cf8 #34d399 #fbbf24 #fb7185 #38bdf8 #f472b6 #a3e635 #c084fc`,
edge/ring colors), `ScoreGauge.tsx`, `MiniMap.tsx`, `AuthenticityPanel`/`CibPanel` tone maps.
→ These need a **shared JS token module** (hex constants) so canvas code consumes tokens too.

### Type scale
`text-sm` ×157 · `text-xs` ×141 · `text-lg` ×27 · `text-xl` ×8 · `text-2xl` ×6 · `text-4xl` ×2 · `text-5xl`/`3xl` ×1.
→ **Body-heavy, almost no display type.** Aurora wants confident oversized display
(hero 60 / display 44 / h1 34). Biggest *visual* gap after the gradient.

### Radius
`rounded-lg` (8px) ×40 · `rounded-xl` (12) ×23 · `rounded-full` ×23 · `rounded-2xl` (16) ×4 · `rounded` ×9 · `rounded-md` ×2.
→ Aurora is **more rounded** (cards 20–26, buttons/inputs 14, tiles 12–14). Remap the ramp.

### Components (utility classes in `globals.css`)
`.card` (rounded-2xl, glass blur + `shadow-soft`, bluish surface), `.card-elev`, `.btn`
(indigo gradient + glow, on **every** primary), `.btn-ghost`, `.label-muted` (mono-less
uppercase), `.gradient-text` (white→periwinkle), `.ring-hairline`. VerdictBadge,
ConfidenceBadge, EvidenceList, ScoreGauge, MiniMap, NetworkGraph, Nav, Disclaimer,
ToolIntro, AuthenticityPanel, CibPanel, SocialMediaPanel, InfraCard, OsintPanel, etc.

## Gaps vs. Aurora discipline
1. **Gradient is the wrong hue, direction, and too broad.** Indigo→violet vertical, applied to
   every `.btn`. Aurora = 120° orange→magenta→purple, **scarce (~2–3%)**: logo, active nav,
   ONE primary CTA per view, icon tiles, one featured item.
2. **No display or mono font.** Need Space Grotesk (display) + JetBrains Mono (labels/metrics).
3. **Shell is top-nav, not the icon-sidebar-with-gradient-tiles** Aurora signature.
4. **Depth via glass blur + shadows** (`.card` backdrop-blur, `shadow-soft`). Aurora = surface
   steps + hairlines, minimal shadow (soft glow only under the gradient).
5. **Ambient body glows are indigo/sky/purple** radial gradients — off-language; Aurora canvas
   is flatter near-black.
6. **Two token homes + ~60 inline hex + ~600 palette classes** = no single source of truth.
7. **Accessibility: no `prefers-reduced-motion`** despite `fade-up`/`float`/`blink` animations. Must add.
8. **Data-viz:** `ScoreGauge` is a semicircle arc (not the Aurora radial **tick** gauge); no
   milestone progress curve. Signature-moment opportunities.

## What already aligns (keep)
- Dark-only, near-black canvas, soft off-white body text (`#e5e7eb`), hairline borders,
  role-named risk tokens, `lucide-react` icons, `.card`/`.btn` component layer (good bones to retune),
  `gradient-text` mechanism (`background-clip:text`) — right technique, wrong colors.

## Risk & scope notes
- **Behavior/flows are preserved** — this is a reskin. The influence-detection engines,
  CIB/authenticity logic, and copy don't change.
- **FROZEN safeguards untouched:** the Disclaimer strings, "not a verdict" framing, "actor
  UNDETERMINED", "earliest observed… not the true origin", and `tests/ethics.test.ts` — a restyle
  must not alter any of these; the audit only maps their *presentation*.
- Largest lifts: (a) the sidebar shell, (b) introducing display type at Aurora's scale without
  breaking dense analyst layouts, (c) migrating ~60 canvas hex into shared JS tokens.
