'use strict';

const {
  SHARE_SCOPE,
  normalizeShareScope,
  buildSharedTripPayload,
} = require('../sharedTripPayload');

const trip = () => ({
  title: 'Zion Trip',
  parkName: 'Zion',
  createdAt: '2026-01-01T00:00:00.000Z',
  formData: { homeCity: 'Austin', budget: 1200, startDate: '2026-05-01' },
  conversation: [
    { role: 'user', content: 'We live in Austin, budget is $1200, plan Zion.', userFeedback: null },
    { role: 'assistant', content: 'Here is your Zion plan.', provider: 'claude', reviewMeta: { x: 1 } },
    { role: 'user', content: 'Make day 2 easier.' },
    { role: 'assistant', content: 'Adjusted day 2.' },
  ],
  plan: {
    type: 'itinerary',
    days: [{ id: 'day-1', stops: [] }],
    reviewMeta: { reviewerRan: true },
    auditTrail: { provider: 'claude' },
    contentHash: 'abc',
  },
});

describe('normalizeShareScope', () => {
  test('defaults to plan_only for missing/invalid values', () => {
    expect(normalizeShareScope(undefined)).toBe(SHARE_SCOPE.PLAN_ONLY);
    expect(normalizeShareScope('nonsense')).toBe(SHARE_SCOPE.PLAN_ONLY);
  });
  test('accepts the three known scopes', () => {
    expect(normalizeShareScope('plan_only')).toBe(SHARE_SCOPE.PLAN_ONLY);
    expect(normalizeShareScope('plan_plus_explanation')).toBe(SHARE_SCOPE.PLAN_PLUS_EXPLANATION);
    expect(normalizeShareScope('full_conversation')).toBe(SHARE_SCOPE.FULL_CONVERSATION);
  });
});

describe('buildSharedTripPayload — plan_only (default)', () => {
  const out = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.PLAN_ONLY });

  test('never exposes any user chat messages', () => {
    expect(out.conversation).toEqual([]);
  });
  test('never exposes private formData', () => {
    expect(out.formData).toBeUndefined();
  });
  test('strips reviewer internals from the plan', () => {
    expect(out.plan.reviewMeta).toBeUndefined();
    expect(out.plan.auditTrail).toBeUndefined();
    expect(out.plan.days).toEqual([{ id: 'day-1', stops: [] }]);
  });
  test('includes public trip metadata', () => {
    expect(out.title).toBe('Zion Trip');
    expect(out.parkName).toBe('Zion');
    expect(out.scope).toBe(SHARE_SCOPE.PLAN_ONLY);
  });
});

describe('buildSharedTripPayload — plan_plus_explanation', () => {
  const out = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });

  test('includes assistant messages only, sanitized', () => {
    expect(out.conversation.map((m) => m.role)).toEqual(['assistant', 'assistant']);
    expect(out.conversation[0]).toEqual({
      role: 'assistant',
      content: 'Here is your Zion plan.',
    });
  });
  test('still excludes user messages and private formData', () => {
    expect(out.conversation.some((m) => m.role === 'user')).toBe(false);
    expect(out.formData).toBeUndefined();
  });
});

describe('buildSharedTripPayload — full_conversation (explicit opt-in)', () => {
  const out = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.FULL_CONVERSATION });

  test('includes the whole conversation but strips per-message internals', () => {
    expect(out.conversation).toHaveLength(4);
    expect(out.conversation[1].reviewMeta).toBeUndefined();
    expect(out.conversation[1].provider).toBeUndefined();
    expect(out.conversation[0]).toEqual({
      role: 'user',
      content: 'We live in Austin, budget is $1200, plan Zion.',
    });
  });
});
