'use strict';

const {
  buildClassifierPriorTripState,
  buildResolvedContext,
  createV2StreamEventBinder,
  deriveRefinementManifestInput,
  latestUserMessage,
  priorHistory,
} = require('../trailieV2RouteBridge');
const { createTrailieTransportAdapter } = require('../../utils/trailieTransportAdapter');
const { resolveTravelerJob } = require('../trailieTravelerJobResolver');

describe('WP11B route bridge context mapping', () => {
  test('maps allExtractedParks to resolvedEntities with real coordinates', () => {
    const ctx = {
      allExtractedParks: [
        { parkCode: 'yell', parkName: 'Yellowstone', lat: 44.428, lon: -110.588 },
        { parkCode: 'grte', parkName: 'Grand Teton', lat: 43.79, lon: -110.681 },
      ],
      constraints: { dates: null },
    };
    const rc = buildResolvedContext(ctx);
    expect(rc.resolvedEntities).toHaveLength(2);
    expect(rc.resolvedEntities[0]).toMatchObject({
      entityId: 'nps:park:yell', displayName: 'Yellowstone', latitude: 44.428, longitude: -110.588,
    });
    // Distinct coordinates per park — this is what stops the weather/astronomy
    // dedupe collision AND keeps the evidence location-correct (not 0,0).
    expect(rc.resolvedEntities[1].latitude).toBe(43.79);
    expect(rc.destinationCount).toBe(2);
  });

  test('hydrates catalog coordinates when extracted park lat/lon are missing (Pass #3)', () => {
    const ctx = { allExtractedParks: [{ parkCode: 'zion', parkName: 'Zion', lat: null, lon: null }] };
    const rc = buildResolvedContext(ctx);
    expect(rc.resolvedEntities).toHaveLength(1);
    expect(rc.resolvedEntities[0]).toMatchObject({
      entityId: 'nps:park:zion',
      displayName: 'Zion',
    });
    expect(rc.resolvedEntities[0].latitude).not.toBeNull();
    expect(rc.resolvedEntities[0].longitude).not.toBeNull();
    expect(rc.resolvedEntities[0].latitude).not.toBe(0);
    expect(rc.resolvedEntities[0].longitude).not.toBe(0);
  });

  test('omits unknown parks without usable coordinates rather than emitting 0,0', () => {
    const ctx = {
      allExtractedParks: [{ parkCode: 'xxxx', parkName: 'Not A Real Park', lat: null, lon: null }],
    };
    const rc = buildResolvedContext(ctx);
    expect(rc.resolvedEntities).toHaveLength(0);
  });

  test('maps a geocoded non-NPS destination into a known-place entity', () => {
    const rc = buildResolvedContext({
      allExtractedParks: [],
      resolvedMetadata: {
        parkName: 'Valley of Fire State Park',
        resolvedPlaceName: 'Valley of Fire State Park',
        lat: 36.4819,
        lon: -114.5311,
      },
    });
    expect(rc.resolvedEntities).toEqual([
      expect.objectContaining({
        entityId: 'place:known:valley-of-fire-state-park',
        displayName: 'Valley of Fire State Park',
        latitude: 36.4819,
        longitude: -114.5311,
      }),
    ]);
  });

  test('maps typed comparison targets into resolved evidence entities', () => {
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

  test('derives tripDays from constraint dates', () => {
    const rc = buildResolvedContext({ constraints: { dates: { start: '2026-09-01', end: '2026-09-07' } } });
    expect(rc.tripDays).toBe(7);
  });

  test('latestUserMessage and priorHistory split the conversation correctly', () => {
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'second' },
    ];
    expect(latestUserMessage(messages)).toBe('second');
    expect(priorHistory(messages)).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
    ]);
  });

  test('buildClassifierPriorTripState sets active-trip flags from destination memory', () => {
    // WP-TU Phase 2 Task 3 fix: primaryDestination/lockedPlanDestination now
    // source from storedTripContext (the genuine pre-turn value), not
    // activeTripContext (this turn's post-resolution value) — matching how
    // ai.js always populates both together in production (storedTripContext
    // = metadata.activeTripContext, captured before resolveActiveTripContext
    // runs and reassigns activeTripContext for the current turn).
    const priorDestination = { name: 'Zion National Park', parkCode: 'zion' };
    const prior = buildClassifierPriorTripState({
      activeTripContext: { primaryDestination: priorDestination },
      storedTripContext: { primaryDestination: priorDestination },
    });
    expect(prior.hasActiveTrip).toBe(true);
    expect(prior.hasItinerary).toBe(false);
    expect(prior.primaryDestination.parkCode).toBe('zion');
  });

  test('buildClassifierPriorTripState.primaryDestination reflects the PRE-turn value, not this turn\'s post-resolution activeTripContext', () => {
    // The precise regression this fix closes: activeTripContext already
    // reflects THIS turn's resolved destination (Badlands) by the time
    // prepareChatContext returns; storedTripContext is what was genuinely
    // active before this turn (Redwood) and must be what flows through.
    const prior = buildClassifierPriorTripState({
      activeTripContext: {
        primaryDestination: { name: 'Badlands', parkCode: 'badl' },
        resolutionSource: 'park_switch',
      },
      storedTripContext: {
        primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' },
      },
    });
    expect(prior.primaryDestination).toEqual({ name: 'Redwood National and State Parks', parkCode: 'redw' });
  });

  test('buildClassifierPriorTripState.primaryDestination is null on a genuine first-ever turn (no fallback to activeTripContext)', () => {
    const prior = buildClassifierPriorTripState({
      activeTripContext: { primaryDestination: { name: 'Acadia', parkCode: 'acad' } },
      // No storedTripContext at all — nothing was active before this turn.
    });
    expect(prior.primaryDestination).toBeNull();
  });

  test('buildClassifierPriorTripState treats lastTravelerJob as an active trip', () => {
    const prior = buildClassifierPriorTripState({
      planningState: {
        lastTravelerJob: 'origin_refinement',
        activeDecision: { kind: 'airport_strategy', destinationParkCode: 'yell' },
        destination: { parkCode: 'yell' },
      },
    });
    expect(prior.hasActiveTrip).toBe(true);
    expect(prior.lastTravelerJob).toBe('origin_refinement');
    expect(prior.activeDecision).toEqual({ kind: 'airport_strategy', destinationParkCode: 'yell' });
  });

  test('buildClassifierPriorTripState sets hasItinerary from saved or existing plan', () => {
    const prior = buildClassifierPriorTripState({
      savedTripPlan: { plan: { days: [{ day: 1, stops: [{ name: 'Pa’rus' }] }] } },
    });
    expect(prior.hasActiveTrip).toBe(true);
    expect(prior.hasItinerary).toBe(true);
  });

  test('buildClassifierPriorTripState carries bounded entry semantics into Prompt V2 state', () => {
    const entryContext = {
      version: 1,
      source: 'intent_guide',
      requestedDestinations: [],
      comparisonTargets: [],
      intentGuide: { path: '/parks-for-couples', searchQuery: 'romantic scenic parks' },
      travelerPreferences: { pace: 'relaxed' },
    };
    const prior = buildClassifierPriorTripState({ entryContext });
    expect(prior.entryContext).toEqual(entryContext);
  });

  // WP-TU Phase 1c (turn-understanding-implementation plan) — derive
  // lastConversationalSubject from the conversation history this function
  // already receives. No new parameter; conversation was already in scope
  // (used above solely to find lastAssistant.intent.travelerJob).
  describe('buildClassifierPriorTripState — lastConversationalSubject (Phase 1c)', () => {
    test('is null with no conversation history', () => {
      const prior = buildClassifierPriorTripState({
        activeTripContext: { primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' } },
        conversation: [],
      });
      expect(prior.lastConversationalSubject).toBeNull();
    });

    test('is null when no conversation key is supplied at all', () => {
      const prior = buildClassifierPriorTripState({
        activeTripContext: { primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' } },
      });
      expect(prior.lastConversationalSubject).toBeNull();
    });

    test('derives the most recently named destination from a user message in history', () => {
      const redwood = { name: 'Redwood National and State Parks', parkCode: 'redw' };
      const prior = buildClassifierPriorTripState({
        activeTripContext: { primaryDestination: redwood },
        storedTripContext: { primaryDestination: redwood },
        conversation: [
          { role: 'user', content: 'Is October good in Acadia?' },
          { role: 'assistant', content: 'October is a great time to visit Acadia...' },
        ],
      });
      expect(prior.lastConversationalSubject).toEqual({
        subjectDestinations: [{ name: 'Acadia', parkCode: 'acad' }],
        primaryDestination: { name: 'Acadia', parkCode: 'acad' },
        destinationRelationship: 'single',
      });
      // The active trip is independent and untouched by this derivation.
      expect(prior.primaryDestination).toEqual(redwood);
    });

    test('scans backward — the MOST RECENT named destination wins over an earlier one', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [
          { role: 'user', content: 'Is October good in Acadia?' },
          { role: 'assistant', content: '...' },
          { role: 'user', content: 'What about Zion instead?' },
          { role: 'assistant', content: '...' },
        ],
      });
      expect(prior.lastConversationalSubject).toEqual({
        subjectDestinations: [{ name: 'Zion', parkCode: 'zion' }],
        primaryDestination: { name: 'Zion', parkCode: 'zion' },
        destinationRelationship: 'single',
      });
    });

    test('a bare follow-up with no destination of its own falls back to the prior named turn', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [
          { role: 'user', content: 'Is October good in Acadia?' },
          { role: 'assistant', content: '...' },
          { role: 'user', content: 'What about November?' },
        ],
      });
      expect(prior.lastConversationalSubject).toEqual({
        subjectDestinations: [{ name: 'Acadia', parkCode: 'acad' }],
        primaryDestination: { name: 'Acadia', parkCode: 'acad' },
        destinationRelationship: 'single',
      });
    });

    // Required fix — multi-destination subjects must carry ALL destinations,
    // not just destinations[0].
    test('a comparison message preserves BOTH destinations, not just the first', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [{ role: 'user', content: 'Yosemite or Sequoia for October?' }],
      });
      expect(prior.lastConversationalSubject).toEqual({
        subjectDestinations: [
          { name: 'Yosemite', parkCode: 'yose' },
          { name: 'Sequoia', parkCode: 'sequ' },
        ],
        primaryDestination: { name: 'Yosemite', parkCode: 'yose' },
        // Real resolveDestinationRelationship() output for this phrasing —
        // reused, not reimplemented (verified via destinationRelationship.js).
        destinationRelationship: 'alternative_choice',
      });
    });

    test('a multi-park itinerary ask preserves BOTH destinations as a combine relationship', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [{ role: 'user', content: 'Plan Yellowstone and Grand Teton.' }],
      });
      expect(prior.lastConversationalSubject).toEqual({
        subjectDestinations: [
          { name: 'Yellowstone', parkCode: 'yell' },
          { name: 'Grand Teton', parkCode: 'grte' },
        ],
        primaryDestination: { name: 'Yellowstone', parkCode: 'yell' },
        destinationRelationship: 'combine',
      });
    });

    // Precedence 1 — structured assistant parkNames, relationship read from
    // the PAIRED USER TURN's text (never the assistant's own prose).
    test('an assistant parkNames echo wins over re-resolving the user text, but relationship still comes from the user turn', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [
          { role: 'user', content: 'Yosemite or Sequoia for October?' },
          {
            role: 'assistant',
            content: 'Both are wonderful in October — Yosemite tends to be less crowded...',
            parkNames: ['Yosemite National Park', 'Sequoia National Park'],
          },
        ],
      });
      expect(prior.lastConversationalSubject).toEqual({
        subjectDestinations: [
          { name: 'Yosemite National Park', parkCode: 'yose' },
          { name: 'Sequoia National Park', parkCode: 'sequ' },
        ],
        primaryDestination: { name: 'Yosemite National Park', parkCode: 'yose' },
        destinationRelationship: 'alternative_choice',
      });
    });

    // Precedence 3 — a single assistant parkName only when nothing richer
    // (no parkNames array, no resolvable user text) is available.
    test('falls back to a single assistant parkName only as a last resort', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [
          { role: 'user', content: 'Tell me more about it.' },
          { role: 'assistant', content: '...', parkName: 'Zion National Park', parkCode: 'zion' },
        ],
      });
      expect(prior.lastConversationalSubject).toEqual({
        subjectDestinations: [{ name: 'Zion National Park', parkCode: 'zion' }],
        primaryDestination: { name: 'Zion National Park', parkCode: 'zion' },
        destinationRelationship: 'single',
      });
    });

    // Precedence-order regression: a single assistant parkName must NEVER
    // shadow a richer multi-destination user message that prompted it. The
    // assistant here echoes only "Yosemite" (no parkNames array) even
    // though the user asked about both Yosemite AND Sequoia — the paired
    // user turn (precedence 2) must win over the assistant's parkName
    // (precedence 3).
    test('a single assistant parkName does not shadow the richer paired user turn that prompted it', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [
          { role: 'user', content: 'Yosemite or Sequoia for October?' },
          { role: 'assistant', content: 'Yosemite is a great pick for October...', parkName: 'Yosemite' },
        ],
      });
      expect(prior.lastConversationalSubject).toEqual({
        subjectDestinations: [
          { name: 'Yosemite', parkCode: 'yose' },
          { name: 'Sequoia', parkCode: 'sequ' },
        ],
        primaryDestination: { name: 'Yosemite', parkCode: 'yose' },
        destinationRelationship: 'alternative_choice',
      });
    });
  });

  // WP-TU Phase 4 Task 10 — priorTargetTripId, sibling scanner to
  // lastConversationalSubject immediately above (same backward scan over
  // recent messages, reused rather than inventing a different mechanism).
  describe('buildClassifierPriorTripState — priorTargetTripId (Task 10)', () => {
    test('is null with no conversation history', () => {
      const prior = buildClassifierPriorTripState({ conversation: [] });
      expect(prior.priorTargetTripId).toBeNull();
    });

    test('is null when no assistant message carries a targetTripId', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [
          { role: 'user', content: 'Make Day 2 easier' },
          { role: 'assistant', content: 'Done.' },
        ],
      });
      expect(prior.priorTargetTripId).toBeNull();
    });

    test('recovers the most recent targetTripId from an earlier assistant turn', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [
          { role: 'user', content: 'For my Redwood trip, change Day 2' },
          { role: 'assistant', content: 'Done.', targetTripId: 'trip-redw-1' },
        ],
      });
      expect(prior.priorTargetTripId).toBe('trip-redw-1');
    });

    test('scans backward — the MOST RECENT targetTripId wins over an earlier one', () => {
      const prior = buildClassifierPriorTripState({
        conversation: [
          { role: 'assistant', content: 'Earlier turn.', targetTripId: 'trip-redw-1' },
          { role: 'user', content: 'Actually plan Badlands instead' },
          { role: 'assistant', content: 'Switched.', targetTripId: 'trip-badl-1' },
        ],
      });
      expect(prior.priorTargetTripId).toBe('trip-badl-1');
    });
  });

  // WP-TU Phase 1c acceptance sequence — proves 1a/1b/1c compose correctly,
  // end to end at the unit level: relationship tracks the conversational
  // SUBJECT (Acadia), never the active TRIP (Redwood), which never changes.
  test('pinned two-turn sequence: conversational continuity is independent of the active trip', () => {
    const activeTripContext = {
      primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' },
    };

    // Turn 1 — no conversation history yet. storedTripContext (the genuine
    // pre-turn value) equals activeTripContext here because Redwood was
    // already active and this turn's own message ("Is October good in
    // Acadia?") does not touch it.
    const turn1PriorTripState = buildClassifierPriorTripState({
      activeTripContext,
      storedTripContext: activeTripContext,
      conversation: [],
    });
    expect(turn1PriorTripState.lastConversationalSubject).toBeNull();

    const turn1 = resolveTravelerJob({
      userPrompt: 'Is October good in Acadia?',
      priorTripState: turn1PriorTripState,
    });
    expect(turn1.understanding.primaryDestination).toEqual(
      expect.objectContaining({ parkCode: 'acad' })
    );
    expect(turn1.tripContext).toEqual({ relationship: 'new', activeContextAction: 'preserve' });

    // Turn 2 — conversation history now carries turn 1's exchange. Redwood is
    // still the pre-turn value (nothing switched it).
    const turn2PriorTripState = buildClassifierPriorTripState({
      activeTripContext,
      storedTripContext: activeTripContext,
      conversation: [
        { role: 'user', content: 'Is October good in Acadia?' },
        { role: 'assistant', content: 'October is lovely in Acadia...' },
      ],
    });
    expect(turn2PriorTripState.lastConversationalSubject).toEqual({
      subjectDestinations: [{ name: 'Acadia', parkCode: 'acad' }],
      primaryDestination: { name: 'Acadia', parkCode: 'acad' },
      destinationRelationship: 'single',
    });
    // The active trip is STILL Redwood — untouched by turn 1's side question.
    expect(turn2PriorTripState.primaryDestination).toEqual(activeTripContext.primaryDestination);

    const turn2 = resolveTravelerJob({
      userPrompt: 'What about November?',
      priorTripState: turn2PriorTripState,
    });
    // Continuation of ACADIA (the last conversational subject) — not of
    // Redwood (the active trip, which this turn never mentions).
    expect(turn2.tripContext).toEqual({ relationship: 'continuation', activeContextAction: 'preserve' });
  });

  // Required regression 1 — comparison continuation. A follow-up naming
  // NEITHER destination explicitly must still read as continuation of the
  // whole multi-destination comparison subject, not `new`.
  test('multi-destination sequence: comparison continuation ("Yosemite or Sequoia" -> "Which one has easier hiking?")', () => {
    const turn2PriorTripState = buildClassifierPriorTripState({
      conversation: [
        { role: 'user', content: 'Yosemite or Sequoia for October?' },
        { role: 'assistant', content: 'Both are great choices for October...' },
      ],
    });
    expect(turn2PriorTripState.lastConversationalSubject).toEqual({
      subjectDestinations: [
        { name: 'Yosemite', parkCode: 'yose' },
        { name: 'Sequoia', parkCode: 'sequ' },
      ],
      primaryDestination: { name: 'Yosemite', parkCode: 'yose' },
      destinationRelationship: 'alternative_choice',
    });

    const turn2 = resolveTravelerJob({
      userPrompt: 'Which one has easier hiking?',
      priorTripState: turn2PriorTripState,
    });
    expect(turn2.tripContext).toEqual({ relationship: 'continuation', activeContextAction: 'preserve' });
  });

  // Required regression — the exact precedence-order bug: the assistant
  // reply echoes only a single parkName ("Yosemite", no parkNames array),
  // even though the paired user turn asked about Yosemite AND Sequoia. The
  // richer paired user turn must still win, end to end through resolveTravelerJob.
  test('multi-destination sequence: a single-parkName assistant reply does not collapse a comparison subject', () => {
    const turn2PriorTripState = buildClassifierPriorTripState({
      conversation: [
        { role: 'user', content: 'Yosemite or Sequoia for October?' },
        { role: 'assistant', content: 'Yosemite is a great pick for October...', parkName: 'Yosemite' },
      ],
    });
    expect(turn2PriorTripState.lastConversationalSubject).toEqual({
      subjectDestinations: [
        { name: 'Yosemite', parkCode: 'yose' },
        { name: 'Sequoia', parkCode: 'sequ' },
      ],
      primaryDestination: { name: 'Yosemite', parkCode: 'yose' },
      destinationRelationship: 'alternative_choice',
    });

    const turn2 = resolveTravelerJob({
      userPrompt: 'Which one has easier hiking?',
      priorTripState: turn2PriorTripState,
    });
    expect(turn2.tripContext).toEqual({ relationship: 'continuation', activeContextAction: 'preserve' });
  });

  // Required regression 2 — multi-park itinerary continuation. Both
  // destinations from the original itinerary ask must be preserved as the
  // prior subject, and a follow-up about either (or neither) still continues.
  test('multi-destination sequence: multi-park itinerary continuation ("Plan Yellowstone and Grand Teton" -> "Which park should get the extra day?")', () => {
    const turn2PriorTripState = buildClassifierPriorTripState({
      conversation: [
        { role: 'user', content: 'Plan Yellowstone and Grand Teton.' },
        { role: 'assistant', content: 'Here is a combined itinerary...' },
      ],
    });
    expect(turn2PriorTripState.lastConversationalSubject).toEqual({
      subjectDestinations: [
        { name: 'Yellowstone', parkCode: 'yell' },
        { name: 'Grand Teton', parkCode: 'grte' },
      ],
      primaryDestination: { name: 'Yellowstone', parkCode: 'yell' },
      destinationRelationship: 'combine',
    });

    const turn2 = resolveTravelerJob({
      userPrompt: 'Which park should get the extra day?',
      priorTripState: turn2PriorTripState,
    });
    expect(turn2.tripContext).toEqual({ relationship: 'continuation', activeContextAction: 'preserve' });
  });

  test('derives normalized refinement change codes before manifest construction', () => {
    expect(deriveRefinementManifestInput({
      activeTripContext: { preferences: { avoidExposure: true } },
      planningState: { preferences: { avoidExposure: true } },
    }, [{
      role: 'user',
      content: 'Make it more relaxed, avoid shuttle-heavy parts, and add one good sunset.',
    }])).toEqual({
      changes: [
        'sunset_added',
        'less_shuttle_reliance',
        'slower_pace',
        'safety_constraint_preserved',
      ],
    });
  });

  test('itinerary_ready binder emits Stage-14 revision-1 envelope', () => {
    const wire = [];
    const transport = createTrailieTransportAdapter({
      dialect: 'v2',
      mode: 'stream',
      emit: (p) => wire.push(p),
    });
    const responseIdentity = { responseId: 'resp-bridge-1', responseVersion: 3 };
    const binder = createV2StreamEventBinder({
      transport,
      responseIdentity,
      parkName: 'Zion National Park',
      parkCode: 'zion',
      provider: 'openai',
      model: 'gpt-5.6-terra',
      getDisplay: () => ({ parkName: 'Zion National Park' }),
    });
    const plan = {
      days: [{ day: 1, title: 'Canyon floor', stops: [{ name: 'Visitor Center', duration: 45 }] }],
    };
    binder.emitCanonicalEvent({
      type: 'itinerary_ready',
      payload: {
        itineraryHash: 'ignored-thin',
        canonicalPlan: plan,
        intent: { primaryIntent: 'simple_itinerary' },
        presentation: {
          schemaVersion: 1,
          presentationKind: 'itinerary',
          refinement: { isRefinement: false, changes: [] },
          primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
          supportingModules: [],
          prosePolicy: 'supplemental_only',
          ending: { caveat: null, beforeYouGo: 'Check conditions.', followups: [] },
        },
      },
    });
    const ready = wire.find((e) => e.type === 'itinerary_ready');
    expect(ready).toBeTruthy();
    expect(ready.response).toMatchObject({
      responseId: 'resp-bridge-1',
      responseVersion: 3,
      responseRevision: 1,
      lifecycleStatus: 'itinerary_ready',
      content: '',
    });
    expect(ready.canonicalPlan).toMatchObject({
      responseId: 'resp-bridge-1',
      responseVersion: 3,
      responseRevision: 1,
      parkName: 'Zion National Park',
    });
    expect(ready.canonicalPlan.days).toHaveLength(1);
    expect(ready.response.itineraryHash).toBeTruthy();
    expect(ready.response.intent.primaryIntent).toBe('simple_itinerary');
    expect(ready.response.presentation.presentationKind).toBe('itinerary');
    expect(ready.canonicalPlan.itineraryHash).toBe(ready.response.itineraryHash);
  });
});
