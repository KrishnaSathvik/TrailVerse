import { buildResponseSavePayload } from '../responseSavePayload';

describe('buildResponseSavePayload', () => {
  it('persists canonical entry context with the response unit', () => {
    const entryContext = { version: 1, source: 'intent_guide', intentGuide: { path: '/parks-for-couples' } };
    expect(buildResponseSavePayload({ conversation: [], summary: {}, plan: null, entryContext }).entryContext).toEqual(entryContext);
  });
  const base = {
    conversation: [{ role: 'assistant', content: 'x', responseVersion: 2 }],
    summary: { hasPlan: true },
    plan: { responseId: 'r', responseVersion: 2 },
  };

  test('carries only response-coupled fields + expectedPreviousVersion', () => {
    const p = buildResponseSavePayload(base);
    expect(p).toEqual({
      conversation: base.conversation,
      summary: base.summary,
      plan: base.plan,
      provider: 'auto',
      expectedPreviousVersion: 1,
    });
  });

  test('NEVER sends status (auto-save cannot reactivate an archived trip)', () => {
    expect('status' in buildResponseSavePayload(base)).toBe(false);
  });

  test('NEVER sends title (auto-save cannot rename)', () => {
    expect('title' in buildResponseSavePayload(base)).toBe(false);
  });

  test('expectedPreviousVersion is plan.responseVersion - 1, or undefined for legacy', () => {
    expect(buildResponseSavePayload({ ...base, plan: { responseVersion: 5 } }).expectedPreviousVersion).toBe(4);
    expect('expectedPreviousVersion' in buildResponseSavePayload({ ...base, plan: { days: [] } })).toBe(false);
  });

  // Stage 14.3 — intra-turn revision succession.
  test('carries expectedPreviousRevision when a revision-2 write names its base', () => {
    const p = buildResponseSavePayload({ ...base, expectedPreviousRevision: 1 });
    expect(p.expectedPreviousRevision).toBe(1);
  });

  test('omits expectedPreviousRevision for a direct-terminal write', () => {
    expect('expectedPreviousRevision' in buildResponseSavePayload(base)).toBe(false);
    expect(
      'expectedPreviousRevision' in buildResponseSavePayload({ ...base, expectedPreviousRevision: null })
    ).toBe(false);
  });
});
