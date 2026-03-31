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

- Explore 470+ U.S. national park units with search, filtering, and map-based browsing.
- Park detail pages with 12 tabs: activities, camping, places, tours, parking, photos, videos, webcams, alerts, facilities, and reviews.
- Full NPS photo galleries with lightbox viewer, swipe navigation, and download.
- In-app NPS video player with captions and duration info.
- Live webcam feeds, self-guided tours with stops, and real-time parking lot data.
- AI trip planning for itineraries and personalized travel suggestions.
- Compare parks side by side. Save favorites, track visited parks, and plan trips.
- Blog content, user reviews, events, ranger programs, and community features.

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
- **Parks list warm-up**: The full parks list (474 parks) is loaded from a MongoDB persistent snapshot on server startup — zero NPS API calls on deploy when the snapshot is fresh.
- **Rate limit protection**: All NPS API calls handle 429 responses gracefully, falling back to cached data or returning empty arrays without crashing.

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

- `http://localhost:3000`

Backend:

- `http://localhost:5001`

## Project Structure

```text
next-frontend/   Next.js frontend
server/          Express API and backend services
scripts/         Utility and maintenance scripts
```

