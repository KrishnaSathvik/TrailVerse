'use client';

import Script from 'next/script';

/**
 * Loads the Google Maps JavaScript API once across the app.
 *
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_KEY in env. This must be a key
 * RESTRICTED TO YOUR DOMAIN (HTTP referrers). Your existing
 * server-side Places key should NOT be reused here — keep them separate.
 *
 * Libraries:
 *   - marker  → AdvancedMarkerElement (modern, replaces deprecated Marker)
 *   - places  → Autocomplete widget for AddPlaceInput
 */
export default function GoogleMapsLoader() {
  return (
    <Script
      src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GMAPS_WEB_KEY}&libraries=marker,places&v=weekly&loading=async`}
      strategy="afterInteractive"
    />
  );
}
