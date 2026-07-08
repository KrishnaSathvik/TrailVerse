---
title: TrailVerse iOS — Design Brief
status: draft
created: 2026-06-22
updated: 2026-06-22
scope: ios-design-north-star
platform: iOS (iPhone first; iPad adaptive later)
canonical_web: https://www.nationalparksexplorerusa.com
bundle_id: com.nationalparksexplorerusa.trailverse
related_docs:
  - docs/plans/ios-app-2026.md
  - docs/plans/ios-web-design-audit.md
  - docs/TRAILVERSE_BRAND_GUIDELINES.md
  - docs/DESIGN_SYSTEM.md
  - docs/pinterest-content-master-guide.md
  - ios/README.md
---

# TrailVerse iOS — Product & Design Brief

Use this as a **north star**, not a pixel-perfect screen spec.  
Designers should invent layout, hierarchy, motion, and visual language.  
Only **rules, outcomes, and capabilities** below are fixed unless product says otherwise.

**Companion doc (engineering):** `docs/plans/ios-app-2026.md` — API mapping, phased delivery, technical architecture.  
**This doc:** journeys, capabilities, constraints, and how to hand designs to engineering for wiring.

---

## What this product is

**TrailVerse** — discover → compare → plan hub for **470+ NPS parks and sites**.

**Core belief:** Park research should use **live NPS data** (alerts, weather, permits), not stale blog posts or guesswork.

**Emotional job:** Help people feel confident picking and planning a park trip — like a sharp friend who’s actually been there.

**AI persona:** **Trailie** (never “Plan AI” in UI).

**Platform:** Native **SwiftUI** in `ios/`. Express API is source of truth — no duplicate business logic on device. Expo prototype archived at git tag `trailverse-expo-archive`.

**Tagline:** Your Universe of National Parks Exploration  
**App Store subtitle (draft):** Compare & plan 470+ parks with live alerts

| TrailVerse IS | TrailVerse is NOT |
|---------------|-------------------|
| Research + compare + plan with live context | Turn-by-turn trail GPS (AllTrails) |
| Live alerts, weather, permits on park pages | Recreation.gov checkout replacement |
| Trailie with live park tools | Generic chatbot |
| Free browse; account for save + unlimited AI | Paywall on basic park info |
| Works alongside NPS App + Recreation.gov | “Official NPS app” |

---

## Design principles (non-negotiable)

1. **Live data leads** — alerts, weather, hours, fees feel current; show “last updated” when stale.
2. **Park photography is the hero** — chrome stays light; data supports the place.
3. **Free to explore** — no account required to browse, compare, or read park pages.
4. **Trailie is a coach, not a brochure** — specific viewpoints, honest tradeoffs, clear next step (not “Want me to dig deeper?”).
5. **Honest offline** — parks in poor cell service; cached content is labeled, online-only features say so.
6. **Apple-native feel** — Dynamic Type, 44pt targets, VoiceOver on icon-only controls, Reduce Motion respected.
7. **One primary green** — brand accent for CTAs and selected states; sync with web tokens (`#10b981` / `#059669`).

**iOS 26 / Liquid Glass (when targeting):** glass on **nav + tab bar + floating search only** — not on park cards or chat bubbles. Do not stack tab bar + bottom toolbar on the same screen.

Everything else — card shape, onboarding, compare layout, Trailie chat aesthetic — is **open for exploration**.

---

## User outcomes (what success looks like)

| Outcome | User feels… |
|---------|-------------|
| Open app from Pinterest link | “I’m on the right park instantly” |
| Scan alerts before booking flights | “I know what’s closed right now” |
| Compare 2 parks side-by-side | “I can decide without 10 browser tabs” |
| Ask Trailie for a 3-day itinerary | “This used real park context” |
| Save a park offline in the backcountry | “My saved list still works” |
| Return after signup | “My chat and saves came with me” |
| Read a blog post while researching | “I didn’t lose my place” |

**Primary funnel:** External link → **Park detail** → **Plan with Trailie** → **Account** (when saving or unlimited AI).

---

## Journey map (states, not screens)

High-level states the app must support. **How many screens, steps, or modals** each state uses is up to design.

```
[First open]
    → (optional) understand value / scope (470+ sites)
    → (optional) location or interest personalization
    → [Explore / active use] — no forced account

[Research loop]
    → search or browse parks (grid, map, discover taxonomy)
    → open park detail
    → scan alerts · weather · permits · fees
    → save ♡ · share · compare · plan with Trailie

[Decision loop]
    → pick 2–4 parks to compare
    → read live comparison (weather, fees, alerts, …)
    → shortlist winner → Trailie or save

[Planning loop]
    → chat with Trailie (anonymous or signed in)
    → refine itinerary over multiple turns
    → (auth) trip persists · chat history · share link

[Return loop]
    → saved parks · visited list · past trips
    → resume Trailie conversation
    → (v1.2) saved-park alert push

[Read loop — v1.2]
    → blog index → article in-app
    → guide → related parks / Trailie

[Account lifecycle]
    → guest · signed in · session expired
    → email verify · password reset

[Deep link entry]
    → Universal Link / custom scheme → correct tab or park
```

---

## Capability inventory

What the product **must be able to do**. Not *where* it lives in the UI.

### Discovery & search
- Browse **470+ parks** with search, state filter, national-parks-only toggle, sort
- Search by name, state, activity (`GET /api/parks`, `/parks/search`)
- Entry to **Discover** taxonomy: activities, types, states, topics (v1.1)
- Entry to **intent vibe** lists, e.g. families, dark sky, first-timers (v1.2)
- **Map** spatial browse with park pins, search, bottom-sheet preview

### Park detail (hero experience)
- Resolve URL slug or 4-char code → canonical park
- Hero image, name, state, designation
- Quick info: hours, fee, phone (tappable)
- **Alerts tab** with severity + badge when active (never hard-code closure copy in chrome)
- Lazy tabs: overview, places, activities, permits, camping, reviews, …
- Live weather with refresh timestamp
- Directions → **Apple Maps** handoff
- Related parks
- Actions: **Save**, **Share** (canonical URL), **Compare**, **Plan with Trailie**
- Deep link `?tab=alerts` opens correct tab

### Compare
- Select **2–4 parks** from explore, park detail, Trailie chip, or URL `?parks=yell,yose`
- Side-by-side live data table + AI summary
- Online only — clear message when offline
- CTA: plan with Trailie for winner

### Trailie (AI planning)
- Brand name **Trailie** in nav
- **Anonymous:** 5 messages / 48h (server-enforced); inline limit state + signup CTA
- **Authenticated:** unlimited; trips persist
- **Streaming** responses (SSE) with typing / thinking states
- Prefill from park (`park` + `name` params) or Universal Link
- On login within 48h: **migrate anonymous chat** → saved trip
- Voice: **v1.2+** — text-first in v1
- Suggested chips (e.g. “3 days in Zion”, “Compare YELL vs YOSE”)

### Collections (auth)
- Saved parks (optimistic save/unsave)
- Visited parks
- Trip list + trip detail + shared trip (read-only)
- Chat history (v1.1)

### Account & auth
- Guest path for full browse + anonymous Trailie
- Sign up · sign in · forgot password · reset password · verify email
- JWT in **Keychain** (not cookies)
- Session expiry → friendly re-auth
- Face ID (v1.1)

### Content (read — v1.2)
- Blog index (native list)
- Blog article (in-app WebView or native HTML — designer defines chrome: share, Safari, text size)
- Editorial guides (8) — native static or WebView
- Intent landings as **ranked park grids**, not long articles

### Events (v1.1)
- Ranger programs list with filters
- Register (auth required)
- Link from park detail; not a root tab

### Offline & connectivity
- Cache park list (daily refresh)
- Cache last **10** park details with `fetchedAt`
- Saved parks metadata offline when authed
- Compare + Trailie: online only + banner
- Global offline banner when no network

### Deep links & distribution
- Universal Links: `/parks/*`, `/plan-ai*`, `/compare*`, `/explore`, `/map*`, `/discover/*`
- Custom scheme: `trailverse://`
- Pinterest / SEO UTMs should land on park detail, not home

### Out of app (Safari or omit)
- `/admin/*`, `/chatgpt`, `/mcp` marketing pages

---

## Business rules (hard constraints)

These affect flow logic — design must accommodate them, but can present them creatively.

| Rule | Detail |
|------|--------|
| Free browse | No account for explore, map, park pages, compare |
| Anonymous Trailie | 5 messages / 48h per device; server enforces |
| Auth gates | Save park, visited, trips, unlimited AI, event register |
| Migrate chat | On login within 48h, anonymous session can become a trip |
| Live data | Alerts/weather from API — UI never invents closure text |
| Scope copy | “470+ parks & sites” — not “63 National Parks” only |
| Compare limit | 2–4 parks |
| Offline | Label cached data; block compare/Trailie gracefully |
| No paywall v1 | Basic park info is free |
| Persona | Always **Trailie**, never “Plan AI” |
| Voice | Not in v1.0 MVP |

**Permissions (request only when needed):**  
Location (map centering, optional), notifications (v1.2 saved-park alerts), camera/mic (voice v1.2+).

---

## Suggested journey threads (inspiration, not wireframes)

Pick, merge, or reinvent. None are mandatory step orders.

**Thread A — Pinterest arrival:** Universal Link → park detail (alerts visible) → Plan with Trailie → save prompts signup

**Thread B — Explorer:** Explore grid → filter by state → open 3 parks → Compare → Trailie for winner

**Thread C — Map-first:** Map pin tap → bottom sheet → View park → permits tab → book elsewhere (Recreation.gov link)

**Thread D — Planner:** Trailie tab → multi-turn itinerary → signup to keep trip → You → trips

**Thread E — Return visitor:** Sign in → You → saved parks → park detail → check fresh alerts

**Thread F — Content researcher (v1.2):** Blog article → inline link to park → park detail → Trailie

Native tab bar: **Home · Trips · Trailie · Map · Saved**. Home content switches to Today during an active trip; tab label stays **Home**. Stack pushes: park detail, compare, auth, trip detail.

---

## Areas wide open for design

Explicitly **not defined** — push creativity here:

- Tab bar visual treatment (floating pill vs standard; Trailie center emphasis)
- Explore: grid vs list default, filter chip design, empty search state
- Park detail: hero parallax, tab strip style, Trailie block placement
- How **alert severity** is shown (color + icon + text — never color-only)
- Compare: table vs cards vs scroll-sync columns
- Trailie: chat bubbles vs document stream vs hybrid cards for itineraries
- Map: full-bleed vs inset, sheet snap points, layer legend
- You: segmented saved/visited/trips vs separate screens
- Onboarding (0–3 cards max in v1.2) — or none at v1.0
- Login prompt sheet vs full-screen vs inline banner
- Streaks, celebrations, “park of the day” — optional delight
- Dark mode, illustration, motion, haptics
- How **confidence / live** pills look on weather and alerts
- Blog reader chrome and typography

---

## Anti-patterns to avoid

- Web header/footer pasted into mobile (use tabs + stacks)
- Glass-on-glass cards (illegible over photos)
- Tab bar + bottom toolbar + FAB competing on one screen
- Blocking account before any park value
- Static closure warnings not tied to live alerts API
- Generic AI voice (“I’d be happy to help you plan your adventure!”)
- Calorie-tracker density — this is **places**, not macros
- Describing app as “a WebView wrapper” (App Store §4.2 risk)
- “63 National Parks” when product covers 470+ sites
- Safari handoff for core research loop (park → plan → save)

---

## Design token starting points

Sync with web; refine in Figma.

| Token | Value | Usage |
|-------|-------|-------|
| `accentGreen` | `#10b981` | Links, highlights |
| `accentGreenDark` | `#059669` | Primary buttons, selected tab |
| `forestDark` | `#064e3b` | Hero scrim |
| `bgPrimaryLight` | `#FEFCF9` | Light background |
| `bgPrimaryDark` | `#0A0E0F` | Dark background |
| `errorRed` | `#ef4444` | Alerts, destructive |
| `warningOrange` | `#f59e0b` | Caution alerts |

**Type:** Geist preferred; fall back SF Pro. Use **Dynamic Type** text styles.  
**Spacing:** 8pt grid. **Radius:** cards 16pt, buttons 12pt, chips pill.  
**Icons:** SF Symbols primary (map Phosphor → SF mapping table in Figma).

Full web reference: `docs/DESIGN_SYSTEM.md`, `docs/TRAILVERSE_BRAND_GUIDELINES.md`.

---

## Figma deliverable checklist (v1.0 MVP)

Design for **iPhone 15 Pro**, light + dark. Name frames to match wiring keys below.

### P0 — Must ship for TestFlight

| # | Frame name (suggested) | States to cover |
|---|------------------------|-----------------|
| 1 | `Explore` | default, filtered, search results, loading, empty |
| 2 | `ParkDetail` | overview, **alerts active** (badge), offline cached |
| 3 | `Map` | default, pin selected, bottom sheet peek + half |
| 4 | `Trailie` | empty, streaming, anonymous limit, prefill from park |
| 5 | `Compare` | 2 parks, 4 parks, loading, offline blocked |
| 6 | `You` | guest, authed (saved / visited / trips segments) |
| 7 | `Login` | sign in, sign up, error |
| 8 | `LoginPrompt` | half-sheet for gated save/compare |
| 9 | `Offline` | banner + cached park detail |

### P1 — v1.1

| # | Frame | Notes |
|---|-------|-------|
| 10 | `DiscoverHub` | 4 dimensions preview |
| 11 | `DiscoverDetail` | activity/topic grid |
| 12 | `Events` | list + filters |
| 13 | `ChatHistory` | trip threads |
| 14 | `TripDetail` | itinerary view |

### P2 — v1.2

| # | Frame | Notes |
|---|-------|-------|
| 15 | `BlogIndex` | |
| 16 | `BlogArticle` | in-app browser chrome |
| 17 | `GuideDetail` | |
| 18 | `Onboarding` | ≤3 cards |
| 19 | `PushSettings` | saved-park alerts |

### Component library (shared)

`ParkCard` · `QuickInfoCard` · `AlertRow` · `TabStrip` · `TrailieBlock` · `WeatherStrip` · `CompareColumn` · `ChatBubble` · `OfflineBanner` · `LoginPromptSheet`

---

## Design → engineering wiring map

When Figma frames are ready, engineering wires them here. **Use frame names as route keys.**

| Figma frame | Code route | Hook / data source |
|-------------|------------|-------------------|
| `Home` | `Features/Home/` | `HomeViewModel` |
| `Explore` | `Features/Explore/` | `ParksRepository` |
| `Map` | `Features/Map/` | MapKit |
| `Trailie` | `Features/Trailie/` | `TrailieRepository` (SSE) |
| `Saved` | `Features/Saved/` | `UserRepository` |
| `ParkDetail` | `Features/ParkDetail/` | `ParksRepository` |
| `Compare` | `Features/Compare/` | `CompareRepository` |
| `Login` | `Features/Authentication/` | `AuthRepository` |
| `DiscoverHub` | TBD v1.1 | `discover.getCatalog` |
| `BlogIndex` | TBD v1.2 | `blog.getPublishedBlogs` |

**API reference (web/TS):** `packages/trailverse-api` — contract reference until OpenAPI → Swift codegen  
**iOS networking:** `ios/TrailVerse/Core/API/`  
**Persistence:** SwiftData in `ios/TrailVerse/Core/Persistence/`  
**Deep links:** `ios/TrailVerse/App/AppRouter.swift`

### Handoff format (preferred)

For each frame, provide:
1. **Figma link** + frame name
2. **Interactive prototype** link (if flows are non-obvious)
3. **Redlines:** spacing, type styles, colors (or Figma variables matching tokens above)
4. **All states:** loading, empty, error, offline, authed vs guest
5. **Copy doc** for Trailie chips, empty states, errors (brand voice)

Engineering replaces placeholder UI in the matching `app/` file — **no feature logic changes** unless spec requires new capability.

---

## Reference: current implementation (v0 engineering layout)

Treat as **fallback baseline**, not target experience.

```
Tabs: Home | Trips | Trailie | Map | Saved
Stack: ParkDetail · Compare · Authentication · TripDetail
```

- Native SwiftUI scaffold in `ios/` with design system tokens
- Universal Links: bundle `com.nationalparksexplorerusa.trailverse` + AASA on Vercel (`APPLE_TEAM_ID`)
- Journey 1 in progress: onboarding → explore → park → Trailie → save trip

**Next engineering:** complete Journey 1 · versioned `/api/mobile/v1` · TestFlight build.

---

## Phased design priority

| Phase | Design focus | Engineering status |
|-------|--------------|-------------------|
| **0** | Tokens, components, Explore + Park detail + Trailie | API + hooks done |
| **1 MVP** | Map sheet, Compare, You, Login, offline states | Placeholders done |
| **1.1** | Discover, Events, Chat history, Face ID | Not started |
| **1.2** | Blog, guides, onboarding, push settings | Not started |
| **2** | Widget, Live Activity, iPad | Optional |

**Design first if funnel matters:** Explore → Park detail → Trailie → Login prompt.

---

## For designers & AI reading this

**Do:** Invent screens, flows, and interactions that deliver the outcomes and capabilities above.  
**Don't:** Mirror the web desktop layout or this doc as a 1:1 wireframe list.  
**Ask:** What would make picking a national park feel exciting and decisive — not overwhelming?

**Park page anatomy reference:** `docs/pinterest-content-master-guide.md` (hero, quick info, Trailie block, tabs).  
**Voice reference:** sharp friend who’s been to the park — specific, honest, clear CTA.

---

*TrailVerse iOS Design Brief v0.1 · `com.nationalparksexplorerusa.trailverse`*
