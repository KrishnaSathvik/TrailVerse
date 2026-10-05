'use strict';

/**
 * Travel & Stay Logistics v1 — pure contract module.
 * Offline, provider-neutral. No network I/O.
 */

const { createHash } = require('crypto');

const TRAVEL_LOGISTICS_SCHEMA_VERSION = 1;
const INVENTORY_MODES = Object.freeze(['planning', 'live']);

const TRANSPORT_MODES = Object.freeze(['drive', 'fly', 'unknown']);

const DEPARTURE_STATUSES = Object.freeze([
  'available',
  'not_requested',
  'not_verified',
  'unknown',
]);

const LIST_STATUSES = Object.freeze([
  'not_requested',
  'available',
  'no_results',
  'provider_unavailable',
  'not_verified',
]);

const INSIDE_PARK_STATUSES = Object.freeze([
  'verified',
  'not_verified',
  'verified_none',
]);

const DRIVE_CAP_STATUSES = Object.freeze([
  'not_requested',
  'available',
  'unknown',
]);

const ACCOMMODATION_CLASSES = Object.freeze(['camping', 'lodging', 'unknown']);

const STAY_PREFERENCES = Object.freeze([
  'campground',
  'rv',
  'lodge',
  'hotel',
  'cabin',
  'vacation_rental',
  'unknown',
]);

const EVIDENCE_STATUSES = Object.freeze(['verified', 'estimated', 'unknown']);

const PROVENANCE_SOURCE_TYPES = Object.freeze([
  'official',
  'nps',
  'google_places',
  'google_maps',
  'curated_catalog',
  'derived',
]);

const STAY_CARD_PRICE_KEYS = Object.freeze(['price', 'priceUsd', 'nightlyRate']);
const COMMERCIAL_CLAIM_KEYS = Object.freeze([
  'price',
  'priceUsd',
  'nightlyRate',
  'fare',
  'currentPrice',
  'roomsLeft',
  'sitesLeft',
  'availability',
  'departureTime',
  'arrivalTime',
  'flightNumber',
  'bookNowUrl',
]);

const METERS_PER_MILE = 1609.344;

function emptyProvenance() {
  return {
    sourceType: null,
    sourceName: null,
    evidenceStatus: 'unknown',
    observedAt: null,
    sourceUpdatedAt: null,
    officialUrl: null,
    livePrice: false,
    liveAvailability: false,
  };
}

function emptyTravelLogistics() {
  return {
    schemaVersion: TRAVEL_LOGISTICS_SCHEMA_VERSION,
    inventoryMode: 'planning',
    destination: {
      parkCode: null,
      parkName: null,
      entityId: null,
    },
    transport: {
      mode: 'unknown',
      departure: {
        city: null,
        airportCode: null,
        status: 'not_requested',
      },
      airports: [],
      airportsStatus: 'not_requested',
      routeLegs: [],
      routeLegsStatus: 'not_requested',
      driveCap: {
        maxDailyDriveMinutes: null,
        status: 'not_requested',
      },
    },
    stays: {
      accommodationClass: 'unknown',
      stayPreference: 'unknown',
      insidePark: {
        status: 'not_verified',
        properties: [],
      },
      gateway: {
        status: 'not_requested',
        areaLabel: null,
        properties: [],
      },
      campgrounds: {
        status: 'not_requested',
        properties: [],
      },
      vacationRentalHint: null,
    },
  };
}

function normalizeTravelLogistics(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, value: null, errors: ['travelLogistics must be a plain object'] };
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'version') && !Object.prototype.hasOwnProperty.call(raw, 'schemaVersion')) {
    return {
      ok: false,
      value: null,
      errors: ['ambiguous top-level version without schemaVersion; use schemaVersion only'],
    };
  }

  const schemaVersion = raw.schemaVersion;
  if (schemaVersion == null) {
    return { ok: false, value: null, errors: ['schemaVersion is required'] };
  }

  if (schemaVersion !== TRAVEL_LOGISTICS_SCHEMA_VERSION) {
    return {
      ok: false,
      value: null,
      errors: [`unsupported schemaVersion: ${schemaVersion}`],
    };
  }

  const shell = emptyTravelLogistics();
  const value = {
    ...shell,
    ...raw,
    transport: {
      ...shell.transport,
      ...(raw.transport || {}),
      departure: {
        ...shell.transport.departure,
        ...((raw.transport && raw.transport.departure) || {}),
      },
      driveCap: {
        ...shell.transport.driveCap,
        ...((raw.transport && raw.transport.driveCap) || {}),
      },
      airports: Array.isArray(raw.transport?.airports) ? raw.transport.airports : shell.transport.airports,
      routeLegs: Array.isArray(raw.transport?.routeLegs) ? raw.transport.routeLegs : shell.transport.routeLegs,
    },
    stays: {
      ...shell.stays,
      ...(raw.stays || {}),
      insidePark: {
        ...shell.stays.insidePark,
        ...((raw.stays && raw.stays.insidePark) || {}),
        properties: Array.isArray(raw.stays?.insidePark?.properties)
          ? raw.stays.insidePark.properties
          : shell.stays.insidePark.properties,
      },
      gateway: {
        ...shell.stays.gateway,
        ...((raw.stays && raw.stays.gateway) || {}),
        properties: Array.isArray(raw.stays?.gateway?.properties)
          ? raw.stays.gateway.properties
          : shell.stays.gateway.properties,
      },
      campgrounds: {
        ...shell.stays.campgrounds,
        ...((raw.stays && raw.stays.campgrounds) || {}),
        properties: Array.isArray(raw.stays?.campgrounds?.properties)
          ? raw.stays.campgrounds.properties
          : shell.stays.campgrounds.properties,
      },
      vacationRentalHint:
        raw.stays && Object.prototype.hasOwnProperty.call(raw.stays, 'vacationRentalHint')
          ? raw.stays.vacationRentalHint
          : shell.stays.vacationRentalHint,
    },
  };

  if (Object.prototype.hasOwnProperty.call(value, 'version')) {
    delete value.version;
  }

  if (!INVENTORY_MODES.includes(value.inventoryMode)) {
    return { ok: false, value: null, errors: ['inventoryMode must be planning or live'] };
  }

  return { ok: true, value, errors: [] };
}

function assertNoLiveCommercialClaimsOnNode(node, path = 'travelLogistics') {
  if (node == null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      assertNoLiveCommercialClaimsOnNode(node[i], `${path}[${i}]`);
    }
    return;
  }

  if (node.livePrice === true) {
    throw new Error(`${path}: livePrice must remain false in v1`);
  }

  if (node.liveAvailability === true) {
    throw new Error(`${path}: liveAvailability must remain false in v1`);
  }

  const looksLikeStayCard = Object.prototype.hasOwnProperty.call(node, 'propertyId')
    || Object.prototype.hasOwnProperty.call(node, 'locationClass');

  if (looksLikeStayCard) {
    for (const key of STAY_CARD_PRICE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(node, key) && node[key] != null) {
        throw new Error(`${path}: commercial price field "${key}" is not allowed in v1`);
      }
    }
  }

  for (const [key, child] of Object.entries(node)) {
    if (child != null && typeof child === 'object') {
      assertNoLiveCommercialClaimsOnNode(child, `${path}.${key}`);
    }
  }
}

function assertNoLiveCommercialClaims(travelLogistics) {
  assertNoLiveCommercialClaimsOnNode(travelLogistics);
}

function hasCommercialClaim(node) {
  return COMMERCIAL_CLAIM_KEYS.some((key) => (
    Object.prototype.hasOwnProperty.call(node, key) && node[key] != null
  ));
}

function hasValidLiveProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (!provenance.provider || provenance.sourceType !== 'live_inventory' || !provenance.fetchedAt) {
    return false;
  }
  return Number.isFinite(Date.parse(provenance.fetchedAt));
}

function assertCommercialClaimsOnNode(node, inventoryMode, path = 'travelLogistics') {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertCommercialClaimsOnNode(child, inventoryMode, `${path}[${index}]`));
    return;
  }

  const commercialClaim = hasCommercialClaim(node)
    || node.livePrice === true
    || node.liveAvailability === true;
  if (commercialClaim && inventoryMode === 'planning') {
    throw new Error(`${path}: planning_inventory_commercial_claim`);
  }
  if (commercialClaim && inventoryMode === 'live' && !hasValidLiveProvenance(node.provenance)) {
    throw new Error(`${path}: live_inventory_provenance_missing`);
  }

  for (const [key, child] of Object.entries(node)) {
    if (key === 'provenance') continue;
    if (child != null && typeof child === 'object') {
      assertCommercialClaimsOnNode(child, inventoryMode, `${path}.${key}`);
    }
  }
}

function assertCommercialInventorySafety(travelLogistics) {
  if (!travelLogistics || typeof travelLogistics !== 'object') {
    throw new Error('travelLogistics: inventory_payload_invalid');
  }
  const inventoryMode = travelLogistics.inventoryMode || 'planning';
  if (!INVENTORY_MODES.includes(inventoryMode)) {
    throw new Error('travelLogistics: inventory_mode_invalid');
  }
  assertCommercialClaimsOnNode(travelLogistics, inventoryMode);
}

function buildDriveLegId({ originEntityId, destinationEntityId, travelMode } = {}) {
  const origin = String(originEntityId ?? '');
  const destination = String(destinationEntityId ?? '');
  const mode = String(travelMode ?? 'unknown');
  const digest = createHash('sha256')
    .update(`${origin}|${destination}|${mode}`)
    .digest('hex')
    .slice(0, 12);
  return `leg:${digest}`;
}

function buildAirportEntityId(airportCode) {
  const code = String(airportCode || '').trim().toUpperCase();
  return code ? `airport:${code}` : 'airport:unknown';
}

function metersToMiles(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return null;
  return value / METERS_PER_MILE;
}

module.exports = {
  TRAVEL_LOGISTICS_SCHEMA_VERSION,
  INVENTORY_MODES,
  TRANSPORT_MODES,
  DEPARTURE_STATUSES,
  LIST_STATUSES,
  INSIDE_PARK_STATUSES,
  DRIVE_CAP_STATUSES,
  ACCOMMODATION_CLASSES,
  STAY_PREFERENCES,
  EVIDENCE_STATUSES,
  PROVENANCE_SOURCE_TYPES,
  emptyProvenance,
  emptyTravelLogistics,
  normalizeTravelLogistics,
  assertNoLiveCommercialClaims,
  assertCommercialInventorySafety,
  buildDriveLegId,
  buildAirportEntityId,
  metersToMiles,
};
