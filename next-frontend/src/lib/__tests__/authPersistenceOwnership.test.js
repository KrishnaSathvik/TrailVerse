/**
 * Stage 14.8H.1 §17 — regression coverage for the authenticated persistence repair.
 *
 * The defects these lock down, both from the paid Stage 14.8H run:
 *   1. the Trailie welcome copy was persisted as a second assistant turn and
 *      replayed on restore as conversation history
 *   2. the trip was labelled `General Planning / null` while the frozen plan it
 *      contained said `Zion National Park / zion`
 *
 * A third defect is covered here too: the acceptance adjudicator passed the run
 * anyway, because it only asked whether the response slot was unique.
 */

import { describe, it, expect } from 'vitest';

import {
  MESSAGE_KIND,
  PERSISTENCE_SCOPE,
  createUiWelcomeMessage,
  isDeclaredUiOnly,
  isLegacyLeadingUiWelcome,
  selectCanonicalConversation,
  describeConversationOwnership,
} from '../messageOwnership';
import {
  extractPlanDestination,
  resolveTripDestination,
  assertTripDestinationCoherence,
} from '../tripDestination';
import { adjudicateAuthenticatedTurn } from '../authenticatedTurnAcceptance';
import { sanitizeMessagesForPersistence } from '../../services/tripHistoryService';

const WELCOME_TEXT = "Hey Acceptance, I'm **Trailie**. Tell me a destination.";

const welcome = () => createUiWelcomeMessage({ id: 1, content: WELCOME_TEXT, timestamp: null });
const userTurn = () => ({ id: 2, role: 'user', content: 'Plan a relaxed 3-day trip to Zion' });
const assistantResponse = (overrides = {}) => ({
  id: 3,
  role: 'assistant',
  content: 'Three days in Zion, taken slowly.',
  responseId: 'resp-1',
  responseVersion: 1,
  responseRevision: 2,
  lifecycleStatus: 'prose_ready',
  itineraryHash: 'hash-1',
  ...overrides,
});

const zionPlan = {
  parkName: 'Zion National Park',
  parkCode: 'zion',
  itineraryHash: 'hash-1',
  days: [
    { dayNumber: 1, label: 'Day 1', stops: [{ name: 'Riverside Walk' }] },
    { dayNumber: 2, label: 'Day 2', stops: [{ name: 'Watchman Trail' }] },
    { dayNumber: 3, label: 'Day 3', stops: [{ name: "Pa'rus Trail" }] },
  ],
};

describe('UI welcome ownership', () => {
  it('marks the welcome as UI-only chrome', () => {
    const message = welcome();
    expect(message.messageKind).toBe(MESSAGE_KIND.UI_WELCOME);
    expect(message.persistenceScope).toBe(PERSISTENCE_SCOPE.UI_ONLY);
    expect(isDeclaredUiOnly(message)).toBe(true);
  });

  it('keeps the welcome visible in message state', () => {
    // The fix must not remove the greeting from the UI — only from persistence.
    const messages = [welcome(), userTurn(), assistantResponse()];
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe(WELCOME_TEXT);
  });

  it('excludes the welcome from the revision-1 persistence payload', () => {
    const rev1 = [welcome(), userTurn(), assistantResponse({ responseRevision: 1, lifecycleStatus: 'itinerary_ready', content: '' })];
    const persisted = sanitizeMessagesForPersistence(rev1);

    expect(persisted.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(persisted.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  it('excludes the welcome from the revision-2 persistence payload', () => {
    const rev2 = [welcome(), userTurn(), assistantResponse()];
    const persisted = sanitizeMessagesForPersistence(rev2);

    expect(persisted.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(persisted.some((m) => m.content === WELCOME_TEXT)).toBe(false);
  });

  it('retains the real assistant response', () => {
    const persisted = sanitizeMessagesForPersistence([welcome(), userTurn(), assistantResponse()]);
    expect(persisted.at(-1).responseId).toBe('resp-1');
    expect(persisted.at(-1).content).toBe('Three days in Zion, taken slowly.');
  });

  it('does not leak ownership metadata into the stored payload', () => {
    const persisted = sanitizeMessagesForPersistence([welcome(), userTurn(), assistantResponse()]);
    for (const message of persisted) {
      expect(message.persistenceScope).toBeUndefined();
      expect(message.includedInCanonicalConversation).toBeUndefined();
    }
  });

  it('still drops in-flight streaming placeholders', () => {
    const persisted = sanitizeMessagesForPersistence([
      userTurn(),
      { id: 9, role: 'assistant', content: 'partial…', isStreaming: true },
    ]);
    expect(persisted).toHaveLength(1);
  });
});

describe('legacy leading welcome recognition', () => {
  // Trips written before the marker existed, i.e. the Stage 14.8H shape.
  const legacyStored = [
    { id: 1, role: 'assistant', content: WELCOME_TEXT },
    userTurn(),
    assistantResponse(),
  ];

  it('recognises an unmarked leading assistant message with no response identity', () => {
    expect(isLegacyLeadingUiWelcome(legacyStored, 0)).toBe(true);
  });

  it('excludes it from restored canonical history without touching the record', () => {
    const canonical = selectCanonicalConversation(legacyStored, { includeLegacyRecognition: true });
    expect(canonical.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(legacyStored).toHaveLength(3);
  });

  it('never removes an assistant message that carries response identity', () => {
    const withIdentityFirst = [assistantResponse({ id: 0 }), userTurn(), assistantResponse()];
    expect(isLegacyLeadingUiWelcome(withIdentityFirst, 0)).toBe(false);
    expect(selectCanonicalConversation(withIdentityFirst, { includeLegacyRecognition: true })).toHaveLength(3);
  });

  it('never removes an assistant message that follows a user turn', () => {
    const normal = [userTurn(), { id: 5, role: 'assistant', content: 'a legacy answer with no identity' }];
    expect(isLegacyLeadingUiWelcome(normal, 1)).toBe(false);
    expect(selectCanonicalConversation(normal, { includeLegacyRecognition: true })).toHaveLength(2);
  });

  it('does not apply legacy recognition on the write path', () => {
    const legacyish = [{ id: 1, role: 'assistant', content: WELCOME_TEXT }, userTurn()];
    // Write-side stays strict: only declared chrome is dropped, so a heuristic
    // can never silently delete a real turn on its way to the database.
    expect(selectCanonicalConversation(legacyish)).toHaveLength(2);
  });

  it('summarises ownership for acceptance evidence', () => {
    expect(describeConversationOwnership(legacyStored)).toMatchObject({
      canonicalUserTurnCount: 1,
      canonicalAssistantTurnCount: 1,
      legacyRecognisedUiOnlyCount: 1,
    });
  });
});

describe('trip destination ownership', () => {
  it('leaves a new trip shell unresolved when no plan exists', () => {
    const destination = resolveTripDestination({ plan: null });
    expect(destination.destinationResolved).toBe(false);
    expect(destination.parkName).toBe('General Planning');
    expect(destination.parkCode).toBeNull();
    expect(destination.source).toBe('unresolved');
  });

  it('canonicalises the destination from a validated frozen plan', () => {
    const destination = resolveTripDestination({ plan: zionPlan });
    expect(destination).toMatchObject({
      parkName: 'Zion National Park',
      parkCode: 'zion',
      title: 'Zion National Park Trip Plan',
      source: 'validated_frozen_plan',
      destinationResolved: true,
    });
  });

  it('prefers the frozen plan over stale browsing context', () => {
    const destination = resolveTripDestination({
      plan: zionPlan,
      contextParkName: 'Grand Canyon National Park',
      contextParkCode: 'grca',
    });
    expect(destination.parkCode).toBe('zion');
  });

  it('normalises a park code to lower case', () => {
    expect(extractPlanDestination({ parkCode: 'ZION', parkName: 'Zion' }).parkCode).toBe('zion');
  });

  it('rejects the Stage 14.8H mixed state', () => {
    const coherence = assertTripDestinationCoherence({
      trip: { parkName: 'General Planning', parkCode: null },
      plan: zionPlan,
    });
    expect(coherence.tripDestinationMatchesFrozenPlan).toBe(false);
  });

  it('accepts an unresolved trip when the plan carries no destination', () => {
    const coherence = assertTripDestinationCoherence({
      trip: { parkName: 'General Planning', parkCode: null },
      plan: { days: [] },
    });
    expect(coherence.planCarriesDestination).toBe(false);
    expect(coherence.tripDestinationMatchesFrozenPlan).toBe(true);
  });
});

describe('authenticated turn adjudicator', () => {
  const goodTrip = { parkName: 'Zion National Park', parkCode: 'zion', plan: zionPlan };

  it('passes a clean turn', () => {
    const verdict = adjudicateAuthenticatedTurn({
      storedConversation: [userTurn(), assistantResponse()],
      storedTrip: goodTrip,
      acceptedRevisionWrites: 2,
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toEqual([]);
  });

  it('FAILS the exact Stage 14.8H shape — one user, two persisted assistants', () => {
    const verdict = adjudicateAuthenticatedTurn({
      storedConversation: [
        { id: 1, role: 'assistant', content: WELCOME_TEXT },
        userTurn(),
        assistantResponse(),
      ],
      storedTrip: goodTrip,
      acceptedRevisionWrites: 2,
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('uiChromeExcludedFromPersistence');
    expect(verdict.observed.storedAssistantTurns).toBe(2);
    // The response slot IS unique — which is precisely why the old checks passed.
    expect(verdict.checks.singleResponseSlot).toBe(true);
  });

  it('FAILS a trip whose metadata disagrees with its frozen plan', () => {
    const verdict = adjudicateAuthenticatedTurn({
      storedConversation: [userTurn(), assistantResponse()],
      storedTrip: { parkName: 'General Planning', parkCode: null, plan: zionPlan },
      acceptedRevisionWrites: 2,
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('tripDestinationMatchesFrozenPlan');
  });

  it('FAILS when done produced a third write', () => {
    const verdict = adjudicateAuthenticatedTurn({
      storedConversation: [userTurn(), assistantResponse()],
      storedTrip: goodTrip,
      acceptedRevisionWrites: 3,
      doneWrites: 1,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toEqual(
      expect.arrayContaining(['doneWroteNothing', 'exactlyTwoAcceptedRevisionWrites'])
    );
  });

  it('FAILS a duplicated response slot', () => {
    const verdict = adjudicateAuthenticatedTurn({
      storedConversation: [userTurn(), assistantResponse(), assistantResponse({ id: 4 })],
      storedTrip: goodTrip,
      acceptedRevisionWrites: 2,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('singleResponseSlot');
  });
});

describe('day ordering contract', () => {
  // Stage 14.8H reported `day: null`. The schema has no `day` field at all —
  // that was a projection error in the acceptance harness, not stored data.
  it('stores dayNumber and label, not day and title', () => {
    for (const day of zionPlan.days) {
      expect(day.dayNumber).toEqual(expect.any(Number));
      expect(day.label).toEqual(expect.any(String));
      expect(day.day).toBeUndefined();
      expect(day.title).toBeUndefined();
    }
  });

  it('keeps dayNumber consistent with array position', () => {
    zionPlan.days.forEach((day, index) => {
      expect(day.dayNumber).toBe(index + 1);
    });
  });
});
