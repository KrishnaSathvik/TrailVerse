import { describe, it, expect } from 'vitest';
import { buildTripExportPayload, PUBLIC_PLAN_FIELDS } from '@/lib/pdf/buildTripExportPayload';

const ITIN_HASH = 'itin-hash';
const RID = 'resp-export';

const plan = (over = {}) => ({
  type: 'itinerary',
  parkName: 'Zion National Park',
  days: [{ id: 'd1', day: 1, title: 'Canyon floor', stops: [{ id: 'd1s1', name: 'Visitor Center' }] }],
  feasibilityIssues: [{ message: 'Long drive on day 1.' }],
  responseId: RID,
  responseVersion: 3,
  responseRevision: 1,
  previousRevision: null,
  lifecycleStatus: 'itinerary_ready',
  itineraryReadyAt: '2026-08-01T00:00:00.000Z',
  contentHash: 'empty',
  itineraryHash: ITIN_HASH,
  reviewMeta: { reviewerNotes: 'internal' },
  auditTrail: { npsFacts: ['secret'] },
  ...over,
});

const rev1Turn = {
  role: 'assistant', content: '', responseId: RID, responseVersion: 3,
  responseRevision: 1, lifecycleStatus: 'itinerary_ready', itineraryHash: ITIN_HASH,
};
const rev2Turn = {
  ...rev1Turn, content: 'A relaxed day on the canyon floor.',
  responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready',
};
const fallbackTurn = { ...rev2Turn, lifecycleStatus: 'fallback_complete' };

describe('Stage 14.5 §7 — revision-1 export', () => {
  const out = () => buildTripExportPayload({ plan: plan(), conversation: [{ role: 'user', content: 'x' }, rev1Turn] });

  it('contains the full canonical itinerary', () => {
    expect(out().plan.days).toHaveLength(1);
    expect(out().exportable).toBe(true);
  });

  it('keeps feasibility warnings', () => {
    expect(out().plan.feasibilityIssues).toEqual([{ message: 'Long drive on day 1.' }]);
  });

  it('treats settled itinerary-only as complete (no incomplete-notes export chrome)', () => {
    expect(out().notesLabel).toBeNull();
    expect(out().notesStatus).toBe('complete');
  });

  it('never carries prose or an empty assistant message', () => {
    const serialized = JSON.stringify(out());
    expect(serialized).not.toContain('"role"');
    expect(serialized).not.toContain('"content"');
  });

  it('does not start prose recovery', () => {
    // Pure function: nothing to call. The output carries no recovery affordance
    // or lease state — only the bounded label, which legitimately reads
    // "Trip notes were not generated."
    const serialized = JSON.stringify(out());
    expect(serialized).not.toMatch(/recovery|lease|showRecoveryAction/i);
    expect(serialized).not.toMatch(/Generate trip notes/);
  });
});

describe('Stage 14.5 §7 — revision-2 export', () => {
  const out = (turn = rev2Turn) =>
    buildTripExportPayload({
      plan: plan({ responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready' }),
      conversation: [{ role: 'user', content: 'x' }, turn],
    });

  it('reports notes complete and drops the label', () => {
    expect(out().notesStatus).toBe('complete');
    expect(out().notesLabel).toBeNull();
  });

  it('exports fallback prose with no internal provenance', () => {
    const r = out(fallbackTurn);
    expect(r.notesStatus).toBe('complete');
    expect(JSON.stringify(r)).not.toMatch(/fallback_complete|deterministic|verifier/i);
  });

  it('stays plan-only: prose is never embedded in the export payload', () => {
    expect(JSON.stringify(out())).not.toContain('A relaxed day on the canyon floor.');
  });

  it('fails closed on an itinerary-hash mismatch', () => {
    const r = out({ ...rev2Turn, itineraryHash: 'moved' });
    expect(r.notesStatus).toBe('not_available');
    expect(r.notesLabel).toBe('Trip notes were not generated.');
  });
});

describe('Stage 14.5 §7 — no internals in any export', () => {
  it.each([
    ['revision 1', rev1Turn],
    ['revision 2', rev2Turn],
    ['fallback', fallbackTurn],
    ['legacy', { role: 'assistant', content: 'Legacy answer.' }],
  ])('%s exports ONLY allowlisted plan fields', (_label, turn) => {
    const out = buildTripExportPayload({ plan: plan(), conversation: [turn] });
    // Stage 14.7F5 §11 — the allowlist is the assertion. Anything not named is
    // absent by construction, including fields nobody has invented yet.
    expect(Object.keys(out.plan || {}).filter((k) => !PUBLIC_PLAN_FIELDS.includes(k))).toEqual([]);

    // The previously denylisted internals remain absent — strictly weaker than
    // the check above, kept so the original intent stays legible.
    const serialized = JSON.stringify(out);
    for (const field of [
      'responseId', 'responseVersion', 'responseRevision', 'previousRevision',
      'expectedPreviousRevision', 'lifecycleStatus', 'itineraryReadyAt',
      'proseReadyAt', 'contentHash', 'itineraryHash', 'reviewMeta', 'auditTrail',
      'promptHash', 'rawReviewerOutput', 'rawRepairOutput',
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it('§11 — an unknown internal field added later is omitted automatically', () => {
    const out = buildTripExportPayload({
      plan: { ...plan(), someFieldInventedNextQuarter: 'INTERNAL', leaseToken: 'INTERNAL' },
      conversation: [rev2Turn],
    });
    expect(JSON.stringify(out)).not.toContain('INTERNAL');
  });

  it('strips reviewer, provider and lease internals', () => {
    const serialized = JSON.stringify(buildTripExportPayload({ plan: plan(), conversation: [rev2Turn] }));
    expect(serialized).not.toContain('reviewerNotes');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toMatch(/leaseToken|expectedContentHash|awaiting_persistence/);
    expect(serialized).not.toMatch(/TRAILIE_|\[ITINERARY_JSON\]|input_schema/);
  });

  it('legacy trips export exactly as before, with notes complete', () => {
    const legacyPlan = plan();
    ['responseRevision', 'previousRevision', 'lifecycleStatus'].forEach((k) => delete legacyPlan[k]);
    const r = buildTripExportPayload({
      plan: legacyPlan,
      conversation: [{ role: 'assistant', content: 'Legacy answer.' }],
    });
    expect(r.notesStatus).toBe('complete');
    expect(r.notesLabel).toBeNull();
    expect(r.plan.days).toHaveLength(1);
  });

  it('a missing plan is not exportable', () => {
    const r = buildTripExportPayload({ plan: null, conversation: [rev1Turn] });
    expect(r.exportable).toBe(false);
    expect(r.plan).toBeNull();
  });
});
