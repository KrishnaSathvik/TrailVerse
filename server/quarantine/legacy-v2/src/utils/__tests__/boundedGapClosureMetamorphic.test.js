'use strict';

/**
 * Phase 12F.1 — development metamorphic families.
 *
 * Destinations are unused in the frozen audit and the 12F held-out set.
 * Surface forms are generated from semantic components, not the 12F misses.
 * Assert contract fields, never exact prose.
 */

const { buildTurnUnderstanding } = require('../../../../../src/services/turnUnderstanding');
const { resolveTravelerJob } = require('../../../../../src/services/trailieTravelerJobResolver');
const { parseConstraints } = require('../../../../../src/utils/constraintEngine');
const { resolveProduceTripRequest } = require('../../../../../src/utils/produceTripRequest');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
} = require('../../../../../src/utils/namedExperienceRequirements');
const { resolveDestinationsFromMessage } = require('../../../../../src/utils/genericDestinationResolver');
const { extractAllParksFromMessage } = require('../../../../../src/utils/parkExtractor');
const { buildOfficialPlaceIndex } = require('../../../../../src/utils/officialPlaceIndex');
const {
  setPersistedOfficialPlaceEvidence,
  clearPersistedOfficialPlaceEvidence,
  resolvePersistedOfficialPlaces,
  lookupExactPersistedOfficialPlace,
} = require('../../../../../src/utils/persistedOfficialPlaceLookup');
const { kmToMiles } = require('../../../../../src/utils/constraintFamilies');

const DEST = Object.freeze([
  { name: 'Gates of the Arctic', code: 'gaar' },
  { name: 'Lake Clark', code: 'lacl' },
  { name: 'Kobuk Valley', code: 'kova' },
  { name: 'National Park of American Samoa', code: 'npsa' },
]);

const PLACES = Object.freeze({
  arrigetch: {
    id: 'ev:gaar-arrigetch',
    npsId: 'F1A10000-0000-4000-8000-000000000001',
    name: 'Arrigetch Peaks Traverse',
    type: 'trail',
    parkCode: 'gaar',
    latitude: 67.4,
    longitude: -154.2,
  },
  tanalian: {
    id: 'ev:lacl-tanalian',
    npsId: 'F1A10000-0000-4000-8000-000000000002',
    name: 'Tanalian Falls Overlook',
    type: 'viewpoint',
    parkCode: 'lacl',
    latitude: 60.2,
    longitude: -154.3,
  },
  glacierWalk: {
    id: 'ev:lacl-ridge-glacier',
    npsId: 'F1A10000-0000-4000-8000-000000000003',
    name: 'Ridgeline Glacier',
    type: 'walk',
    parkCode: 'lacl',
    latitude: 60.31,
    longitude: -154.41,
  },
  onion: {
    id: 'ev:kova-onion',
    npsId: 'F1A10000-0000-4000-8000-000000000004',
    name: 'Onion Portage Ridge',
    type: 'trail',
    parkCode: 'kova',
    latitude: 67.1,
    longitude: -158.3,
  },
  pola: {
    id: 'ev:npsa-pola',
    npsId: 'F1A10000-0000-4000-8000-000000000005',
    name: 'Pola Island Overlook',
    type: 'viewpoint',
    parkCode: 'npsa',
    latitude: -14.25,
    longitude: -170.66,
  },
  shared: {
    id: 'ev:gaar-cedar',
    npsId: 'F1A10000-0000-4000-8000-000000000006',
    name: 'Cedar Bench Trail',
    type: 'trail',
    parkCode: 'gaar',
    latitude: 67.5,
    longitude: -154.0,
  },
  sharedOther: {
    id: 'ev:lacl-cedar',
    npsId: 'F1A10000-0000-4000-8000-000000000007',
    name: 'Cedar Bench Trail',
    type: 'trail',
    parkCode: 'lacl',
    latitude: 60.4,
    longitude: -154.5,
  },
});

function officialRow(spec) {
  const parkCode = spec.parkCode;
  const entityId = `nps:park:${parkCode}`;
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
        parkCode,
        latitude: spec.latitude,
        longitude: spec.longitude,
        aliases: spec.aliases || [],
      },
    },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: spec.npsId },
    quality: { authorityClass: 'official_owner' },
  };
}

const PERSISTED = [
  officialRow(PLACES.arrigetch),
  officialRow(PLACES.tanalian),
  officialRow(PLACES.glacierWalk),
  officialRow(PLACES.onion),
  officialRow(PLACES.pola),
  officialRow(PLACES.shared),
  officialRow(PLACES.sharedOther),
];

function grounded(prompt, extra = {}) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt, officialPlaces: extra.officialPlaces });
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
    produce: resolveProduceTripRequest(prompt, {
      destinationCount: understanding.subjectDestinations?.length || 0,
      durationDays: understanding.temporalScope?.durationDays ?? null,
    }),
  };
}

beforeEach(() => {
  setPersistedOfficialPlaceEvidence(PERSISTED);
});

afterEach(() => {
  clearPersistedOfficialPlaceEvidence();
});

describe('12F.1 produce-object ordering', () => {
  const dest = DEST[0].name;

  test.each([
    [`I need a day plan for ${dest}`],
    [`We want a day plan at ${dest}`],
    [`Make a day plan for ${dest}`],
    [`A day plan for ${dest} please`],
    [`We have a day in ${dest} — map it`],
    [`Map a day at ${dest}`],
    [`Map out a day at ${dest}`],
  ])('%s produces a one-day itinerary', (prompt) => {
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.artifact).toBe('itinerary');
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.durationDays).toBe(1);
    expect(got.produce.impliedDurationDays).toBe(1);
    expect(got.parkCodes).toContain('gaar');
  });

  test.each([
    'Show me this on a map at Gates of the Arctic',
    'Map the route from Fairbanks to Gates of the Arctic',
    'Can you put Gates of the Arctic on a map?',
  ])('%s is not a trip-artifact produce request', (prompt) => {
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(false);
    expect(got.artifact).not.toBe('itinerary');
  });
});

describe('12F.1 generic unavailable-target contingency', () => {
  test.each([
    `If we can't get into ${DEST[1].name}, what's a fallback?`,
    `If ${DEST[2].name} is inaccessible, what should we do instead?`,
    `If the road into ${DEST[0].name} is unavailable, give us an alternative`,
    `If the reservation for ${DEST[3].name} is sold out, what's plan B?`,
    `If parking at ${DEST[1].name} is unusable, what instead?`,
  ])('%s → access_contingency', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
  });

  test.each([
    `Is ${DEST[1].name} closed today?`,
    `What's the parking situation at ${DEST[2].name}?`,
  ])('%s remains status, not contingency', (prompt) => {
    expect(grounded(prompt).job).not.toBe('access_contingency');
  });
});

describe('12F.1 activity-distance ceilings', () => {
  const dest = DEST[2].name;

  test.each([
    [`No hike over 4 miles at ${dest}.`, 4],
    [`Nothing over 4 miles at ${dest}.`, 4],
    [`Keep each outing under 4 miles at ${dest}.`, 4],
    [`Four miles max at ${dest}.`, 4],
    [`Keep outings under 6 kilometers at ${dest}.`, kmToMiles(6)],
  ])('%s → maxWalkMilesPerSegment %s', (prompt, miles) => {
    const got = grounded(prompt);
    expect(got.explicit.maxWalkMilesPerSegment).toBe(miles);
    expect(got.planning.mobility.maxWalkMilesPerSegment).toBe(miles);
  });

  test.each([
    'The hotel is 4 miles away from Kobuk Valley.',
    'The lodge is 4 miles from the entrance at Kobuk Valley.',
  ])('%s is geographic distance, not a hiking cap', (prompt) => {
    expect(grounded(prompt).explicit.maxWalkMilesPerSegment).toBeUndefined();
  });
});

describe('12F.1 downtime pace', () => {
  const dest = DEST[3].name;

  test.each([
    [`Leave plenty of downtime at ${dest}.`],
    [`Build in breathing room at ${dest}.`],
    [`We want unscheduled time at ${dest}.`],
    [`Keep some free time in the ${dest} days.`],
    [`Include a buffer at ${dest}.`],
  ])('%s → pace relaxed', (prompt) => {
    const got = grounded(prompt);
    expect(got.explicit.pace).toBe('relaxed');
    expect(got.planning.preferences.pace).toBe('relaxed');
  });

  test.each([
    'What are the visitor center hours at American Samoa?',
    'If we have free time we could grab lunch near American Samoa.',
  ])('%s is not trip pace', (prompt) => {
    expect(grounded(prompt).explicit.pace).toBeUndefined();
  });
});

describe('12F.1 numeric daily-drive ceiling', () => {
  const dest = DEST[0].name;

  test.each([
    [`Keep driving under 3 hours/day at ${dest}.`, 180],
    [`3-hour daily driving limit at ${dest}.`, 180],
    [`Cap driving at 3 hours each day at ${dest}.`, 180],
    [`No more than three hours behind the wheel per day at ${dest}.`, 180],
    [`Cap us at three hours of driving each day at ${dest}.`, 180],
  ])('%s → maxDailyDriveMinutes %s', (prompt, minutes) => {
    const got = grounded(prompt);
    expect(got.parsed.maxDailyDriveMinutes).toBe(minutes);
    expect(got.planning.preferences.maxDailyDriveMinutes).toBe(minutes);
  });

  test('qualitative minimize-driving stays uncapped', () => {
    const got = grounded(`Not much driving at ${DEST[1].name}.`);
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.explicit.maxDailyDriveMinutes).toBeUndefined();
  });
});

describe('12F.1 photography does not defeat produce', () => {
  test.each([
    `Map a day at ${DEST[1].name} for sunrise photography with little driving.`,
    `Make a day plan at ${DEST[1].name} for sunrise photography without much driving.`,
    `We have a day in ${DEST[1].name} — map it for sunrise photos and little driving.`,
  ])('%s stays an itinerary with photography + driving prefs', (prompt) => {
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.durationDays).toBe(1);
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBe('sunrise');
    expect(got.soft.minimizeDriving).toBe(true);
  });
});

describe('12F.1 first-turn exact official-place lookup', () => {
  test('a unique persisted official place infers its parent park', () => {
    const prompt = `Hike ${PLACES.arrigetch.name}.`;
    const lookup = resolvePersistedOfficialPlaces({ text: prompt, records: PERSISTED });
    expect(lookup.status).toBe('exact');
    expect(lookup.parentParkCode).toBe('gaar');
    const dests = resolveDestinationsFromMessage(prompt);
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe('gaar');
    expect(dests[0].entityType).toBe('national_park');
    expect(dests[0].displayName).not.toMatch(/arrigetch/i);
  });

  test('the same official name in two parks stays unresolved', () => {
    const prompt = `Hike ${PLACES.shared.name}.`;
    const lookup = resolvePersistedOfficialPlaces({ text: prompt, records: PERSISTED });
    expect(lookup.status).toBe('ambiguous');
    expect(lookup.parentParkCode).toBeNull();
    const dests = resolveDestinationsFromMessage(prompt);
    expect(dests.filter((d) => d.parkCode === 'gaar' || d.parkCode === 'lacl')).toEqual([]);
  });

  test('no network-shaped fuzzy guess: an unknown name stays unresolved', () => {
    expect(lookupExactPersistedOfficialPlace('Ghost Ridge Traverse').status).toBe('unresolved');
    expect(resolveDestinationsFromMessage('Hike Ghost Ridge Traverse.')).toEqual([]);
  });
});

describe('12F.1 false park-token collision controls', () => {
  test('a place containing a park word is not that park without official identity', () => {
    clearPersistedOfficialPlaceEvidence();
    expect(extractAllParksFromMessage(`Hike ${PLACES.glacierWalk.name}.`).map((p) => p.parkCode))
      .not.toContain('glac');
    expect(resolveDestinationsFromMessage(`Hike ${PLACES.glacierWalk.name}.`)
      .map((d) => d.parkCode)).not.toContain('glac');
  });

  test('exact official place with unique parent outranks the park-token substring', () => {
    setPersistedOfficialPlaceEvidence(PERSISTED);
    const dests = resolveDestinationsFromMessage(`Hike ${PLACES.glacierWalk.name}.`);
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe('lacl');
    expect(dests[0].parkCode).not.toBe('glac');
  });

  test('a true park-name mention still resolves', () => {
    expect(extractAllParksFromMessage('Visit Glacier National Park').map((p) => p.parkCode))
      .toEqual(['glac']);
  });
});

describe('12F.1 unframed authoritative place lists', () => {
  test('with/and/plus lists become named experiences once a parent and index exist', () => {
    const prompt =
      `Plan a day in ${DEST[1].name} with ${PLACES.tanalian.name} and ${PLACES.glacierWalk.name}`;
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.parkCodes).toContain('lacl');
    const index = buildOfficialPlaceIndex(PERSISTED);
    const requests = extractNamedExperienceRequests(prompt, {
      officialIndex: index,
      parkCodes: ['lacl'],
    });
    const names = requests.map((r) => r.requestedName);
    expect(names).toEqual(expect.arrayContaining([PLACES.tanalian.name, PLACES.glacierWalk.name]));
    const reqs = resolveNamedExperienceRequirements({
      requests,
      evidenceBundle: { evidence: PERSISTED },
    });
    expect(reqs.filter((r) => r.status === 'resolved').map((r) => r.canonicalPlaceName).sort())
      .toEqual([PLACES.glacierWalk.name, PLACES.tanalian.name].sort());
  });

  test('generic TitleCase without an official hit is not an obligation', () => {
    const prompt = `Plan a day in ${DEST[0].name} with Some Fake Mesa`;
    const requests = extractNamedExperienceRequests(prompt, {
      officialIndex: buildOfficialPlaceIndex(PERSISTED),
      parkCodes: ['gaar'],
    });
    expect(requests.map((r) => r.requestedName)).not.toContain('Some Fake Mesa');
  });
});
