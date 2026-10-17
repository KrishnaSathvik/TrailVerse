const fixtures = require('../../../../shared/trailieStoredPresentation.fixtures.json');
const {
  PRESENTATION_STATE,
  PUBLIC_NOTES_STATUS,
  VIEWER_CONTEXT,
  deriveTrailieStoredPresentation,
} = require('../trailieStoredPresentation');

describe('Stage 14.5 §1 — shared stored-presentation fixtures', () => {
  test.each(fixtures.cases.map((c) => [c.name, c]))('%s', (_name, c) => {
    const result = deriveTrailieStoredPresentation({
      response: c.response,
      canonicalPlan: c.withPlan ? fixtures.plan : null,
      viewerContext: c.viewerContext || VIEWER_CONTEXT.OWNER,
      recoveryCapability: c.recoveryCapability === true,
    });

    for (const [key, expected] of Object.entries(c.expect)) {
      expect({ [key]: result[key] }).toEqual({ [key]: expected });
    }
  });

  test('every fixture case is exercised', () => {
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(17);
  });
});

describe('Stage 14.5 §2 — no silent normalization', () => {
  const plan = fixtures.plan;

  test('an invalid state never offers recovery', () => {
    for (const c of fixtures.cases.filter((x) => x.expect.state === 'invalid')) {
      const r = deriveTrailieStoredPresentation({
        response: c.response,
        canonicalPlan: c.withPlan ? plan : null,
        viewerContext: VIEWER_CONTEXT.OWNER,
        recoveryCapability: true,
      });
      expect(r.showRecoveryAction).toBe(false);
    }
  });

  test('an invalid state never shows prose', () => {
    for (const c of fixtures.cases.filter((x) => x.expect.state === 'invalid')) {
      const r = deriveTrailieStoredPresentation({
        response: c.response,
        canonicalPlan: c.withPlan ? plan : null,
      });
      expect(r.showProse).toBe(false);
      expect(r.content).toBeNull();
    }
  });

  test('no path ever asks for an empty assistant bubble', () => {
    for (const c of fixtures.cases) {
      const r = deriveTrailieStoredPresentation({
        response: c.response,
        canonicalPlan: c.withPlan ? plan : null,
      });
      expect(r.showEmptyAssistantBubble).toBe(false);
      if (r.showProse) expect(r.content).not.toBe('');
    }
  });

  test('the resolver is pure — it mutates neither response nor plan', () => {
    const response = { ...fixtures.cases[3].response };
    const snapshot = JSON.stringify({ response, plan });
    deriveTrailieStoredPresentation({ response, canonicalPlan: plan, recoveryCapability: true });
    expect(JSON.stringify({ response, plan })).toBe(snapshot);
  });

  test('it never rebuilds an itinerary from prose', () => {
    const r = deriveTrailieStoredPresentation({
      response: { role: 'assistant', content: '## Day 1\n- Visitor Center' },
      canonicalPlan: null,
    });
    expect(r.showItinerary).toBe(false);
  });
});

describe('Stage 14.5 §9 — surface-appropriate wording', () => {
  const rev1 = fixtures.cases.find((c) => c.name === 'valid explicit revision 1').response;
  const invalid = fixtures.cases.find((c) => c.name === 'revision 1 with a missing canonical plan is invalid').response;

  test('settled itinerary-only success has no incomplete-notes label on any surface', () => {
    for (const viewerContext of Object.values(VIEWER_CONTEXT)) {
      const r = deriveTrailieStoredPresentation({
        response: rev1, canonicalPlan: fixtures.plan, viewerContext,
      });
      expect(r.notesLabel).toBeNull();
      expect(r.publicNotesStatus).toBe(PUBLIC_NOTES_STATUS.COMPLETE);
      expect(r.state).toBe('itinerary_only');
    }
  });

  test.each([
    [VIEWER_CONTEXT.OWNER, 'Trip notes were not completed.'],
    [VIEWER_CONTEXT.SHARED, 'Trip notes are not available yet.'],
    [VIEWER_CONTEXT.EXPORT, 'Trip notes were not generated.'],
  ])('%s keeps bounded wording for genuine incomplete/invalid states', (viewerContext, label) => {
    const r = deriveTrailieStoredPresentation({
      response: invalid, canonicalPlan: null, viewerContext,
    });
    expect(r.notesLabel).toBe(label);
  });

  test('no label implies generation is currently running', () => {
    for (const ctx of Object.values(VIEWER_CONTEXT)) {
      const r = deriveTrailieStoredPresentation({
        response: rev1, canonicalPlan: fixtures.plan, viewerContext: ctx,
      });
      expect(r.notesLabel).toBeNull();
    }
  });

  test('publicNotesStatus is coarse and never the internal enum', () => {
    for (const c of fixtures.cases) {
      const r = deriveTrailieStoredPresentation({
        response: c.response, canonicalPlan: c.withPlan ? fixtures.plan : null,
      });
      expect(Object.values(PUBLIC_NOTES_STATUS)).toContain(r.publicNotesStatus);
      expect(r.publicNotesStatus).not.toBe('itinerary_ready');
      expect(r.publicNotesStatus).not.toBe('fallback_complete');
    }
  });
});

describe('Stage 14.5 §3 — recovery action gating', () => {
  const rev1 = fixtures.cases.find((c) => c.name === 'valid explicit revision 1').response;
  const rev2 = fixtures.cases.find((c) => c.name === 'valid revision 2 with model prose').response;
  const legacy = { role: 'assistant', content: 'Legacy answer.' };

  test('offered only to an owner with capability on a valid revision 1', () => {
    const call = (response, viewerContext, recoveryCapability) =>
      deriveTrailieStoredPresentation({
        response, canonicalPlan: fixtures.plan, viewerContext, recoveryCapability,
      }).showRecoveryAction;

    expect(call(rev1, VIEWER_CONTEXT.OWNER, true)).toBe(true);
    expect(call(rev1, VIEWER_CONTEXT.OWNER, false)).toBe(false);
    expect(call(rev1, VIEWER_CONTEXT.SHARED, true)).toBe(false);
    expect(call(rev1, VIEWER_CONTEXT.EXPORT, true)).toBe(false);
    expect(call(rev2, VIEWER_CONTEXT.OWNER, true)).toBe(false);
    expect(call(legacy, VIEWER_CONTEXT.OWNER, true)).toBe(false);
  });

  test('PRESENTATION_STATE is a bounded enum', () => {
    expect(Object.values(PRESENTATION_STATE).sort()).toEqual([
      'fallback_complete', 'invalid', 'itinerary_only', 'legacy_terminal', 'prose_complete',
    ]);
  });
});
