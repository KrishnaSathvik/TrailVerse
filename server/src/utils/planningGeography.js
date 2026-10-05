'use strict';

/**
 * Generic planning geography: states, named regions, park groups.
 * Not park-specific. Used when a traveler names a place that is not an NPS park.
 */

const { STATE_CODE_TO_SLUG, STATE_NAMES } = require('./discoverUtils');

const STATE_CENTROIDS = Object.freeze({
  AL: [32.8, -86.8], AK: [64.2, -153.5], AZ: [34.3, -111.7], AR: [34.9, -92.4],
  CA: [37.2, -119.5], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.6, -83.4], HI: [20.8, -156.3],
  ID: [44.4, -114.6], IL: [40.0, -89.3], IN: [39.9, -86.3], IA: [42.0, -93.5],
  KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.0, -92.0], ME: [45.3, -69.2],
  MD: [39.0, -76.7], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3],
  MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -110.0], NE: [41.5, -99.7],
  NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.1, -74.5], NM: [34.4, -106.1],
  NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.3], OH: [40.3, -82.8],
  OK: [35.6, -97.5], OR: [44.0, -120.5], PA: [40.9, -77.8], RI: [41.7, -71.6],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3],
  UT: [39.3, -111.7], VT: [44.0, -72.7], VA: [37.5, -78.6], WA: [47.4, -120.5],
  WV: [38.6, -80.6], WI: [44.3, -89.8], WY: [43.0, -107.6],
  AS: [-14.3, -170.7], GU: [13.4, 144.8], PR: [18.2, -66.5], VI: [18.3, -64.8],
});

const NAMED_REGIONS = Object.freeze([
  {
    id: 'southwest',
    type: 'region',
    labels: ['the southwest', 'american southwest', 'southwest'],
    displayName: 'the American Southwest',
    latitude: 36.1,
    longitude: -111.2,
    confidence: 0.85,
  },
  {
    id: 'pacific-northwest',
    type: 'region',
    labels: ['pacific northwest', 'the pacific northwest', 'pnw'],
    displayName: 'the Pacific Northwest',
    latitude: 45.5,
    longitude: -122.5,
    confidence: 0.85,
  },
  {
    id: 'mighty-five',
    type: 'park_group',
    labels: ['the mighty five', 'mighty five'],
    displayName: 'the Mighty Five',
    latitude: 38.2,
    longitude: -111.0,
    confidence: 0.8,
  },
  {
    id: 'american-west',
    type: 'region',
    labels: ['out west', 'the american west'],
    displayName: 'the American West',
    latitude: 40.0,
    longitude: -110.0,
    confidence: 0.35,
  },
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toGeoEntity({ entityId, entityType, displayName, latitude, longitude, confidence, order }) {
  return {
    entityId,
    entityType,
    parkCode: null,
    displayName,
    latitude,
    longitude,
    resolutionConfidence: confidence,
    order,
    status: latitude != null && longitude != null ? 'resolved' : 'unresolved_coords',
    source: 'planning_geography',
  };
}

function resolveStatesFromMessage(lower) {
  const found = [];
  for (const [code, slug] of Object.entries(STATE_CODE_TO_SLUG)) {
    const name = String(STATE_NAMES[code] || slug.replace(/-/g, ' ')).toLowerCase();
    if (code === 'WA') {
      if (!/\bwashington state\b|\bstate of washington\b/.test(lower)) continue;
    } else if (code === 'NY') {
      if (/\bnew york city\b|\bnyc\b/.test(lower) && !/\bnew york state\b/.test(lower)) continue;
    }
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`);
    if (!pattern.test(lower)) continue;
    const centroid = STATE_CENTROIDS[code] || [null, null];
    found.push(toGeoEntity({
      entityId: `geo:state:${code.toLowerCase()}`,
      entityType: 'state',
      displayName: STATE_NAMES[code] || name,
      latitude: centroid[0],
      longitude: centroid[1],
      confidence: 0.9,
      order: found.length,
    }));
  }
  return found;
}

function resolveRegionsFromMessage(lower) {
  const found = [];
  for (const region of NAMED_REGIONS) {
    const labels = [...region.labels].sort((a, b) => b.length - a.length);
    const hit = labels.find((label) => lower.includes(label));
    if (!hit) continue;
    if (region.id === 'southwest' && /\bpacific northwest\b/.test(lower) && hit === 'southwest') continue;
    found.push(toGeoEntity({
      entityId: `geo:${region.type}:${region.id}`,
      entityType: region.type,
      displayName: region.displayName,
      latitude: region.latitude,
      longitude: region.longitude,
      confidence: region.confidence,
      order: found.length,
    }));
  }
  return found;
}

function isRegionalParksAsk(message) {
  return /\bnational parks\b/i.test(String(message || ''));
}

function resolvePlanningGeographyFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return [];
  const regions = resolveRegionsFromMessage(lower);
  const states = resolveStatesFromMessage(lower);
  const merged = [];
  const seen = new Set();
  for (const entity of [...regions, ...states]) {
    if (!entity.entityId || seen.has(entity.entityId)) continue;
    seen.add(entity.entityId);
    merged.push({ ...entity, order: merged.length });
  }
  return merged;
}

module.exports = {
  resolvePlanningGeographyFromMessage,
  isRegionalParksAsk,
  NAMED_REGIONS,
};
