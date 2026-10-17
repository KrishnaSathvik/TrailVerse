'use strict';

/**
 * WP-TU Phase 2 Task 5 — `entryContext.requestedDestinations`/`comparisonTargets`
 * is an ENTRY-TIME hint, not an independent/current destination authority.
 * `resolveEntitiesFromContext` (trailieRouteBridge.js) must consult the
 * persisted active trip (`tripScope.destinations`) and the CURRENT turn's own
 * extraction (`allExtractedParks`) BEFORE it, demoting entry targets to a
 * fallback used only when neither produces entities.
 *
 * Tests 1-4 and 6 drive the REAL `buildResolvedContext` (which calls the real,
 * unmocked `resolveEntitiesFromContext`) directly — no mocks of the function
 * under test. Test 5 is satisfied by running the pre-existing
 * `trailieEntryContext.test.js` file unchanged (see report).
 */

const { buildResolvedContext } = require('../trailieV2RouteBridge');
const { prepareChatContext } = require('../../routes/ai');

function entryDestination({ name, parkCode, lat, lon }) {
  return { name, parkCode, lat, lon };
}

const REDWOOD_ENTRY = entryDestination({ name: 'Redwood National Park', parkCode: 'redw', lat: 41.2, lon: -124.0 });
const ZION_ENTRY = entryDestination({ name: 'Zion National Park', parkCode: 'zion', lat: 37.30, lon: -113.05 });
const YOSEMITE_ENTRY = entryDestination({ name: 'Yosemite National Park', parkCode: 'yose', lat: 37.865, lon: -119.538 });
const SEQUOIA_ENTRY = entryDestination({ name: 'Sequoia National Park', parkCode: 'sequ', lat: 36.486, lon: -118.566 });

function extractedPark({ parkCode, parkName, lat, lon }) {
  return { parkCode, parkName, lat, lon };
}

const ACADIA_EXTRACTED = extractedPark({ parkCode: 'acad', parkName: 'Acadia National Park', lat: 44.35, lon: -68.21 });
const YELLOWSTONE_EXTRACTED = extractedPark({ parkCode: 'yell', parkName: 'Yellowstone National Park', lat: 44.428, lon: -110.588 });

function tripScopeDestination({ parkCode, displayName, lat, lon }) {
  return {
    entityId: `nps:park:${parkCode}`,
    entityType: 'national_park',
    parkCode,
    displayName,
    latitude: lat,
    longitude: lon,
    resolutionConfidence: 1,
    status: 'resolved',
  };
}

const BADLANDS_TRIPSCOPE = {
  type: 'single_destination',
  destinations: [tripScopeDestination({ parkCode: 'badl', displayName: 'Badlands National Park', lat: 43.75, lon: -102.50 })],
};

describe('Task 5 — entryContext demoted to a fallback authority (resolveEntitiesFromContext via buildResolvedContext)', () => {
  test('1. stale park-entry (Redwood) does not override fresher current-turn context (Acadia)', () => {
    const rc = buildResolvedContext({
      entryContext: { version: 1, source: 'park_cta', requestedDestinations: [REDWOOD_ENTRY], comparisonTargets: [] },
      allExtractedParks: [ACADIA_EXTRACTED],
    });
    expect(rc.resolvedEntities.map((e) => e.entityId)).toEqual(['nps:park:acad']);
  });

  test('2. a genuinely empty initial turn (park_cta entry = Zion, no tripScope, no extracted parks) still resolves Zion via the entry fallback', () => {
    const rc = buildResolvedContext({
      entryContext: { version: 1, source: 'park_cta', requestedDestinations: [ZION_ENTRY], comparisonTargets: [] },
      allExtractedParks: [],
    });
    expect(rc.resolvedEntities.map((e) => e.entityId)).toEqual(['nps:park:zion']);
  });

  test('3. stale Redwood entry does not override an active persisted Badlands trip (tripScope.destinations) with no new destination-bearing turn', () => {
    const rc = buildResolvedContext({
      entryContext: { version: 1, source: 'park_cta', requestedDestinations: [REDWOOD_ENTRY], comparisonTargets: [] },
      constraints: { tripScope: BADLANDS_TRIPSCOPE },
      allExtractedParks: [],
    });
    expect(rc.resolvedEntities.map((e) => e.entityId)).toEqual(['nps:park:badl']);
  });

  test('4. a stale multi-destination entry (Yosemite + Sequoia) does not win over a fresher unrelated destination (Yellowstone) merely because it has more entities', () => {
    const rc = buildResolvedContext({
      entryContext: { version: 1, source: 'compare', requestedDestinations: [YOSEMITE_ENTRY, SEQUOIA_ENTRY], comparisonTargets: [] },
      allExtractedParks: [YELLOWSTONE_EXTRACTED],
    });
    expect(rc.resolvedEntities.map((e) => e.entityId)).toEqual(['nps:park:yell']);
  });

  // Test 5 (non-destination EntryContext semantics — source, entry mode,
  // formData/dates, quick-fill, saved-trip semantics, hasSemanticTrailieEntryContext)
  // is covered unchanged by src/utils/__tests__/trailieEntryContext.test.js
  // (8/8 pass, no code in that file was touched by this task — see report).

  test('6. structural: entryTargets never wins when EITHER tripScope or allExtractedParks is also present and disagrees (regression guard against re-promoting entryTargets to the top)', () => {
    // All three sources present at once, all disagreeing with each other.
    // tripScope is checked before allExtractedParks (pre-existing precedence,
    // untouched by this task) — the assertion that matters here is that
    // entry NEVER wins, which would only happen if entryTargets were moved
    // back above tripScope/allExtractedParks.
    const rc = buildResolvedContext({
      entryContext: { version: 1, source: 'park_cta', requestedDestinations: [REDWOOD_ENTRY], comparisonTargets: [] },
      constraints: { tripScope: BADLANDS_TRIPSCOPE },
      allExtractedParks: [ACADIA_EXTRACTED],
    });
    const winningIds = rc.resolvedEntities.map((e) => e.entityId);
    expect(winningIds).not.toContain('nps:park:redw');
    expect(winningIds).toEqual(['nps:park:badl']);
  });

  test('comparisonTargets alone still seeds a genuinely empty turn (pre-existing behavior preserved)', () => {
    const rc = buildResolvedContext({
      entryContext: {
        version: 1,
        source: 'compare',
        comparisonTargets: [
          { parkCode: 'yell', name: 'Yellowstone National Park' },
          { parkCode: 'grte', name: 'Grand Teton National Park' },
        ],
      },
    });
    expect(rc.resolvedEntities.map((entity) => entity.entityId)).toEqual([
      'nps:park:yell',
      'nps:park:grte',
    ]);
    expect(rc.destinationCount).toBe(2);
  });
});

describe('Task 5 follow-up — ai.js resolvedMetadata.parkCode fallback (the second site the coordinator flagged)', () => {
  // Verifies via the REAL prepareChatContext (offline, no DB — skipUserContext
  // + no tripId) that a stale entry-seeded resolvedMetadata.parkCode cannot
  // leak over a real active trip signal, and that it CAN still seed a
  // genuinely empty turn — confirming this site needed no code change.
  async function runPrepare({ userMessage, entryContext = null, activeTripContext = null }) {
    return prepareChatContext(
      {
        messages: [{ role: 'user', content: userMessage }],
        provider: 'openai',
        metadata: { skipUserContext: true, entryContext, activeTripContext },
      },
      '[Task5 test]',
      { isAnonymous: true }
    );
  }

  test('a stale Redwood entry does NOT override a real client-echoed active Badlands trip on a side-query turn', async () => {
    const preparedContext = await runPrepare({
      userMessage: 'How busy does it get in October?',
      entryContext: { version: 1, source: 'park_cta', requestedDestinations: [REDWOOD_ENTRY], comparisonTargets: [] },
      activeTripContext: {
        primaryDestination: { parkCode: 'badl', name: 'Badlands National Park', lat: 43.75, lon: -102.50 },
      },
    });
    expect(preparedContext.resolvedMetadata.parkCode).toBe('badl');
  });

  test('a stale Redwood entry DOES seed a genuinely empty turn (no active trip, no destination named this turn)', async () => {
    const preparedContext = await runPrepare({
      userMessage: 'What is there to do?',
      entryContext: { version: 1, source: 'park_cta', requestedDestinations: [REDWOOD_ENTRY], comparisonTargets: [] },
      activeTripContext: null,
    });
    expect(preparedContext.resolvedMetadata.parkCode).toBe('redw');
  });
});
