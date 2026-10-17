'use strict';

/**
 * AUTHENTICATED-UNSAVED PLAN CONTINUITY (2026-09-02).
 *
 * Live repro (artifacts/trailie-refinement-containment-2026-09-02/
 * auth-unsaved-verdict.json): a signed-in traveler with no saved TripPlan
 * generated an accepted 3-day Olympic plan, said "Make day 2 more relaxed.",
 * and got `simple_itinerary` + a full rewrite of all three days — the same
 * plan-continuity failure fixed for guests, on its remaining branch.
 *
 * INVARIANT: an accepted canonical plan Trailie produced in this conversation
 * must be available to the next turn regardless of guest/auth status or
 * whether the traveler pressed Save. Conversational state != durable TripPlan.
 *
 * TRUST MODEL: the plan is stored server-side at acceptance, keyed by user.
 * The client never supplies plan content — its echoed transcript is only the
 * CONTINUITY SIGNAL: recall requires an assistant message in the incoming
 * history whose text matches the server-authored prose stored with the plan.
 * A genuinely new chat has no assistant history → nothing lifts. A different
 * conversation echoes different prose → nothing lifts. A forged assistant
 * message can at most re-surface the same user's own stored plan.
 */

const {
  buildConversationPlanRecord,
  matchConversationPlan,
} = require('../conversationPlanContinuity');

const PLAN = Object.freeze({
  days: [
    { dayNumber: 1, stops: [{ name: 'Hurricane Ridge sunrise' }] },
    { dayNumber: 2, stops: [{ name: 'Hoh Rain Forest Visitor Center' }] },
    { dayNumber: 3, stops: [{ name: 'Kalaloch sunset' }] },
  ],
});
const PROSE = 'Here is a relaxed 3-day Olympic plan built around easy walks, '
  + 'with sunrise at Hurricane Ridge and a Kalaloch sunset to close the trip.';

const record = () => buildConversationPlanRecord({
  userId: 'user-1',
  responseId: 'resp-1',
  content: PROSE,
  canonicalPlan: PLAN,
});

describe('buildConversationPlanRecord', () => {
  test('stores the server-authored plan with a normalized content key', () => {
    const built = record();
    expect(built.userId).toBe('user-1');
    expect(built.responseId).toBe('resp-1');
    expect(built.canonicalPlan).toBe(PLAN);
    expect(built.contentKey.length).toBeGreaterThan(40);
    expect(built.contentKey).toBe(built.contentKey.toLowerCase());
  });

  test('refuses a record it could never safely recall', () => {
    expect(buildConversationPlanRecord({
      userId: 'user-1', responseId: 'r', content: '', canonicalPlan: PLAN,
    })).toBeNull();
    expect(buildConversationPlanRecord({
      userId: 'user-1', responseId: 'r', content: 'too short', canonicalPlan: PLAN,
    })).toBeNull();
    expect(buildConversationPlanRecord({
      userId: 'user-1', responseId: 'r', content: PROSE, canonicalPlan: { days: [] },
    })).toBeNull();
  });
});

describe('matchConversationPlan — continuation signal', () => {
  test('a continuation echoing the assistant prose recalls the plan', () => {
    const plan = matchConversationPlan(record(), [
      { role: 'user', content: 'Plan 3 days in Olympic, easy walks.' },
      { role: 'assistant', content: PROSE },
      { role: 'user', content: 'Make day 2 more relaxed.' },
    ]);
    expect(plan).toBe(PLAN);
  });

  test('client-appended photo context does not break the match', () => {
    const plan = matchConversationPlan(record(), [
      { role: 'assistant', content: `${PROSE}\n\n(Photos shown to user: [Photo 1: Hurricane Ridge])` },
      { role: 'user', content: 'Make day 2 more relaxed.' },
    ]);
    expect(plan).toBe(PLAN);
  });

  test('a client-truncated echo of the same prose still matches', () => {
    const plan = matchConversationPlan(record(), [
      { role: 'assistant', content: PROSE.slice(0, 80) },
      { role: 'user', content: 'Make day 2 more relaxed.' },
    ]);
    expect(plan).toBe(PLAN);
  });

  test('a genuinely new chat (no assistant history) recalls nothing', () => {
    const plan = matchConversationPlan(record(), [
      { role: 'user', content: 'Plan me 3 relaxed days in Badlands.' },
    ]);
    expect(plan).toBeNull();
  });

  test('a different conversation recalls nothing', () => {
    const plan = matchConversationPlan(record(), [
      { role: 'assistant', content: 'Zion in winter rewards early starts; here is what I would do instead for your question about crowds and parking during the holiday season.' },
      { role: 'user', content: 'Make day 2 more relaxed.' },
    ]);
    expect(plan).toBeNull();
  });

  test('user-authored messages can never satisfy the match', () => {
    const plan = matchConversationPlan(record(), [
      { role: 'user', content: PROSE },
      { role: 'user', content: 'Make day 2 more relaxed.' },
    ]);
    expect(plan).toBeNull();
  });

  test('a short echoed fragment is not enough to claim continuity', () => {
    const plan = matchConversationPlan(record(), [
      { role: 'assistant', content: 'Here is a' },
      { role: 'user', content: 'Make day 2 more relaxed.' },
    ]);
    expect(plan).toBeNull();
  });

  test('null record or missing messages recall nothing', () => {
    expect(matchConversationPlan(null, [{ role: 'assistant', content: PROSE }])).toBeNull();
    expect(matchConversationPlan(record(), null)).toBeNull();
  });
});
