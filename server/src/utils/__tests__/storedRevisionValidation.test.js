const {
  RECOVERY_DECISION,
  evaluateStoredRevisionForRecovery,
  extractStoredItineraryData,
} = require('../storedRevisionValidation');
const { hashPayload } = require('../canonicalResponse');
const { buildPlanDocument } = require('../trailiePipelineUtils');

const RID = 'resp-1';
const ITIN = {
  days: [
    { day: 1, title: 'Arrive', stops: [{ name: 'Visitor Center' }] },
    { day: 2, title: 'Hike', stops: [{ name: 'Angels Landing' }] },
  ],
};
const ITIN_HASH = hashPayload(ITIN);

function storedPlan(over = {}) {
  const plan = buildPlanDocument({
    itineraryData: ITIN,
    parkName: 'Zion National Park',
    parkCode: 'zion',
    identity: { responseId: RID, responseVersion: 3, contentHash: hashPayload(''), itineraryHash: ITIN_HASH },
    feasibilityIssues: [],
  });
  return {
    ...plan,
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: 'itinerary_ready',
    ...over,
  };
}

function trip(over = {}) {
  return {
    plan: storedPlan(over.plan),
    conversation: over.conversation || [
      { role: 'user', content: 'Plan 2 days in Zion' },
      {
        role: 'assistant',
        content: '',
        responseId: RID,
        responseVersion: 3,
        responseRevision: 1,
        lifecycleStatus: 'itinerary_ready',
        itineraryHash: ITIN_HASH,
      },
    ],
  };
}

describe('Stage 14.4 §3 — stored revision validation', () => {
  test('accepts a well-formed stored revision 1', () => {
    const res = evaluateStoredRevisionForRecovery({ trip: trip(), responseId: RID });

    expect(res.decision).toBe(RECOVERY_DECISION.RECOVERABLE);
    expect(res.context.responseVersion).toBe(3);
    expect(res.context.itineraryHash).toBe(ITIN_HASH);
    expect(res.context.itineraryData.days).toHaveLength(2);
    expect(res.context.parkName).toBe('Zion National Park');
  });

  test('the reconstructed itinerary payload rehashes to the stored hash', () => {
    const res = evaluateStoredRevisionForRecovery({ trip: trip(), responseId: RID });
    expect(hashPayload(res.context.itineraryData)).toBe(ITIN_HASH);
  });

  test('reports an already-complete revision 2 without refusing', () => {
    const res = evaluateStoredRevisionForRecovery({
      trip: trip({
        plan: { responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready' },
        conversation: [
          { role: 'user', content: 'x' },
          {
            role: 'assistant', content: 'Full notes.', responseId: RID, responseVersion: 3,
            responseRevision: 2, lifecycleStatus: 'prose_ready', itineraryHash: ITIN_HASH,
          },
        ],
      }),
      responseId: RID,
    });

    expect(res.decision).toBe(RECOVERY_DECISION.ALREADY_COMPLETE);
  });

  test('treats a legacy plan with no revision field as already complete', () => {
    const res = evaluateStoredRevisionForRecovery({
      trip: trip({
        plan: { responseRevision: undefined, lifecycleStatus: undefined },
        conversation: [
          { role: 'user', content: 'x' },
          { role: 'assistant', content: 'Legacy answer.', responseId: RID, itineraryHash: ITIN_HASH },
        ],
      }),
      responseId: RID,
    });

    expect(res.decision).toBe(RECOVERY_DECISION.ALREADY_COMPLETE);
  });

  test.each([
    ['a missing trip', { trip: null, responseId: RID }, 'not_found'],
    ['a missing responseId', { trip: trip(), responseId: null }, 'not_found'],
  ])('refuses %s', (_label, args, code) => {
    expect(evaluateStoredRevisionForRecovery(args)).toEqual({
      decision: RECOVERY_DECISION.REFUSED,
      code,
    });
  });

  test('refuses when the plan belongs to a different response', () => {
    const res = evaluateStoredRevisionForRecovery({ trip: trip(), responseId: 'someone-elses-response' });
    expect(res).toEqual({ decision: RECOVERY_DECISION.REFUSED, code: 'not_found' });
  });

  test('refuses when no assistant turn carries the responseId', () => {
    const res = evaluateStoredRevisionForRecovery({
      trip: trip({ conversation: [{ role: 'user', content: 'x' }] }),
      responseId: RID,
    });
    expect(res.code).toBe('not_found');
  });

  test('refuses when two assistant turns share the responseId', () => {
    const t = trip();
    const res = evaluateStoredRevisionForRecovery({
      trip: { ...t, conversation: [...t.conversation, { ...t.conversation[1] }] },
      responseId: RID,
    });
    expect(res.code).toBe('not_found');
  });

  test('refuses when the plan and assistant itinerary hashes disagree', () => {
    const t = trip();
    t.conversation[1].itineraryHash = 'a-different-hash';
    expect(evaluateStoredRevisionForRecovery({ trip: t, responseId: RID }).code).toBe('identity_mismatch');
  });

  test('refuses a revision 1 whose assistant content is not empty', () => {
    const t = trip();
    t.conversation[1].content = 'unexpectedly present';
    expect(evaluateStoredRevisionForRecovery({ trip: t, responseId: RID }).code).toBe(
      'revision_1_content_not_empty'
    );
  });

  test('refuses an unsupported lifecycle status', () => {
    const res = evaluateStoredRevisionForRecovery({
      trip: trip({ plan: { lifecycleStatus: 'prose_failed' } }),
      responseId: RID,
    });
    expect(res.code).toBe('unsupported_lifecycle_status');
  });

  test('refuses an unsupported revision number', () => {
    const res = evaluateStoredRevisionForRecovery({
      trip: trip({ plan: { responseRevision: 3 } }),
      responseId: RID,
    });
    expect(res.code).toBe('unsupported_revision');
  });

  test('refuses a plan with no itinerary days', () => {
    const res = evaluateStoredRevisionForRecovery({
      trip: trip({ plan: { days: [] } }),
      responseId: RID,
    });
    expect(res.code).toBe('missing_itinerary_data');
  });

  test('refuses when the stored itinerary no longer hashes to the stored hash', () => {
    const t = trip();
    // Simulate the row being edited underneath us.
    t.plan.days = [...t.plan.days, { day: 3, title: 'Injected', stops: [] }];
    expect(evaluateStoredRevisionForRecovery({ trip: t, responseId: RID }).code).toBe(
      'stored_itinerary_hash_mismatch'
    );
  });

  test('refuses when the stored itinerary hash is absent', () => {
    const t = trip();
    t.plan.itineraryHash = null;
    t.conversation[1].itineraryHash = null;
    expect(evaluateStoredRevisionForRecovery({ trip: t, responseId: RID }).code).toBe(
      'missing_itinerary_hash'
    );
  });

  test('never repairs a malformed stored revision — no context is returned', () => {
    const t = trip();
    t.conversation[1].content = 'oops';
    const res = evaluateStoredRevisionForRecovery({ trip: t, responseId: RID });
    expect(res.context).toBeUndefined();
  });

  test('extractStoredItineraryData drops plan bookkeeping fields', () => {
    const data = extractStoredItineraryData(storedPlan());
    for (const k of [
      'type', 'version', 'generatedAt', 'createdFrom', 'parkName', 'parkCode',
      'responseId', 'responseVersion', 'contentHash', 'itineraryHash',
      'responseRevision', 'previousRevision', 'lifecycleStatus', 'feasibilityIssues',
    ]) {
      expect(k in data).toBe(false);
    }
    expect(data.days).toHaveLength(2);
  });

  test('works on a mongoose-style document exposing toObject', () => {
    const raw = storedPlan();
    const doc = { ...raw, toObject: () => raw };
    expect(hashPayload(extractStoredItineraryData(doc))).toBe(ITIN_HASH);
  });
});
