'use client';

import { useEffect, useState } from 'react';
import parkSlugs from '@/data/park-slugs.json';
import npsApi from '@/services/npsApi';
import { imageAllowed } from '@/lib/trailieRichPresentation';

const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const BY_NAME = new Map(parkSlugs.map((park) => [normalize(park.fullName), park.parkCode]));

/** Exact canonical-name match only; an ambiguous or unknown destination gets no imagery. */
export function parkCodeForPlan(plan) {
  return parkCodesForPlan(plan)[0] || null;
}

const MAX_TRIP_PARKS = 3;
const KNOWN_CODES = new Set(parkSlugs.map((park) => park.parkCode));

/**
 * Official parks a trip covers, in plan order: the server's canonical
 * destinations first, then its primary park code, then an exact park-name match.
 */
export function parkCodesForPlan(plan) {
  const fromDestinations = (Array.isArray(plan?.destinations) ? plan.destinations : [])
    .filter((d) => d?.type === 'nps_park' && KNOWN_CODES.has(d.parkCode)).map((d) => d.parkCode);
  const codes = fromDestinations.length ? fromDestinations
    : KNOWN_CODES.has(plan?.parkCode) ? [plan.parkCode]
      : [BY_NAME.get(normalize(plan?.parkName))].filter(Boolean);
  return [...new Set(codes)].slice(0, MAX_TRIP_PARKS);
}

// The park's lead image is its curated hero; later record images are often
// archival or incidental, so one strong image beats a mixed strip.
export function officialParkImages(park, limit = 1) {
  return (Array.isArray(park?.images) ? park.images : [])
    .filter((image) => imageAllowed(image?.url))
    .slice(0, limit)
    .map((image) => ({ url: image.url, alt: image.altText || image.title || park.fullName || '', title: image.title || '' }));
}

/**
 * Existing official NPS park imagery for a canonical trip. Never blocks the
 * response: renders nothing until (and unless) eligible images arrive.
 */
export default function useTripImagery(plan, { enabled = true } = {}) {
  const key = enabled ? parkCodesForPlan(plan).join(',') : '';
  const [state, setState] = useState({ key: '', images: [] });
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    // One curated hero per park, so a multi-park trip shows each of its parks.
    Promise.all(key.split(',').map((code) => npsApi.getParkByCode(code)
      .then((park) => officialParkImages(park))
      .catch(() => [])))
      .then((perPark) => { if (live) setState({ key, images: perPark.flat() }); });
    return () => { live = false; };
  }, [key]);
  return state.key === key ? state.images : [];
}
