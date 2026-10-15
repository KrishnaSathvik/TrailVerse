'use strict';

/**
 * WP-TU Phase 2 Task 4 — tripScope becomes a CONSUMER of the single
 * authoritative classification (Task 3's `intent`) instead of an independent
 * destination resolver:
 *
 *   current user turn -> classifyIntent (once) -> understanding.subjectDestinations
 *                                               + understanding.primaryDestination
 *                                               + understanding.destinationRelationship
 *                                               + tripContext.activeContextAction
 *                                               -> tripScope synchronization
 *
 * Three layers are tested:
 *   1. `syncTripScopeDestinationFromIntent` in isolation (pure, deterministic,
 *      no providers) — cases 1-6 + the structural assertion (single
 *      destination only).
 *   2. Follow-up fix — a 'set' turn naming 2+ destinations must NOT collapse
 *      to `primaryDestination` alone (the exact bug Task 1c already fixed one
 *      layer up for `subjectDestinations`/`destinationRelationship`
 *      themselves). Reuses the EXISTING multi-destination/route contract
 *      (`buildTripScopeFromMessage`) driven by the authoritative destinations
 *      + relationship, never by re-parsing the raw message for either.
 *   3. One wiring test through the REAL `executeTrailieV2Turn` call site
 *      (injected deps only, matching trailieV2ExecutionService.test.js's
 *      convention) proving the pure function is actually consulted where
 *      `tripScope` is derived, and that a raw message naming a different
 *      park has zero effect when the classifier reports `preserve`.
 */

const {
  executeTrailieV2Turn,
  __testables: { syncTripScopeDestinationFromIntent },
} = require('../../../../../src/services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');
const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function destination({ name, parkCode, lat = 36.0, lon = -112.0 }) {
  return { name, parkCode, lat, lon, source: 'deterministic', confidence: 0.95 };
}

const ZION = destination({ name: 'Zion National Park', parkCode: 'zion', lat: 37.3, lon: -113.0 });
const BADLANDS = destination({ name: 'Badlands National Park', parkCode: 'badl', lat: 43.8, lon: -102.3 });
const REDWOOD = destination({ name: 'Redwood National Park', parkCode: 'redw', lat: 41.2, lon: -124.0 });
const ACADIA = destination({ name: 'Acadia National Park', parkCode: 'acad', lat: 44.3, lon: -68.2 });
const YELLOWSTONE = destination({ name: 'Yellowstone', parkCode: 'yell', lat: 44.428, lon: -110.588 });
const GRAND_TETON = destination({ name: 'Grand Teton', parkCode: 'grte', lat: 43.79, lon: -110.681 });

function singleDestinationScope(dest) {
  return {
    type: 'single_destination',
    destinations: [{
      entityId: `nps:park:${dest.parkCode}`,
      entityType: 'national_park',
      parkCode: dest.parkCode,
      displayName: dest.name,
      order: 0,
      latitude: dest.lat,
      longitude: dest.lon,
      status: 'resolved',
    }],
    origin: null,
    routeShape: 'unknown',
    maxDailyDriveMinutes: null,
    routeLegs: [],
    unresolvedRouteLegs: [],
  };
}

function intentWith({ primaryDestination, activeContextAction, relationship = 'new' }) {
  return {
    understanding: { primaryDestination: primaryDestination || null },
    tripContext: { relationship, activeContextAction },
  };
}

function scopeDestinationNames(tripScope) {
  return (tripScope?.destinations || []).map((d) => d.parkCode);
}

function scopeDisplayNames(tripScope) {
  return (tripScope?.destinations || []).map((d) => d.displayName);
}

// Real `understanding` fields (subjectDestinations/destinationRelationship),
// with `tripContext.activeContextAction` explicitly overridable — the fix
// under test consumes ONLY these fields, never the raw message, so building
// the fixture this way (rather than a bespoke shorthand) is itself part of
// the structural proof.
function intentWithMulti({ subjectDestinations, destinationRelationship, activeContextAction, originalText = '' }) {
  return {
    understanding: {
      originalText,
      subjectDestinations,
      primaryDestination: subjectDestinations[0] || null,
      destinationRelationship,
    },
    tripContext: { relationship: 'new', activeContextAction },
  };
}

// ---------------------------------------------------------------------------
// 1. Pure-function cases
// ---------------------------------------------------------------------------

describe('syncTripScopeDestinationFromIntent — pure', () => {
  test('case 1: no active trip, "Plan 3 days in Zion" (set) -> tripScope becomes Zion', () => {
    const intent = intentWith({ primaryDestination: ZION, activeContextAction: 'set' });
    const result = syncTripScopeDestinationFromIntent(null, intent);
    expect(scopeDestinationNames(result)).toEqual(['zion']);
  });

  test('case 2: Redwood active, "Actually plan Badlands instead" (set) -> tripScope becomes Badlands', () => {
    const redwoodScope = singleDestinationScope(REDWOOD);
    const intent = intentWith({ primaryDestination: BADLANDS, activeContextAction: 'set' });
    const result = syncTripScopeDestinationFromIntent(redwoodScope, intent);
    expect(scopeDestinationNames(result)).toEqual(['badl']);
    // The input tripScope object itself must not be mutated — it is a
    // snapshot of whatever else (persisted plan identity) it came from.
    expect(scopeDestinationNames(redwoodScope)).toEqual(['redw']);
  });

  test('case 3: Redwood active, "Is October good in Acadia?" (preserve) -> tripScope REMAINS Redwood', () => {
    const redwoodScope = singleDestinationScope(REDWOOD);
    const intent = intentWith({
      primaryDestination: ACADIA,
      activeContextAction: 'preserve',
      relationship: 'new',
    });
    const result = syncTripScopeDestinationFromIntent(redwoodScope, intent);
    expect(scopeDestinationNames(result)).toEqual(['redw']);
  });

  test('case 4: Acadia follow-up, "What about November?" (preserve) -> tripScope REMAINS Redwood', () => {
    const redwoodScope = singleDestinationScope(REDWOOD);
    // Bare follow-up: the conversational subject (Acadia) continues, but the
    // active trip context action is still 'preserve' — no destination
    // switch is implied.
    const intent = intentWith({
      primaryDestination: ACADIA,
      activeContextAction: 'preserve',
      relationship: 'continuation',
    });
    const result = syncTripScopeDestinationFromIntent(redwoodScope, intent);
    expect(scopeDestinationNames(result)).toEqual(['redw']);
  });

  test('case 5: Badlands active, "For my Redwood trip, change Day 2" (historical_reference/preserve) -> tripScope REMAINS Badlands', () => {
    const badlandsScope = singleDestinationScope(BADLANDS);
    const intent = intentWith({
      primaryDestination: REDWOOD,
      activeContextAction: 'preserve',
      relationship: 'historical_reference',
    });
    const result = syncTripScopeDestinationFromIntent(badlandsScope, intent);
    expect(scopeDestinationNames(result)).toEqual(['badl']);
  });

  test('case 6: multi-destination comparison Q&A must NOT mutate tripScope', () => {
    const badlandsScope = singleDestinationScope(BADLANDS);
    // Comparison subjects never imply 'set' — only a genuine NEW itinerary
    // build does (see trailieTravelerJobResolver.resolveTripContext).
    const intent = intentWith({
      primaryDestination: ZION,
      activeContextAction: 'preserve',
      relationship: 'new',
    });
    const result = syncTripScopeDestinationFromIntent(badlandsScope, intent);
    expect(scopeDestinationNames(result)).toEqual(['badl']);
  });

  test('no-op when tripScope is null and action is preserve', () => {
    const intent = intentWith({ primaryDestination: ACADIA, activeContextAction: 'preserve' });
    expect(syncTripScopeDestinationFromIntent(null, intent)).toBeNull();
  });

  test('no-op when intent/tripContext/understanding is missing entirely', () => {
    const redwoodScope = singleDestinationScope(REDWOOD);
    expect(syncTripScopeDestinationFromIntent(redwoodScope, null)).toBe(redwoodScope);
    expect(syncTripScopeDestinationFromIntent(redwoodScope, {})).toBe(redwoodScope);
  });

  test('no-op when activeContextAction is "set" but primaryDestination is absent', () => {
    const redwoodScope = singleDestinationScope(REDWOOD);
    const intent = intentWith({ primaryDestination: null, activeContextAction: 'set' });
    expect(syncTripScopeDestinationFromIntent(redwoodScope, intent)).toBe(redwoodScope);
  });

  // ── Structural assertion ──────────────────────────────────────────────
  // The destination change is driven from `intent.understanding.
  // primaryDestination` + `intent.tripContext.activeContextAction` TOGETHER
  // — never from a raw-message park-switch branch. This function does not
  // even accept a message/text parameter, so a message naming a different
  // park cannot reach it; and when `activeContextAction` is forced to
  // 'preserve', naming a different park in `primaryDestination` still
  // cannot change the destination.
  test('structural: function takes only (tripScope, intent) — no raw-message parameter', () => {
    expect(syncTripScopeDestinationFromIntent.length).toBe(2);
  });

  test('structural: forcing activeContextAction to preserve blocks a destination change even when primaryDestination names a different park', () => {
    const redwoodScope = singleDestinationScope(REDWOOD);
    const intent = intentWith({ primaryDestination: BADLANDS, activeContextAction: 'preserve' });
    const result = syncTripScopeDestinationFromIntent(redwoodScope, intent);
    expect(scopeDestinationNames(result)).toEqual(['redw']);
  });

  test('single-destination "set" preserves the destination display name across the round trip (not just parkCode)', () => {
    const intent = intentWith({ primaryDestination: ZION, activeContextAction: 'set' });
    const result = syncTripScopeDestinationFromIntent(null, intent);
    expect(scopeDisplayNames(result)).toEqual(['Zion National Park']);
  });
});

// ---------------------------------------------------------------------------
// Follow-up fix — a 'set' turn naming 2+ destinations must not collapse to
// `primaryDestination` alone. Consumes ONLY `understanding.subjectDestinations`
// + `understanding.primaryDestination` + `understanding.destinationRelationship`
// + `tripContext.activeContextAction`, together — no new destination
// detection, no raw-message re-parsing for destinations/relationship.
// ---------------------------------------------------------------------------

describe('syncTripScopeDestinationFromIntent — 2+ destination "set" (multi-destination fix)', () => {
  test('preserve turns with multiple subjectDestinations are still an untouched no-op (compare/alternative-choice Q&A)', () => {
    const badlandsScope = singleDestinationScope(BADLANDS);
    const intent = intentWithMulti({
      subjectDestinations: [YELLOWSTONE, GRAND_TETON],
      destinationRelationship: 'compare',
      activeContextAction: 'preserve',
      originalText: 'Should I do Yellowstone or Grand Teton?',
    });
    const result = syncTripScopeDestinationFromIntent(badlandsScope, intent);
    expect(scopeDestinationNames(result)).toEqual(['badl']);
  });

  test('Redwood active -> "Let\'s plan Yellowstone and Grand Teton instead." (set) -> tripScope carries BOTH destinations', () => {
    // Verified via the REAL classifier (not assumed): this phrasing resolves
    // destinationRelationship: 'combine' (a plain "X and Y" conjunction, no
    // "road trip"/"drive"/"between" framing), travelerJob: 'day_by_day_itinerary',
    // tripContext: { relationship: 'new', activeContextAction: 'set' }.
    const realIntent = classifyTrailieIntent({
      userPrompt: "Let's plan Yellowstone and Grand Teton instead.",
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
    });
    expect(realIntent.understanding.destinationRelationship).toBe('combine');
    expect(realIntent.tripContext).toEqual({ relationship: 'new', activeContextAction: 'set' });
    expect(realIntent.understanding.subjectDestinations.map((d) => d.parkCode)).toEqual(['yell', 'grte']);

    const redwoodScope = singleDestinationScope(REDWOOD);
    const result = syncTripScopeDestinationFromIntent(redwoodScope, realIntent);

    // BOTH destinations survive — not just the first (primaryDestination).
    expect(scopeDestinationNames(result)).toEqual(['yell', 'grte']);
    expect(scopeDisplayNames(result)).toEqual(['Yellowstone', 'Grand Teton']);
    // A plain "and" conjunction with no road-trip/drive wording reuses the
    // EXISTING multi_destination shape (not road_trip) — the relationship
    // ('combine') still implies travel, so adjacent route legs are built.
    expect(result.type).toBe('multi_destination');
    expect(result.destinationRelationship).toBe('combine');
    expect(result.routeLegs.map((l) => `${l.fromEntityId}->${l.toEntityId}`)).toEqual(['nps:park:yell->nps:park:grte']);
    // Redwood's own stored scope object is untouched.
    expect(scopeDestinationNames(redwoodScope)).toEqual(['redw']);
  });

  test('no active trip -> "Plan a Yellowstone and Grand Teton road trip." (set) -> tripScope carries BOTH destinations as a road_trip', () => {
    // WP-TU Phase 2 Task 4A fixed the upstream gap this test used to route
    // around: this exact phrasing now resolves destinationRelationship:
    // 'route' AND travelerJob: 'day_by_day_itinerary' / tripContext.
    // activeContextAction: 'set' from the REAL classifier — no forcing
    // needed. This is the full Task 3 -> Task 4 -> Task 4A loop, closed.
    const realIntent = classifyTrailieIntent({
      userPrompt: 'Plan a Yellowstone and Grand Teton road trip.',
      priorTripState: null,
    });
    expect(realIntent.understanding.destinationRelationship).toBe('route');
    expect(realIntent.tripContext.activeContextAction).toBe('set');

    const result = syncTripScopeDestinationFromIntent(null, realIntent);

    expect(scopeDestinationNames(result)).toEqual(['yell', 'grte']);
    expect(scopeDisplayNames(result)).toEqual(['Yellowstone', 'Grand Teton']);
    // Explicit "road trip" wording in the shared originalText drives type
    // selection to 'road_trip' (via the reused, unmodified
    // buildTripScopeFromMessage sub-field logic), with a drive transport mode.
    expect(result.type).toBe('road_trip');
    expect(result.transportMode).toBe('drive');
    expect(result.destinationRelationship).toBe('route');
    expect(result.routeLegs.map((l) => `${l.fromEntityId}->${l.toEntityId}`)).toEqual(['nps:park:yell->nps:park:grte']);
  });
});

// ---------------------------------------------------------------------------
// 2. Wiring test through the real executeTrailieV2Turn call site
// ---------------------------------------------------------------------------

function classification(overrides = {}) {
  return {
    version: 'trailie-intent-v2.0.0',
    source: 'deterministic',
    primaryIntent: 'general_qa',
    verticals: ['parks'],
    depth: 'quick',
    freshness: 'stable',
    actionability: 'informational',
    scope: 'single_destination',
    entities: [],
    confidence: 0.9,
    reasonCodes: ['general_travel_question'],
    compound: false,
    requiresLunaShadow: false,
    travelerJob: null,
    understanding: { primaryDestination: null },
    tripContext: { relationship: 'continuation', activeContextAction: 'preserve' },
    ...overrides,
  };
}

function buildDeps(overrides = {}) {
  const capturedTripScopes = [];
  const defaultExec = async () => ({
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText: 'A complete, validated prose answer well over the fallback length threshold.',
    toolCalls: [],
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 800, outputTokens: 150, cachedInputTokens: 0 },
  });
  const executeResponses = overrides.executeResponses || jest.fn(defaultExec);

  const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
    candidates: [],
  }));

  const resolveLogisticsNeeds = jest.fn((args) => {
    capturedTripScopes.push(args.tripScope);
    return {};
  });

  const deps = {
    classifyIntent: jest.fn(() => classification()),
    planRequirements: jest.fn(() => []),
    resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
    detectContradiction: jest.fn(() => []),
    now: () => new Date('2026-09-04T12:00:00.000Z'),
    newTurnId: () => 'turn-test-tripscope',
    streamGeneration: false,
    ...overrides,
    responseAdapters: {},
    executeResponses,
    resolveEvidence,
    resolveLogisticsNeeds,
    buildTravelLogisticsForTurn: overrides.buildTravelLogisticsForTurn || (async () => ({
      schemaVersion: 1,
      inventoryMode: 'planning',
      transport: { airportsStatus: 'not_requested', airports: [], routeLegsStatus: 'not_requested', routeLegs: [] },
      stays: {
        insidePark: { status: 'not_requested', properties: [] },
        gateway: { status: 'not_requested', properties: [] },
        campgrounds: { status: 'not_requested', properties: [] },
        vacationRentalHint: null,
      },
    })),
  };
  return { deps, capturedTripScopes };
}

function baseInput(overrides = {}) {
  return {
    userMessage: 'What is Yosemite like in spring?',
    conversationContext: { history: [] },
    tripState: null,
    constraints: null,
    resolvedContext: {},
    ...overrides,
  };
}

describe('tripScope call site — real executeTrailieV2Turn wiring', () => {
  test('a raw message naming a different park has NO effect on tripScope when the classifier reports preserve', async () => {
    const redwoodScope = singleDestinationScope(REDWOOD);
    const { deps, capturedTripScopes } = buildDeps({
      // The raw message explicitly names Badlands, but the (injected,
      // authoritative) classification says this turn PRESERVES the active
      // context — e.g. a side question about Badlands while Redwood stays
      // active. If the call site secretly re-derived the destination from
      // the raw message text, this assertion would fail.
      classifyIntent: () => classification({
        understanding: { primaryDestination: BADLANDS },
        tripContext: { relationship: 'new', activeContextAction: 'preserve' },
      }),
    });

    const result = await executeTrailieV2Turn(baseInput({
      userMessage: 'Actually plan Badlands instead',
      tripState: { tripScope: redwoodScope, existingCanonicalPlan: { days: [{ dayNumber: 1 }] }, hasItinerary: true },
    }), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(capturedTripScopes).toHaveLength(1);
    expect(scopeDestinationNames(capturedTripScopes[0])).toEqual(['redw']);
  });

  test('a "set" classification switches the active tripScope destination without destroying the prior stored plan', async () => {
    const redwoodScope = singleDestinationScope(REDWOOD);
    const redwoodPlan = { intro: 'Redwood trip', days: [{ id: 'd1', dayNumber: 1, label: 'Day 1', stops: [] }] };
    const { deps, capturedTripScopes } = buildDeps({
      classifyIntent: () => classification({
        understanding: { primaryDestination: BADLANDS },
        tripContext: { relationship: 'new', activeContextAction: 'set' },
      }),
    });

    const tripStateInput = { tripScope: redwoodScope, existingCanonicalPlan: redwoodPlan, hasItinerary: true };
    const result = await executeTrailieV2Turn(baseInput({
      userMessage: 'Actually plan Badlands instead',
      tripState: tripStateInput,
    }), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(capturedTripScopes).toHaveLength(1);
    expect(scopeDestinationNames(capturedTripScopes[0])).toEqual(['badl']);
    // Redwood's stored plan identity, as supplied to this turn, is untouched —
    // this execution service only derives a NEW local tripScope value; it
    // never mutates the frozen tripState it was given.
    expect(tripStateInput.existingCanonicalPlan).toEqual(redwoodPlan);
    expect(tripStateInput.tripScope).toBe(redwoodScope);
    expect(scopeDestinationNames(tripStateInput.tripScope)).toEqual(['redw']);
  });
});
