'use strict';

/**
 * Stage 14.7F4B §2/§13 — the complete freeze, at the unit level.
 *
 * The controller test proves the route behaves; these prove the RULE, including
 * the property that actually closes Defect D1: a plan field this module has
 * never heard of is frozen automatically, because the successor is built from
 * the stored plan rather than from the incoming one.
 */

const {
  LIFECYCLE_PROGRESSION_FIELDS,
  buildFrozenSuccessionPlan,
  compareFrozenSuccessionPlan,
} = require('../frozenSuccessionPlan');

const storedPlan = () => ({
  type: 'itinerary',
  responseId: 'r1',
  responseVersion: 3,
  responseRevision: 1,
  lifecycleStatus: 'itinerary_ready',
  contentHash: 'ch1',
  itineraryHash: 'ih1',
  itineraryReadyAt: '2026-06-01T00:00:00.000Z',
  generatedAt: '2026-06-01T00:00:00.000Z',
  days: [{ day: 1, stops: [{ name: 'Tunnel View', lat: 37.7 }] }],
  stops: [{ name: 'Tunnel View' }],
  coordinates: { lat: 37.86, lng: -119.53 },
  provenance: { drivingTimesSource: 'google' },
  warnings: ['Tioga closed'],
  totalDurationMinutes: 480,
  difficulty: 'moderate',
  parks: [{ parkCode: 'yose' }],
  evidence: { npsSnapshotId: 'snap-1' },
  feasibilityIssues: [],
  planHash: 'ph1',
});

const identity = {
  responseId: 'r1',
  responseVersion: 3,
  responseRevision: 2,
  lifecycleStatus: 'prose_ready',
  contentHash: 'ch2',
  itineraryHash: 'ih1',
};

describe('§2 — the successor is built from the STORED plan', () => {
  test('every itinerary-derived field survives a fully mutated incoming plan', () => {
    const mutated = Object.fromEntries(
      Object.keys(storedPlan()).map((k) => [k, 'MUTATED'])
    );
    const frozen = buildFrozenSuccessionPlan({
      storedPlan: storedPlan(),
      incomingPlan: { ...mutated, responseRevision: 2, lifecycleStatus: 'prose_ready', contentHash: 'ch2' },
      resolvedIdentity: identity,
    });

    const { immutableFieldsChanged } = compareFrozenSuccessionPlan({
      before: storedPlan(),
      after: frozen,
    });
    expect(immutableFieldsChanged).toEqual([]);
  });

  test('a plan field this module has never heard of is frozen by default', () => {
    const stored = { ...storedPlan(), someFutureField: { nested: 'original' } };
    const frozen = buildFrozenSuccessionPlan({
      storedPlan: stored,
      incomingPlan: { ...storedPlan(), someFutureField: { nested: 'MUTATED' } },
      resolvedIdentity: identity,
    });
    expect(frozen.someFutureField).toEqual({ nested: 'original' });
  });

  test('an incoming-only field is dropped, never merged in', () => {
    const frozen = buildFrozenSuccessionPlan({
      storedPlan: storedPlan(),
      incomingPlan: { ...storedPlan(), smuggled: 'INJECTED' },
      resolvedIdentity: identity,
    });
    expect(frozen.smuggled).toBeUndefined();
  });

  test('itineraryReadyAt belongs to revision 1 and is never restamped', () => {
    const frozen = buildFrozenSuccessionPlan({
      storedPlan: storedPlan(),
      incomingPlan: { ...storedPlan(), itineraryReadyAt: '2027-01-01T00:00:00.000Z' },
      resolvedIdentity: identity,
    });
    expect(frozen.itineraryReadyAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('§2 — whitelisted lifecycle progression DOES advance', () => {
  test('identity-sourced fields come from the classified identity, not the body', () => {
    const frozen = buildFrozenSuccessionPlan({
      storedPlan: storedPlan(),
      incomingPlan: {
        responseRevision: 99,
        lifecycleStatus: 'LIES',
        contentHash: 'LIES',
      },
      resolvedIdentity: identity,
    });
    expect(frozen.responseRevision).toBe(2);
    expect(frozen.lifecycleStatus).toBe('prose_ready');
    expect(frozen.contentHash).toBe('ch2');
  });

  test('terminal-only metadata is carried from the incoming write', () => {
    const frozen = buildFrozenSuccessionPlan({
      storedPlan: storedPlan(),
      incomingPlan: {
        previousRevision: 1,
        proseReadyAt: '2026-06-02T00:00:00.000Z',
        reviewMeta: { reviewerRan: true, reviewerSeverity: 'none' },
        auditTrail: { provider: 'claude', model: 'claude-x' },
      },
      resolvedIdentity: identity,
    });
    expect(frozen.previousRevision).toBe(1);
    expect(frozen.proseReadyAt).toBe('2026-06-02T00:00:00.000Z');
    expect(frozen.reviewMeta).toEqual({ reviewerRan: true, reviewerSeverity: 'none' });
    expect(frozen.auditTrail).toEqual({ provider: 'claude', model: 'claude-x' });
  });

  test('an omitted progression field does not blank out stored state', () => {
    const stored = { ...storedPlan(), reviewMeta: { sampled: true } };
    const frozen = buildFrozenSuccessionPlan({
      storedPlan: stored,
      incomingPlan: {},
      resolvedIdentity: identity,
    });
    expect(frozen.reviewMeta).toEqual({ sampled: true });
  });

  test('the whitelist is exactly the terminal-revision fields', () => {
    expect([...LIFECYCLE_PROGRESSION_FIELDS].sort()).toEqual([
      'auditTrail', 'contentHash', 'lifecycleStatus', 'previousRevision',
      'proseReadyAt', 'responseRevision', 'reviewMeta',
    ]);
    expect(LIFECYCLE_PROGRESSION_FIELDS).not.toContain('days');
    expect(LIFECYCLE_PROGRESSION_FIELDS).not.toContain('itineraryHash');
    expect(LIFECYCLE_PROGRESSION_FIELDS).not.toContain('itineraryReadyAt');
  });
});

describe('§13 — the comparison never hides a change', () => {
  test('a field added by the write counts as changed', () => {
    const evidence = compareFrozenSuccessionPlan({
      before: { days: [1] },
      after: { days: [1], sneaked: 'x' },
    });
    expect(evidence.immutableFieldsCompared).toContain('sneaked');
    expect(evidence.immutableFieldsChanged).toEqual(['sneaked']);
  });

  test('a field removed by the write counts as changed', () => {
    const evidence = compareFrozenSuccessionPlan({
      before: { days: [1], warnings: ['w'] },
      after: { days: [1] },
    });
    expect(evidence.immutableFieldsChanged).toEqual(['warnings']);
  });

  test('progression fields are excluded from the immutable comparison', () => {
    const evidence = compareFrozenSuccessionPlan({
      before: { responseRevision: 1, days: [1] },
      after: { responseRevision: 2, days: [1] },
    });
    expect(evidence.immutableFieldsChanged).toEqual([]);
    expect(evidence.immutableFieldsCompared).not.toContain('responseRevision');
  });

  test('with no stored plan there is nothing to freeze', () => {
    expect(buildFrozenSuccessionPlan({ storedPlan: null, incomingPlan: { a: 1 } })).toEqual({ a: 1 });
  });
});


/**
 * Stage 14.7F5 §2 — OWNERSHIP. Being whitelisted means a field may advance, not
 * that the client may set it to anything. Persistence is client-initiated, so
 * every rule below has to survive a hostile echo of server-built data.
 */
describe('§2 — progression-field ownership', () => {
  const { PROGRESSION_FIELD_SOURCE, LIFECYCLE_PROGRESSION_FIELDS } = require('../frozenSuccessionPlan');

  test('every whitelisted field has a documented authoritative source', () => {
    expect(Object.keys(PROGRESSION_FIELD_SOURCE).sort())
      .toEqual([...LIFECYCLE_PROGRESSION_FIELDS].sort());
  });

  describe('previousRevision — from the classified succession', () => {
    test('a lying body cannot rewrite the lineage', () => {
      const frozen = buildFrozenSuccessionPlan({
        storedPlan: storedPlan(),
        incomingPlan: { previousRevision: 47 },
        resolvedIdentity: identity,
      });
      expect(frozen.previousRevision).toBe(1); // the revision actually succeeded
    });
  });

  describe('proseReadyAt — write once, forward only', () => {
    test('an idempotent replay never restamps it', () => {
      const stored = { ...storedPlan(), responseRevision: 2, proseReadyAt: '2026-06-02T00:00:00.000Z' };
      const frozen = buildFrozenSuccessionPlan({
        storedPlan: stored,
        incomingPlan: { proseReadyAt: '2026-06-09T00:00:00.000Z' },
        resolvedIdentity: identity,
      });
      expect(frozen.proseReadyAt).toBe('2026-06-02T00:00:00.000Z');
    });

    test('it cannot predate the itinerary it describes', () => {
      const frozen = buildFrozenSuccessionPlan({
        storedPlan: storedPlan(), // itineraryReadyAt 2026-06-01
        incomingPlan: { proseReadyAt: '2020-01-01T00:00:00.000Z' },
        resolvedIdentity: identity,
      });
      expect(frozen.proseReadyAt).toBeUndefined();
    });

    test('a junk value is refused rather than stored', () => {
      const frozen = buildFrozenSuccessionPlan({
        storedPlan: storedPlan(),
        incomingPlan: { proseReadyAt: 'not-a-date' },
        resolvedIdentity: identity,
      });
      expect(frozen.proseReadyAt).toBeUndefined();
    });
  });

  describe('reviewMeta — server-owned, write once, allowlisted', () => {
    test('an existing review verdict cannot be overwritten', () => {
      const stored = { ...storedPlan(), reviewMeta: { reviewerRan: true, reviewerPassed: false } };
      const frozen = buildFrozenSuccessionPlan({
        storedPlan: stored,
        incomingPlan: { reviewMeta: { reviewerRan: true, reviewerPassed: true } },
        resolvedIdentity: identity,
      });
      expect(frozen.reviewMeta).toEqual({ reviewerRan: true, reviewerPassed: false });
    });

    test('injected internal fields are stripped on first write', () => {
      const frozen = buildFrozenSuccessionPlan({
        storedPlan: storedPlan(),
        incomingPlan: {
          reviewMeta: {
            reviewerPassed: true,
            leaseToken: 'INJECTED', evaluationRunId: 'INJECTED',
            reviewerPrompt: 'INJECTED', rejectedDraft: 'INJECTED',
          },
        },
        resolvedIdentity: identity,
      });
      expect(frozen.reviewMeta).toEqual({ reviewerPassed: true });
      expect(JSON.stringify(frozen)).not.toContain('INJECTED');
    });
  });

  describe('auditTrail — server-owned, append only', () => {
    test('an existing trail cannot be replaced', () => {
      const stored = { ...storedPlan(), auditTrail: { provider: 'claude', model: 'a' } };
      const frozen = buildFrozenSuccessionPlan({
        storedPlan: stored,
        incomingPlan: { auditTrail: { provider: 'INJECTED', model: 'INJECTED' } },
        resolvedIdentity: identity,
      });
      expect(frozen.auditTrail).toEqual({ provider: 'claude', model: 'a' });
    });

    test('a list trail may only grow, never be reordered or truncated', () => {
      const base = [{ provider: 'a' }, { provider: 'b' }];
      const stored = { ...storedPlan(), auditTrail: base };
      const append = buildFrozenSuccessionPlan({
        storedPlan: stored,
        incomingPlan: { auditTrail: [...base, { provider: 'c' }] },
        resolvedIdentity: identity,
      });
      expect(append.auditTrail).toHaveLength(3);

      for (const hostile of [
        [{ provider: 'b' }, { provider: 'a' }, { provider: 'c' }], // reordered
        [{ provider: 'a' }],                                       // truncated
        [{ provider: 'X' }, { provider: 'b' }, { provider: 'c' }], // replaced
      ]) {
        const out = buildFrozenSuccessionPlan({
          storedPlan: stored,
          incomingPlan: { auditTrail: hostile },
          resolvedIdentity: identity,
        });
        expect(out.auditTrail).toEqual(base);
      }
    });
  });

  test('no internal field can be injected anywhere in the plan', () => {
    const frozen = buildFrozenSuccessionPlan({
      storedPlan: storedPlan(),
      incomingPlan: {
        ...storedPlan(),
        leaseToken: 'INJECTED', fencingToken: 'INJECTED',
        evaluationRunId: 'INJECTED', providerRequest: 'INJECTED',
        reviewerPrompt: 'INJECTED', persistenceDecision: 'INJECTED',
        __proto__internal: 'INJECTED',
      },
      resolvedIdentity: identity,
    });
    expect(JSON.stringify(frozen)).not.toContain('INJECTED');
  });
});
