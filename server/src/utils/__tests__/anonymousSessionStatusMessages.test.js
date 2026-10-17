'use strict';

const { mapAnonymousSessionMessagesForStatus } = require('../anonymousSessionStatusMessages');

const travelLogistics = {
  schemaVersion: 'travel-logistics-v1',
  gettingThere: {
    status: 'complete',
    routes: [{ origin: 'Bozeman', destination: 'Yellowstone' }],
  },
  stays: {
    status: 'partial',
    regions: [{ name: 'West Yellowstone' }],
  },
};

describe('mapAnonymousSessionMessagesForStatus', () => {
  it('includes travelLogistics on assistant messages', () => {
    const mapped = mapAnonymousSessionMessagesForStatus([
      { role: 'user', content: 'Where should I stay near Yellowstone?' },
      {
        role: 'assistant',
        content: 'Stay near the west entrance.',
        provider: 'synthetic',
        model: 'synthetic-1',
        travelLogistics,
      },
      { role: 'system', content: 'ignored' },
    ]);

    expect(mapped).toHaveLength(2);
    expect(mapped[1]).toMatchObject({
      role: 'assistant',
      content: 'Stay near the west entrance.',
      provider: 'synthetic',
      model: 'synthetic-1',
    });
    expect(mapped[1].travelLogistics).toEqual(travelLogistics);
  });

  it('omits travelLogistics when absent', () => {
    const mapped = mapAnonymousSessionMessagesForStatus([
      { role: 'assistant', content: 'Try the rim trail.', provider: null, model: null },
    ]);

    expect(mapped[0].travelLogistics).toBeUndefined();
  });

  // WP-TU Phase 3 Task 8B — activeTripPresentation must survive the same
  // allowlist that already forwards intent/presentation, so a guest's cold
  // reload (session-status refresh) restores the authoritative header
  // destination instead of regressing to legacy conversational-subject fields.
  it('includes activeTripPresentation on assistant messages when present', () => {
    const activeTripPresentation = {
      destination: { parkCode: 'badl', parkName: 'Badlands National Park' },
      activeContextAction: 'set',
    };
    const mapped = mapAnonymousSessionMessagesForStatus([
      { role: 'assistant', content: 'Badlands it is.', activeTripPresentation },
    ]);
    expect(mapped[0].activeTripPresentation).toEqual(activeTripPresentation);
  });

  it('omits activeTripPresentation when absent (old records saved before Task 8B)', () => {
    const mapped = mapAnonymousSessionMessagesForStatus([
      { role: 'assistant', content: 'An older, pre-8B message.' },
    ]);
    expect(mapped[0].activeTripPresentation).toBeUndefined();
  });

  it('returns the canonical itinerary identity needed to restore the same response UI', () => {
    const canonicalPlan = {
      parkName: 'Zion National Park',
      days: [{ dayNumber: 1, stops: [{ name: 'Pa’rus Trail' }] }],
    };
    const mapped = mapAnonymousSessionMessagesForStatus([{
      role: 'assistant',
      content: 'Here is your plan.',
      canonicalPlan,
      itineraryHash: 'hash-1',
      responseId: 'response-1',
      presentationKind: 'itinerary',
      intent: { primaryIntent: 'simple_itinerary', verticals: ['itinerary'] },
      presentation: {
        schemaVersion: 1,
        presentationKind: 'itinerary',
        refinement: { isRefinement: false, changes: [] },
        primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
        supportingModules: [],
        prosePolicy: 'supplemental_only',
        ending: { caveat: null, beforeYouGo: null, followups: [] },
      },
    }]);

    expect(mapped[0]).toMatchObject({
      canonicalPlan,
      itineraryPlan: canonicalPlan,
      itineraryHash: 'hash-1',
      responseId: 'response-1',
      presentationKind: 'itinerary',
      hasItinerary: true,
    });
    expect(mapped[0].intent.primaryIntent).toBe('simple_itinerary');
    expect(mapped[0].presentation.primaryArtifact.source).toBe('canonicalPlan');
  });
});

describe('mapGuestMessageToTripConversation', () => {
  const { mapGuestMessageToTripConversation } = require('../anonymousSessionStatusMessages');

  it('keeps per-message plan, logistics, intent, and presentation on migrate', () => {
    const canonicalPlan = { days: [{ dayNumber: 1, stops: [{ name: 'Old Faithful' }] }] };
    const mapped = mapGuestMessageToTripConversation({
      role: 'assistant',
      content: 'Here is the shape.',
      canonicalPlan,
      travelLogistics: { schemaVersion: 1 },
      intent: { travelerJob: 'airport_strategy', primaryIntent: 'flight_strategy' },
      presentation: { presentationKind: 'plain_answer' },
      itineraryHash: 'hash-1',
      responseId: 'response-1',
    });
    expect(mapped.canonicalPlan).toEqual(canonicalPlan);
    expect(mapped.itineraryPlan).toEqual(canonicalPlan);
    expect(mapped.travelLogistics).toEqual({ schemaVersion: 1 });
    expect(mapped.intent.travelerJob).toBe('airport_strategy');
    expect(mapped.presentation.presentationKind).toBe('plain_answer');
    expect(mapped.responseId).toBe('response-1');
    expect(mapped.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mapped.responseRevision).toBe(2);
    expect(mapped.lifecycleStatus).toBe('prose_ready');
  });
});

describe('11A.3 projectGuestConversationForStatus', () => {
  const {
    projectGuestConversationForStatus,
    RETRYABLE_FAILURE_PUBLIC_MESSAGE,
  } = require('../anonymousSessionStatusMessages');

  test('restores a retryable failed turn as transcript without canonical plan state', () => {
    const projected = projectGuestConversationForStatus({
      messages: [],
      turns: [{
        status: 'failed',
        failureCode: 'provider_http_failure',
        admittedAt: '2026-09-17T18:00:00.000Z',
        failedAt: '2026-09-17T18:00:01.000Z',
        userMessage: {
          role: 'user',
          content: 'Compare Zion and Bryce for a first-timer who wants easier hiking.',
          timestamp: '2026-09-17T18:00:00.000Z',
        },
      }],
    });

    expect(projected).toHaveLength(2);
    expect(projected[0]).toMatchObject({
      role: 'user',
      content: 'Compare Zion and Bryce for a first-timer who wants easier hiking.',
      lifecycleStatus: 'failed',
    });
    expect(projected[1]).toMatchObject({
      role: 'assistant',
      content: RETRYABLE_FAILURE_PUBLIC_MESSAGE,
      outcomeClass: 'retryable_failure',
      lifecycleStatus: 'failed',
    });
    expect(projected[1].canonicalPlan).toBeUndefined();
    expect(projected[1].hasItinerary).toBeUndefined();
  });

  test('does not restore cancelled or unknown-outcome failures', () => {
    const projected = projectGuestConversationForStatus({
      messages: [
        { role: 'user', content: 'earlier success question' },
        { role: 'assistant', content: 'earlier success answer' },
      ],
      turns: [
        {
          status: 'failed',
          failureCode: 'client_disconnected',
          userMessage: { role: 'user', content: 'Compare Zion and Bryce' },
        },
        {
          status: 'failed',
          failureCode: 'stream_aborted',
          userMessage: { role: 'user', content: 'Plan Yosemite' },
        },
        {
          status: 'failed',
          failureCode: 'turn_abandoned',
          userMessage: { role: 'user', content: 'stale pending' },
        },
      ],
    });

    expect(projected).toHaveLength(2);
    expect(projected.map((m) => m.content)).toEqual([
      'earlier success question',
      'earlier success answer',
    ]);
  });

  test('completed messages keep canonical plans; failed turns never inherit them', () => {
    const canonicalPlan = { parkName: 'Zion National Park', days: [{ dayNumber: 1, stops: [] }] };
    const projected = projectGuestConversationForStatus({
      messages: [{
        role: 'assistant',
        content: 'Here is your plan.',
        canonicalPlan,
        timestamp: '2026-09-17T17:00:00.000Z',
      }],
      turns: [{
        status: 'failed',
        failureCode: 'backend_exception',
        admittedAt: '2026-09-17T18:00:00.000Z',
        failedAt: '2026-09-17T18:00:01.000Z',
        userMessage: { role: 'user', content: 'Make day 2 easier', timestamp: '2026-09-17T18:00:00.000Z' },
      }],
    });
    expect(projected[0].canonicalPlan).toEqual(canonicalPlan);
    expect(projected[2].canonicalPlan).toBeUndefined();
    expect(projected[2].outcomeClass).toBe('retryable_failure');
  });
});
