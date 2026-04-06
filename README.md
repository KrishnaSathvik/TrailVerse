# TrailVerse

TrailVerse is a national parks discovery and trip-planning platform built from real travel experience, park exploration, and a desire to make trip planning simpler.

Live site: [www.nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)

## Overview

TrailVerse helps people explore parks, compare destinations, plan trips, read useful travel content, and save the places they care about. It brings together park discovery, planning tools, live trip context, and community insights in one place.

## Vision

TrailVerse was built to make national park travel easier to plan and easier to enjoy.

After years of exploring parks, writing reviews, sharing photos, and helping other travelers through real-world travel contributions, the goal became clear: bring park discovery, planning, saved travel ideas, and useful guidance into one product instead of forcing people to piece a trip together across scattered apps and websites.

The product is designed to help someone move from "Where should I go?" to "What should I do there?" to "How do I save and plan this trip?" in one flow.

## Why I Built It

The idea came from real travel friction:

- planning a park trip usually means switching between maps, weather, park sites, blogs, and saved notes
- park information is often fragmented and hard to compare
- useful trip ideas should feel personal, not generic
- saving parks, tracking visits, and revisiting plans should be simple

I built TrailVerse to solve that problem in a way that feels practical: discover parks, compare options, plan a trip, save places, track what you have visited, and come back later without losing context.

## Core Features

### Park Discovery & Research
- Explore 470+ U.S. parks and sites with search, filtering, and map-based browsing
- Park detail pages with 14 tabs: activities, camping, places, tours, parking, photos, videos, webcams, alerts, facilities, brochures, permits, reviews, and visitor centers
- Full NPS photo galleries with lightbox viewer, swipe navigation, and download
- In-app NPS video player with captions and duration info
- Live webcam feeds, self-guided tours with stops, and real-time parking lot data
- State-level aggregation pages (e.g. /parks/state/utah) for regional discovery
- Human-readable park URLs (/parks/yellowstone-national-park) with 301 redirects from legacy codes

### AI Trip Planning
- Dual-provider AI planner: GPT-4.1 ("The Planner") and Claude Sonnet 4.6 ("The Local") — switchable in the UI
- Live NPS data injected at inference time: active closures, campground status, visitor center hours, permits, and real-time weather for any mentioned park
- Park name auto-detection from user messages — no need to pre-select a park
- Structured itinerary output: AI generates machine-readable day/stop data alongside visible markdown
- Follow-up conversation with full context preservation across messages
- Anonymous sessions (5 free messages) and authenticated sessions with full history

### Trip Management
- Auto-save — every AI conversation saved to MongoDB automatically
- Drag-and-drop visual itinerary builder at /plan-ai/[tripId]/itinerary
- Day columns: add, rename, reorder, remove
- Stop cards: park search + custom stops (hotels, restaurants, viewpoints), drag between days, inline note editing
- PDF export: download AI-generated trip plan as a branded multi-page PDF
- Trip sharing: generate a public shareable link for any saved trip
- Public shared trip pages (/plan-ai/shared/[shareId]) — SEO-indexable, no auth required

### Community & Personalization
- Daily Feed with featured park, nature facts, weather context, and sky insights
- Monthly events browsing for ranger programs, guided tours, and seasonal park happenings
- Compare parks side by side
- Save favorites, track visited parks with dates and memories, and build trip collections
- Community reviews with photo upload (up to 5 photos, auto-optimized)
- 1000+ avatar combinations with custom upload option
- Blog with comments, replies, and likes — 6 category pages (trip-planning, park-guides, gear-packing, seasonal, astrophotography, budget-travel)

### Technical & SEO
- Full schema markup: TouristAttraction + BreadcrumbList on park pages, BlogPosting on blog posts, FAQPage on /faq, WebSite + SearchAction sitewide
- Open Graph and Twitter Card metadata on all pages
- Dynamic XML sitemap with park, blog, state, and category routes
- PWA / offline mode installable to home screen
- Dark/light mode toggle
- Real-time WebSocket sync for trip updates
- Google Analytics integration

## NPS API Integration

TrailVerse integrates with 12 National Park Service API endpoints to provide comprehensive, real-time park data:

| Endpoint | Tab | Data |
|---|---|---|
| `/parks` | Overview | Park info, descriptions, entrance fees, images |
| `/alerts` | Alerts | Hazard warnings, closures, and notices |
| `/thingstodo` | Activities | Things to do, hiking, programs |
| `/campgrounds` | Camping | Campground info and amenities |
| `/places` | Places | Named points of interest with GPS coordinates |
| `/tours` | Tours | Self-guided itineraries with ordered stops |
| `/parkinglots` | Parking | Lot capacity, live occupancy, fees, accessibility |
| `/visitorcenters` | Facilities | Visitor center info and hours |
| `/multimedia/galleries/assets` | Photos | Full NPS photo gallery per park |
| `/multimedia/videos` | Videos | NPS-produced park videos with in-app playback |
| `/webcams` | Webcams | Live camera feeds and status |
| `/events` | Events | Ranger programs, festivals, guided tours |

### Performance Architecture

- **Lazy-loaded tabs**: Park pages load instantly with just park info and alerts. Each tab fetches its own data on click (~200-500ms), then caches for 24 hours.
- **Per-park caching**: Only parks that users visit cost API calls. Each endpoint is cached per-park for 24 hours.
- **Parks list warm-up**: The full parks list (474 NPS units) is loaded from a MongoDB persistent snapshot on server startup — zero NPS API calls on deploy when the snapshot is fresh.
- **Rate limit protection**: All NPS API calls handle 429 responses gracefully, falling back to cached data or returning empty arrays without crashing.

## AI Architecture

### Providers
TrailVerse supports two AI providers, selectable in the Plan AI UI:

| Provider | Model | Persona |
|---|---|---|
| OpenAI | gpt-4.1 | "The Planner" — detailed, structured, comprehensive itineraries |
| Anthropic | Claude Sonnet 4.6 | "The Local" — casual, opinionated, insider recommendations |

### Live Data Injection (RAG)
Before every AI call, `prepareChatContext()` in `server/src/routes/ai.js`:
1. Extracts the park name from the user's message (if `metadata.parkCode` not pre-set)
2. Looks up the park code from a full map of all 63 national parks (`server/src/utils/parkExtractor.js`)
3. Fetches live NPS data in parallel via `server/src/services/factsService.js`:
   - Active alerts (closures, cautions, information notices)
   - Campground status and reservation info
   - Visitor center hours
   - Permit requirements
   - Real-time weather (OpenWeather API)
4. Injects structured context into the system prompt with a date stamp and citation instructions

### Structured Itinerary Output
When the AI generates a day-by-day trip plan, it appends a `[ITINERARY_JSON]` block at the end of its response. The server (`server/src/utils/extractItineraryJSON.js`) strips this block before sending the markdown to the frontend and saves the structured data to `TripPlan.plan` in MongoDB. This structured data powers:
- The drag-and-drop itinerary builder (reads `plan.days`)
- PDF export (reads `plan.days`, `plan.highlights`, `plan.packingList`)
- Shared trip pages (renders structured day overview if `plan.days` exists)

### Anonymous Sessions
Anonymous users get 5 free messages per session. Sessions are tracked via MongoDB's `AnonymousSession` model. Authenticated users get unlimited planning with full trip history.

## Built From Experience

TrailVerse is shaped by actual park travel, review writing, and on-the-ground trip research. The product direction came from seeing how hard it still is to answer simple questions well:

- Which park fits the kind of trip I want right now?
- What is happening there this week?
- What should I save for later?
- How do I compare this with another park?
- What do real visitors recommend?

That is the reason the app combines park discovery, planning, events, weather, saved collections, blogs, and reviews instead of treating them as separate products.

## Local Development

### Requirements

- Node.js 20+
- MongoDB

### Environment Variables

Required environment variables for the backend (`server/.env`):

- `NPS_API_KEY` — NPS API key (register at [developer.nps.gov](https://www.nps.gov/subjects/developer/get-started.htm))
- `MONGODB_URI` — MongoDB connection string
- `OPENWEATHER_API_KEY` — OpenWeather API key for weather data
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — Required for AI trip planning features

### Run the app

1. Install dependencies:

```bash
npm install
cd next-frontend && npm install
cd ../server && npm install
```

2. Configure environment variables:

- Create `server/.env` (see env.example)
- Create `next-frontend/.env.local` if needed for frontend environment values

3. Start both services from the repo root:

```bash
npm run dev
```

Frontend:

- `http://127.0.0.1:3000`

Backend:

- `http://localhost:5001`

### New Frontend Dependencies (recently added)
- `@react-pdf/renderer` ^3.4.0 — client-side PDF generation for trip export
- `@hello-pangea/dnd` ^18.0.1 — drag-and-drop for the visual itinerary builder

## Common Commands

From the repo root:

```bash
npm run dev      # start frontend + backend
npm run build    # production build for the Next.js frontend
npm run lint     # frontend linting
npm run test     # frontend tests
```

## Project Structure

```text
next-frontend/                  Next.js 15 App Router frontend (Vercel)
  src/
    app/
      parks/[parkCode]/         Park detail pages (14 tabs)
      parks/state/[stateCode]/  State aggregation pages
      plan-ai/                  AI trip planner
        [tripId]/               Existing trip chat view
          itinerary/            Drag-and-drop itinerary builder
        shared/[shareId]/       Public shared trip view
      blog/
        [slug]/                 Blog post pages
        category/[category]/    Blog category pages
    components/
      ai-chat/                  Chat UI (MessageBubble, ChatInput, SuggestedPrompts)
      plan-ai/                  TripPlannerChat, QuickFillModal
      itinerary/                ItineraryBuilder, DayColumn, StopCard, AddStopSearch, TripPDFDocument
      park-details/             14-tab park detail UI
      common/                   Header, Footer, Button, OptimizedImage
    services/                   API clients (aiService, tripService, etc.)
    utils/                      parkExtractor, extractItineraryJSON, parkLinkifier

server/                         Express API backend (Render.com)
  src/
    routes/                     ai.js, trips.js, parks.js, reviews.js, blogs.js
    services/                   openaiService, claudeService, factsService, npsService
    models/                     TripPlan, AnonymousSession, User, Review
    utils/                      parkExtractor.js, extractItineraryJSON.js
    middleware/                 auth.js (JWT), protect

scripts/                        Utility and maintenance scripts
```
