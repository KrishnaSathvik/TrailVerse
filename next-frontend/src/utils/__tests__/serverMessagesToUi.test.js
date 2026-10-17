import { describe, expect, it } from 'vitest';
import { mapServerMessagesToUi } from '../serverMessagesToUi';
import { resolvePlanningParkName } from '@/lib/planAiHeaderMeta';

describe('mapServerMessagesToUi', () => {
  it('preserves travel logistics while restoring guest messages', () => {
    const travelLogistics = {
      schemaVersion: 'travel-logistics-v1',
      gettingThere: {
        status: 'complete',
        routes: [{ origin: 'Bozeman', destination: 'Yellowstone' }],
      },
    };

    const [restored] = mapServerMessagesToUi([{
      role: 'assistant',
      content: '',
      timestamp: '2026-08-11T12:00:00.000Z',
      travelLogistics,
    }]);

    expect(restored.travelLogistics).toBe(travelLogistics);
    expect(restored.content).toBe('');
    expect(restored.timestamp).toEqual(new Date('2026-08-11T12:00:00.000Z'));
  });

  it('preserves the canonical presentation fields required for restore parity', () => {
    const canonicalPlan = { parkName: 'Zion National Park', days: [{ dayNumber: 1, stops: [] }] };
    const intent = { primaryIntent: 'trip_refinement' };
    const presentation = {
      schemaVersion: 1,
      presentationKind: 'itinerary',
      refinement: { isRefinement: true, changes: ['slower_pace'], changedDayNumbers: [1] },
      primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
    };
    const responseArtifacts = { comparison: null };
    const [restored] = mapServerMessagesToUi([{
      role: 'assistant',
      content: 'A plan',
      canonicalPlan,
      itineraryHash: 'hash-1',
      responseId: 'response-1',
      responseVersion: 1,
      responseRevision: 2,
      intent,
      presentation,
      responseArtifacts,
      parkName: 'Zion National Park',
      parkNames: ['Zion National Park'],
      hasLiveData: true,
    }]);

    expect(restored).toMatchObject({
      itineraryPlan: canonicalPlan,
      canonicalPlan,
      itineraryHash: 'hash-1',
      responseId: 'response-1',
      responseVersion: 1,
      responseRevision: 2,
      intent,
      presentation,
      responseArtifacts,
      parkName: 'Zion National Park',
      parkNames: ['Zion National Park'],
      hasLiveData: true,
    });
  });

  /**
   * WP-TU Phase 3 Task 8B — activeTripPresentation must round-trip through
   * a cold restore (page reload) exactly like intent/presentation already do,
   * and the restored message must feed `resolvePlanningParkName` the same way
   * a live message does (Task 8) — proving persistence closes the gap Task 7B
   * left, rather than just re-testing Task 8's already-passing live logic.
   */
  it('preserves activeTripPresentation on restore', () => {
    const activeTripPresentation = {
      destination: { parkCode: 'badl', parkName: 'Badlands National Park' },
      activeContextAction: 'set',
    };
    const [restored] = mapServerMessagesToUi([{
      role: 'assistant',
      content: 'Badlands it is.',
      activeTripPresentation,
    }]);
    expect(restored.activeTripPresentation).toEqual(activeTripPresentation);
  });

  it('a restored activeTripPresentation resolves the header the same way a live one does', () => {
    const [restored] = mapServerMessagesToUi([{
      role: 'assistant',
      content: 'Badlands it is.',
      activeTripPresentation: {
        destination: { parkCode: 'badl', parkName: 'Badlands National Park' },
        activeContextAction: 'set',
      },
    }]);
    expect(resolvePlanningParkName({ parkName: 'Redwood National Park', messages: [restored] }))
      .toBe('Badlands National Park');
  });

  it('old record safety: a message saved before Task 8B (no activeTripPresentation) restores without error and still resolves via the legacy fallback', () => {
    const [restored] = mapServerMessagesToUi([{
      role: 'assistant',
      content: 'An older message.',
      parkName: 'Glacier National Park',
    }]);
    expect(restored.activeTripPresentation).toBeUndefined();
    expect(resolvePlanningParkName({ parkName: '', messages: [restored] }))
      .toBe('Glacier National Park');
  });

  it('preserves retryable failure outcome so reload can show Try again without treating it as completed history', () => {
    const [user, assistant] = mapServerMessagesToUi([
      {
        role: 'user',
        content: 'Compare Zion and Bryce for a first-timer who wants easier hiking.',
        timestamp: '2026-09-17T18:00:00.000Z',
        lifecycleStatus: 'failed',
      },
      {
        role: 'assistant',
        content: "I couldn't finish that one.",
        timestamp: '2026-09-17T18:00:01.000Z',
        lifecycleStatus: 'failed',
        outcomeClass: 'retryable_failure',
      },
    ]);
    expect(user.content).toMatch(/Compare Zion and Bryce/);
    expect(assistant.outcomeClass).toBe('retryable_failure');
    expect(assistant.canonicalPlan).toBeUndefined();
  });
});

it('preserves the guest conversation scope across a reload', () => {
  const [message] = mapServerMessagesToUi([{role:'user',content:'A named chat',conversationId:'named-chat'}]);
  expect(message.conversationId).toBe('named-chat');
});
