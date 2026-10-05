'use client';

import Script from 'next/script';
import { getGmapsMapId, installMapsRuntimeGuard, reportMapsRuntimeFailure } from '@/lib/mapsRuntimeStatus';

/**
 * Loads the Google Maps JavaScript API once across the app.
 *
 * Requires NEXT_PUBLIC_GMAPS_WEB_KEY in env. This must be a browser key
 * restricted to HTTP referrers, including local 127.0.0.1 and localhost if
 * you demo locally. The server-side Places/Distance Matrix key must not be
 * reused here.
 *
 * Requires NEXT_PUBLIC_GMAPS_MAP_ID from the same Google Cloud project
 * (Advanced Markers). Missing/empty Map ID uses the maps-readiness surface
 * rather than a placeholder name.
 *
 * Libraries:
 *   - marker  → AdvancedMarkerElement (modern, replaces deprecated Marker)
 *   - places  → Autocomplete widget for AddPlaceInput
 */
export default function GoogleMapsLoader() {
  installMapsRuntimeGuard();
  const key = process.env.NEXT_PUBLIC_GMAPS_WEB_KEY;
  if (!key) {
    reportMapsRuntimeFailure('missing_browser_key');
    return null;
  }
  if (!getGmapsMapId()) {
    reportMapsRuntimeFailure('missing_map_id');
  }
  return (
    <Script
      src={`https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker,places&v=weekly&loading=async`}
      strategy="afterInteractive"
      onError={() => reportMapsRuntimeFailure('script_load_error')}
    />
  );
}
