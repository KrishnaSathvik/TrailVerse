# Google Maps Integration Setup Guide

## Overview

TrailVerse now uses **Google Maps** exclusively for the interactive map page. This provides:
- Search-first UX (no API calls until user searches)
- Place Details with photos
- Nearby essentials (Food/Gas/Lodging)
- Route building with Directions
- Animated pins
- Graceful fallback to static maps

## 🔑 API Keys Setup

### 1. Backend Key (IP-Restricted)

**Server Environment Variable:**
```bash
# server/.env or server/.env.development
GMAPS_SERVER_KEY=your_ip_restricted_server_key
```

**Google Cloud Console Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select your project
3. Enable APIs:
   - Maps JavaScript API
   - Places API
   - Directions API
   - Distance Matrix API (optional)
4. Create API Key → "Server Key"
5. **Restrict by IP addresses:**
   - Add your server IP(s)
   - Add `127.0.0.1` for local development

**Used by:**
- Place Details (`/api/gmaps/place/:placeId`)
- Nearby Search (`/api/gmaps/nearby`)
- Photo Proxy (`/api/gmaps/photo`)
- Static Map (`/api/gmaps/static`)

### 2. Frontend Key (Referrer-Restricted)

**Client Environment Variable:**
```bash
# client/.env or client/.env.local
VITE_GMAPS_WEB_KEY=your_referrer_restricted_web_key
```

**Google Cloud Console Setup:**
1. Same project as above
2. Create API Key → "Web Key"
3. **Restrict by HTTP referrers:**
   - `http://localhost:3000/*` (development)
   - `https://www.nationalparksexplorerusa.com/*` (production)
   - `https://nationalparksexplorerusa.com/*` (production)

**Used by:**
- Maps JavaScript API (client-side rendering)
- Places Autocomplete (search)
- Directions rendering (client-side)

## 📦 Dependencies

### Backend (Already Installed)
```bash
# Existing dependencies - no new packages needed
node-fetch
node-cache
express
```

### Frontend (No New Dependencies)
All functionality uses native Google Maps JavaScript API loaded via script tag.

## 🗑️ Removing Leaflet (Optional)

If you want to completely remove the old Leaflet dependencies:

```bash
cd client
npm uninstall leaflet react-leaflet
```

## 🧪 Testing the Setup

### 1. Start the Backend
```bash
cd server
npm start
```

Verify routes are registered:
- Check console for no errors
- Visit `http://localhost:5001/api-docs` (Swagger docs should show `/api/gmaps` endpoints)

### 2. Start the Frontend
```bash
cd client
npm start
```

### 3. Test the Map Page

1. **Navigate to `/map`** (requires login)
2. **Initial State:**
   - Blank map (centered on USA)
   - Search box at top
   - No markers
   - ✅ **No network calls yet** (check Network tab)

3. **Search Test:**
   - Type "Yosemite National Park"
   - Select from autocomplete
   - Expected behavior:
     - Map centers and zooms
     - Main pin drops (animated)
     - Details card appears
     - Photos load (via proxy)
     - ✅ **1 call to `/api/gmaps/place/:id`**

4. **Essentials Test:**
   - Click "Food" chip
   - Expected behavior:
     - Spinner shows on chip
     - Mini orange pins drop
     - List appears below
     - Toast: "Loaded X restaurant nearby"
     - ✅ **1 call to `/api/gmaps/nearby`**

5. **Route Building Test:**
   - Click "Add This Park to Route"
   - Add 1-2 nearby places from essentials
   - Click "Build Route"
   - Expected behavior:
     - Blue route line appears
     - Map fits to bounds
     - Toast shows distance/time
     - ✅ **No server call** (client-side Directions)

6. **Fallback Test:**
   - Block Google Maps in DevTools (Network → Block request URL pattern)
   - Reload page
   - Expected behavior:
     - Static map image shows
     - Message: "Interactive map unavailable"
     - "Open in Google Maps" button works
     - Details card still functions

## 💰 Cost Controls (Already Implemented)

### Built-in Optimizations:
1. **No calls until search** → Zero cost at page load
2. **Field masks on Place Details** → Only fetch needed fields
3. **Server-side caching:**
   - Place Details: 3 days
   - Nearby: 1 day
   - Photos: 30 days
   - Static Maps: 30 days
4. **Client-side Directions** → No server charge
5. **Session tokens on Autocomplete** → Multiple keystrokes = 1 session

### Recommended GCP Settings:
1. **Set daily quotas per API**:
   - Places API: 1,000/day (free tier covers this)
   - Maps JavaScript API: unlimited (free)
   - Directions API: 500/day

2. **Budget alerts**:
   - Set alert at $5/month
   - Set hard cap at $10/month

3. **Monitor usage**:
   - Check GCP Console weekly
   - Review cache hit rates in server logs

## 🐛 Troubleshooting

### Map Won't Load

**Symptom:** Blank white div, no map
**Causes:**
1. Missing `VITE_GMAPS_WEB_KEY`
2. Incorrect referrer restrictions
3. APIs not enabled in GCP

**Fix:**
- Check browser console for errors
- Verify `.env` file exists and is loaded
- Check GCP Console → Credentials → API Key restrictions

### Place Details Fail

**Symptom:** Card doesn't appear after search
**Causes:**
1. Missing `GMAPS_SERVER_KEY`
2. IP restrictions blocking server
3. Places API not enabled

**Fix:**
- Check server logs for error messages
- Verify server IP is in allowed list
- Test with `curl http://localhost:5001/api/gmaps/place/VALID_PLACE_ID`

### Photos Don't Load

**Symptom:** Empty photo strip or broken images
**Causes:**
1. Photo references expired (rare)
2. Server key restrictions too strict
3. Cache issue

**Fix:**
- Check Network tab → `/api/gmaps/photo` status
- Clear cache: restart server
- Verify server key has Places API access

### Nearby Search Returns Empty

**Symptom:** "No X found within 10 km"
**Causes:**
1. Actually no results (remote location)
2. Type parameter mismatch
3. Radius too small

**Fix:**
- Try different location (e.g., city center)
- Check console for API errors
- Increase radius in `googlePlacesService.js` if needed

## 📊 Monitoring

### Server Logs
```bash
# Watch for cache hit/miss rates
tail -f server/logs/access.log | grep gmaps

# Monitor API errors
tail -f server/logs/error.log | grep "Google Maps"
```

### GCP Console
1. **APIs & Services → Dashboard**
   - View requests per API
   - Check error rates
   - Monitor quotas

2. **Billing → Reports**
   - Track costs per API
   - Set up alerts

## 🚀 Production Deployment

### Environment Variables
```bash
# Vercel/Production
GMAPS_SERVER_KEY=prod_server_key
VITE_GMAPS_WEB_KEY=prod_web_key
```

### Pre-deployment Checklist:
- [ ] Both API keys created and restricted
- [ ] All APIs enabled in GCP project
- [ ] Budget alerts configured
- [ ] Referrer restrictions updated for production domain
- [ ] Server IP restrictions updated for production IPs
- [ ] Test map on production domain
- [ ] Monitor costs for first week

## 📝 Files Created/Modified

### Backend
- ✅ `server/src/routes/gmaps.js` (new)
- ✅ `server/src/app.js` (route registered)

### Frontend
- ✅ `client/src/lib/loadMaps.js` (new)
- ✅ `client/src/lib/pins.js` (new)
- ✅ `client/src/services/googlePlacesService.js` (new)
- ✅ `client/src/components/common/Spinner.jsx` (new)
- ✅ `client/src/components/map/MapErrorBoundary.jsx` (new)
- ✅ `client/src/components/map/StaticMapFallback.jsx` (new)
- ✅ `client/src/pages/MapPage.jsx` (replaced - Google only)
- ✅ `client/src/index.css` (pin animations added)
- ✅ `client/src/utils/toastHelper.js` (new)

## 🎨 Features Implemented

### Core Features:
- [x] Search-first map (no calls until user searches)
- [x] Places Autocomplete (US only)
- [x] Single main pin with animation
- [x] Place Details card (name, address, rating, hours, photos)
- [x] Food/Gas/Lodging chips (on-demand Nearby search)
- [x] Mini pins for essentials (color-coded, animated)
- [x] Photo proxy (hides web key, 30-day cache)
- [x] Route builder (add stops, build route, clear route)
- [x] Directions polyline (client-side)
- [x] Route distance/duration display
- [x] "Open in Google Maps" links
- [x] Loading spinners
- [x] Skeleton loaders
- [x] Toast notifications
- [x] Error boundary
- [x] Static map fallback
- [x] Offline detection
- [x] Responsive design (mobile + desktop)

### Cost Optimizations:
- [x] Field masks on all API calls
- [x] Multi-tier caching (3d/1d/30d)
- [x] Session tokens for Autocomplete
- [x] Client-side Directions (no server cost)
- [x] Lazy loading (no calls until interaction)

## 📚 API Reference

### Backend Endpoints

#### `GET /api/gmaps/place/:placeId`
Returns Place Details with field masking.

**Response:**
```json
{
  "place_id": "ChIJ...",
  "name": "Yosemite National Park",
  "address": "California 95389, USA",
  "lat": 37.8651,
  "lng": -119.5383,
  "rating": 4.8,
  "user_ratings_total": 50000,
  "opening_hours": ["Monday: Open 24 hours", ...],
  "photo_refs": ["CmRaAAAA...", ...],
  "website": "https://www.nps.gov/yose"
}
```

#### `GET /api/gmaps/nearby?lat=X&lng=Y&type=restaurant&radius=10000`
Returns nearby places of specified type.

**Response:**
```json
[
  {
    "place_id": "ChIJ...",
    "name": "Mountain Café",
    "lat": 37.8652,
    "lng": -119.5385,
    "rating": 4.5,
    "address": "123 Park Rd, CA"
  },
  ...
]
```

#### `GET /api/gmaps/photo?ref=CmRaAAAA...&w=800`
Returns optimized JPEG image (proxied from Google).

#### `GET /api/gmaps/static?center=lat,lng&zoom=9&w=1200&h=560&markers=...`
Returns static map PNG (fallback).

## 🔗 Resources

- [Google Maps JavaScript API Docs](https://developers.google.com/maps/documentation/javascript)
- [Places API Docs](https://developers.google.com/maps/documentation/places/web-service)
- [Directions API Docs](https://developers.google.com/maps/documentation/directions)
- [Google Cloud Console](https://console.cloud.google.com/)

## 🎉 Success!

Your Google Maps integration is now complete. The map page offers a rich, interactive experience with:
- **Zero API calls** until the user searches
- **Beautiful animations** on pins
- **On-demand essentials** (food, gas, lodging)
- **Route building** with distance/time
- **Graceful fallbacks** when offline or if APIs fail

Enjoy exploring national parks with TrailVerse! 🏞️

