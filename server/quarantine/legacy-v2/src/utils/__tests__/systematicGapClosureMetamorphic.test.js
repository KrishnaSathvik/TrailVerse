'use strict';

/**
 * Phase 12F.3 — development metamorphic families.
 *
 * Destinations are unused in 12F.2 and 12F.1. Surface forms are generated
 * from semantic classes, not 12F.2 held-out strings. Assert durable fields.
 */

const { buildTurnUnderstanding } = require('../../../../../src/services/turnUnderstanding');
const { resolveTravelerJob } = require('../../../../../src/services/trailieTravelerJobResolver');
const { parseConstraints } = require('../../../../../src/utils/constraintEngine');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
} = require('../../../../../src/utils/namedExperienceRequirements');
const { resolveDestinationsFromMessage } = require('../../../../../src/utils/genericDestinationResolver');
const {
  extractAllParksFromMessage,
  setDynamicMapForTests,
  clearDynamicMapForTests,
} = require('../../../../../src/utils/parkExtractor');
const { buildOfficialPlaceIndex, lookupOfficialPlace } = require('../../../../../src/utils/officialPlaceIndex');
const {
  setPersistedOfficialPlaceEvidence,
  clearPersistedOfficialPlaceEvidence,
  resolvePersistedOfficialPlaces,
  lookupExactPersistedOfficialPlace,
} = require('../../../../../src/utils/persistedOfficialPlaceLookup');
const { resolveStopIdentities } = require('../../../../../src/utils/stopIdentityResolution');
const { degradeUnresolvedModelStops } = require('../../../../../src/utils/modelSelectedIdentityDegradation');
const { canonicalExperienceKey } = require('../../../../../src/utils/canonicalExperience');

const DEST = Object.freeze([
  { name: 'Florissant Fossil Beds', code: 'flfo', full: 'Florissant Fossil Beds National Monument', lat: 38.913, lon: -105.267 },
  { name: 'Gila Cliff Dwellings', code: 'gicl', full: 'Gila Cliff Dwellings National Monument', lat: 33.227, lon: -108.272 },
  { name: 'Effigy Mounds', code: 'efmo', full: 'Effigy Mounds National Monument', lat: 43.089, lon: -91.185 },
  { name: 'Aztec Ruins', code: 'azru', full: 'Aztec Ruins National Monument', lat: 36.836, lon: -107.998 },
]);

const PLACES = Object.freeze({
  hornbek: {
    id: 'ev:flfo-hornbek',
    npsId: 'D3A10000-0000-4000-8000-000000000001',
    name: 'Hornbek Homestead Walk',
    type: 'walk',
    parkCode: 'flfo',
    latitude: 38.91,
    longitude: -105.27,
  },
  petrified: {
    id: 'ev:flfo-pond',
    npsId: 'D3A10000-0000-4000-8000-000000000002',
    name: 'Fossil Pond Loop',
    type: 'trail',
    parkCode: 'flfo',
    latitude: 38.914,
    longitude: -105.268,
  },
  sawmill: {
    id: 'ev:flfo-sawmill',
    npsId: 'D3A10000-0000-4000-8000-000000000003',
    name: 'Sawmill',
    type: 'trail',
    parkCode: 'flfo',
    latitude: 38.915,
    longitude: -105.269,
  },
  gilaFork: {
    id: 'ev:gicl-fork',
    npsId: 'D3A10000-0000-4000-8000-000000000004',
    name: 'Gila River Fork Overlook',
    type: 'viewpoint',
    parkCode: 'gicl',
    latitude: 33.227,
    longitude: -108.272,
  },
  glacierTerrace: {
    id: 'ev:gicl-glacier',
    npsId: 'D3A10000-0000-4000-8000-000000000005',
    name: 'Iceberg Glacier Terrace',
    type: 'walk',
    parkCode: 'gicl',
    latitude: 33.23,
    longitude: -108.27,
  },
  marching: {
    id: 'ev:efmo-marching',
    npsId: 'D3A10000-0000-4000-8000-000000000006',
    name: 'Marching Bear Walk',
    type: 'walk',
    parkCode: 'efmo',
    latitude: 43.09,
    longitude: -91.18,
  },
  kivaTerrace: {
    id: 'ev:azru-kiva-terrace',
    npsId: 'D3A10000-0000-4000-8000-000000000007',
    name: 'West Ruin Overlook',
    type: 'viewpoint',
    parkCode: 'azru',
    latitude: 36.836,
    longitude: -107.998,
  },
  kivaWalk: {
    id: 'ev:azru-kiva-walk',
    npsId: 'D3A10000-0000-4000-8000-000000000008',
    name: 'West Ruin Walk',
    type: 'walk',
    parkCode: 'azru',
    latitude: 36.837,
    longitude: -107.997,
  },
  sharedFlfo: {
    id: 'ev:flfo-sage',
    npsId: 'D3A10000-0000-4000-8000-000000000009',
    name: 'Sage Bench Trail',
    type: 'trail',
    parkCode: 'flfo',
    latitude: 38.92,
    longitude: -105.26,
  },
  sharedGicl: {
    id: 'ev:gicl-sage',
    npsId: 'D3A10000-0000-4000-8000-000000000010',
    name: 'Sage Bench Trail',
    type: 'trail',
    parkCode: 'gicl',
    latitude: 33.22,
    longitude: -108.26,
  },
});

function parentFor(code) {
  return DEST.find((d) => d.code === code);
}

function officialRow(spec) {
  const park = parentFor(spec.parkCode);
  const entityId = `nps:park:${spec.parkCode}`;
  return {
    evidenceId: spec.id,
    entityId,
    topic: 'activities',
    evidenceType: 'fact',
    claim: {
      identity: `thingstodo:${spec.npsId}`,
      text: `${spec.name}.`,
      normalizedValue: {
        entityId: `${entityId}:thingstodo:${spec.npsId}`,
        destinationId: entityId,
        name: spec.name,
        category: 'thingstodo',
        activityTypes: [spec.type],
        parkCode: spec.parkCode,
        latitude: spec.latitude,
        longitude: spec.longitude,
        aliases: spec.aliases || [],
        parentParkName: park?.full,
        parentLatitude: park?.lat,
        parentLongitude: park?.lon,
        parentDesignation: 'National Monument',
      },
    },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: spec.npsId },
    quality: { authorityClass: 'official_owner' },
  };
}

const PERSISTED = Object.values(PLACES).map(officialRow);

const DYNAMIC = DEST.flatMap((d) => ([
  { key: d.full.toLowerCase(), code: d.code, lat: d.lat, lon: d.lon },
  { key: d.name.toLowerCase(), code: d.code, lat: d.lat, lon: d.lon },
]));

function grounded(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  const parsed = parseConstraints({ formData: {} }, prompt);
  const explicit = Object.fromEntries(
    (understanding.explicitConstraints || []).map((item) => [item.field, item.value]),
  );
  const soft = Object.fromEntries(
    (understanding.softPreferences || []).map((item) => [item.field, item.value]),
  );
  return {
    explicit,
    soft,
    job: resolved.job,
    artifact: understanding.requestedArtifact,
    askedToProduce: understanding.askedToProduceTripArtifact === true,
    durationDays: understanding.temporalScope?.durationDays ?? null,
    parkCodes: (understanding.subjectDestinations || []).map((d) => d.parkCode).filter(Boolean),
    mentioned: (understanding.subjectDestinations || []).flatMap((d) => d.mentionedPlaces || []).map((p) => p.name),
    planning: parsed.planningState,
    parsed,
  };
}

function stop(name, type, extra = {}) {
  return {
    id: extra.id || `stop:${canonicalExperienceKey(name).replace(/\s+/g, '-')}`,
    name,
    type,
    duration: extra.duration ?? 60,
    parkCode: extra.parkCode || 'flfo',
    ...extra,
  };
}

function dayPlan(stops) {
  return {
    intro: 'A day at Florissant Fossil Beds.',
    days: [{ dayNumber: 1, title: 'Day 1', stops }],
    ending: 'Wrap the visit.',
  };
}

beforeEach(() => {
  setDynamicMapForTests(DYNAMIC);
  setPersistedOfficialPlaceEvidence(PERSISTED);
});

afterEach(() => {
  clearPersistedOfficialPlaceEvidence();
  clearDynamicMapForTests();
});

describe('12F.3 slack-noun pace', () => {
  const dest = DEST[0].name;

  test.each([
    [`Easy trails, breathing room, and a slow morning at ${dest}.`],
    [`Plan ${dest} with downtime, photography, and short walks.`],
    [`We want buffer time at ${dest}.`],
    [`Unscheduled time and room between stops at ${dest}.`],
    [`Keep free time in the ${dest} days.`],
  ])('%s → pace relaxed', (prompt) => {
    const got = grounded(prompt);
    expect(got.explicit.pace).toBe('relaxed');
    expect(got.planning.preferences.pace).toBe('relaxed');
  });

  test.each([
    'What are the visitor center hours at Florissant Fossil Beds?',
    'If we have free time we could grab lunch near Gila Cliff Dwellings.',
    'Is there buffer parking at Effigy Mounds?',
    'I have free time this afternoon near Aztec Ruins.',
  ])('%s is not trip pace', (prompt) => {
    expect(grounded(prompt).explicit.pace).toBeUndefined();
  });
});

describe('12F.3 numeric daily-drive ceilings', () => {
  const dest = DEST[1].name;

  test.each([
    [`Keep driving under 3 hours/day at ${dest}.`, 180],
    [`Three hours of driving each day at ${dest}.`, 180],
    [`90 minutes of driving per day at ${dest}.`, 90],
    [`Daily driving limit of 2.5 hours at ${dest}.`, 150],
    [`Cap driving at 150 minutes at ${dest}.`, 150],
    [`Cap us at 90 minutes of driving each day at ${dest}.`, 90],
  ])('%s → maxDailyDriveMinutes %s', (prompt, minutes) => {
    const got = grounded(prompt);
    expect(got.parsed.maxDailyDriveMinutes).toBe(minutes);
    expect(got.planning.preferences.maxDailyDriveMinutes).toBe(minutes);
  });

  test('qualitative minimize-driving stays uncapped', () => {
    const got = grounded(`Not much driving at ${DEST[2].name}.`);
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.explicit.maxDailyDriveMinutes).toBeUndefined();
    expect(got.parsed.maxDailyDriveMinutes == null).toBe(true);
  });
});

describe('12F.3 generic unavailable-state contingency', () => {
  test.each([
    `If the shuttle at ${DEST[0].name} is down, what's a fallback?`,
    `If the ferry to ${DEST[1].name} is cancelled, give us an alternative.`,
    `If the sunset viewpoint at ${DEST[2].name} is socked in, what should we do instead?`,
    `If parking at ${DEST[3].name} is unusable, what instead?`,
    `If the road into ${DEST[0].name} is closed, what's plan B?`,
    `What's a good backup plan if ${DEST[1].name} access or parking doesn't work out?`,
  ])('%s → access_contingency', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
  });

  test.each([
    `Is ${DEST[0].name} closed today?`,
    `What's the parking situation at ${DEST[1].name}?`,
    `Is the ferry to ${DEST[2].name} running this week?`,
  ])('%s remains status, not contingency', (prompt) => {
    expect(grounded(prompt).job).not.toBe('access_contingency');
  });
});

describe('12F.3 constraint persistence across non-itinerary jobs', () => {
  test('comparison keeps a walk ceiling without becoming an itinerary', () => {
    const prompt = `Should we choose ${DEST[2].name} or ${DEST[3].name} for a quiet weekend with nothing over 3 miles?`;
    const got = grounded(prompt);
    expect(got.job).toBe('destination_compare');
    expect(got.artifact).not.toBe('itinerary');
    expect(got.parkCodes.sort()).toEqual(['azru', 'efmo']);
    expect(got.explicit.maxWalkMilesPerSegment).toBe(3);
    expect(got.planning.mobility.maxWalkMilesPerSegment).toBe(3);
  });

  test('advice keeps hiking effort', () => {
    const prompt = `Do we need a timed-entry reservation for ${DEST[1].name} if we also want easy hiking?`;
    const got = grounded(prompt);
    expect(got.job).toBe('permits_reservations');
    expect(got.explicit.hiking).toBe('easy');
  });

  test('hotel distance is still not a hike cap', () => {
    expect(grounded(`The hotel is 3 miles away from ${DEST[0].name}.`).explicit.maxWalkMilesPerSegment)
      .toBeUndefined();
  });
});

describe('12F.3 dynamic official NPS-unit parent identity', () => {
  test('exact official place infers a non-62 unit from the dynamic catalog', () => {
    const prompt = `Hike ${PLACES.hornbek.name}.`;
    const lookup = resolvePersistedOfficialPlaces({ text: prompt, records: PERSISTED });
    expect(lookup.status).toBe('exact');
    expect(lookup.parentParkCode).toBe('flfo');
    const dests = resolveDestinationsFromMessage(prompt);
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe('flfo');
    expect(dests[0].displayName).toMatch(/florissant fossil beds/i);
    expect(dests[0].displayName).not.toMatch(/hornbek/i);
    expect(dests[0].displayName).not.toBe('Florissant Fossil Beds National Park');
    expect(dests[0].npsUnitKind).toBe('nps_unit');
  });

  test('parent identity can be built from official-place metadata without the dynamic map', () => {
    clearDynamicMapForTests();
    const dests = resolveDestinationsFromMessage(`Visit ${PLACES.marching.name}.`);
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe('efmo');
    expect(dests[0].displayName).toBe('Effigy Mounds National Monument');
    expect(dests[0].identitySource).toBe('official_place_parent');
  });

  test('ambiguous same-name places do not invent a parent', () => {
    const prompt = `Hike ${PLACES.sharedFlfo.name}.`;
    expect(resolvePersistedOfficialPlaces({ text: prompt }).status).toBe('ambiguous');
    expect(resolveDestinationsFromMessage(prompt).filter((d) => d.parkCode === 'flfo' || d.parkCode === 'gicl'))
      .toEqual([]);
  });

  test('unknown names stay unresolved', () => {
    expect(lookupExactPersistedOfficialPlace('Ghost Fen Overlook').status).toBe('unresolved');
    expect(resolveDestinationsFromMessage('Hike Ghost Fen Overlook.')).toEqual([]);
  });
});

describe('12F.3 conservative derived official-title aliases', () => {
  test('a unique suffix-stripped alias binds', () => {
    const index = buildOfficialPlaceIndex(PERSISTED);
    expect(lookupOfficialPlace({ name: 'Hornbek Homestead', index }).status).toBe('exact');
    expect(lookupOfficialPlace({ name: 'Hornbek Homestead', index }).place.canonicalName)
      .toBe(PLACES.hornbek.name);
    expect(lookupOfficialPlace({ name: 'Gila River Fork', index }).place.canonicalName)
      .toBe(PLACES.gilaFork.name);
    const dests = resolveDestinationsFromMessage('Visit Hornbek Homestead.');
    expect(dests[0].parkCode).toBe('flfo');
  });

  test('an ambiguous derived stem stays unresolved', () => {
    const index = buildOfficialPlaceIndex(PERSISTED);
    expect(lookupOfficialPlace({ name: 'West Ruin', index }).status).toBe('ambiguous');
    expect(resolveDestinationsFromMessage('Visit West Ruin.').map((d) => d.parkCode)).not.toContain('azru');
  });

  test('semantic similarity is not a match', () => {
    expect(lookupExactPersistedOfficialPlace('some lake').status).toBe('unresolved');
    expect(lookupExactPersistedOfficialPlace('Hornbek Homestead Path').status).toBe('unresolved');
  });
});

describe('12F.3 single-token exact official mentions', () => {
  test('framed unique single-token binds the parent', () => {
    const lookup = resolvePersistedOfficialPlaces({ text: 'Hike Sawmill.', records: PERSISTED });
    expect(lookup.status).toBe('exact');
    expect(lookup.parentParkCode).toBe('flfo');
  });

  test('unframed single-token binds only when the parent is known', () => {
    const prompt = `Plan two days in ${DEST[0].name} with Sawmill.`;
    const got = grounded(prompt);
    expect(got.parkCodes).toContain('flfo');
    const requests = extractNamedExperienceRequests(prompt, {
      officialIndex: buildOfficialPlaceIndex(PERSISTED),
      parkCodes: ['flfo'],
    });
    expect(requests.map((r) => r.requestedName)).toContain('Sawmill');
    expect(got.mentioned).toEqual(expect.arrayContaining(['Sawmill']));
  });

  test('single-token without parent stays unresolved in mention scan', () => {
    const requests = extractNamedExperienceRequests('Add Sawmill to the mix.', {
      officialIndex: buildOfficialPlaceIndex(PERSISTED),
      parkCodes: [],
    });
    expect(requests.map((r) => r.requestedName)).not.toContain('Sawmill');
  });
});

describe('12F.3 false-parent controls', () => {
  test('a glacier-token place is not Glacier National Park', () => {
    clearPersistedOfficialPlaceEvidence();
    expect(extractAllParksFromMessage(`Hike ${PLACES.glacierTerrace.name}.`).map((p) => p.parkCode))
      .not.toContain('glac');
    setPersistedOfficialPlaceEvidence(PERSISTED);
    const dests = resolveDestinationsFromMessage(`Hike ${PLACES.glacierTerrace.name}.`);
    expect(dests[0].parkCode).toBe('gicl');
    expect(dests[0].parkCode).not.toBe('glac');
  });
});

describe('12F.3 traveler-required / model-selected identity on a non-62 unit', () => {
  const catalog = { evidence: [officialRow(PLACES.hornbek), officialRow(PLACES.petrified)] };

  test('traveler-required official place binds', () => {
    const prompt = `I want to hike ${PLACES.hornbek.name} at ${DEST[0].name}.`;
    const requirements = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests(prompt),
      evidenceBundle: catalog,
    });
    expect(requirements.some((r) => r.status === 'resolved' && r.canonicalPlaceName === PLACES.hornbek.name)).toBe(true);
    const identity = resolveStopIdentities({
      itineraryData: dayPlan([stop(PLACES.hornbek.name, 'walk')]),
      evidenceBundle: catalog,
    });
    expect(identity.violations).toEqual([]);
  });

  test('model-selected unsupported stop is replaced or omitted', () => {
    const catalog = { evidence: [officialRow(PLACES.hornbek), officialRow(PLACES.petrified)] };
    const identity = resolveStopIdentities({
      itineraryData: dayPlan([
        stop(PLACES.hornbek.name, 'walk'),
        stop('Phantom Cinder Walk', 'walk'),
      ]),
      evidenceBundle: catalog,
    });
    const degraded = degradeUnresolvedModelStops({
      itineraryData: identity.itineraryData,
      violations: identity.violations,
      evidenceBundle: catalog,
      namedExperienceRequirements: [],
    });
    const names = (degraded.itineraryData?.days?.[0]?.stops || []).map((s) => s.name);
    expect(names).toContain(PLACES.hornbek.name);
    expect(names).not.toContain('Phantom Cinder Walk');
  });
});
