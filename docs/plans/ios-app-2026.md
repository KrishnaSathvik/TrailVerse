---
title: TrailVerse iOS App — Design & Implementation Plan
status: draft
created: 2026-06-16
updated: 2026-06-16
scope: ios-native-app
platform: iOS (iPhone first; iPad adaptive later)
canonical_web: https://www.nationalparksexplorerusa.com
related_docs:
  - docs/TRAILVERSE_BRAND_GUIDELINES.md
  - docs/DESIGN_SYSTEM.md
  - docs/pinterest-content-master-guide.md
  - docs/plans/discover-page-2026-05.md
  - .cursor/rules/05-plan-ai-mcp-and-admin.mdc
  - .cursor/rules/07-frontend-services-layer.mdc
---

# TrailVerse iOS App — Design & Implementation Plan

> **Purpose:** Single reference for redesigning TrailVerse as a native iOS experience — product scope, information architecture, UI/UX specs, design tokens, API mapping, and phased delivery.  
> **Audience:** Design, iOS engineering, product.  
> **Principle:** Native shell for **planning** (discover → compare → plan → save). In-app **reading** (blog/guides) via hybrid viewer. Express API remains source of truth — no duplicate business logic.

---

## 1. Product positioning

### What TrailVerse iOS is

| TrailVerse IS | TrailVerse is NOT |
|---------------|-------------------|
| Discover → compare → plan hub for **470+ NPS sites** | Trail GPS / turn-by-turn (AllTrails) |
| Live **NPS alerts, weather, permits** on park pages | Full Recreation.gov checkout replacement |
| **Trailie** AI with live park context | Generic chatbot without tools |
| Free browse; account for saved trips & unlimited AI | Paywall on basic park info |
| Works **alongside** NPS App + Recreation.gov | “Official NPS app replacement” |

**Tagline (brand):** Your Universe of National Parks Exploration  
**App Store subtitle (draft):** Compare & plan 470+ parks with live alerts

**Primary funnel:** Pinterest / SEO → park detail (`/parks/{slug}`) → Plan with Trailie → account.

### Jobs the app must do well

1. **Research** — find and evaluate parks (explore, discover, compare)
2. **Decide** — live alerts, weather, fees, permits before booking elsewhere
3. **Plan** — Trailie itineraries; saved trips
4. **Return** — saved parks, visited list, chat history (auth)
5. **Read** — blog + guides in-app (hybrid); not a Safari handoff for core content

---

## 2. Design principles

### Apple Human Interface Guidelines (baseline)

| Principle | TrailVerse application |
|-----------|------------------------|
| **Clarity** | Park name, alert severity, and primary CTA visible without scrolling past hero |
| **Deference** | Chrome stays light; park photography and live data are the focus |
| **Depth** | Hero → quick info → Trailie block → tabs → inline cards (weather, directions) |
| **Consistency** | SF Symbols + one primary green; same save/compare/plan CTAs everywhere |
| **Feedback** | Skeleton loaders for live API; offline banner; pull-to-refresh on alerts |

**Non-negotiables** ([Apple Design Tips](https://developer.apple.com/design/tips/)):

- Touch targets **≥ 44×44 pt**
- Body text **≥ 17 pt** (Dynamic Type text styles)
- Contrast **≥ 4.5:1** (normal text) on scrims over photos
- **VoiceOver** labels on all icon-only controls
- Support **Reduce Motion** and **Reduce Transparency**

### iOS 26 / Liquid Glass (navigation layer)

When targeting iOS 26 SDK:

- **Liquid Glass** applies to **tab bar, nav bar, floating search** — not park cards or chat bubbles
- **Do not stack** tab bar + bottom toolbar on the same screen
- Tab bar: **floating pill**, inset from edges; selected tab tinted with brand green
- Content lists remain **opaque cards** on solid/material backgrounds — not glass-on-glass

Reference: [WWDC25 — Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)

### TrailVerse brand (content layer)

From `docs/TRAILVERSE_BRAND_GUIDELINES.md` and `docs/pinterest-content-master-guide.md`:

- **Voice:** Sharp friend who’s been to the park — specific viewpoints, honest downsides, clear CTA (not “Want me to plan more?”)
- **Persona name:** **Trailie** (never “Plan AI” in UI)
- **Scope copy:** “470+ parks & sites” (not only 63 National Parks)
- **Free to browse:** No account for explore, compare, park pages, discover

### Web → iOS translation rules

| Web pattern | iOS pattern |
|-------------|-------------|
| Top `Header` + More menu | **Bottom tab bar** + nav stack per tab |
| Sidebar on park detail (desktop) | **Inline cards** below hero on phone |
| Horizontal scroll tabs (park) | **Scrollable tab strip** (keep; proven on mobile web) |
| Profile 6-tab grid (mobile web) | **Sections inside You tab** (not 6 root tabs) |
| Glassmorphism cards | **Opaque / `.regularMaterial`** content cards |
| `VoiceButton` FAB bottom-right | **Toolbar mic** or trailing nav item — avoid fighting tab bar |
| Footer links (blog, guides) | **In-app** sections, not footer |

---

## 3. Information architecture

### Root navigation — 4 tabs (+ optional 5th)

**Default (recommended v1):**

```
┌─────────────────────────────────────────────────────────┐
│                    Content (nav stack)                   │
├─────────────────────────────────────────────────────────┤
│  Explore  │   Map   │  Trailie  │   You                 │
└─────────────────────────────────────────────────────────┘
```

| Tab | SF Symbol | Role |
|-----|-----------|------|
| **Explore** | `map` | Search, grid, discover entry, compare entry, blog/guides entry |
| **Map** | `location.fill` | Full-bleed map, bottom sheet park preview |
| **Trailie** | `sparkles` or compass | AI chat (center tab — brand emphasis) |
| **You** | `person.circle` | Auth, saved parks, visited, trips, settings |

**Optional 5th tab (v1.1+):** **Compare** — only if analytics show compare as top-level action. Otherwise compare stays in Explore + park detail.

**Explicitly NOT root tabs:** Saved (lives in You), Blog, Events, Discover (hub inside Explore), ChatGPT/MCP, Admin.

### Global flows (cross-tab)

```
                    ┌──────────────┐
                    │  Universal   │
                    │    Link      │
                    └──────┬───────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     ▼                     ▼                     ▼
 Park Detail          Trailie (prefill)      Compare
     │                     │                     │
     ├── Plan with Trailie ┘                     │
     ├── Compare with… ──────────────────────────┘
     ├── Save ♡ → You / Saved
     └── Related blog → Read (in-app)
```

### Screen inventory

#### P0 — MVP (v1.0)

| Screen | Web equivalent | Notes |
|--------|----------------|-------|
| Explore home | `/explore` | Search, filters, park grid |
| Park detail | `/parks/{slug}` | Hero, quick info, Trailie block, tabs |
| Trailie chat | `/plan-ai` | Anonymous + authed; stream |
| Map | `/map` | Pins, search, bottom sheet |
| You (guest) | — | Sign in CTA, settings, legal links |
| You (auth) | `/profile` (subset) | Saved, visited, trips, settings |
| Login / Sign up | `/login`, `/signup` | Keychain token; optional Face ID |
| Compare flow | `/compare` | Pick 2–4 parks → results (modal or push) |
| Offline empty | `/offline` | Cached parks message |

#### P1 — v1.1

| Screen | Web equivalent |
|--------|----------------|
| Discover hub | `/discover` |
| Discover detail | `/discover/activity/{slug}`, topic, type |
| Vibe list (subset) | `/parks-for-families`, etc. (3–4 highest-traffic) |
| Events list | `/events` |
| Chat history | `/chat-history` |
| Trip detail | `/plan-ai/{tripId}` |
| Shared trip (read-only) | `/plan-ai/shared/{shareId}` |

#### P2 — v1.2

| Screen | Web equivalent |
|--------|----------------|
| All 12 intent vibe landings | `intentLandings.js` routes |
| Blog index | `/blog` |
| Blog article | `/blog/{slug}` (hybrid viewer) |
| Guide detail | `/guides/{slug}` (native static or WebView) |
| Push notification settings | — |
| Onboarding (first launch) | — |

#### Out of app (Safari or omit)

| Surface | Reason |
|---------|--------|
| `/admin/*` | Internal CMS |
| `/chatgpt`, `/mcp` | Distribution marketing |
| Legal long-form if unmigrated | Optional Safari |

---

## 4. Screen specifications (UI/UX)

### 4.1 Explore

**Job:** Find parks; enter discover and compare; surface editorial content.

```
┌─────────────────────────────────────┐
│ Explore                    [Compare]│  ← nav bar; Compare = toolbar action
├─────────────────────────────────────┤
│ 🔍 Search parks, states, activities │  ← glass search field (iOS 26)
│ [National Parks only] [State ▾] [Sort]│  ← filter chips, horizontal scroll
├─────────────────────────────────────┤
│ Browse by activity          See all →│  ← Discover hub entry
│ [Hiking] [Camping] [Stargazing] …   │
├─────────────────────────────────────┤
│ From TrailVerse                     │  ← optional blog carousel (v1.2)
│ ┌─────┐ ┌─────┐                     │
│ │guide│ │guide│  →                    │
├─────────────────────────────────────┤
│ 470+ parks                          │
│ ┌───────────────────┐               │
│ │ [photo]           │               │  ← 1-column ParkCard
│ │ Yellowstone NP    │               │
│ │ Wyoming · ★ 4.8   │               │
│ └───────────────────┘               │
│ … pagination / infinite scroll      │
└─────────────────────────────────────┘
```

**UX rules:**

- Default sort: relevance or name (match web explore)
- Empty search → featured / tier-A parks
- Tap card → Park detail (push)
- Long-press card → quick actions: Save, Compare, Plan with Trailie
- Grid: **1 column** phone; 2 column iPad

**API:** `GET /api/parks`, `GET /api/parks/search`

---

### 4.2 Park detail

**Job:** #1 Pinterest destination; live planning context.

Reference anatomy: `docs/pinterest-content-master-guide.md` (Park detail section).

```
┌─────────────────────────────────────┐
│ ←                    ♡ saved   ↗  │
│ ┌─────────────────────────────────┐ │
│ │         HERO IMAGE              │ │
│ │  Yellowstone National Park      │ │
│ │  Wyoming                        │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Hours      │ Fee        │ Phone     │  ← 3-up quick info
├─────────────────────────────────────┤
│ Trailie · at a glance               │
│ Best time · Trip length · Don't miss│
│ [Plan with Trailie]  [Compare]      │
├─────────────────────────────────────┤
│ Overview Alerts Places Permits …    │  ← scrollable tabs; badge on Alerts
├─────────────────────────────────────┤
│ (tab content — lazy loaded)         │
├─────────────────────────────────────┤
│ Weather · 5-day          Live ↻     │
│ Directions → Apple Maps             │
│ Related parks (horizontal)          │
└─────────────────────────────────────┘
```

**Tab priority (mobile):**

| Tab | ID | Load |
|-----|-----|------|
| Overview | `overview` | SSR bundle / details API |
| Alerts | `alerts` | **High priority** — badge count |
| What to See | `places` | Lazy |
| Things to Do | `activities` | Lazy |
| Permits | `permits` | Lazy — strong for timed-entry parks |
| Reviews | `reviews` | Lazy |
| Camping | `camping` | Lazy |

**UX rules:**

- Alerts tab: red/orange badge when count > 0; never hard-code closure text in UI chrome
- “Live” pill on weather (refreshed timestamp)
- Share → `UIActivityViewController` with canonical URL
- Save ♡ → optimistic UI; login prompt if guest
- **Plan with Trailie** → Trailie tab with `park` + `name` prefill
- **Compare** → Compare flow with this park pre-selected
- Deep link: `?tab=alerts` opens on Alerts

**API:** `GET /api/parks/:code/details`, weather, alerts, permits, reviews sub-routes

---

### 4.3 Map

**Job:** Spatial discovery; hand off to park detail.

Reference: `next-frontend/src/app/map/MobileMapLayout.jsx`

```
┌─────────────────────────────────────┐
│ [Legend ▾]                          │
│ 🔍 Search parks…                    │  ← floating top cluster
│                                     │
│           MAP (full bleed)          │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ [thumb] Yellowstone NP          │ │  ← bottom sheet (snap: peek / half)
│ │ Wyoming · ★ 4.8                 │ │
│ │ [View park] [Directions]        │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**UX rules:**

- Safe area on sheet actions (`pb: max(12pt, safe-area-inset-bottom)`)
- Directions → **Apple Maps** (`MKMapItem`) by default; optional Google Maps SDK later
- Toggle layers: places, campgrounds (match web legend)
- Tab bar remains visible OR map extends under tab bar with sheet above tab bar — **pick one**; do not stack sheet + tab bar + FAB

**API:** parks list, map places/campgrounds hooks

---

### 4.4 Trailie

**Job:** AI trip planning with live context.

```
┌─────────────────────────────────────┐
│ Trailie                    [New]  │
├─────────────────────────────────────┤
│                                     │
│  (message bubbles)                  │
│                                     │
│  Suggested chips:                   │
│  [3 days in Zion] [Compare YELL/YOSE]│
│                                     │
├─────────────────────────────────────┤
│ Message…                    [Send]  │  ← keyboard + safe area
└─────────────────────────────────────┘
```

**UX rules:**

- Brand: **Trailie** in nav title
- Anonymous: 5 messages / 48h — inline banner + sign-up CTA (match web)
- On login: `POST /api/auth/migrate-chat`
- Streaming responses (SSE) with typing indicator
- Prefill from park detail or Universal Link `?park=&name=`
- Voice: **v1.2+** — mic in toolbar; text-first for v1
- Completion sound optional (match web `useTrailieCompletionSound`)

**API:** `POST /api/ai/chat-anonymous`, `/chat-anonymous-stream`, `/api/ai/chat`, `/chat-stream`

---

### 4.5 Compare

**Job:** Side-by-side decision support (native differentiator).

**Entry points:**

- Explore toolbar “Compare”
- Park detail “Compare”
- Trailie suggested chip
- Universal Link `/compare?parks=yell,yose`

```
┌─────────────────────────────────────┐
│ ← Compare parks                     │
├─────────────────────────────────────┤
│ [Yellowstone ×] [Yosemite ×] [+ Add]│  ← 2–4 park chips
├─────────────────────────────────────┤
│         │ Yellowstone │ Yosemite    │
│ Weather │ …           │ …           │
│ Fees    │ …           │ …           │
│ Alerts  │ 2 active    │ 0           │
│ …       │               │           │
├─────────────────────────────────────┤
│ [Plan with Trailie for winner]      │
└─────────────────────────────────────┘
```

**API:** `POST /api/parks/compare`, `/compare/summary`

---

### 4.6 Discover (inside Explore)

**Job:** NPS-dimensional browse without duplicating full web taxonomy in v1.

**v1.1 scope:**

- Discover hub: 4 dimensions — Activities, Types, States, Topics
- Detail page per slug: intro + park grid (simplified vs web — skip thingstodo carousel in v1.1 if needed)
- States → link to state park list (native or web)

Reference: `docs/plans/discover-page-2026-05.md`

**v1.2:** Intent vibe pages (`/parks-for-families`, etc.) as native ranked grids via `GET /api/parks/search?q=&pinned=`

---

### 4.7 You

**Job:** Account, collections, settings.

```
┌─────────────────────────────────────┐
│ You                          [Edit] │
├─────────────────────────────────────┤
│ [Avatar]  Name                      │
│           member since …            │
├─────────────────────────────────────┤
│ Saved │ Visited │ Trips             │  ← segmented control
├─────────────────────────────────────┤
│ (list content)                      │
├─────────────────────────────────────┤
│ Chat history                        │
│ Events                              │  → v1.1 native list
│ Blog & guides                       │  → v1.2 in-app reader
│ Settings                            │
│ Sign out                            │
└─────────────────────────────────────┘
```

**Guest state:** Sign in / Create account hero; limited settings (theme, legal).

**API:** `userService`, `favoriteService`, `tripService`, `/api/auth/me`

---

### 4.8 Read — Blog & guides (in-app)

**Job:** Trip research without leaving the app.

**Approach (hybrid — recommended):**

| Surface | v1.2 implementation |
|---------|----------------------|
| Blog index | **Native** list — `GET /api/blogs?status=published` |
| Blog article | **In-app WebView** (authenticated cookies/token injection) OR WKWebView to canonical URL |
| Guide detail (8 editorial) | **Native static** screens from `guides.js` copy OR WebView |
| Intent landings | **Native grid** (planning, not reading) |

**UX rules:**

- Toolbar: Share, Safari (open canonical URL), text size (if native renderer added later)
- Respect dark mode via web theme cookie or `prefers-color-scheme` injection
- Related links at bottom → park detail or Trailie (in-app navigation)

**Why in-app:** Single research flow; auth for likes/favorites; brand continuity. Safari is fallback only for unmigrated pages.

---

### 4.9 Events (v1.1)

**Job:** Ranger programs when planning or on trip.

- **v1.0:** Row on park detail + “All events” link (Safari acceptable temporarily)
- **v1.1:** Native list with filters (date, state, park); register requires auth
- **Not a root tab**

**API:** `GET /api/events`, register `POST .../register`

---

## 5. Design tokens (iOS)

Create `TrailVerseDesignTokens` (Swift) or `theme/tokens.ts` (Expo).

| Token | Hex / value | Usage |
|-------|-------------|-------|
| `accentGreen` | `#10b981` | Brand primary, links |
| `accentGreenDark` | `#059669` | Buttons, selected tab, PWA theme |
| `forestDark` | `#064e3b` | Hero scrim, dark headers |
| `bgPrimaryDark` | `#0A0E0F` | Dark mode background |
| `bgPrimaryLight` | `#FEFCF9` | Light mode background |
| `errorRed` | `#ef4444` | Alerts, destructive |
| `warningOrange` | `#f59e0b` | Caution alerts |

**Typography:**

| Style | Font | Size (Large DT) |
|-------|------|-----------------|
| Large title | Geist Bold or SF Pro Display | 34 pt |
| Title 2 | Geist Semibold | 22 pt |
| Headline | Geist Medium | 17 pt semibold |
| Body | Geist / SF Pro Text | 17 pt |
| Caption | SF Pro Text | 12 pt |

Use **Dynamic Type text styles** — test at AX3 minimum.

**Spacing:** 8 pt grid (4, 8, 12, 16, 24, 32).

**Radius:** Cards 16 pt; buttons 12 pt; chips 999 pt (pill).

**Icons:** SF Symbols primary; map Phosphor → SF Symbol table in Figma.

**App icon:** Compass mark on `#059669` / `#064e3b` — extend from `apple-touch-icon.png`.

---

## 6. Components library (native)

| Component | Spec |
|-----------|------|
| `ParkCard` | Image 16:9, title, state, rating, ♡ |
| `QuickInfoCard` | Icon + label + value; tap phone → tel, fee → detail |
| `AlertRow` | Severity color + title + date; never color-only |
| `TabStrip` | Horizontal scroll; badge on Alerts/Permits |
| `TrailieBlock` | Editorial snapshot + dual CTA |
| `WeatherStrip` | 5-day horizontal; “Updated …” |
| `CompareColumn` | Sticky header row + scroll sync |
| `ChatBubble` | User trailing green; assistant leading surface |
| `OfflineBanner` | Top inset banner; cached timestamp |
| `LoginPromptSheet` | Half sheet for gated actions |

---

## 7. Technical architecture

### Stack recommendation

| Layer | Choice | Rationale |
|-------|--------|-----------|
| App | **Expo (React Native)** + Expo Router | Team knows React; Android later; API-heavy app |
| API client | `packages/trailverse-api` (TS) | Port from `next-frontend/src/services/` |
| Auth token | **Keychain** | Not cookies |
| Maps v1 | **MapKit** | No extra key; Apple Maps handoff |
| Maps v2 | Google Maps SDK | Parity with web if needed |
| Realtime | `socket.io-client` | Favorites, optional live updates |
| Blog article | `react-native-webview` | TipTap HTML fidelity |

**Alternative:** SwiftUI if iOS-only and widgets/Live Activities are day-one requirements.

### Backend (minimal new work)

| Addition | Purpose |
|----------|---------|
| `X-TrailVerse-Client: ios` header | Analytics |
| `POST /api/users/devices` | APNs tokens (v1.2) |
| Existing JWT auth | No change |

**Do not duplicate:** MCP server pattern — thin client, fat Express API.

### Service mapping

| Web service | iOS module |
|-------------|------------|
| `authService.js` | `auth.ts` + Keychain |
| `npsApi.js`, `enhancedParkService.js` | `parks.ts` |
| `aiService.js` | `ai.ts` |
| `tripService.js` | `trips.ts` |
| `favoriteService.js`, `userService.js` | `user.ts` |
| `blogService.js` | `blog.ts` |
| `eventService.js` | `events.ts` |
| Discover | `discover.ts` via `/api/discover/*` |

---

## 8. Universal Links & deep links

Host `apple-app-site-association` on production (no redirect, `Content-Type: application/json`).

**Register paths (app opens):**

```
/parks/*
/plan-ai*
/compare*
/explore
/map*
/discover/*
/parks-for-*          # as native screens ship
/dog-friendly-parks
/... (other intent slugs per rollout)
```

**Web-only (omit from AASA or fall through to Safari):**

```
/blog/*               # until in-app reader ships — then add
/admin/*
/chatgpt
/mcp
```

**Examples:**

| URL | Destination |
|-----|---------------|
| `/parks/yellowstone-national-park?tab=alerts` | ParkDetail(slug, tab: .alerts) |
| `/plan-ai?park=yell&name=Yellowstone%20…` | Trailie(prefill) |
| `/compare?parks=yell,yose` | Compare(codes) |
| `/discover/activity/hiking` | DiscoverDetail |

Dev: `applinks:nationalparksexplorerusa.com?mode=developer`

Reference: [Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)

---

## 9. Offline & connectivity

Park connectivity is often poor — design honestly.

| Data | Strategy |
|------|----------|
| Park list | Cache on launch; SWR daily |
| Last 10 park details | Disk cache with `fetchedAt` |
| Saved parks (auth) | Full metadata offline |
| Compare / Trailie | Online only + clear banner |
| Blog (saved) | v2 — cache HTML for saved articles |

Show **“Last updated …”** on alerts/weather when stale.

---

## 10. App Store & review (§4.2)

App must exceed “repackaged website.” Ship:

- Native tab shell + navigation stacks
- Keychain auth + **Face ID** (v1.1)
- Offline cache for saved/viewed parks
- Universal Links
- Compare + Trailie as native flows
- Push (v1.2) for saved-park alerts

**Review notes template:** List native APIs (Keychain, Face ID, APNs, MapKit, Universal Links). Do not describe app as WebView wrapper.

---

## 11. Phased delivery

### Phase 0 — Design & infra (2–3 weeks)

- [ ] Figma: 12 core screens + component library + light/dark
- [ ] SF Symbol / Phosphor mapping table
- [x] `apple-app-site-association` on Vercel (route handlers + `APPLE_TEAM_ID` env)
- [x] `packages/trailverse-api` scaffold from Swagger
- [x] Expo project `mobile/` with theme tokens

### Phase 1 — MVP v1.0 (8–10 weeks)

- [ ] 4 tabs + navigation
- [ ] Explore + park detail (core tabs)
- [ ] Trailie chat (anonymous + auth)
- [x] Map + bottom sheet (MapKit pins; design polish TBD)
- [ ] You: auth, saved, visited, settings
- [ ] Compare flow (from explore + park detail)
- [x] Universal Links routes (AASA deployed; needs `APPLE_TEAM_ID` on Vercel)
- [ ] TestFlight internal

### Phase 2 — v1.1 (4–6 weeks)

- [ ] Discover hub + detail (simplified)
- [ ] Events list
- [ ] Chat history + trip list
- [ ] Face ID
- [ ] 2–3 vibe intent pages
- [ ] App Store submission

### Phase 3 — v1.2 (4–6 weeks)

- [ ] Blog index + in-app article viewer
- [ ] Guides (native or WebView)
- [ ] Remaining intent landings
- [ ] Push notifications (saved park alerts)
- [ ] Voice Trailie (evaluate WebRTC)

### Phase 4 — Apple differentiation (optional)

- [ ] Home screen widget — Park of the Day
- [ ] Live Activity — trip day
- [ ] Siri Shortcut — “Ask Trailie about {park}”
- [ ] iPad adaptive layouts

---

## 12. Success metrics

| Metric | Target |
|--------|--------|
| Universal Link open rate (Pinterest UTMs) | Track vs Safari |
| Park detail → Plan with Trailie | Conversion |
| Compare flow completion | ≥ web mobile |
| D1 / D7 retention (auth users) | Baseline post-launch |
| App Store rating | ≥ 4.5 |
| §4.2 first-submission pass | No minimum-functionality rejection |

---

## 13. Open decisions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | 5th tab for Compare? | Yes / No | No for v1; toolbar entry |
| 2 | Expo vs SwiftUI | RN / Native | Expo unless widgets day-one |
| 3 | Blog article renderer | WebView / native HTML | WebView v1.2 |
| 4 | Map provider | MapKit / Google | MapKit v1 |
| 5 | Voice in v1? | Yes / No | No — text Trailie first |
| 6 | iPad v1? | Yes / No | iPhone first; adaptive later |

---

## 14. Related internal files

| File | Use |
|------|-----|
| `docs/TRAILVERSE_BRAND_GUIDELINES.md` | Colors, voice, logo |
| `docs/DESIGN_SYSTEM.md` | Web tokens (sync greens) |
| `docs/pinterest-content-master-guide.md` | Park page anatomy, URLs |
| `docs/DESIGN_PATTERNS_OVERVIEW.md` | Card/glass patterns (adapt for iOS) |
| `next-frontend/src/app/map/MobileMapLayout.jsx` | Map UX reference |
| `next-frontend/public/manifest.json` | PWA shortcut priorities |
| `next-frontend/src/data/guides.js` | Editorial + app positioning copy |
| `next-frontend/src/data/intentLandings.js` | Vibe page configs |
| `.cursor/rules/07-frontend-services-layer.mdc` | API service map |

---

## 15. Figma deliverable checklist

Screens to design (iPhone 15 Pro, light + dark):

1. Explore (default + filtered)
2. Park detail (overview + alerts active)
3. Map + bottom sheet
4. Trailie (empty + conversation + anonymous limit)
5. Compare (2 parks)
6. Discover hub + activity detail
7. You (guest + authed saved list)
8. Login / sign up
9. Blog index + article (in-app browser chrome)
10. Events list
11. Offline state
12. Onboarding (3 cards max)

---

*TrailVerse iOS Plan v0.1 — draft for design kickoff. Update `status` to `in-progress` when Figma/expo scaffold starts.*
