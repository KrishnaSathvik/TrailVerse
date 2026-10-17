export function tripSurfacePath(tripId, surface) {
  const base = `/plan-ai/${encodeURIComponent(tripId)}`;
  return surface === 'map' ? `${base}/map` : surface === 'itinerary' ? `${base}/plan` : `${base}?chat=true`;
}
