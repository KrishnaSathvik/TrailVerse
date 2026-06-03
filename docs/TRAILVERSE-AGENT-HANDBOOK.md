# TrailVerse Agent Handbook

> **Human-readable merge of all Cursor rules.**  
> **Source of truth for agents:** `.cursor/rules/*.mdc` (Cursor loads these automatically; update rules first, then refresh this handbook when doing large doc passes).

**Last consolidated:** June 2026 · **Repo:** `npe-usa` · **Production:** [nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)

---

## Table of contents

1. [Quick reference](#1-quick-reference)
2. [Product & repository](#2-product--repository)
3. [Local development](#3-local-development)
4. [Architecture overview](#4-architecture-overview)
5. [Frontend page map (all routes)](#5-frontend-page-map-all-routes)
5b. [Guides & intent landings](#5b-guides--intent-landings)
6. [Discover & park detail](#6-discover--park-detail)
7. [Trailie (Plan AI), voice & admin](#7-trailie-plan-ai-voice--admin)
8. [MCP, ChatGPT & cloud (Render)](#8-mcp-chatgpt--cloud-render)
9. [Backend API](#9-backend-api)
10. [Frontend conventions](#10-frontend-conventions)
11. [Frontend services layer](#11-frontend-services-layer)
12. [SEO, slugs & redirects](#12-seo-slugs--redirects)
13. [Coverage checklist](#13-coverage-checklist)
14. [Related documentation](#14-related-documentation)

---

## 1. Quick reference

| What | Where |
|------|--------|
| Run everything | `npm run dev` (repo root) |
| Frontend | http://127.0.0.1:3000 |
| Backend API | http://localhost:5001/api |
| Production API | https://trailverse.onrender.com/api |
| MCP server (cloud) | https://trailverse-mcp.onrender.com/mcp |
| Auth cookie | `trailverse_auth_token` |
| AI persona | **Trailie** → `/plan-ai` |
| Park URLs | `/parks/yellowstone-national-park` (slug, not `yell`) |
| ChatGPT app landing | `/chatgpt` |
| Claude MCP landing | `/mcp` |
| Planning guides hub | `/guides` (+ 12 intent landings — §5b) |

**Cursor rules map**

| Rule file | Topic |
|-----------|--------|
| `00-trailverse-master.mdc` | Overview (always on) |
| `01-frontend-pages.mdc` | All pages (always on) |
| `06-mcp-chatgpt-cloud.mdc` | MCP + ChatGPT (always on) |
| `02-backend-api.mdc` | Express (`server/**`) |
| `03-frontend-conventions.mdc` | Next.js patterns |
| `04-discover-and-parks.mdc` | Discover + parks |
| `05-plan-ai-mcp-and-admin.mdc` | Trailie, admin |
| `07-frontend-services-layer.mdc` | `src/services/` |
| `08-guides-and-intent-pages.mdc` | Guides + intent landings |

---

## 2. Product & repository

**TrailVerse** covers **470+ NPS parks and sites** — national parks, monuments, historic sites, seashores, and more.

- **Tagline:** "Your Universe of National Parks Exploration"
- **Trailie:** AI trip planner (nav: "Trailie", routes: `/plan-ai`)
- **No account required** to browse parks, maps, compare, discover, blog

### Repository layout

```
npe-usa/
├── package.json          # npm run dev → frontend + backend
├── next-frontend/        # Next.js App Router (v0.4.0, Next 16.x, Node 20)
├── server/               # Express + MongoDB + Socket.IO
├── mcp-server/           # Python FastMCP → ChatGPT + Claude
└── docs/                 # Plans, SEO, this handbook
```

### Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Next.js App Router, React 19, Tailwind v4, TanStack Query, Phosphor icons, Serwist PWA |
| Backend | Express, Mongoose, JWT, Socket.IO, Swagger `/api-docs` |
| Data | MongoDB, NPS API, OpenWeather, GMaps (server proxy), RIDB, GTFS |
| AI | OpenAI + Anthropic |
| Email | Resend |
| Deploy | Vercel (frontend), Render (backend + MCP) |

### Global providers (`Providers.jsx`)

- TanStack Query (5 min staleTime)
- ThemeProvider — CSS vars: `--bg-primary`, `--text-primary`, `--accent-green`, `--font-display`
- AuthProvider — JWT cookie + `authService`
- Root layout: `VoiceButton`, `GoogleMapsLoader`, Analytics

---

## 3. Local development

| Service | Command | URL |
|---------|---------|-----|
| Both | `npm run dev` | — |
| Frontend only | `cd next-frontend && npm run dev` | http://127.0.0.1:3000 |
| Backend only | `cd server && npm run dev` | http://localhost:5001/api |
| MCP server | `cd mcp-server && python -m server.main` | http://localhost:8000/mcp |

- Next.js rewrites `/api/*` and `/uploads/*` to backend (`next.config.mjs`)
- API helper: `getApiBaseUrl()` in `next-frontend/src/lib/apiBase.js`

### MCP local setup

```bash
cd mcp-server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export TRAILVERSE_API_BASE=http://localhost:5001
python -m server.main
# Test tools: python scripts/test_local.py
```

---

## 4. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Users                                                           │
│  • Website (Vercel)  • ChatGPT App  • Claude MCP  • Voice       │
└────────────┬──────────────────┬─────────────────┬───────────────┘
             │                  │                 │
             ▼                  ▼                 ▼
     next-frontend/      mcp-server/         (same site)
     (Next.js)           (Render Python)
             │                  │
             │    /api rewrite  │  HTTPS + MCP_BYPASS_KEY
             └────────┬─────────┘
                      ▼
              server/ (Express on Render)
                      │
         MongoDB · NPS · OpenAI · Claude · OpenWeather · GMaps
```

**Three AI surfaces, one backend:**

| Surface | Entry | Protocol |
|---------|-------|----------|
| Website Trailie | `/plan-ai` | REST + voice (Realtime API) |
| ChatGPT App | App Directory | MCP over HTTP → `mcp-server` |
| Claude | `/mcp` connector URL | Same MCP server |

---

## 5. Frontend page map (all routes)

**Base path:** `next-frontend/src/app/` (~**65** `page.jsx` routes)  
**Nav (Header):** Primary — Explore, Map, Trailie, Blog (+ Home when authed). More — Events, Compare, **Explore by Activity** → `/discover` (`browseHub.js`). Authed more — Chat History, Profile. Footer — Planning Guides → `/guides`.

### Public marketing

| Route | File / notes | API / SEO |
|-------|----------------|-----------|
| `/` | `page.jsx` — hero, featured parks, Park of the Day, testimonials | `GET /api/parks?all=true&nationalParksOnly=true` |
| `/home` | Protected dashboard | `trailverse_auth_token` required |
| `/about`, `/features`, `/faq` | Static marketing | Sitemap |
| `/testimonials` | `TestimonialsPageClient.jsx` | `POST /api/testimonials` |
| `/magazine`, `/newsletter` | Newsletter / magazine | Subscribers API |
| `/chatgpt` | ChatGPT App Directory landing | See [§8](#8-mcp-chatgpt--cloud-render) |
| `/mcp` | Claude MCP install guide | Connector: `https://trailverse-mcp.onrender.com/mcp` |
| `/privacy`, `/terms` | Legal | |
| `/reports/when-to-go.html` | Crowd calendar (static) | Redirect from `/reports/when-to-go` |
| `/reports/national-parks-2025.html` | Data report | |

### Park discovery

| Route | Purpose |
|-------|---------|
| `/explore` | Grid: search, national-parks-only toggle, 56 states, sort, pagination |
| `/parks/[parkCode]` | Park detail — **slug URLs** (`length > 4`), tabs, lazy NPS data |
| `/parks/state/[stateCode]` | All sites in a state |
| `/parks/[parkCode]/activity/[id]` | Single activity |
| `/compare` | 2–4 park comparison |
| `/map` | Full-screen Google Maps |

**Park detail tabs** (`?tab=`): Overview, Alerts, What to See, Things to Do, Tours, Visitor Centers, Where to Stay, Parking, Amenities, Brochures, Permits, Photos, Videos, Webcams, Reviews, Transit (if GTFS).

### Discover hub

| Route | Purpose |
|-------|---------|
| `/discover` | Hub — Activities, Type, States, Topics (SSR catalog) |
| `/discover/activities`, `/discover/activity/[slug]` | By activity |
| `/discover/types`, `/discover/type/[slug]` | By designation |
| `/discover/topics`, `/discover/topic/[slug]` | By topic |
| `/discover/states` | All states |

API: `GET /api/discover/catalog`, `detail`, `parks`, `nps-guide`  
**Nav label** for `/discover`: "Explore by Activity" (not "Discover" in the UI).

### Trailie / Plan AI

| Route | Purpose |
|-------|---------|
| `/plan-ai` | Main chat (anonymous or authed) |
| `/plan-ai/[tripId]` | Saved trip (+ `/plan`, `/itinerary`, `/map`) |
| `/plan-ai/shared/[shareId]` | Public share (noindex) |
| `/chat-history` | Past chats (auth, noindex) |

### Blog & events

| Route | Purpose |
|-------|---------|
| `/blog` | Index, categories, search |
| `/blog/[slug]` | Post (TipTap HTML) |
| `/blog/category/[category]` | Category filter |
| `/events` | Events list + registration |

### Auth & account (mostly noindex)

| Route | Notes |
|-------|-------|
| `/login`, `/signup`, `/forgot-password`, `/reset-password/[token]` | Auth flows |
| `/verify-email/[token]` | Email verify |
| `/profile` | Saved/visited parks (**protected**) |
| `/unsubscribe` | Email unsubscribe |

### Admin (noindex)

| Route | Purpose |
|-------|---------|
| `/admin/login` | Admin gate |
| `/admin` | Dashboard |
| `/admin/users` | User management |
| `/admin/blog/new`, `/admin/blog/edit/[id]` | TipTap CMS |
| `/admin/settings` | Site settings |

Requires JWT + `role: 'admin'`.

### Global UI

- **Header / Footer** on most pages
- **VoiceButton** — "Talk to Trailie" (all pages)
- **Theme** — system / light / dark via CSS variables

---

## 5b. Guides & intent landings

**Cursor rule:** `.cursor/rules/08-guides-and-intent-pages.mdc` (standouts voice, do-not-add UI blocks).

| Type | Config | Routes |
|------|--------|--------|
| Editorial guides | `src/data/guides.js` | `/guides`, `/guides/[slug]` (8 slugs) |
| Intent landings | `intentLandings.js` + `intentLandingsExtended.js` | 12 paths — see rule `08` / `01` for full list |

- **Intent API:** `GET /api/parks/search?q=` + `pinned=`; traits/match copy in `server/src/catalog/traitBuilder.js`, `matchExplanation.js`
- **Sitemap:** `guides` + all intent paths in `sitemap.ts`
- **New intent page:** entry in `INTENT_LANDINGS`, thin `app/{path}/page.jsx`, sitemap, `relatedLinks`

---

## 6. Discover & park detail

### Discover dimensions

| Dimension | URL | Example |
|-----------|-----|---------|
| Activity | `/discover/activity/[slug]` | `hiking` |
| Type | `/discover/type/[slug]` | `national-park` |
| State | `/parks/state/[slug]` | `utah` |
| Topic | `/discover/topic/[slug]` | `animals` |

**Key files:** `DiscoverPageClient.jsx`, `DiscoverDetailClient.jsx`, `useDiscoverCatalog`, `lib/discoverApi.js`, `discoverCatalogService`, `server/data/discover-featured.json`

### Park detail

1. URL slug when `parkCode.length > 4`
2. 4-char NPS codes redirect to canonical slug
3. Tabs lazy-load: `GET /api/parks/:npsCode/{endpoint}` only when active
4. SEO: `lib/parkSeo.js` (tier-A parks, state hubs, meta descriptions)

**Extension guides:** new discover facet → catalog service + route + sitemap. New park tab → NPS route + `ParkDetailClient` + lazy fetch.

---

## 7. Trailie (Plan AI), voice & admin

### Anonymous → authenticated

1. `POST /api/ai/chat-anonymous`
2. On login (48h window): `POST /api/auth/migrate-chat`
3. Redirect: `/plan-ai/{tripId}?chat=true`

### Authenticated

- `POST /api/ai/chat` or `chat-stream`
- Trips: `/api/trips` CRUD, share → `/plan-ai/shared/[shareId]`

### Voice (not MCP)

| | |
|--|--|
| UI | `VoiceButton`, `VoiceOverlay` |
| API | `POST /api/ai/realtime-session`, `voice-tool` |
| Tech | OpenAI Realtime API + WebRTC, 4 function tools |

### Admin CMS

- Blog: TipTap via `BlogPostForm.jsx`
- Scheduled publish: cron + `publish-scheduled`
- Email: Resend + `reactEmailRenderer`

---

## 8. MCP, ChatGPT & cloud (Render)

### Production URLs

| Service | URL |
|---------|-----|
| MCP server | https://trailverse-mcp.onrender.com |
| MCP endpoint | https://trailverse-mcp.onrender.com/mcp |
| Health | `GET /health` |
| Express API | https://trailverse.onrender.com/api |

Deploy MCP: `mcp-server/render.yaml` → `python -m server.main`

### MCP_BYPASS_KEY (required)

All ChatGPT/Claude traffic shares one IP. Without bypass, Express **60 req / 15 min** anonymous limit is hit immediately.

1. MCP sends `X-TrailVerse-MCP-Key` (`mcp-server/server/client.py`)
2. Express `server/src/middleware/mcpBypass.js` sets `req.skipAnonymousRateLimit`

**Same secret on both Render services.**

### Five MCP tools

| Tool | Backend |
|------|---------|
| `plan_trip` | `POST /api/ai/chat-anonymous` |
| `get_park_details` | Park details + alerts, weather, campgrounds, permits, feed |
| `compare_parks` | `POST /api/parks/compare` |
| `search_parks` | `GET /api/parks/search` |
| `find_events` | `GET /api/events` |

**Output:** `structuredContent` (ChatGPT widgets) + `text` (Markdown for Claude)

### Widgets (`mcp-server/widgets/`)

`itinerary.html`, `park-details.html`, `compare.html`, `park-list.html`, `events.html`

MIME: `text/html;profile=mcp-app`

### Marketing pages

- **`/chatgpt`** — Apps Directory CTA (`NEXT_PUBLIC_CHATGPT_APP_URL`)
- **`/mcp`** — Claude connector install (`MCP_URL` = cloud `/mcp`)

### MCP change checklist

1. Express route/controller
2. `mcp-server/server/client.py`
3. `formatters.py`
4. `python scripts/test_local.py`
5. Redeploy Render + refresh connectors
6. Update `/chatgpt` or `/mcp` copy if needed
7. Verify `MCP_BYPASS_KEY` on both services

**Deep spec:** `docs/mcp-server-technical-doc.md`, `mcp-server/README.md`

---

## 9. Backend API

**Entry:** `server/server.js` → `server/src/app.js`  
**Base:** `/api` · **Swagger:** `/api-docs` · **Health:** `/health`

### Auth middleware

| Middleware | Behavior |
|------------|----------|
| `protect` | Bearer JWT required → `req.user` |
| `admin` | `role === 'admin'` |
| `optionalAuth` | User or null, never 401 |

### Critical mount order

- `enhancedParks` before `parks` on `/api/parks`
- Blog `GET /:slug` **last** in `blogs.js`
- Comments at `/api` root

### Domain summary

| Prefix | Highlights |
|--------|------------|
| `/api/auth` | signup, login, migrate-chat |
| `/api/parks` | NPS proxy + `GET /search` (traits, pinned) + enhanced + compare |
| `/api/discover` | catalog, detail, parks, nps-guide |
| `/api/trips` | TripPlan; shared trip public |
| `/api/ai` | chat, anonymous, stream, realtime, voice-tool |
| `/api/blogs` | public read; admin write |
| `/api/users`, `/api/user` | profile, GDPR, preferences |
| `/api/gmaps` | **Server-only** maps key |
| `/api/admin`, `/api/analytics` | admin only |

### Models

User, TripPlan, AnonymousSession, BlogPost, Comment, ParkReview, Favorite, VisitedPark, UserPreferences, Event, Testimonial, DailyFeed, Analytics, SiteSettings, Subscriber

### New endpoint pattern

1. `routes/` → `controllers/` → `services/`
2. Mount in `app.js`
3. `{ success, data }` response shape
4. Specific routes before `/:param`

---

## 10. Frontend conventions

- **JSX** in app code; `@/` alias
- **Server components** for SEO + initial fetch; **client** for interactivity
- **Fetch:** server uses `getApiBaseUrl()` + `revalidate`; client uses services or TanStack Query
- **Styling:** Tailwind + CSS variables (keep inline `var(--*)` pattern)
- **Icons:** `@components/icons`
- **Auth gate:** `useAuth()` + `showLoginPrompt()`
- **Tests:** Vitest + Playwright in `next-frontend/`
- **Prebuild:** `generate-park-slugs.mjs` → `park-slugs.json`

### Avoid

- Dynamic inline imports
- Hardcoded API hosts in client
- noindex pages in sitemap
- Breaking park slug redirects

---

## 11. Frontend services layer

Prefer `next-frontend/src/services/` over raw `fetch` in client components.

| Service | Use |
|---------|-----|
| `api.js` | Axios base + auth header |
| `authService.js` | Auth |
| `npsApi.js` | Parks |
| `enhancedParkService.js` | Weather, crowd |
| `aiService.js` | Plan AI |
| `tripService.js` | Trips |
| `blogService.js` | Blog |
| `userService.js` | Profile, saved parks |
| `savedEventsService.js` | Saved events |
| `statsService.js` | Stats endpoints |
| `discoverApi` | In `lib/discoverApi.js` (SSR) |

**Legacy:** `src/old_pages/` — do not extend.

---

## 12. SEO, slugs & redirects

| Topic | Detail |
|-------|--------|
| Canonical domain | `https://www.nationalparksexplorerusa.com` |
| Indexable | `indexablePageRobots` from `@/lib/seo` |
| Private | auth, profile, admin, shared trips — `privatePageRobots` |
| Park slugs | `park-slugs.json` + `parkSlug.js`; `/parks/yell` → full slug |
| Sitemap | `app/sitemap.ts` |
| robots.txt | `app/robots.ts` — disallows `/admin`, `/login`, `/plan-ai/shared/`, etc. |
| Proxy | `src/proxy.js` — auth gates + blog slug 308 redirects (no `/plan-ai/new`; chat at `/plan-ai`) |

**New public page:** sitemap + metadata + canonical + robots decision.

---

## 13. Coverage checklist

| Area | Documented |
|------|------------|
| ~65 App Router pages | Yes — §5 + §5b |
| Express API | Yes — §9 |
| Discover + parks | Yes — §6 |
| Guides + intent landings | Yes — §5b, rule `08` |
| Park search / traits | Yes — §9, §5b |
| Trailie + voice + admin | Yes — §7 |
| MCP cloud + ChatGPT + Claude | Yes — §8 |
| Client services | Yes — §11 |
| SEO / slugs | Yes — §12 |
| `mcp-server/` Python | Yes — §8 |
| `docs/` SEO exports, content-engine | Reference only — not runtime |
| `src/old_pages/` | Legacy — do not extend |
| `/dashboard`, `/settings` (user) | No pages — use `/profile` |

---

## 14. Related documentation

| Document | Purpose |
|----------|---------|
| `AGENTS.md` (repo root) | Pointer to Cursor rules + handbook |
| `docs/mcp-server-technical-doc.md` | Full MCP technical spec |
| `mcp-server/README.md` | MCP dev, deploy, troubleshooting |
| `mcp-server/docs/SUBMISSION_CHECKLIST.md` | ChatGPT App Directory |
| `next-frontend/AGENTS.md` | Next.js version caveats |
| `.cursor/rules/*.mdc` | **Machine source of truth** for Cursor agents |

---

*When you change product behavior, update the relevant `.cursor/rules/*.mdc` file first, then sync this handbook if the change is structural or cross-cutting.*
