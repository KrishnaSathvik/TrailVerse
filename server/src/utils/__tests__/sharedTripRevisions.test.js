const { SHARE_SCOPE, buildSharedTripPayload, deriveNotesStatus } = require('../sharedTripPayload');
const { hashPayload } = require('../canonicalResponse');
const { buildPlanDocument } = require('../trailiePipelineUtils');

const RID = 'resp-share';
const ITIN = {
  days: [{ id: 'd1', day: 1, title: 'Canyon floor', stops: [{ id: 'd1s1', name: 'Visitor Center' }] }],
};
const ITIN_HASH = hashPayload(ITIN);

function plan(over = {}) {
  return {
    ...buildPlanDocument({
      itineraryData: ITIN,
      parkName: 'Zion National Park',
      parkCode: 'zion',
      identity: { responseId: RID, responseVersion: 3, contentHash: hashPayload(''), itineraryHash: ITIN_HASH },
      feasibilityIssues: [],
      reviewMeta: { verdict: 'ok', reviewerNotes: 'internal' },
      auditTrail: { npsFacts: ['secret'] },
    }),
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: 'itinerary_ready',
    itineraryReadyAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

const userMsg = { role: 'user', content: 'Plan a day in Zion from Springdale, budget $400' };

const rev1Turn = {
  role: 'assistant', content: '', responseId: RID, responseVersion: 3,
  responseRevision: 1, lifecycleStatus: 'itinerary_ready', itineraryHash: ITIN_HASH,
  provider: 'claude', model: 'claude-model',
};

const rev2Turn = {
  ...rev1Turn,
  content: 'A relaxed day on the canyon floor.',
  responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready',
  contentHash: hashPayload('A relaxed day on the canyon floor.'),
};

const trip = (over = {}) => ({
  title: 'Zion Trip Plan',
  parkName: 'Zion National Park',
  createdAt: new Date('2026-08-01'),
  plan: over.plan || plan(),
  conversation: over.conversation || [userMsg, rev1Turn],
  formData: { homeCity: 'Las Vegas', budget: 400 },
});

const rev2Trip = () =>
  trip({
    plan: plan({ responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready' }),
    conversation: [userMsg, rev2Turn],
  });

describe('Stage 14.5 §5 — shared explicit revision 1', () => {
  test('returns the frozen itinerary and a coarse complete notes status for tool-first rev1', () => {
    const p = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });

    expect(p.plan.days).toHaveLength(1);
    // Settled itinerary-only revision 1 is complete — not a pending-notes state.
    expect(p.notesStatus).toBe('complete');
  });

  test('publishes NO empty assistant message', () => {
    const p = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });

    expect(p.conversation).toEqual([]);
    expect(p.conversation.some((m) => (m.content ?? '') === '')).toBe(false);
  });

  test('drops the empty turn under full_conversation but keeps the user message', () => {
    const p = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.FULL_CONVERSATION });

    expect(p.conversation.map((m) => m.role)).toEqual(['user']);
    expect(p.conversation.every((m) => m.content !== '')).toBe(true);
  });

  test('exposes no recovery action or capability of any kind', () => {
    const serialized = JSON.stringify(buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.FULL_CONVERSATION }));

    expect(serialized).not.toMatch(/recovery|Generate trip notes|leaseToken|awaiting_persistence/i);
  });
});

describe('Stage 14.5 §5 — shared explicit revision 2', () => {
  test('publishes terminal prose when the scope allows it', () => {
    const p = buildSharedTripPayload(rev2Trip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });

    expect(p.conversation).toEqual([{ role: 'assistant', content: 'A relaxed day on the canyon floor.' }]);
    expect(p.notesStatus).toBe('complete');
  });

  test('plan_only excludes prose even when revision 2 exists', () => {
    const p = buildSharedTripPayload(rev2Trip(), { scope: SHARE_SCOPE.PLAN_ONLY });

    expect(p.conversation).toEqual([]);
    expect(p.plan.days).toHaveLength(1);
    // notesStatus reports availability but must not override the privacy scope.
    expect(p.notesStatus).toBe('complete');
    expect(JSON.stringify(p)).not.toContain('A relaxed day on the canyon floor.');
  });

  test('plan_only still excludes prose for revision 1', () => {
    const p = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.PLAN_ONLY });
    expect(p.conversation).toEqual([]);
    expect(p.plan.days).toHaveLength(1);
  });

  test('a revision-2 itinerary-hash mismatch publishes no prose', () => {
    const t = rev2Trip();
    t.conversation[1] = { ...t.conversation[1], itineraryHash: 'moved' };
    const p = buildSharedTripPayload(t, { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });

    expect(p.conversation).toEqual([]);
    expect(p.notesStatus).toBe('not_available');
  });
});

describe('Stage 14.5 §5 — internal fields never leave the server', () => {
  const FORBIDDEN = [
    'responseRevision', 'previousRevision', 'expectedPreviousRevision',
    'lifecycleStatus', 'itineraryReadyAt', 'proseReadyAt',
    'reviewMeta', 'auditTrail', 'promptHash',
    'contentHash', 'itineraryHash', 'responseId', 'responseVersion',
    'leaseToken', 'expectedContentHash', 'generationCompletedAt',
    'provider', 'model',
  ];

  test.each([
    ['plan_only', SHARE_SCOPE.PLAN_ONLY],
    ['plan_plus_explanation', SHARE_SCOPE.PLAN_PLUS_EXPLANATION],
    ['full_conversation', SHARE_SCOPE.FULL_CONVERSATION],
  ])('%s strips every forbidden field, for both revisions', (_label, scope) => {
    for (const t of [trip(), rev2Trip()]) {
      const serialized = JSON.stringify(buildSharedTripPayload(t, { scope }));
      for (const field of FORBIDDEN) {
        expect(serialized).not.toContain(`"${field}"`);
      }
    }
  });

  test('no verifier, provider, or reviewer internals appear', () => {
    const serialized = JSON.stringify(
      buildSharedTripPayload(rev2Trip(), { scope: SHARE_SCOPE.FULL_CONVERSATION })
    );
    expect(serialized).not.toContain('reviewerNotes');
    expect(serialized).not.toContain('internal');
    expect(serialized).not.toContain('claude-model');
    expect(serialized).not.toMatch(/TRAILIE_|\[ITINERARY_JSON\]|input_schema/);
  });

  test('notesStatus is the bounded coarse enum only', () => {
    for (const t of [trip(), rev2Trip()]) {
      const p = buildSharedTripPayload(t, { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });
      expect(['complete', 'not_available']).toContain(p.notesStatus);
    }
  });
});

describe('Stage 14.5 §6 — later prose completion under the same link', () => {
  test('the itinerary is byte-for-value unchanged when prose completes', () => {
    const before = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });
    const after = buildSharedTripPayload(rev2Trip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });

    expect(JSON.stringify(after.plan)).toBe(JSON.stringify(before.plan));
  });

  test('a fresh fetch surfaces the newly completed prose and status', () => {
    const before = buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });
    const after = buildSharedTripPayload(rev2Trip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });

    expect(before.notesStatus).toBe('complete');
    expect(before.conversation).toHaveLength(0);
    expect(after.notesStatus).toBe('complete');
    expect(after.conversation).toHaveLength(1);
  });

  test('completion never produces a duplicate assistant message', () => {
    const after = buildSharedTripPayload(rev2Trip(), { scope: SHARE_SCOPE.FULL_CONVERSATION });
    expect(after.conversation.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  test('no parallel share record is introduced — the payload shape is unchanged', () => {
    const keys = Object.keys(buildSharedTripPayload(trip(), { scope: SHARE_SCOPE.PLAN_ONLY })).sort();
    expect(keys).toEqual(
      ['conversation', 'createdAt', 'notesStatus', 'parkName', 'plan', 'scope', 'sharedBy', 'title'].sort()
    );
  });
});

describe('Stage 14.5 — legacy shares are unchanged', () => {
  const legacyTrip = () =>
    trip({
      plan: (() => {
        const p = plan();
        delete p.responseRevision;
        delete p.previousRevision;
        delete p.lifecycleStatus;
        return p;
      })(),
      conversation: [userMsg, { role: 'assistant', content: 'Legacy answer.' }],
    });

  test('a legacy terminal response still publishes its prose', () => {
    const p = buildSharedTripPayload(legacyTrip(), { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION });
    expect(p.conversation).toEqual([{ role: 'assistant', content: 'Legacy answer.' }]);
    expect(p.notesStatus).toBe('complete');
  });

  test('a legacy response with empty content is not treated as revision 1', () => {
    const t = legacyTrip();
    t.conversation[1] = { role: 'assistant', content: '' };
    expect(deriveNotesStatus(t.conversation, t.plan)).toBe('complete');
  });
});
