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

- Explore 470+ U.S. national park units with search, filtering, park pages, and map-based browsing.
- View park details across 12 dedicated tabs: Overview, Activities, Camping, Places, Tours, Parking, Facilities, Photos, Videos, Webcams, Alerts, and Reviews.
- Browse full NPS photo galleries with lightbox viewer, swipe navigation, and image download.
- Watch NPS park videos in-app with native video player, captions, and duration info.
- View live webcam feeds and status for parks with active cameras.
- Explore named places and points of interest within each park.
- Browse curated self-guided tours with ordered stops and descriptions.
- Check real-time parking lot availability, capacity, fees, and accessibility info.
- Use AI trip planning to build itineraries and get personalized travel suggestions.
- Compare parks side by side when deciding where to go.
- Browse blog content, travel guides, and seasonal park articles.
- Save favorite parks, events, and blogs inside a user account.
- Track visited parks and trip history over time.
- Read and submit reviews, comments, and community content.
- Access park events, ranger programs, and related planning details.

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

## Product Areas

### Park Discovery

- Search and filter parks by different criteria.
- Browse park pages with summaries, activities, alerts, and weather context.
- Use map-based exploration and comparison flows.
- Compare multiple parks before choosing a destination.

### Park Detail Pages

- 12 tabs covering every aspect of a park: overview, activities, camping, places, tours, parking, facilities, photos, videos, webcams, alerts, and reviews.
- Photo gallery with full-screen lightbox, swipe navigation, keyboard controls, and download.
- In-app video player with captions for NPS park videos.
- Live webcam feeds with status indicators.
- Tour itineraries with numbered stops.
- Parking lot info with live occupancy and accessibility details.
- Weather forecasts and current conditions.

### Trip Planning

- Generate trip ideas and itineraries with AI-assisted planning.
- Revisit previous planning sessions and saved trip data.
- Use saved parks and preferences to plan future travel.
- Plan around live events, nearby context, and current conditions.

### Content and Community

- Blog platform with featured images, categories, and structured posts.
- User reviews with photos and community engagement features.
- Blog comments, testimonials, and saved content experiences across the app.
- Favorites, visited tracking, and profile-based travel history.

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

