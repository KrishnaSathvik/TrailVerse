'use strict';

/**
 * Phase 12F.1 — fresh independent paraphrase/place evaluation.
 *
 * Not the 12F held-out strings, not the 12F.1 development tables, and not
 * the frozen audit. Agreement is on contract fields.
 */

const { buildTurnUnderstanding } = require('../../../../../src/services/turnUnderstanding');
const { resolveTravelerJob } = require('../../../../../src/services/trailieTravelerJobResolver');
const { parseConstraints } = require('../../../../../src/utils/constraintEngine');
const { extractNamedExperienceRequests } = require('../../../../../src/utils/namedExperienceRequirements');
const { resolveDestinationsFromMessage } = require('../../../../../src/utils/genericDestinationResolver');
const { extractAllParksFromMessage } = require('../../../../../src/utils/parkExtractor');
const { buildOfficialPlaceIndex } = require('../../../../../src/utils/officialPlaceIndex');
const {
  setPersistedOfficialPlaceEvidence,
  clearPersistedOfficialPlaceEvidence,
  resolvePersistedOfficialPlaces,
} = require('../../../../../src/utils/persistedOfficialPlaceLookup');
const { kmToMiles } = require('../../../../../src/utils/constraintFamilies');

const DEST = Object.freeze([
  { name: 'Grand Canyon', code: 'grca' },
  { name: 'Dry Tortugas', code: 'drto' },
  { name: 'Mesa Verde', code: 'meve' },
  { name: 'Channel Islands', code: 'chis' },
]);

const PLACES = Object.freeze({
  shoshone: {
    id: 'ev:grca-shoshone-walk',
    npsId: 'C1B20000-0000-4000-8000-000000000001',
    name: 'Shoshone Point Walk',
    parkCode: 'grca',
    latitude: 36.04,
    longitude: -112.04,
  },
  garden: {
    id: 'ev:drto-garden-dock',
    npsId: 'C1B20000-0000-4000-8000-000000000002',
    name: 'Garden Key Dock',
    parkCode: 'drto',
    latitude: 24.628,
    longitude: -82.873,
  },
  sunTemple: {
    id: 'ev:meve-sun-temple',
    npsId: 'C1B20000-0000-4000-8000-000000000003',
    name: 'Sun Temple Terrace',
    parkCode: 'meve',
    latitude: 37.166,
    longitude: -108.472,
  },
  glacierCove: {
    id: 'ev:chis-glacier-cove',
    npsId: 'C1B20000-0000-4000-8000-000000000004',
    name: 'Harbor Glacier Cove',
    parkCode: 'chis',
    latitude: 34.01,
    longitude: -119.4,
  },
});

function officialRow(spec) {
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
        aliases: [],
      },
    },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: spec.npsId },
    quality: { authorityClass: 'official_owner' },
  };
}

const PERSISTED = Object.values(PLACES).map(officialRow);

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
    planning: parsed.planningState,
    parsed,
  };
}

beforeEach(() => setPersistedOfficialPlaceEvidence(PERSISTED));
afterEach(() => clearPersistedOfficialPlaceEvidence());

describe('independent produce-object paraphrases', () => {
  test.each([
    [`Looking for a day plan at ${DEST[0].name}`],
    [`We have a day in ${DEST[1].name} — map it out`],
    [`Draft a day plan for ${DEST[2].name}`],
  ])('%s is a one-day produce request', (prompt) => {
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.durationDays).toBe(1);
  });
});

describe('independent contingency paraphrases', () => {
  test.each([
    `If we cannot get into ${DEST[3].name}, what's a fallback?`,
    `If ${DEST[0].name} becomes inaccessible, what should we do instead?`,
  ])('%s → access_contingency', (prompt) => {
    expect(grounded(prompt).job).toBe('access_contingency');
  });
});

describe('independent distance / pace / drive paraphrases', () => {
  test('bare outing ceiling still writes maxWalkMilesPerSegment', () => {
    const got = grounded(`Nothing over 3 miles at ${DEST[2].name}.`);
    expect(got.explicit.maxWalkMilesPerSegment).toBe(3);
  });

  test('km still converts', () => {
    const got = grounded(`Keep each outing under 5 kilometers at ${DEST[1].name}.`);
    expect(got.explicit.maxWalkMilesPerSegment).toBe(kmToMiles(5));
  });

  test('downtime language is relaxed pace', () => {
    const got = grounded(`Leave breathing room at ${DEST[3].name}.`);
    expect(got.explicit.pace).toBe('relaxed');
  });

  test('numeric drive cap paraphrases agree', () => {
    const prompts = [
      `Keep driving under 2 hours/day at ${DEST[0].name}.`,
      `2-hour daily driving limit at ${DEST[0].name}.`,
      `Cap driving at 2 hours each day at ${DEST[0].name}.`,
    ];
    const minutes = prompts.map((prompt) => grounded(prompt).parsed.maxDailyDriveMinutes);
    expect(new Set(minutes)).toEqual(new Set([120]));
  });
});

describe('independent produce + photography', () => {
  test('a mapped photography day stays an itinerary', () => {
    const got = grounded(
      `Map a day at ${DEST[1].name} for sunrise photography with little driving.`,
    );
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.askedToProduce).toBe(true);
    expect(got.soft.photography).toBe(true);
    expect(got.soft.minimizeDriving).toBe(true);
  });
});

describe('independent first-turn official lookup', () => {
  test('unique official place infers parent', () => {
    const prompt = `Visit ${PLACES.shoshone.name}.`;
    expect(resolvePersistedOfficialPlaces({ text: prompt }).parentParkCode).toBe('grca');
    expect(resolveDestinationsFromMessage(prompt).map((d) => d.parkCode)).toEqual(['grca']);
  });
});

describe('independent false-parent controls', () => {
  test('a glacier-token place is not Glacier National Park', () => {
    expect(extractAllParksFromMessage(`Visit ${PLACES.glacierCove.name}.`).map((p) => p.parkCode))
      .not.toContain('glac');
    expect(resolveDestinationsFromMessage(`Visit ${PLACES.glacierCove.name}.`).map((d) => d.parkCode))
      .toEqual(['chis']);
  });
});

describe('independent unframed official mentions', () => {
  test('plus/and lists bind when the parent park is known', () => {
    const prompt = `Plan a day in ${DEST[2].name} plus ${PLACES.sunTemple.name}`;
    const requests = extractNamedExperienceRequests(prompt, {
      officialIndex: buildOfficialPlaceIndex(PERSISTED),
      parkCodes: ['meve'],
    });
    expect(requests.map((r) => r.requestedName)).toContain(PLACES.sunTemple.name);
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.parkCodes).toContain('meve');
  });
});
