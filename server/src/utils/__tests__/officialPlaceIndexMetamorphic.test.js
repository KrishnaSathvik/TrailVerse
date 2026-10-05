'use strict';

/**
 * Phase 12E — generic official-place identity / coordinate coverage.
 *
 * Synthetic official NPS-shaped rows only. Destinations are not 12A–12D parks
 * and not frozen Hurricane Ridge / Mormon Row / Phelps Lake goldens.
 * Asserts identity classes, not exact prose.
 */

const { canonicalExperienceKey } = require('../canonicalExperience');
const {
  buildOfficialPlaceIndex,
  lookupOfficialPlace,
  extractOfficialCoordinates,
} = require('../officialPlaceIndex');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
  evaluateNamedExperienceSatisfaction,
} = require('../namedExperienceRequirements');
const { degradeUnresolvedModelStops } = require('../modelSelectedIdentityDegradation');
const { resolveDestinationsFromMessage } = require('../genericDestinationResolver');
const {
  COORDINATE_SOURCE,
  hasAuthoritativeCoordinates,
  hasUsableCoordinates,
} = require('../coordinateValidation');
const { enrichKnownStopLocations } = require('../knownOutdoorLocations');

const ISRO = Object.freeze({
  name: 'Isle Royale National Park',
  code: 'isro',
  entityId: 'nps:park:isro',
});
const HOSP = Object.freeze({
  name: 'Hot Springs National Park',
  code: 'hosp',
  entityId: 'nps:park:hosp',
});

const PLACES = Object.freeze({
  greenstone: {
    id: 'ev:isro-greenstone',
    npsId: 'AAAA1111-0000-4000-8000-000000000001',
    name: 'Greenstone Ridge Trail',
    type: 'trail',
    parkCode: ISRO.code,
    latitude: 48.001,
    longitude: -88.831,
  },
  rockHarbor: {
    id: 'ev:isro-rock-harbor',
    npsId: 'AAAA1111-0000-4000-8000-000000000002',
    name: 'Rock Harbor Overlook',
    type: 'viewpoint',
    parkCode: ISRO.code,
    latitude: 48.145,
    longitude: -88.485,
    aliases: ['Rock Harbor Lookout'],
  },
  obrien: {
    id: 'ev:isro-obrien',
    npsId: 'AAAA1111-0000-4000-8000-000000000003',
    name: "O'Brien Creek Trail",
    type: 'trail',
    parkCode: ISRO.code,
    latitude: 48.090,
    longitude: -88.610,
  },
  unmapped: {
    id: 'ev:isro-scoville',
    npsId: 'AAAA1111-0000-4000-8000-000000000004',
    name: 'Scoville Point Walk',
    type: 'walk',
    parkCode: ISRO.code,
  },
  hospCedar: {
    id: 'ev:hosp-cedar',
    npsId: 'BBBB2222-0000-4000-8000-000000000001',
    name: 'Cedar Trail',
    type: 'trail',
    parkCode: HOSP.code,
    latitude: 34.513,
    longitude: -93.053,
  },
  isroCedar: {
    id: 'ev:isro-cedar',
    npsId: 'AAAA1111-0000-4000-8000-000000000005',
    name: 'Cedar Trail',
    type: 'trail',
    parkCode: ISRO.code,
    latitude: 47.940,
    longitude: -89.150,
  },
});

function officialRow(spec, { nestCoordinates = true } = {}) {
  const parkCode = spec.parkCode;
  const entityId = `nps:park:${parkCode}`;
  const coords = Number.isFinite(spec.latitude) && Number.isFinite(spec.longitude)
    ? { latitude: spec.latitude, longitude: spec.longitude }
    : null;
  const normalizedValue = {
    entityId: `${entityId}:thingstodo:${spec.npsId}`,
    destinationId: entityId,
    name: spec.name,
    category: 'thingstodo',
    activityTypes: [spec.type],
    parkCode,
    authority: 'official_owner',
    aliases: spec.aliases || [],
  };
  if (nestCoordinates) {
    normalizedValue.coordinates = coords;
  } else if (coords) {
    normalizedValue.latitude = coords.latitude;
    normalizedValue.longitude = coords.longitude;
  }
  return {
    evidenceId: spec.id,
    entityId,
    topic: 'activities',
    evidenceType: 'fact',
    claim: {
      identity: `thingstodo:${spec.npsId}`,
      text: `${spec.name}.`,
      normalizedValue,
    },
    source: {
      provider: 'nps',
      sourceClass: 'official_owner',
      sourceId: spec.npsId,
    },
    quality: { authorityClass: 'official_owner' },
  };
}

function bundleFrom(...specs) {
  return { evidence: specs.map((spec) => officialRow(spec)) };
}

function stop(name, type, extra = {}) {
  return {
    id: extra.id || `stop:${canonicalExperienceKey(name).replace(/\s+/g, '-')}`,
    name,
    type,
    duration: extra.duration ?? 70,
    parkCode: extra.parkCode || ISRO.code,
    ...extra,
  };
}

function dayPlan(stops) {
  return {
    days: [{ dayNumber: 1, stops }],
  };
}

describe('official-place index — exact identity', () => {
  const records = [
    officialRow(PLACES.greenstone),
    officialRow(PLACES.rockHarbor),
    officialRow(PLACES.obrien),
    officialRow(PLACES.unmapped),
    officialRow(PLACES.hospCedar),
    officialRow(PLACES.isroCedar),
  ];

  test('an exact official named place binds to a stable entity and parent park', () => {
    const index = buildOfficialPlaceIndex(records);
    const hit = lookupOfficialPlace({ name: 'Greenstone Ridge Trail', index });
    expect(hit.status).toBe('exact');
    expect(hit.place.canonicalName).toBe('Greenstone Ridge Trail');
    expect(hit.place.parkCode).toBe(ISRO.code);
    expect(hit.place.entityId).toMatch(/thingstodo:/);
    expect(hit.place.evidenceId).toBe(PLACES.greenstone.id);
    expect(hit.place.provenance.sourceClass).toBe('official_owner');
  });

  test('case, whitespace, and apostrophe punctuation normalize to the same identity', () => {
    const index = buildOfficialPlaceIndex(records);
    const variants = [
      "O'Brien Creek Trail",
      'O’Brien Creek Trail',
      '  o’brien   creek trail  ',
      'OBRIEN CREEK TRAIL',
    ];
    const ids = variants.map((name) => lookupOfficialPlace({ name, index }));
    expect(ids.every((hit) => hit.status === 'exact')).toBe(true);
    expect(new Set(ids.map((hit) => hit.place.entityId)).size).toBe(1);
    expect(ids[0].place.canonicalName).toBe("O'Brien Creek Trail");
  });

  test('a provider-supplied official alias binds; a unique derived title alias also binds', () => {
    const index = buildOfficialPlaceIndex(records);
    expect(lookupOfficialPlace({ name: 'Rock Harbor Lookout', index }).status).toBe('exact');
    expect(lookupOfficialPlace({ name: 'Rock Harbor Lookout', index }).place.canonicalName)
      .toBe('Rock Harbor Overlook');
    expect(lookupOfficialPlace({ name: 'Rock Harbor', index }).status).toBe('exact');
    expect(lookupOfficialPlace({ name: 'Rock Harbor', index }).place.canonicalName)
      .toBe('Rock Harbor Overlook');
  });

  test('the same official name in two parks is ambiguous without park context', () => {
    const index = buildOfficialPlaceIndex(records);
    const global = lookupOfficialPlace({ name: 'Cedar Trail', index });
    expect(global.status).toBe('ambiguous');
    expect(global.place).toBeNull();
    expect(global.candidates.map((c) => c.parkCode).sort()).toEqual([HOSP.code, ISRO.code]);
    const scoped = lookupOfficialPlace({ name: 'Cedar Trail', parkCode: HOSP.code, index });
    expect(scoped.status).toBe('exact');
    expect(scoped.place.parkCode).toBe(HOSP.code);
  });
});

describe('destination vs experience identity', () => {
  const officialPlaces = [
    officialRow(PLACES.greenstone),
    officialRow(PLACES.rockHarbor),
    officialRow(PLACES.hospCedar),
    officialRow(PLACES.isroCedar),
  ];

  test('place + parent park keeps the park as the destination', () => {
    const dests = resolveDestinationsFromMessage(
      `Build a day at ${ISRO.name} and hike ${PLACES.greenstone.name}.`,
      { officialPlaces },
    );
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe(ISRO.code);
    expect(dests[0].displayName).toMatch(/isle royale/i);
    expect(dests[0].displayName).not.toMatch(/greenstone/i);
    expect(dests[0].entityType).toBe('national_park');
    expect(dests[0].mentionedPlaces?.map((p) => p.name)).toEqual(
      expect.arrayContaining([PLACES.greenstone.name]),
    );
  });

  test('a uniquely resolved place-only prompt infers the parent park', () => {
    const dests = resolveDestinationsFromMessage(
      `I want to hike ${PLACES.greenstone.name}.`,
      { officialPlaces },
    );
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe(ISRO.code);
    expect(dests[0].entityType).toBe('national_park');
    expect(dests[0].displayName).toMatch(/isle royale/i);
    expect(dests[0].displayName).not.toMatch(/greenstone/i);
    expect(dests[0].mentionedPlaces?.map((p) => p.name)).toEqual(
      expect.arrayContaining([PLACES.greenstone.name]),
    );
  });

  test('an ambiguous official name does not guess a parent park', () => {
    const dests = resolveDestinationsFromMessage(
      'I want to hike Cedar Trail.',
      { officialPlaces },
    );
    expect(dests.filter((d) => d.parkCode === ISRO.code || d.parkCode === HOSP.code)).toEqual([]);
  });
});

describe('traveler-required and model-selected official places', () => {
  const catalog = bundleFrom(PLACES.greenstone, PLACES.rockHarbor, PLACES.unmapped);

  test('a traveler-required official place satisfies the named obligation without a landmark alias', () => {
    const prompt = `I absolutely want to hike ${PLACES.greenstone.name} at ${ISRO.name}.`;
    const requirements = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests(prompt),
      evidenceBundle: catalog,
    });
    const resolved = requirements.filter((r) => r.status === 'resolved');
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved[0].canonicalPlaceName).toBe(PLACES.greenstone.name);
    const plan = dayPlan([stop(PLACES.greenstone.name, 'trail')]);
    const identity = resolveStopIdentities({ itineraryData: plan, evidenceBundle: catalog });
    expect(identity.violations).toEqual([]);
    const named = evaluateNamedExperienceSatisfaction({
      itineraryData: identity.itineraryData,
      requirements,
      evidenceBundle: catalog,
    });
    expect(named.ok).toBe(true);
    expect(named.satisfiedBy[0].relationship).toBe('exact');
  });

  test('a model-selected official place binds generically', () => {
    const plan = dayPlan([
      stop(PLACES.rockHarbor.name, 'viewpoint'),
      stop(PLACES.unmapped.name, 'walk'),
    ]);
    const identity = resolveStopIdentities({ itineraryData: plan, evidenceBundle: catalog });
    expect(identity.violations).toEqual([]);
    expect(identity.itineraryData.days[0].stops.map((s) => s.canonicalPlaceName)).toEqual([
      PLACES.rockHarbor.name,
      PLACES.unmapped.name,
    ]);
  });

  test('12D replace/omit still runs when no official match exists', () => {
    const plan = dayPlan([
      stop(PLACES.greenstone.name, 'trail', { id: 's-green' }),
      stop('Phantom Lighthouse Trail', 'trail', { id: 's-phantom' }),
    ]);
    const identity = resolveStopIdentities({ itineraryData: plan, evidenceBundle: catalog });
    const degraded = degradeUnresolvedModelStops({
      itineraryData: identity.itineraryData,
      violations: identity.violations,
      namedExperienceRequirements: [],
      evidenceBundle: catalog,
    });
    expect(degraded.status).toBe('degraded');
    const names = degraded.itineraryData.days[0].stops.map((s) => s.name);
    expect(names).toContain(PLACES.greenstone.name);
    expect(names).not.toContain('Phantom Lighthouse Trail');
  });
});

describe('official coordinate promotion', () => {
  test('nested official NPS coordinates become resolved_metadata after identity bind', () => {
    const catalog = bundleFrom(PLACES.greenstone);
    const identity = resolveStopIdentities({
      itineraryData: dayPlan([stop(PLACES.greenstone.name, 'trail', {
        latitude: null,
        longitude: null,
      })]),
      evidenceBundle: catalog,
    });
    expect(identity.violations).toEqual([]);
    const bound = identity.itineraryData.days[0].stops[0];
    expect(bound.latitude).toBe(PLACES.greenstone.latitude);
    expect(bound.longitude).toBe(PLACES.greenstone.longitude);
    expect(bound.coordinateSource).toBe(COORDINATE_SOURCE.RESOLVED_METADATA);
    expect(hasAuthoritativeCoordinates(bound)).toBe(true);
    expect(extractOfficialCoordinates(catalog.evidence[0].claim.normalizedValue)).toEqual({
      latitude: PLACES.greenstone.latitude,
      longitude: PLACES.greenstone.longitude,
    });
  });

  test('missing or invalid official coordinates remain unpinned', () => {
    const bad = officialRow({
      ...PLACES.unmapped,
      latitude: 999,
      longitude: -88.5,
    });
    const none = officialRow(PLACES.unmapped);
    const identity = resolveStopIdentities({
      itineraryData: dayPlan([
        stop(PLACES.unmapped.name, 'walk'),
      ]),
      evidenceBundle: { evidence: [none] },
    });
    expect(identity.violations).toEqual([]);
    const bound = identity.itineraryData.days[0].stops[0];
    expect(hasUsableCoordinates(bound)).toBe(false);
    expect(hasAuthoritativeCoordinates(bound)).toBe(false);
    expect(extractOfficialCoordinates(bad.claim.normalizedValue)).toBeNull();
  });

  test('knownOutdoorLocations does not override already-authoritative official coordinates', () => {
    const catalog = bundleFrom(PLACES.greenstone);
    const identity = resolveStopIdentities({
      itineraryData: dayPlan([stop(PLACES.greenstone.name, 'trail')]),
      evidenceBundle: catalog,
    });
    const before = {
      latitude: identity.itineraryData.days[0].stops[0].latitude,
      longitude: identity.itineraryData.days[0].stops[0].longitude,
      coordinateSource: identity.itineraryData.days[0].stops[0].coordinateSource,
    };
    enrichKnownStopLocations(identity.itineraryData);
    const after = identity.itineraryData.days[0].stops[0];
    expect(after.latitude).toBe(before.latitude);
    expect(after.longitude).toBe(before.longitude);
    expect(after.coordinateSource).toBe(before.coordinateSource);
    expect(after.coordinateSource).not.toBe('trailverse_catalog');
  });
});
