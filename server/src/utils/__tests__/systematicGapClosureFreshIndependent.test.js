'use strict';

/**
 * Phase 12F.3 — fresh independent paraphrase/place evaluation.
 *
 * Not the 12F.2 held-out strings, not the 12F.3 development tables, and not
 * the frozen audit. Agreement is on contract fields.
 */

const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');
const { parseConstraints } = require('../constraintEngine');
const { extractNamedExperienceRequests } = require('../namedExperienceRequirements');
const { resolveDestinationsFromMessage } = require('../genericDestinationResolver');
const {
  extractAllParksFromMessage,
  setDynamicMapForTests,
  clearDynamicMapForTests,
} = require('../parkExtractor');
const { buildOfficialPlaceIndex, lookupOfficialPlace } = require('../officialPlaceIndex');
const {
  setPersistedOfficialPlaceEvidence,
  clearPersistedOfficialPlaceEvidence,
  resolvePersistedOfficialPlaces,
} = require('../persistedOfficialPlaceLookup');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const { evaluateEvidenceGate } = require('../../services/trailieV2ExecutionService');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { degradeUnresolvedModelStops } = require('../modelSelectedIdentityDegradation');

const DEST = Object.freeze([
  { name: 'Homestead', code: 'home', full: 'Homestead National Historical Park', lat: 40.288, lon: -96.834 },
  { name: 'Pipe Spring', code: 'pisp', full: 'Pipe Spring National Monument', lat: 36.863, lon: -112.740 },
  { name: 'Tuzigoot', code: 'tuzi', full: 'Tuzigoot National Monument', lat: 34.774, lon: -112.026 },
  { name: 'Tonto', code: 'tont', full: 'Tonto National Monument', lat: 33.645, lon: -111.109 },
]);

const PLACES = Object.freeze({
  palmer: {
    id: 'ev:home-palmer',
    npsId: 'E4B10000-0000-4000-8000-000000000001',
    name: 'Palmer-Epard Cabin Overlook',
    parkCode: 'home',
    latitude: 40.288,
    longitude: -96.834,
  },
  windsor: {
    id: 'ev:pisp-windsor',
    npsId: 'E4B10000-0000-4000-8000-000000000002',
    name: 'Windsor Castle Walk',
    parkCode: 'pisp',
    latitude: 36.863,
    longitude: -112.74,
  },
  citadel: {
    id: 'ev:tuzi-citadel',
    npsId: 'E4B10000-0000-4000-8000-000000000003',
    name: 'Citadel',
    parkCode: 'tuzi',
    latitude: 34.774,
    longitude: -112.026,
  },
  glacierCove: {
    id: 'ev:tont-glacier',
    npsId: 'E4B10000-0000-4000-8000-000000000004',
    name: 'Upper Cliff Glacier Cove',
    parkCode: 'tont',
    latitude: 33.645,
    longitude: -111.109,
  },
  caveCreek: {
    id: 'ev:tont-cave',
    npsId: 'E4B10000-0000-4000-8000-000000000005',
    name: 'Cave Creek Overlook',
    parkCode: 'tont',
    latitude: 33.646,
    longitude: -111.108,
  },
  caveCreekWalk: {
    id: 'ev:tont-cave-walk',
    npsId: 'E4B10000-0000-4000-8000-000000000006',
    name: 'Cave Creek Walk',
    parkCode: 'tont',
    latitude: 33.647,
    longitude: -111.107,
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
        activityTypes: ['place'],
        parkCode: spec.parkCode,
        latitude: spec.latitude,
        longitude: spec.longitude,
        parentParkName: park?.full,
        parentLatitude: park?.lat,
        parentLongitude: park?.lon,
        parentDesignation: park?.full.includes('Historical Park') ? 'National Historical Park' : 'National Monument',
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
    parkCodes: (understanding.subjectDestinations || []).map((d) => d.parkCode).filter(Boolean),
    mentioned: (understanding.subjectDestinations || []).flatMap((d) => d.mentionedPlaces || []).map((p) => p.name),
    planning: parsed.planningState,
    parsed,
  };
}

function entityFor(dest) {
  return {
    entityId: `nps:park:${dest.code}`,
    entityType: 'national_park',
    displayName: dest.full,
    parkCode: dest.code,
    latitude: dest.lat,
    longitude: dest.lon,
    resolutionConfidence: 1,
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

describe('independent slack-noun pace', () => {
  test.each([
    `Breathing room at ${DEST[0].name}.`,
    `Buffer time and easy trails at ${DEST[1].name}.`,
    `Room between activities at ${DEST[2].name}.`,
  ])('%s is relaxed', (prompt) => {
    expect(grounded(prompt).explicit.pace).toBe('relaxed');
  });

  test('opening hours are not pace', () => {
    expect(grounded(`What are the opening hours at ${DEST[3].name}?`).explicit.pace).toBeUndefined();
  });
});

describe('independent minute/hour daily drive caps', () => {
  test('hour, minute, and decimal forms agree on minutes', () => {
    const dest = DEST[0].name;
    expect(grounded(`Three hours of driving each day at ${dest}.`).parsed.maxDailyDriveMinutes).toBe(180);
    expect(grounded(`90 minutes of driving per day at ${dest}.`).parsed.maxDailyDriveMinutes).toBe(90);
    expect(grounded(`Daily driving limit of 2.5 hours at ${dest}.`).parsed.maxDailyDriveMinutes).toBe(150);
    expect(grounded(`Cap driving at 150 minutes at ${dest}.`).parsed.maxDailyDriveMinutes).toBe(150);
  });
});

describe('independent unavailable-state contingency', () => {
  test.each([
    `If the shuttle at ${DEST[1].name} is down, what's a fallback?`,
    `If the ferry to ${DEST[0].name} is cancelled, give us an alternative.`,
    `If the viewpoint at ${DEST[2].name} is socked in, what should we do instead?`,
    `What's a good backup plan if ${DEST[3].name} access or parking doesn't work out?`,
  ])('%s → access_contingency', (prompt) => {
    expect(grounded(prompt).job).toBe('access_contingency');
  });

  test('status-only ferry question is not contingency', () => {
    expect(grounded(`Is the ferry to ${DEST[0].name} running this week?`).job).not.toBe('access_contingency');
  });
});

describe('independent constraint persistence on compare/advice', () => {
  test('which-is-better keeps a 3-mile activity ceiling', () => {
    const prompt = `Which park is better, ${DEST[2].name} or ${DEST[3].name}, if we don't want anything over 3 miles?`;
    const got = grounded(prompt);
    expect(got.job).toBe('destination_compare');
    expect(got.explicit.maxWalkMilesPerSegment).toBe(3);
    expect(got.parkCodes.sort()).toEqual(['tont', 'tuzi']);
  });
});

describe('independent dynamic NPS-unit identity', () => {
  test('unique official place infers Homestead NHP, not a national park label', () => {
    const dests = resolveDestinationsFromMessage(`Visit ${PLACES.palmer.name}.`);
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe('home');
    expect(dests[0].displayName).toBe('Homestead National Historical Park');
    expect(dests[0].displayName).not.toMatch(/national park$/i);
  });
});

describe('independent derived aliases and single-token', () => {
  test('Palmer-Epard Cabin is a unique derived alias', () => {
    const index = buildOfficialPlaceIndex(PERSISTED);
    expect(lookupOfficialPlace({ name: 'Palmer-Epard Cabin', index }).status).toBe('exact');
    expect(resolveDestinationsFromMessage('Visit Palmer-Epard Cabin.')[0].parkCode).toBe('home');
  });

  test('Cave Creek is ambiguous across Terrace and Walk', () => {
    const index = buildOfficialPlaceIndex(PERSISTED);
    expect(lookupOfficialPlace({ name: 'Cave Creek', index }).status).toBe('ambiguous');
  });

  test('unframed Citadel binds when Tuzigoot is the parent', () => {
    const prompt = `Plan two days in ${DEST[2].name} with Citadel.`;
    const requests = extractNamedExperienceRequests(prompt, {
      officialIndex: buildOfficialPlaceIndex(PERSISTED),
      parkCodes: ['tuzi'],
    });
    expect(requests.map((r) => r.requestedName)).toContain('Citadel');
    expect(grounded(prompt).mentioned).toEqual(expect.arrayContaining(['Citadel']));
  });
});

describe('independent false-parent control', () => {
  test('glacier-token place is not Glacier NP', () => {
    expect(extractAllParksFromMessage(`Visit ${PLACES.glacierCove.name}.`).map((p) => p.parkCode))
      .not.toContain('glac');
    expect(resolveDestinationsFromMessage(`Visit ${PLACES.glacierCove.name}.`).map((d) => d.parkCode))
      .toEqual(['tont']);
  });
});

describe('independent model-selected degradation on a non-62 unit', () => {
  test('unsupported model stop is omitted', () => {
    const catalog = { evidence: [officialRow(PLACES.palmer)] };
    const identity = resolveStopIdentities({
      itineraryData: {
        intro: 'A day at Homestead.',
        days: [{
          dayNumber: 1,
          title: 'Day 1',
          stops: [
            { id: 's1', name: PLACES.palmer.name, type: 'viewpoint', duration: 60, parkCode: 'home' },
            { id: 's2', name: 'Ghost Homestead Walk', type: 'walk', duration: 45, parkCode: 'home' },
          ],
        }],
        ending: 'Done.',
      },
      evidenceBundle: catalog,
    });
    const degraded = degradeUnresolvedModelStops({
      itineraryData: identity.itineraryData,
      violations: identity.violations,
      evidenceBundle: catalog,
      namedExperienceRequirements: [],
    });
    const names = (degraded.itineraryData?.days?.[0]?.stops || []).map((s) => s.name);
    expect(names).toContain(PLACES.palmer.name);
    expect(names).not.toContain('Ghost Homestead Walk');
  });
});

describe('independent provider honesty / 12D hardness', () => {
  test('numeric daily cap still makes driving_time hard and does not fabricate minutes', () => {
    const prompt = `Build two days through ${DEST[0].name} and ${DEST[1].name}. Cap driving at 150 minutes.`;
    const parsed = parseConstraints({ formData: {} }, prompt);
    const requirements = planEvidenceRequirements({
      turnId: 'turn:12f3-drive',
      userPrompt: prompt,
      intent: classifyTrailieIntent({ userPrompt: prompt }),
      resolvedEntities: [entityFor(DEST[0]), entityFor(DEST[1])],
      constraints: parsed,
      tripScope: parsed.planningState?.tripScope || parsed.tripScope || null,
      now: new Date('2026-09-19T12:00:00.000Z'),
    });
    const drives = (requirements || []).filter((r) => r.topic === 'driving_time');
    expect(drives.length).toBeGreaterThan(0);
    expect(drives.some((d) => d.criticality === 'hard')).toBe(true);
    const gate = evaluateEvidenceGate(requirements, {
      resolutions: requirements.map((r) => ({
        requirementId: r.requirementId,
        status: r.topic === 'driving_time' ? 'unsupported' : 'satisfied_fresh',
      })),
    });
    expect(gate.hardComplete).toBe(false);
    expect(gate.unmetHardReasons).toContain('unmet_hard_driving_time');
  });
});
