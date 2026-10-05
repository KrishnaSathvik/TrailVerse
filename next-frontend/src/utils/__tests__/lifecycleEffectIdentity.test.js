import { describe, it, expect } from 'vitest';
import {
  reduceLifecycle, initialLifecycleState, EFFECT,
  canonicalIdentityOf, assertCanonicalIdentity,
  validateItineraryReadyEvent, validateProseReadyEvent,
} from '@/utils/earlyRevisionLifecycle';

/**
 * Stage 14.7F2 §1 — PERSIST_* and REVEAL_* must never disagree about identity.
 *
 * Stage 14.7F1 Defect B was the coarse version of this: the persistence effects
 * carried no identity at all, so the UI revealed a turn the database stored
 * without canonical keys. These tests pin the subtler failure — persisting one
 * identity while revealing another.
 */

const RESPONSE_ID = 'resp-identity-1';
const ITINERARY_HASH = 'itin-hash-1';

const plan = (overrides = {}) => ({
  responseId: RESPONSE_ID,
  itineraryHash: ITINERARY_HASH,
  days: [{ id: 'd1', day: 1, stops: [{ id: 's1', name: 'South Rim' }] }],
  ...overrides,
});

const revisionOneEvent = (overrides = {}) => ({
  type: 'itinerary_ready',
  response: {
    responseId: RESPONSE_ID,
    responseVersion: 1,
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: 'itinerary_ready',
    content: '',
    contentHash: 'ch-0',
    itineraryHash: ITINERARY_HASH,
    ...overrides.response,
  },
  canonicalPlan: overrides.canonicalPlan ?? plan(),
});

const revisionTwoEvent = (overrides = {}) => ({
  type: 'prose_ready',
  expectedPreviousRevision: 1,
  response: {
    responseId: RESPONSE_ID,
    responseVersion: 1,
    responseRevision: 2,
    previousRevision: 1,
    lifecycleStatus: 'prose_ready',
    content: 'Day 1 — start at the South Rim.',
    contentHash: 'ch-1',
    itineraryHash: ITINERARY_HASH,
    ...overrides.response,
  },
  canonicalPlan: overrides.canonicalPlan ?? plan(),
});

const started = () => {
  const state = initialLifecycleState({ tripId: 'trip-1' });
  return reduceLifecycle(state, {
    type: 'response_started', responseId: RESPONSE_ID, responseVersion: 1,
  }).state;
};

const effectsOf = (state, event) => reduceLifecycle(state, event);
const find = (effects, type) => effects.find((e) => e.type === type);

/** Drives to the point where revision 1 is durable. */
const afterRevisionOnePersisted = () => {
  let out = effectsOf(started(), revisionOneEvent());
  out = effectsOf(out.state, { type: 'revision_1_result', ok: true, tripId: 'trip-1' });
  return out;
};

describe('§1 — the shared identity helper', () => {
  it('derives all four fields from the canonical response', () => {
    const identity = canonicalIdentityOf(revisionOneEvent().response, 1);
    expect(identity).toEqual({
      responseId: RESPONSE_ID, responseVersion: 1, responseRevision: 1, itineraryHash: ITINERARY_HASH,
    });
  });

  it('fails closed on incomplete identity', () => {
    expect(() => assertCanonicalIdentity(canonicalIdentityOf({}, 1))).toThrow('canonical_identity_incomplete');
    expect(() => assertCanonicalIdentity(canonicalIdentityOf({ responseId: RESPONSE_ID }, 1)))
      .toThrow('canonical_identity_incomplete');
    expect(() => assertCanonicalIdentity(canonicalIdentityOf(revisionOneEvent().response, 3)))
      .toThrow('canonical_identity_incomplete');
  });
});

describe('§1 — PERSIST_REVISION_1 ↔ REVEAL_ITINERARY agree', () => {
  it('the persistence effect carries complete canonical identity', () => {
    const persist = find(effectsOf(started(), revisionOneEvent()).effects, EFFECT.PERSIST_REVISION_1);
    expect(persist.responseId).toBe(RESPONSE_ID);
    expect(persist.responseVersion).toBe(1);
    expect(persist.responseRevision).toBe(1);
    expect(persist.itineraryHash).toBe(ITINERARY_HASH);
  });

  it('top-level identity matches the nested canonical response', () => {
    const persist = find(effectsOf(started(), revisionOneEvent()).effects, EFFECT.PERSIST_REVISION_1);
    expect(persist.responseId).toBe(persist.response.responseId);
    expect(persist.responseVersion).toBe(persist.response.responseVersion);
    expect(persist.itineraryHash).toBe(persist.response.itineraryHash);
  });

  it('identity matches the canonical plan', () => {
    const persist = find(effectsOf(started(), revisionOneEvent()).effects, EFFECT.PERSIST_REVISION_1);
    expect(persist.canonicalPlan.responseId).toBe(persist.responseId);
    expect(persist.canonicalPlan.itineraryHash).toBe(persist.itineraryHash);
  });

  it('the reveal effect carries the identical identity', () => {
    const reveal = find(afterRevisionOnePersisted().effects, EFFECT.REVEAL_ITINERARY);
    const persist = find(effectsOf(started(), revisionOneEvent()).effects, EFFECT.PERSIST_REVISION_1);
    expect(reveal.responseId).toBe(persist.responseId);
    expect(reveal.responseVersion).toBe(persist.responseVersion);
    expect(reveal.responseRevision).toBe(persist.responseRevision);
    expect(reveal.itineraryHash).toBe(persist.itineraryHash);
  });

  it('duplicate delivery produces the same identity', () => {
    const first = find(effectsOf(started(), revisionOneEvent()).effects, EFFECT.PERSIST_REVISION_1);
    const second = find(effectsOf(started(), revisionOneEvent()).effects, EFFECT.PERSIST_REVISION_1);
    expect(second.responseId).toBe(first.responseId);
    expect(second.itineraryHash).toBe(first.itineraryHash);
  });
});

describe('§1 — PERSIST_REVISION_2 ↔ REVEAL_PROSE agree', () => {
  const afterRevisionTwo = () => {
    const one = afterRevisionOnePersisted();
    return effectsOf(one.state, revisionTwoEvent());
  };

  it('the persistence effect carries complete canonical identity and prose', () => {
    const persist = find(afterRevisionTwo().effects, EFFECT.PERSIST_REVISION_2);
    expect(persist.responseId).toBe(RESPONSE_ID);
    expect(persist.responseVersion).toBe(1);
    expect(persist.responseRevision).toBe(2);
    expect(persist.itineraryHash).toBe(ITINERARY_HASH);
    expect(persist.content).toBe(persist.response.content);
  });

  it('top-level identity matches the nested canonical response', () => {
    const persist = find(afterRevisionTwo().effects, EFFECT.PERSIST_REVISION_2);
    expect(persist.responseId).toBe(persist.response.responseId);
    expect(persist.responseVersion).toBe(persist.response.responseVersion);
    expect(persist.itineraryHash).toBe(persist.response.itineraryHash);
  });

  it('the reveal effect carries the identical identity and content', () => {
    const two = afterRevisionTwo();
    const persist = find(two.effects, EFFECT.PERSIST_REVISION_2);
    const revealed = effectsOf(two.state, { type: 'revision_2_result', ok: true });
    const reveal = find(revealed.effects, EFFECT.REVEAL_PROSE);

    expect(reveal.responseId).toBe(persist.responseId);
    expect(reveal.responseVersion).toBe(persist.responseVersion);
    expect(reveal.responseRevision).toBe(persist.responseRevision);
    expect(reveal.itineraryHash).toBe(persist.itineraryHash);
    expect(reveal.content).toBe(persist.content);
  });

  it('revision 2 keeps the revision-1 itinerary hash', () => {
    const one = find(effectsOf(started(), revisionOneEvent()).effects, EFFECT.PERSIST_REVISION_1);
    const two = find(afterRevisionTwo().effects, EFFECT.PERSIST_REVISION_2);
    expect(two.itineraryHash).toBe(one.itineraryHash);
    expect(two.responseId).toBe(one.responseId);
  });
});

describe('§1 — mismatched identity fails closed before any effect', () => {
  it('a nested/plan responseId mismatch is rejected', () => {
    const verdict = validateItineraryReadyEvent(
      revisionOneEvent({ canonicalPlan: plan({ responseId: 'resp-other' }) }),
      { responseId: RESPONSE_ID }
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('plan_identity_mismatch');
  });

  it('a response/plan itinerary-hash mismatch is rejected', () => {
    const verdict = validateItineraryReadyEvent(
      revisionOneEvent({ canonicalPlan: plan({ itineraryHash: 'itin-other' }) }),
      { responseId: RESPONSE_ID }
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('plan_itinerary_hash_mismatch');
  });

  it('revision 2 changing the itinerary hash is rejected', () => {
    const verdict = validateProseReadyEvent(
      revisionTwoEvent({ response: { itineraryHash: 'itin-changed' } }),
      { responseId: RESPONSE_ID, responseVersion: 1, itineraryHash: ITINERARY_HASH }
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('itinerary_hash_changed');
  });

  it('nothing is revealed and nothing is persisted after a contract failure', () => {
    const out = effectsOf(started(), revisionOneEvent({ canonicalPlan: plan({ itineraryHash: 'itin-other' }) }));
    const types = out.effects.map((e) => e.type);
    expect(types).not.toContain(EFFECT.PERSIST_REVISION_1);
    expect(types).not.toContain(EFFECT.REVEAL_ITINERARY);
    expect(types).toContain(EFFECT.CONTRACT_ERROR);
  });

  it('a revision-1 event missing responseVersion never reaches persistence', () => {
    const out = effectsOf(started(), revisionOneEvent({ response: { responseVersion: undefined } }));
    expect(out.effects.map((e) => e.type)).not.toContain(EFFECT.PERSIST_REVISION_1);
  });

  it('a revision-1 event missing itineraryHash never reaches persistence', () => {
    const out = effectsOf(started(), revisionOneEvent({ response: { itineraryHash: undefined } }));
    expect(out.effects.map((e) => e.type)).not.toContain(EFFECT.PERSIST_REVISION_1);
  });
});
