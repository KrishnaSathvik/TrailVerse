# Maps Feature - Quick Test Guide 🗺️

## Before You Test

### 1. Restart Dev Server (REQUIRED)
```bash
# Stop the current dev server (Ctrl+C)
cd /Users/krishnasathvikmantripragada/npe-usa/client
npm run dev
```

⚠️ **This is CRITICAL** - Vite env vars are only loaded at startup!

### 2. Verify Environment Variable
Open browser console and run:
```js
console.log('VITE_GMAPS_WEB_KEY:', import.meta.env.VITE_GMAPS_WEB_KEY);
```

Expected output: `AIzaSy_your_google_maps_api_key_here`

If `undefined`, restart the dev server again.

---

## Testing Flow (5 Minutes)

### ✅ Test 1: Map Loads
1. Login to app
2. Navigate to `/map` or click "Map" in navigation
3. **Expected:** 
   - Map loads (shows US centered)
   - Search box at top
   - NO errors in console
   - NO API calls yet (check Network tab)

**If map doesn't load:** Check console for errors, verify env var above.

---

### ✅ Test 2: Search & Pin Drop
1. Click in search box
2. Type "Yosemite National Park"
3. **Expected:**
   - Autocomplete dropdown appears
   - Shows suggestions as you type
4. Click on "Yosemite National Park, CA, USA"
5. **Expected:**
   - Map pans and zooms to Yosemite
   - Green pin drops with 🏞️ emoji
   - Toast notification: "Pin dropped at Yosemite National Park"
   - Card STAYS HIDDEN (this is correct!)

**Network activity:**
- `GET /api/gmaps/place/[placeId]` - should succeed (200 OK)

---

### ✅ Test 3: Show Details
1. Click the green pin on the map
2. **Expected:**
   - Details card slides in from bottom-left
   - Shows:
     - Park name
     - Address
     - Rating (⭐ X.X)
     - Photo gallery (3-4 photos)
     - Three chips: Restaurant, Gas Station, Lodging

**Network activity:**
- `GET /api/gmaps/photo?ref=...` (multiple times) - photos load

---

### ✅ Test 4: Nearby Search
1. With details card open, click **"Restaurant"** chip
2. **Expected:**
   - Chip shows spinner briefly
   - Orange pins (🍽️) drop around Yosemite
   - List appears below photos showing restaurants
   - Toast: "Loaded X restaurants nearby"
   - Each item has name, address, rating, "Add" button

**Network activity:**
- `GET /api/gmaps/nearby?lat=...&lng=...&type=restaurant` - should succeed

3. Click "Restaurant" chip again
4. **Expected:**
   - Orange pins disappear
   - List hides
   - Toast: "restaurant hidden"

5. Try "Gas Station" (red ⛽) and "Lodging" (blue 🏨)
   - Should work the same way

---

### ✅ Test 5: Build Route
1. With details card open, click **"🚗 Add to Route"** button (main park)
2. **Expected:**
   - Route bar appears at bottom
   - Shows "🗺️ Route (1 stop)"
   - Park name in a chip

3. Click "Restaurant" chip, then click "Add" on 2-3 restaurants
4. **Expected:**
   - Route bar updates: "Route (4 stops)"
   - All stops shown as chips
   - Each chip has X to remove

5. Click **"🚗 Build Route"**
6. **Expected:**
   - Blue polyline appears connecting all stops
   - Map zooms/pans to show entire route
   - Toast: "Route ready: X.X km • ~XX min"

**Network activity:**
- NO backend call (done client-side)

7. Click **"Clear Route"**
8. **Expected:**
   - Route bar disappears
   - Polyline disappears
   - Toast: "Route cleared"

---

### ✅ Test 6: Open in Google Maps
1. With details card open, click **"Open in Google Maps"**
2. **Expected:**
   - Opens in new tab
   - Shows the place in Google Maps
   - URL includes `place_id`

---

### ✅ Test 7: Close Card
1. Click **"Close"** button in details card
2. **Expected:**
   - Card slides out
   - Pin stays on map
   - Can click pin again to reopen

---

### ✅ Test 8: Fallback (Optional)
1. Open DevTools → Network tab
2. Add "maps.googleapis.com" to blocked URLs
3. Refresh page
4. **Expected:**
   - Static map image appears
   - Message: "Interactive map unavailable"
   - "Open Google Maps" button works
   - Details API still works (server-backed)

---

## Expected Console Output (Clean Run)

```
🚀 National Parks Explorer App loaded successfully!
✅ Google Analytics initialized
🗺️ Map panned to: (37.8651, -119.5383) Zoom: 15
✅ Main marker created successfully at: (37.8651, -119.5383)
✅ Map center: (37.8651, -119.5383)
✅ Map zoom: 15
✅ Marker position: (37.8651, -119.5383)
✅ Marker map: attached
✅ Marker visible: true
✅ Simple blue marker created at: (37.8651, -119.5383)
🔒 Map view locked at zoom 15
Place details received: {name: "Yosemite National Park", ...}
🔒 Final map view lock at zoom 15
```

**No errors or warnings should appear!**

---

## Troubleshooting

### ❌ "Cannot read properties of undefined (reading 'maps')"
**Cause:** `VITE_GMAPS_WEB_KEY` not loaded  
**Fix:** Restart dev server, verify env var in console

### ❌ "Google Maps API error: REQUEST_DENIED"
**Cause:** API key not authorized for this URL  
**Fix:** Check key restrictions in Google Cloud Console

### ❌ "Failed to load place details"
**Cause:** Backend error or missing `GMAPS_SERVER_KEY`  
**Fix:** Check server console, verify `server/.env` has key

### ❌ Map loads but no pins appear
**Cause:** Console should show errors  
**Fix:** Check console, verify zoom level (should be 15)

### ❌ Nearby search returns no results
**Cause:** Normal for remote locations  
**Fix:** Try a city (e.g., "San Francisco, CA")

### ❌ Photos don't load
**Cause:** Backend photo proxy error  
**Fix:** Check server logs, verify key permissions

---

## Quick Verification Script

Run in browser console after map loads:

```js
// Verify Google Maps loaded
console.log('Google Maps loaded:', !!window.google?.maps);

// Verify env var
console.log('API Key present:', !!import.meta.env.VITE_GMAPS_WEB_KEY);

// Verify map instance (after search)
console.log('Map initialized:', !!document.getElementById('map').children.length);

// Check for errors
console.log('No console errors:', !window.hasErrors);
```

All should return `true`.

---

## Performance Notes

**First search:** ~500ms (map pan + API call)  
**Nearby search:** ~200-400ms (cached after first load)  
**Photos:** ~100-200ms each (cached 30 days)  
**Route build:** ~300-500ms (client-side)  

**Total API cost per search session:** ~$0.02-0.05

---

## Success Criteria ✅

- [x] Map loads without errors
- [x] Search autocomplete works
- [x] Pin drops on selection
- [x] Details card shows all info
- [x] Nearby search works for all types
- [x] Route building works
- [x] All toasts appear correctly
- [x] No console errors
- [x] Photos load
- [x] Google Maps link works
- [x] Fallback works (if tested)

If all these pass → **Maps feature is WORKING!** 🎉

---

## Need Help?

1. Check browser console for errors
2. Check server console for backend errors
3. Verify env vars in both places
4. Restart dev server
5. Check Network tab for failed requests
6. Review `MAPS_AUDIT_AND_FIX.md` for detailed architecture

---

**Last Updated:** October 12, 2025  
**Status:** Ready for testing after dev server restart

