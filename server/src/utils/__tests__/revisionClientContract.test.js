'use strict';

/**
 * Stage 14.1 §9/§10 — contract assertions for behavior implemented LATER.
 *
 * §9 encodes the persist-before-reveal rule the frontend must follow in Stage 14.3,
 * expressed against the pure decision layer so the server side of the contract is
 * verifiable now. §10 proves `done` stays backward-compatible: additive, complete,
 * and self-sufficient — NOT byte-identical, since it gains optional fields.
 */

const {
  PERSISTENCE_OUTCOME, LIFECYCLE_STATUS,
} = require('../planPersistence');
const {
  resolveCanonicalResponsePersistence, resolveCreateIdempotency, CREATE_ACTION,
} = require('../canonicalPersistence');
const { buildCanonicalTrailieResponse, hashPayload } = require('../canonicalResponse');

const RID = 'resp-xyz';
const ITIN_DATA = { days: [{ dayNumber: 1, stops: [{ name: 'Old Faithful' }] }] };

function envelopeRev1() {
  return buildCanonicalTrailieResponse({
    responseId: RID, responseVersion: 1,
    responseRevision: 1, previousRevision: null,
    lifecycleStatus: LIFECYCLE_STATUS.ITINERARY_READY,
    itineraryReadyAt: '2026-08-02T00:00:00.000Z',
    processedContent: '', itineraryData: ITIN_DATA,
  });
}
function envelopeRev2() {
  return buildCanonicalTrailieResponse({
    responseId: RID, responseVersion: 1,
    responseRevision: 2, previousRevision: 1,
    lifecycleStatus: LIFECYCLE_STATUS.PROSE_READY,
    proseReadyAt: '2026-08-02T00:01:00.000Z',
    processedContent: 'Day 1 — start at Old Faithful.', itineraryData: ITIN_DATA,
  });
}
const planFrom = (e) => ({
  responseId: e.responseId, responseVersion: e.responseVersion,
  responseRevision: e.responseRevision, contentHash: e.contentHash,
  itineraryHash: e.itineraryHash, days: ITIN_DATA.days,
});

describe('Stage 14.1 §9 — client persist-before-reveal contract', () => {
  const rev1 = envelopeRev1();
  const rev2 = envelopeRev2();

  it('revision 2 buffered until revision 1 succeeds: ordered writes are ACCEPTed', () => {
    const first = resolveCreateIdempotency({ incomingPlan: planFrom(rev1), existingPlan: null });
    expect(first.action).toBe(CREATE_ACTION.CREATE);

    const second = resolveCanonicalResponsePersistence({
      incomingPlan: planFrom(rev2),
      incomingConversation: [{ role: 'assistant', responseId: RID, responseVersion: 1, responseRevision: 2, content: rev2.content }],
      expectedPreviousRevision: 1,
      existingPlan: planFrom(rev1),
      existingConversation: [{ role: 'assistant', responseId: RID, responseVersion: 1, responseRevision: 1, content: '' }],
    });
    expect(second.success).toBe(true);
    expect(second.revisionSuccession).toBe(true);
  });

  it('revision 2 written OUT OF ORDER is refused — it cannot invent revision 1', () => {
    // The exact failure the client buffer prevents: rev 2 reaching the server while
    // rev 1 is still in flight. The server must not construct a partial trip.
    expect(resolveCreateIdempotency({
      incomingPlan: planFrom(rev2), existingPlan: null, expectedPreviousRevision: 1,
    })).toEqual({ action: CREATE_ACTION.CONFLICT, reason: 'expected_revision_but_none_stored' });
  });

  it('when revision 1 persistence FAILS, the terminal done path can still save once', () => {
    // Rev 1 never landed (nothing stored). The terminal `done` write carries no
    // expectedPreviousRevision, so it is accepted as a direct-terminal response —
    // one trip, one write, no duplicate.
    const terminal = resolveCreateIdempotency({ incomingPlan: planFrom(rev2), existingPlan: null });
    expect(terminal.action).toBe(CREATE_ACTION.CREATE);
  });

  it('a revealed card is always already recoverable: the revealed hash is the stored hash', () => {
    const stored = planFrom(rev1);
    // Reveal happens only after this write is accepted, so what the user sees is
    // exactly what a reload would restore.
    expect(stored.itineraryHash).toBe(rev1.itineraryHash);
    // …and the terminal revision cannot change it.
    expect(planFrom(rev2).itineraryHash).toBe(stored.itineraryHash);
  });

  it('a late revision-1 retry after the terminal landed is STALE, not a rollback', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planFrom(rev1),
      incomingConversation: [],
      existingPlan: planFrom(rev2),
      existingConversation: [],
    });
    expect(r.success).toBe(false);
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.STALE);
    expect(r.writePlan).toBe(false);
  });
});

describe('Stage 14.1 §10 — `done` backward compatibility (additive, not byte-identical)', () => {
  it('every pre-Stage-14 field keeps its meaning and value', () => {
    const base = { responseId: RID, responseVersion: 2, processedContent: 'prose', itineraryData: ITIN_DATA };
    const legacy = buildCanonicalTrailieResponse(base);
    const revised = buildCanonicalTrailieResponse({ ...base, responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready' });

    for (const key of ['responseId', 'responseVersion', 'content', 'contentHash', 'itineraryHash', 'planScore', 'provider', 'model']) {
      expect(revised[key]).toEqual(legacy[key]);
    }
  });

  it('new fields are strictly additive', () => {
    const legacy = buildCanonicalTrailieResponse({ responseId: RID, processedContent: 'x' });
    const revised = buildCanonicalTrailieResponse({ responseId: RID, processedContent: 'x', responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready' });
    const added = Object.keys(revised).filter((k) => !(k in legacy));
    expect(added.sort()).toEqual(['lifecycleStatus', 'previousRevision', 'responseRevision']);
  });

  it('an old client that ignores revision fields can still save a terminal done', () => {
    const revised = envelopeRev2();
    // Simulate a client that strips unknown fields before persisting.
    const { responseRevision, previousRevision, lifecycleStatus, proseReadyAt, ...oldClientPlan } = planFrom(revised);
    const r = resolveCreateIdempotency({ incomingPlan: oldClientPlan, existingPlan: null });
    expect(r.action).toBe(CREATE_ACTION.CREATE);
    // …and it is read as terminal, so a later revision-1 write cannot regress it.
    const late = resolveCanonicalResponsePersistence({
      incomingPlan: planFrom(envelopeRev1()), incomingConversation: [],
      existingPlan: oldClientPlan, existingConversation: [],
    });
    expect(late.outcome).toBe(PERSISTENCE_OUTCOME.STALE);
  });

  it('flag-off behavior is ONE terminal persistence operation', () => {
    // No revision fields anywhere = today's single write.
    const terminalOnly = buildCanonicalTrailieResponse({ responseId: RID, responseVersion: 1, processedContent: 'prose', itineraryData: ITIN_DATA });
    expect(terminalOnly).not.toHaveProperty('responseRevision');
    const r = resolveCreateIdempotency({ incomingPlan: planFrom(terminalOnly), existingPlan: null });
    expect(r.action).toBe(CREATE_ACTION.CREATE);
    const replay = resolveCreateIdempotency({ incomingPlan: planFrom(terminalOnly), existingPlan: planFrom(terminalOnly) });
    expect(replay.action).toBe(CREATE_ACTION.RETURN_EXISTING);
  });

  it('optional fields never alter legacy content or itinerary hashes', () => {
    const legacy = buildCanonicalTrailieResponse({ responseId: RID, processedContent: 'prose', itineraryData: ITIN_DATA });
    const revised = envelopeRev2();
    expect(revised.contentHash).toBe(hashPayload('Day 1 — start at Old Faithful.'));
    expect(revised.itineraryHash).toBe(legacy.itineraryHash);
  });
});
