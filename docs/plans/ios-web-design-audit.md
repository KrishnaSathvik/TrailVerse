---
title: TrailVerse Web → iOS Design Audit
status: active
created: 2026-07-08
scope: ios-design-system-source
canonical_web: https://www.nationalparksexplorerusa.com
sources:
  - next-frontend/src/styles/themes.css
  - next-frontend/src/app/globals.css
  - docs/DESIGN_SYSTEM.md
  - docs/TRAILVERSE_BRAND_GUIDELINES.md
swift_tokens: ios/TrailVerse/Core/DesignSystem/
---

# TrailVerse Web → iOS Design Audit

**Goal:** Same TrailVerse identity, rebuilt as a native iOS experience — not a pixel copy of the website.

Source of truth for runtime web tokens: `next-frontend/src/styles/themes.css`.

---

## Brand colors

| Token | Light | Dark | iOS usage |
|-------|-------|------|-----------|
| `accent-green` | `#059669` | `#059669` | Primary CTA, selected tab, links, Trailie accent |
| `accent-green-dark` | `#047857` | `#047857` | Pressed primary button |
| `accent-green-light` | `rgba(5,150,105,0.15)` | `rgba(5,150,105,0.18)` | Tinted chips, subtle highlights |
| `accent-blue` | `#0369A1` | `#0ea5e9` | Info links, secondary actions |
| `accent-orange` | `#EA580C` | `#f97316` | Warnings, seasonal highlights |
| `forest-dark` | `#064e3b` | `#064e3b` | Hero scrims over park photography |
| `error-red` | `#dc2626` | `#ef4444` | Destructive, closure severity |
| `warning` | `#d97706` | `#f59e0b` | Caution alerts |

**Note:** Older docs list `#10b981` / `#22c55e`; production CSS uses **deep emerald `#059669`** for WCAG contrast on white-on-green buttons.

### Backgrounds

| Token | Light | Dark |
|-------|-------|------|
| `bg-primary` | `#FEFCF9` | `#0A0E0F` |
| `bg-secondary` | `#F9F7F4` | `#131719` |
| `bg-tertiary` | `#F4F1EC` | `#1A1F21` |

### Surfaces (cards)

| Token | Light | Dark |
|-------|-------|------|
| `surface` | `rgba(255,255,255,0.8)` | `rgba(255,255,255,0.05)` |
| `border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.10)` |

### Text hierarchy

| Token | Light | Dark |
|-------|-------|------|
| `text-primary` | `#2D2B28` | `#FFFFFF` |
| `text-secondary` | `rgba(45,43,40,0.85)` | `rgba(255,255,255,0.85)` |
| `text-tertiary` | `rgba(45,43,40,0.65)` | `rgba(255,255,255,0.60)` |

---

## Typography

| Web | iOS mapping |
|-----|-------------|
| Geist (UI) | **SF Pro** (system) — body, labels, buttons |
| Bricolage Grotesque (display) | **SF Pro Rounded** or `.largeTitle`/`.title` with semibold — park names, section headers |
| Body default | 17pt minimum (Apple HIG) |
| `text-sm` 14pt | `.subheadline` |
| `text-xs` 12pt | `.caption` |
| `text-xl`–`text-3xl` | `.title3`–`.largeTitle` |

Weights: regular 400, medium 500, semibold 600, bold 700.

---

## Spacing (8pt grid)

| Web (Tailwind) | px | iOS |
|----------------|-----|-----|
| `space-2` | 8 | `TVSpacing.xs` |
| `space-3` | 12 | `TVSpacing.sm` |
| `space-4` | 16 | `TVSpacing.md` |
| `space-6` | 24 | `TVSpacing.lg` |
| `space-8` | 32 | `TVSpacing.xl` |
| Screen horizontal padding | 16–20 | `TVSpacing.screenHorizontal` |

Touch targets: **≥ 44pt** everywhere.

---

## Corner radii

| Pattern | Web | iOS |
|---------|-----|-----|
| Cards, park tiles | `rounded-2xl` (16px) | `TVRadius.card` = 16 |
| Inner image thumbs | `rounded-xl` (12px) | `TVRadius.medium` = 12 |
| Buttons | 8–12px | `TVRadius.button` = 12 |
| Chips, pills | `rounded-full` | `TVRadius.pill` |
| Modals / sheets | `rounded-3xl` top | `TVRadius.sheet` = 24 |

---

## Buttons

Web `Button` component patterns → iOS:

| Variant | Web | iOS |
|---------|-----|-----|
| Primary | Green fill, white text | `TVPrimaryButton` — `#059669` bg |
| Secondary | Surface + border | `TVSecondaryButton` |
| Outline | Green border, green text | `TVOutlineButton` |
| Ghost | Text only | `TVGhostButton` |
| Danger | `error-red` fill | `TVDangerButton` |

Hover on web → pressed state on iOS. No `translateY` lift on mobile; use opacity + scale 0.98.

---

## Cards

| Type | Web pattern | iOS |
|------|-------------|-----|
| Park card | Image hero, `rounded-2xl`, border, shadow, hover scale on image | `TVParkCard` — photo hero, title, state, optional rating |
| Trip card | Surface card, countdown/status | `TVTripCard` |
| Guide card | Category chip, title, read time | Safari handoff wrapper card (Journey 1) |
| Glass card | `backdrop-blur` + surface | **Avoid on photo heroes** — use opaque `.regularMaterial` on nav only |

---

## Inputs

| Type | Web | iOS |
|------|-----|-----|
| Search | Rounded field, magnifying glass | `TVSearchField` — `.searchable` or custom with SF Symbol `magnifyingglass` |
| Text field | Border, 12px radius | `TVTextField` |
| Secure | Password fields | `TVSecureField` |

Focus ring: 2pt `accent-green` outline (web `.focus-ring`).

---

## Icons

Web uses **Phosphor** via `@components/icons`. iOS uses **SF Symbols** with this mapping:

| Phosphor / concept | SF Symbol |
|--------------------|-----------|
| Map / explore | `map` |
| Location | `location.fill` |
| Sparkles / Trailie | `sparkles` |
| Person | `person.circle` |
| Heart / save | `heart` / `heart.fill` |
| Compare | `arrow.left.arrow.right` |
| Alert | `exclamationmark.triangle.fill` |
| Weather sun | `sun.max.fill` |
| Directions | `arrow.triangle.turn.up.right.diamond.fill` |

---

## Trailie styling

From `TrailieAvatar.jsx` and Plan AI UI:

- Avatar: circular, green ring `ring-green-500/20`
- User bubbles: surface card, right-aligned
- Assistant bubbles: left-aligned, optional structured blocks below text
- Streaming: typing indicator, no generic “happy to help” voice
- Chips: pill suggestions below input (`rounded-full`, green tint)
- **Never** label “Plan AI” in UI — always **Trailie**

---

## Weather cards

- Show **last updated** timestamp (live data leads)
- Condition icon + temp + short phrase
- Use `accent-blue` for info, not alarm colors unless severe
- Offline: label “Weather snapshot · updated {time}”

---

## Alert cards

Severity must use **icon + text + color** (never color-only):

| Severity | Color | Icon |
|----------|-------|------|
| Closure / danger | `error-red` | `exclamationmark.octagon.fill` |
| Warning | `warning` | `exclamationmark.triangle.fill` |
| Info | `accent-blue` | `info.circle.fill` |

Badge on park detail tab when active alerts exist.

---

## Loading, empty, error states

| State | Pattern |
|-------|---------|
| Loading | Skeleton blocks using `skeleton` token; `ProgressView` for actions |
| Empty | Illustration optional; specific copy + primary CTA |
| Error | `error-red` icon, plain language, Retry button |
| Offline | Banner at top — “You’re offline” — cached data labeled |

---

## Photography treatment

- Park photos are **heroes** — full-bleed or 16:9 with bottom gradient scrim (`forest-dark` → transparent)
- Chrome stays minimal over imagery
- No glass-on-glass over photos (illegible on busy scenes)
- Image corner radius matches card (`16pt`)

---

## Dark mode

- Web: `html.light` / `html.dark` + system preference
- iOS: `@Environment(\.colorScheme)` + semantic colors in `TVColors`
- Same warm cream light / near-black dark as web
- Tab bar: opaque material, selected tint `accent-green`

---

## iOS-specific adaptations (not copied from web)

| Web | iOS |
|-----|-----|
| Top header + footer | Bottom tab bar (5 tabs) |
| Desktop sidebar | Inline cards below hero |
| WKWebView marketing | `SFSafariViewController` for guides/blog |
| Voice FAB bottom-right | Toolbar mic on Trailie screen |
| Horizontal marketing sections | Personalized Home cards |

---

## Swift token files

Implemented in `ios/TrailVerse/Core/DesignSystem/`:

- `TVColors.swift` — semantic light/dark
- `TVTypography.swift` — text styles
- `TVSpacing.swift`, `TVRadius.swift`, `TVShadows.swift`
- `TVIcons.swift` — SF Symbol names
- `TVButtons.swift`, `TVCards.swift`, `TVInputs.swift`
- `TVStatusStyles.swift` — alerts, weather, badges
- `TVMotion.swift` — animation durations, Reduce Motion
