# Trail Data Sources — Research Notes

**Date:** April 2024
**Status:** On hold — not currently needed

## Problem

The NPS `thingstodo` endpoint returns hiking activities (title, description, tags) but no actual trail metrics — no distance, elevation, difficulty ratings, or GPS paths. If we want a "Trails" tab on park detail pages, we need external data.

## Data Source Landscape

There is no single free, comprehensive trail data source. The landscape is fragmented.

### AllTrails (Private)
- **What it offers:** Most comprehensive dataset — distance, difficulty, elevation, reviews, GPS tracks
- **Limitation:** API is private, no public access
- **Verdict:** Not usable without licensing/scraping (legally risky)

### Hiking Project / REI (Defunct)
- **What it offered:** Good structured trail API
- **Limitation:** Shut down, no longer available
- **Verdict:** Dead end

### OpenStreetMap Overpass API (Best Free Option)
- **What it offers:** Free, no API key required, good trail geometry/GPS coordinates, global coverage
- **Limitations:**
  - Community-maintained — quality varies by region
  - Difficulty tags (`sac_scale`) are sparse for US trails (exact coverage unknown, likely under 40%)
  - No elevation data — coordinates are 2D only
  - Rate limits exist (no auth, but aggressive querying gets blocked)
- **Verdict:** Best free option for trail geometry, but needs supplementation

### USFS Trail Data (Government)
- **What it offers:** Official data, detailed for National Forest lands
- **Limitations:**
  - Only covers National Forest lands — does NOT cover National Parks (those are NPS)
  - Better suited as a periodic bulk import than a live API
- **Verdict:** Useful supplement for forest areas only

### RIDB / Recreation.gov (Already Integrated)
- **What it offers:** Recreation facility data
- **Our integration:** `server/src/services/ridbService.js` — currently used for **permits only** (timed entry, ticket facilities, backcountry permits)
- **Limitations:** Facility/permit-focused by design; trail data is essentially nonexistent
- **Verdict:** Not a trail data source despite being in our stack

### TrailAPI on RapidAPI (Freemium)
- **What it offers:** Structured difficulty, distance, photos
- **Limitations:**
  - Freemium with rate limits
  - Third-party RapidAPI services can disappear without notice
  - Reliability/longevity concerns
- **Verdict:** Risky dependency

### NPS API (Current Integration)
- **What it offers:** Activity descriptions, tags, images via `thingstodo` endpoint
- **Limitations:** No trail metrics whatsoever (no distance, elevation, difficulty, GPS)
- **Our integration:** `server/src/services/npsService.js`
- **Verdict:** Good for context/descriptions, useless for trail data

## Recommended Approach (When Ready)

### Option 1: Assemble from free sources (recommended)

Combine multiple sources to build a complete picture:

| Data | Source |
|------|--------|
| Trail geometry/routes | OpenStreetMap Overpass API |
| Elevation profiles | Open-Elevation API or USGS elevation service |
| Difficulty ratings | Derive from elevation gain + distance (OSM tags too sparse) |
| Descriptions/context | NPS thingstodo (already have this) |

**Proposed architecture:**
1. **Backend:** New `/api/trails/:parkCode` endpoint that queries Overpass by park boundary coordinates, enriches with elevation data, calculates derived difficulty, normalizes everything, and caches in MongoDB (24-48hr TTL)
2. **Frontend:** "Trails" tab on park detail pages with difficulty/distance filters, trail cards, and optional map overlay showing trail paths

### Option 2: License commercial data
- Comprehensive but paid — would need to evaluate cost vs. value

### Option 3: Crowdsource our own trail data
- Long-term play with a cold start problem
- Only viable once user base is large enough

## Key Gotchas

- Overpass returns 2D coordinates — **elevation requires a separate API call** (often overlooked)
- Difficulty ratings can be derived: flat + short = easy, steep + long = hard (use a simple formula based on elevation gain per mile)
- Any RapidAPI trail service may disappear without notice
- AllTrails has effectively monopolized trail data via crowdsourcing and keeps it locked down
- Caching is essential for Overpass — don't hit it on every page load
