# TrailVerse — Page Architecture & Flow Diagrams

**Product:** [nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)  
**Stack:** Next.js 16 App Router (Vercel) · Express API (Render) · MongoDB · NPS API · OpenAI/Anthropic  
**Scope:** Explore · Park Detail · Trailie (`/plan-ai`) · Events · Compare · Discover  

This document maps how each major surface is wired: routes, components, APIs, SSR vs client fetching, and primary user flows.

---

## Table of contents

1. [Platform overview](#1-platform-overview)
2. [Explore (`/explore`)](#2-explore-explore)
3. [Park detail (`/parks/[slug]`)](#3-park-detail-parksslug)
4. [Trailie (`/plan-ai`)](#4-trailie-plan-ai)
5. [Events (`/events`)](#5-events-events)
6. [Compare (`/compare`)](#6-compare-compare)
7. [Discover (`/discover`)](#7-discover-discover)
8. [Cross-page patterns](#8-cross-page-patterns)

---

## 1. Platform overview

### 1.1 System context

```mermaid
flowchart TB
  subgraph Client["Browser"]
    UI["Next.js App Router<br/>React 19 + TanStack Query"]
    PWA["Serwist PWA"]
    LS["localStorage<br/>anonymous session, saved events"]
  end

  subgraph Vercel["Vercel (Frontend)"]
    Pages["~65 page.jsx routes"]
    Proxy["Rewrites /api/* → backend"]
    ISR["ISR / revalidate<br/>parks, discover, explore"]
  end

  subgraph Render["Render (Backend)"]
    API["Express :5001<br/>32 route modules"]
    AI["routes/ai.js<br/>prepareChatContext + SSE"]
    MW["Auth JWT · rate limits · MCP bypass"]
  end

  subgraph Data["Data & external APIs"]
    Mongo["MongoDB<br/>users, trips, blogs, events"]
    NPS["NPS API<br/>parks, alerts, programs"]
    OW["OpenWeather"]
    LLM["OpenAI + Anthropic"]
    GMaps["Google Maps<br/>server proxy"]
  end

  UI --> Pages
  Pages --> Proxy
  Proxy --> API
  API --> Mongo
  API --> NPS
  API --> OW
  API --> LLM
  API --> GMaps
  UI --> LS
  UI --> PWA
```

### 1.2 Request path (all pages)

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Next.js (Vercel)
  participant E as Express API
  participant X as External (NPS, Mongo, AI)

  B->>N: GET /parks/yellowstone-national-park
  Note over N: SSR page.jsx fetches /api/*
  N->>E: GET /api/parks/.../details
  E->>X: NPS + RIDB + cache
  X-->>E: park payload
  E-->>N: JSON
  N-->>B: HTML + initialData → Client hydrates

  B->>N: Client tab click ?tab=activities
  N->>E: GET /api/parks/yell/activities
  E-->>B: tab JSON (via rewrite)
```

### 1.3 Shared frontend layers

| Layer | Location | Role |
|-------|----------|------|
| App routes | `next-frontend/src/app/**/page.jsx` | SSR metadata, initial fetch, thin server shell |
| Client pages | `*Client.jsx`, `*PageClient.jsx` | Interactivity, React Query, filters |
| Services | `next-frontend/src/services/*.js` | API clients (`npsApi`, `aiService`, `eventService`) |
| Hooks | `next-frontend/src/hooks/*.js` | Data fetching, auth, prefetch |
| SEO | `next-frontend/src/lib/seo.js`, `parkSeo.js` | Canonical, robots, JSON-LD helpers |
| Park slugs | `src/data/park-slugs.json` | Prebuild from `scripts/generate-park-slugs.mjs` |
| Proxy | `next.config.mjs` | `/api/*` → `localhost:5001` (dev) / Render (prod) |

---

## 2. Explore (`/explore`)

**Purpose:** Paginated grid of all NPS parks/sites with search, state filters, and sort — primary “browse everything” entry.

### 2.1 Route map

| File | Role |
|------|------|
| `app/explore/page.jsx` | SSR: first page of parks + `generateMetadata` |
| `app/explore/layout.jsx` | Static SEO + `CollectionPage` JSON-LD |
| `app/explore/ExplorePageClient.jsx` | Grid/list, filters, pagination, search |

### 2.2 Architecture

```mermaid
flowchart TB
  subgraph SSR["Server (page.jsx)"]
    M["generateMetadata<br/>canonical /explore<br/>?page= → noindex"]
    F1["GET /api/parks?page=1&limit=12&nationalParksOnly=true"]
    F2["GET /api/parks?all=true"]
    SEO["ExploreSeoShell<br/>crawlable H1 + nav"]
  end

  subgraph Client["ExplorePageClient"]
    QP["useSearchParams → ?page= ?search="]
    DP["Dual fetch strategy"]
    PG["useParks — paginated API"]
    ALL["useAllParks — full catalog + IndexedDB"]
    SRCH["npsApi.searchParks — debounced 300ms"]
    FILT["Client filter/sort/paginate"]
    CARD["ParkCard → /parks/{slug}"]
  end

  SSR --> Client
  DP -->|default: national parks only| PG
  DP -->|filters / all sites / sort by state| ALL
  DP -->|search ≥2 chars| SRCH
  ALL --> FILT
  PG --> CARD
  SRCH --> CARD
  FILT --> CARD
```

### 2.3 User flow

```mermaid
flowchart LR
  A[Land /explore] --> B[SSR: 12 national parks]
  B --> C{User action}
  C -->|Toggle All sites| D[Load 470+ catalog]
  C -->|Filter by state| D
  C -->|Search name| E[GET /parks/search]
  C -->|Paginate| F["?page=2"]
  C -->|Click card| G["/parks/{slug}"]
  C -->|CTA| H["/discover or /plan-ai"]
```

### 2.4 API endpoints

| Endpoint | When |
|----------|------|
| `GET /api/parks?page=&limit=&nationalParksOnly=` | Default grid + pagination |
| `GET /api/parks?all=true` | Full catalog (filters, “all sites”) |
| `GET /api/parks/search?q=&state=` | Debounced search |
| `GET /api/reviews/ratings` | Star ratings on cards |

**Backend:** `parkController.getAllParks`, `parkSearchService.executeParkSearch` · `server/src/routes/parks.js`  
**ISR:** `revalidate: 86400` (24h) on SSR fetches

---

## 3. Park detail (`/parks/[slug]`)

**Purpose:** Canonical park page — hero, live data, 16+ tabs with lazy-loaded NPS content, reviews, planning CTAs.

### 3.1 Route map

| File | Role |
|------|------|
| `app/parks/[parkCode]/page.jsx` | SSR, slug resolution, redirects, JSON-LD |
| `app/parks/[parkCode]/ParkDetailClient.jsx` | Tabs, sidebar, auth actions (~3.4k lines) |
| `app/parks/[parkCode]/activity/[id]/page.jsx` | Single activity deep link |
| `lib/parkApi.js` | Server fetch helpers |
| `lib/parkTabEndpoints.js` | Tab → API path mapping |
| `hooks/useParkTabData.js` | `useParkExploreIndex`, `useParkExploreTabBundle` |

### 3.2 URL & slug resolution

```mermaid
flowchart TD
  URL["/parks/{parkCode}"] --> LEN{length > 4?}
  LEN -->|Yes| SLUG["slug → park-slugs.json → NPS code"]
  LEN -->|No| CODE["4-char code e.g. yell"]
  CODE --> REDIR["308 → /parks/yellowstone-national-park"]
  SLUG --> TYPO["findCorrectSlug() typo fix"]
  TYPO --> SSR["SSR fetch details + planning"]
```

### 3.3 Three-tier data loading

```mermaid
flowchart TB
  subgraph Tier1["Tier 1 — SSR (page.jsx)"]
    D["GET /parks/:code/details<br/>park + alerts + permits"]
    P["GET /parks/:code/planning<br/>snapshot + FAQ"]
    R["Related parks same state"]
    LD["JSON-LD NationalPark + BreadcrumbList"]
    SR["ParkSeoOverview sr-only crawl block"]
  end

  subgraph Tier2["Tier 2 — Client index"]
    I["GET /parks/:code/explore-index<br/>tab counts only"]
    V["filterVisibleExploreTabs()<br/>hide empty tabs"]
  end

  subgraph Tier3["Tier 3 — Lazy per tab"]
    T["GET /parks/:code/{endpoint}<br/>only active ?tab="]
    E1["activities · places · tours"]
    E2["campgrounds · parking · facilities"]
    E3["gallery · videos · webcams · transit"]
  end

  subgraph Eager["Eager client (badges)"]
    PR["GET /reviews/:code"]
    PM["GET /permits if SSR missed"]
    WX["OpenWeather direct"]
  end

  Tier1 --> Tier2
  Tier2 --> Tier3
  Tier1 --> Eager
```

### 3.4 Tab model

| Tab ID | Label | Load |
|--------|-------|------|
| `overview` | Overview | SSR park object |
| `alerts` | Alerts | SSR |
| `permits` | Permits | SSR + eager refetch |
| `places` | What to See | Lazy |
| `activities` | Things to Do | Lazy |
| `tours` | Self-Guided Tours | Lazy |
| `visitorcenters` | Visitor Centers | Lazy |
| `camping` | Where to Stay | Lazy |
| `parking` | Parking & Access | Lazy |
| `facilities` | Amenities | Lazy |
| `transit` | Transit | Lazy (GTFS parks only) |
| `brochures` | Brochures | Lazy |
| `photos` | Photos | Lazy |
| `videos` | Videos | Lazy |
| `webcams` | Webcams | Lazy |
| `reviews` | Reviews | Lazy on first visit |

Tab state: `?tab=` via `router.replace` (no full navigation). Tab variants: **noindex**, canonical = base park URL.

### 3.5 User flow

```mermaid
flowchart TD
  A[Arrive /parks/yellowstone-national-park] --> B[SSR hero + alerts + JSON-LD]
  B --> C[Client: explore-index]
  C --> D[Show visible tabs]
  D --> E{User picks tab}
  E --> F[Fetch tab endpoint once]
  F --> G[Render tab content]
  B --> H[Sidebar: weather, map, nearby, crowd]
  G --> I{CTA}
  I --> J["/plan-ai?park="]
  I --> K["/compare?park="]
  I --> L["/parks/state/utah"]
  I --> M[Mark visited / Favorite]
```

**Backend:** `parkController`, `parkExploreIndexService`, `npsService`, `ridbService`, `parkPlanningService` · `server/src/routes/parks.js`  
**Revalidate:** 3600s (1h) · **Sitemap:** all park slugs

---

## 4. Trailie (`/plan-ai`)

**Purpose:** AI trip planner — anonymous or authenticated chat, SSE streaming, discovery vs day-by-day itinerary, trip persistence.

### 4.1 Route map

| Route | File |
|-------|------|
| `/plan-ai` | `app/plan-ai/page.jsx` → `PlanAIContent.jsx` |
| `/plan-ai/[tripId]` | Existing trip chat |
| `/plan-ai/[tripId]/plan` | `PlanWorkspace` itinerary editor |
| `/plan-ai/shared/[shareId]` | Public shared trip (noindex) |
| `/plan-ai/guest/[anonymousId]` | Guest session resume link |

**Core components:** `TripPlannerChat.jsx`, `PlanAIShell.jsx`, `MessageBubble.jsx`, `DiscoveryPlanCta.jsx`, `QuickFillModal.jsx`  
**Orchestration:** `hooks/usePlanAI.js` (URL: `?park=`, `?ask=`, `?personalized=`)  
**API client:** `services/aiService.js` (SSE: `chunk` → `stream_end` → `done`)

### 4.2 Chat architecture

```mermaid
flowchart TB
  subgraph UI["TripPlannerChat"]
    IN["ChatInput / SuggestedPrompts"]
    MB["MessageBubble<br/>markdown + park images"]
    CTA["DiscoveryPlanCta<br/>after discovery only"]
    LIM["GuestLimitFooter<br/>5 msg / 48h"]
  end

  subgraph Auth["Mode"]
    G["Guest: anonymousId in localStorage"]
    A["Authed: JWT cookie + TripPlan"]
  end

  subgraph SSE["Streaming path"]
    S1["POST /api/ai/chat-anonymous-stream"]
    S2["POST /api/ai/chat-stream"]
    CH["thinking → chunk → stream_end → done"]
    PP["processAssistantResponse<br/>itinerary JSON extract"]
  end

  IN --> Auth
  Auth -->|guest| S1
  Auth -->|user| S2
  S1 --> CH
  S2 --> CH
  CH --> MB
  CH --> PP
  PP --> CTA
```

### 4.3 Backend: discovery vs itinerary

```mermaid
flowchart TD
  MSG["User message"] --> CTX["prepareChatContext()"]

  CTX --> Q{Intent?}

  Q -->|Open-ended discovery<br/>e.g. weekend hiking from Denver| D1["openEndedDiscovery = true"]
  D1 --> D2["executeParkSearch → ranked parks block"]
  D2 --> D3["Prompt: recommend 2–4 parks<br/>NO ITINERARY_JSON"]
  D3 --> D4["showDayByDayPlanCta on done"]

  Q -->|Explicit plan<br/>plan 3-day Yellowstone| I1["shouldRequestItineraryJson()"]
  I1 --> I2{assessItineraryReadiness}
  I2 -->|missing dates/group| I3["Ask clarifying questions"]
  I2 -->|ready| I4["CRITICAL: include ITINERARY_JSON"]
  I4 --> I5["enrich driving times · save TripPlan"]

  Q -->|CTA clicked| INT["dayByDayPlanIntake metadata"]
  INT --> I3

  D4 -->|User clicks CTA| INT
```

### 4.4 Auth & session flows

```mermaid
stateDiagram-v2
  [*] --> GuestChat: land /plan-ai
  GuestChat --> Streaming: chat-anonymous-stream
  Streaming --> GuestChat: reply
  GuestChat --> LimitHit: 5 user messages
  LimitHit --> Signup: conversion CTA
  Signup --> Migrate: POST /api/auth/migrate-chat
  Migrate --> TripChat: /plan-ai/{tripId}
  TripChat --> StreamingAuth: chat-stream
  StreamingAuth --> TripSaved: auto-save itinerary

  GuestChat --> GuestLink: /plan-ai/guest/{id}
  GuestLink --> GuestChat: restore session
```

| Mode | Limit | Persistence |
|------|-------|-------------|
| Guest | 5 user msgs / 48h | `AnonymousSession` (Mongo) + localStorage |
| Authed | Token limits | `TripPlan` model, chat history |
| Voice | Separate | `VoiceButton` global FAB (hidden on `/plan-ai`); OpenAI Realtime |

**Key endpoints:** `POST /api/ai/chat-stream`, `chat-anonymous-stream`, `GET /api/ai/session-status/:id`, `POST /api/auth/migrate-chat`, `GET|PUT /api/trips/:tripId`

---

## 5. Events (`/events`)

**Purpose:** Browse NPS ranger programs + TrailVerse custom events; filter by month, category, search; local bookmarks.

### 5.1 Route map

| File | Role |
|------|------|
| `app/events/page.jsx` | SSR: current month events + summary |
| `app/events/EventsPageClient.jsx` | Filters, grid/list, pagination |
| `app/events/layout.jsx` | SEO + JSON-LD |
| `lib/eventsApi.js` | `getEventsServer()` |
| `services/eventService.js` | Client fetch (24h cache) |

### 5.2 Architecture

```mermaid
flowchart TB
  subgraph SSR["page.jsx"]
    R["revalidate ISR"]
    E["GET /api/events?upcoming&dateStart&dateEnd&limit=150"]
    S["GET /api/events?summary=true"]
  end

  subgraph API["eventController"]
    NPS["npsService.getAllEvents()"]
    DB["Event model MongoDB"]
    MERGE["Merge + normalize + filter"]
  end

  subgraph Client["EventsPageClient"]
    M["Month picker → refetch"]
    F["Client filter: search, category"]
    P["Pagination 12/page"]
    SV["useSavedEvents → localStorage"]
    CARD["EventCard / EventListItem"]
  end

  SSR --> API
  NPS --> MERGE
  DB --> MERGE
  MERGE --> Client
  M --> API
```

### 5.3 User flow

```mermaid
flowchart LR
  A[Land /events] --> B[SSR: this month's events]
  B --> C[Grid or list view]
  C --> D{Action}
  D -->|Change month| E[Refetch /api/events]
  D -->|Search / category| F[Client filter]
  D -->|Save heart| G[localStorage only]
  D -->|Register custom event| H[Login → POST /events/:id/register]
```

**Auth:** Browse = public · Save = localStorage · Register = `protect` JWT · Admin CMS = `admin` role

---

## 6. Compare (`/compare`)

**Purpose:** Side-by-side comparison of 2–4 parks — weather, crowd, facilities, parking, activities; shareable URLs and preset SEO landings.

### 6.1 Route map

| Route | File |
|-------|------|
| `/compare` | `app/compare/page.jsx` + `ComparePageClient.jsx` |
| `/compare/[slug]` | Preset landings e.g. `zion-vs-bryce` from `data/compareLandings.js` |
| `CompareUrlHydration.jsx` | Client `?parks=` fallback |
| `CompareLandingSeo.jsx` | Preset hero copy |

### 6.2 Architecture

```mermaid
flowchart TB
  subgraph SSR["Server shell only"]
    URL["Parse ?parks= or landing.codes"]
    META["generateMetadata / JSON-LD"]
    STATIC["generateStaticParams for 5 presets"]
  end

  subgraph Client["ComparePageClient — all data client-side"]
    AP["useAllParks — picker catalog"]
    PC["useParkComparison — POST /parks/compare"]
    PK["useCompareParkingLots — per-park parking"]
    HL["Client highlight cards<br/>warmest, lowest crowd, shared activities"]
    TBL["Comparison table rows"]
    URL2["router.replace ?parks= for share link"]
  end

  subgraph API["enhancedParkController"]
    NPS["npsService per code"]
    ENH["enhancedParkService.getEnhancedParkData"]
    REV["ParkReview stats"]
    ACT["getCommonActivities"]
  end

  SSR --> Client
  PC --> API
  PK --> GET["GET /parks/:code/parkinglots"]
```

### 6.3 User flow

```mermaid
flowchart TD
  A["/compare or /compare/zion-vs-bryce"] --> B[Resolve up to 4 park codes]
  B --> C[Load full park list for picker]
  C --> D{≥2 parks?}
  D -->|No| E[Show picker + featured pills]
  D -->|Yes| F[POST /api/parks/compare]
  F --> G[Highlights + comparison table]
  G --> H{CTA}
  H --> I["Copy ?parks= share URL"]
  H --> J["Trailie road trip /plan-ai?suggest="]
  H --> K["Per-park Plan /plan-ai?from=compare"]
```

**Max parks:** 4 · **Stale time:** 30 min (React Query) · **No SSR comparison data** — SEO metadata only

---

## 7. Discover (`/discover`)

**Purpose:** Taxonomy hub — browse parks by activity, designation type, NPS topic, or state; curated featured picks per dimension.

### 7.1 Route map

| Route | Client / server |
|-------|-----------------|
| `/discover` | `DiscoverPageClient` — 4 preview sections |
| `/discover/activities` | `DiscoverFullGridPage` |
| `/discover/types` | same |
| `/discover/topics` | same |
| `/discover/states` | Grid → links to `/parks/state/{slug}` |
| `/discover/activity/[slug]` | `DiscoverDetailClient` |
| `/discover/type/[slug]` | same |
| `/discover/topic/[slug]` | same |
| `/parks/state/[stateCode]` | `StateParkPageClient` (state dimension) |

### 7.2 Architecture

```mermaid
flowchart TB
  subgraph Hub["/discover"]
    CAT["GET /api/discover/catalog"]
    SEC["4 sections × 6 preview cards<br/>activities · types · states · topics"]
  end

  subgraph Grid["/discover/{dimension}s"]
    FG["DiscoverFullGridPage<br/>SSR catalog slice"]
  end

  subgraph Detail["/discover/{activity|type|topic}/[slug]"]
    DET["GET /api/discover/detail"]
    FEAT["Featured parks carousel"]
    NPS["NPS guide section"]
    EV["Upcoming events sample"]
    PG["GET /api/discover/parks?page=<br/>client pagination 12/page"]
  end

  subgraph State["/parks/state/[slug]"]
    ALL["GET /api/parks?all=true filter by state"]
  end

  subgraph Backend["discoverCatalogService"]
    IDX["Build indexes from NPS catalog"]
    FEATJSON["discover-featured.json overrides"]
    COPY["discoverCopy intro/about"]
  end

  Hub --> Backend
  Grid --> Backend
  Detail --> Backend
  State --> ALL
```

### 7.3 User flow

```mermaid
flowchart TD
  A[/discover hub] --> B{Pick dimension}
  B --> C[Preview card]
  B --> D[See all grid]
  C --> E{Type}
  D --> E
  E -->|activity/type/topic| F[Detail page]
  E -->|state| G[/parks/state/utah]
  F --> H[Featured + NPS guide + events]
  H --> I[Paginated all parks]
  I --> J[ParkCard → /parks/slug]
  F --> K[RecentChips local visit tracking]
```

**ISR:** catalog 3600s · detail 1800s · **Hooks:** `useDiscoverCatalog`, `useDiscoverDetail`, `useDiscoverParksPage`

---

## 8. Cross-page patterns

### 8.1 SSR vs client matrix

| Page | SSR data | Client fetch | Pattern name |
|------|----------|--------------|--------------|
| Explore | First page + metadata | Pagination, search, filters | **Hybrid dual-fetch** |
| Park detail | Details + planning + JSON-LD | Tab lazy load | **Three-tier lazy tabs** |
| Trailie | Layout metadata only | SSE stream + session | **Client-heavy realtime** |
| Events | Month batch + summary | Month change refetch | **SSR hydrate + refetch** |
| Compare | URL codes + metadata | All comparison data | **SEO shell SPA** |
| Discover | Catalog / detail | Park pagination | **SSR + client pages** |

### 8.2 Navigation graph (main CTAs)

```mermaid
flowchart LR
  EXP["/explore"] --> PARK["/parks/slug"]
  DISC["/discover"] --> PARK
  DISC --> STATE["/parks/state/slug"]
  PARK --> TR["/plan-ai?park="]
  PARK --> CMP["/compare?park="]
  CMP --> TR
  PARK --> EVT["/events"]
  TR --> PARK
  HUB["/guides"] --> DISC
```

### 8.3 Auth touchpoints

| Page | Guest | Logged in |
|------|-------|-----------|
| Explore | Full browse | Same |
| Park detail | Browse; login for favorite/visited/review | Saved parks, reviews |
| Trailie | 5 messages; migrate on signup | Unlimited; trips saved |
| Events | Browse; local save | Register for custom events |
| Compare | Full compare | Personalized Trailie CTA |
| Discover | Full browse | Saved events on detail |

### 8.4 Key file index

```
next-frontend/src/app/
├── explore/          page.jsx, ExplorePageClient.jsx
├── parks/[parkCode]/ page.jsx, ParkDetailClient.jsx
├── plan-ai/          page.jsx, PlanAIContent.jsx, [tripId]/*
├── events/           page.jsx, EventsPageClient.jsx
├── compare/          page.jsx, ComparePageClient.jsx, [slug]/page.jsx
└── discover/         page.jsx, DiscoverPageClient.jsx, */[slug]/page.jsx

server/src/
├── routes/parks.js, enhancedParks.js, discover.js, events.js, ai.js
├── controllers/parkController.js, discoverController.js, eventController.js, enhancedParkController.js
└── services/npsService.js, discoverCatalogService.js, enhancedParkService.js, parkSearchService.js
```

---

## Related docs

- [TRAILVERSE-AGENT-HANDBOOK.md](./TRAILVERSE-AGENT-HANDBOOK.md) — full agent context
- [.cursor/rules/01-frontend-pages.mdc](../.cursor/rules/01-frontend-pages.mdc) — route map
- [.cursor/rules/04-discover-and-parks.mdc](../.cursor/rules/04-discover-and-parks.mdc) — discover + park tabs
- [.cursor/rules/05-plan-ai-mcp-and-admin.mdc](../.cursor/rules/05-plan-ai-mcp-and-admin.mdc) — Trailie + voice

---

*Generated from codebase analysis — June 2026. Update when routes or API contracts change.*
