const { RECOVERY_OUTCOME, runProseRecovery, deepFreeze } = require('../proseRecoveryService');
const { evaluateStoredRevisionForRecovery } = require('../../utils/storedRevisionValidation');
const { hashPayload } = require('../../utils/canonicalResponse');
const { buildPlanDocument } = require('../../utils/trailiePipelineUtils');

const RID = 'resp-recovery';
// Shaped like a real finalized itinerary: `finalizeStructuredItinerary` assigns
// day/stop ids, and the Phase B marker contract is keyed on them.
const ITIN = {
  days: [
    {
      id: 'd1', day: 1, title: 'Canyon floor',
      stops: [{ id: 'd1s1', name: 'Visitor Center' }, { id: 'd1s2', name: 'Riverside Walk' }],
    },
    { id: 'd2', day: 2, title: 'Angels Landing', stops: [{ id: 'd2s1', name: 'Scout Lookout' }] },
  ],
};
const ITIN_HASH = hashPayload(ITIN);

const PROSE_CONFIG = { mode: 'enforce', maxChars: 20000, retryEnabled: true };

function storedRevision() {
  const plan = {
    ...buildPlanDocument({
      itineraryData: ITIN,
      parkName: 'Zion National Park',
      parkCode: 'zion',
      identity: { responseId: RID, responseVersion: 4, contentHash: hashPayload(''), itineraryHash: ITIN_HASH },
      feasibilityIssues: [],
    }),
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: 'itinerary_ready',
    itineraryReadyAt: '2026-08-01T00:00:00.000Z',
  };
  const trip = {
    plan,
    conversation: [
      { role: 'user', content: 'Plan 2 days in Zion' },
      {
        role: 'assistant', content: '', responseId: RID, responseVersion: 4,
        responseRevision: 1, lifecycleStatus: 'itinerary_ready', itineraryHash: ITIN_HASH,
      },
    ],
  };
  return evaluateStoredRevisionForRecovery({ trip, responseId: RID }).context;
}

/** Deterministic provider: never a network call. */
function fakeProvider(content, { aborted = false } = {}) {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    if (aborted) return { aborted: true };
    return { content, provider: 'claude', model: 'claude-model', usage: { input: 1, output: 2 } };
  };
  fn.calls = calls;
  return fn;
}

/**
 * Prose in the real Phase B marker contract, so the verifier actually passes it.
 * Stop ids are the manifest ids derived from the stored itinerary.
 */
const GOOD_PROSE = [
  '<!--TRAILIE_DAY:d1--> Canyon floor',
  '<!--TRAILIE_STOP:d1s1--> Visitor Center — start here for maps and the shuttle.',
  '<!--TRAILIE_STOP:d1s2--> Riverside Walk — an easy paved stroll along the Virgin River.',
  '<!--TRAILIE_DAY:d2--> Angels Landing',
  '<!--TRAILIE_STOP:d2s1--> Scout Lookout — the turnaround point below the chains.',
].join('\n');

const run = (over = {}) =>
  runProseRecovery({
    storedRevision: storedRevision(),
    deliverProse: fakeProvider(GOOD_PROSE),
    proseConfig: PROSE_CONFIG,
    resolvedMetadata: { parkName: 'Zion National Park' },
    provider: 'claude',
    model: 'claude-model',
    now: () => '2026-08-01T01:00:00.000Z',
    ...over,
  });

describe('Stage 14.4 §4 — Phase-B-only recovery', () => {
  test('produces an explicit revision-2 successor from the stored itinerary', async () => {
    const res = await run();

    expect(res.outcome).toBe(RECOVERY_OUTCOME.PROSE_READY);
    expect(res.revisionTwo.response.responseRevision).toBe(2);
    expect(res.revisionTwo.response.previousRevision).toBe(1);
    expect(res.revisionTwo.expectedPreviousRevision).toBe(1);
  });

  test('retains the same responseId and responseVersion — never a new turn', async () => {
    const res = await run();

    expect(res.revisionTwo.response.responseId).toBe(RID);
    expect(res.revisionTwo.response.responseVersion).toBe(4);
    expect(res.revisionTwo.canonicalPlan.responseId).toBe(RID);
    expect(res.revisionTwo.canonicalPlan.responseVersion).toBe(4);
  });

  test('revision 2 carries exactly the stored itinerary hash', async () => {
    const res = await run();

    expect(res.revisionTwo.response.itineraryHash).toBe(ITIN_HASH);
    expect(res.revisionTwo.canonicalPlan.itineraryHash).toBe(ITIN_HASH);
  });

  test('deep-freezes the stored itinerary before Phase B', async () => {
    const stored = storedRevision();
    let frozenDuringCall = null;
    await runProseRecovery({
      storedRevision: stored,
      deliverProse: async () => {
        frozenDuringCall = {
          root: Object.isFrozen(stored.itineraryData),
          days: Object.isFrozen(stored.itineraryData.days),
          firstDay: Object.isFrozen(stored.itineraryData.days[0]),
          firstStop: Object.isFrozen(stored.itineraryData.days[0].stops[0]),
        };
        return { content: GOOD_PROSE, provider: 'claude', model: 'm' };
      },
      proseConfig: PROSE_CONFIG,
    });

    expect(frozenDuringCall).toEqual({ root: true, days: true, firstDay: true, firstStop: true });
  });

  test('a mutation attempt on the frozen itinerary cannot take effect', async () => {
    const stored = storedRevision();
    deepFreeze(stored.itineraryData);
    expect(() => {
      'use strict';
      stored.itineraryData.days.push({ day: 99 });
    }).toThrow();
    expect(stored.itineraryData.days).toHaveLength(2);
  });

  test('the first-pass prose is used when it verifies', async () => {
    const provider = fakeProvider(GOOD_PROSE);
    const res = await run({ deliverProse: provider });

    expect(provider.calls).toHaveLength(1);
    expect(res.revisionTwo.response.content).toContain('Visitor Center');
    expect(res.revisionTwo.response.lifecycleStatus).toBe('prose_ready');
    expect(res.meta.deterministicFallbackUsed).toBe(false);
  });

  test('a bounded retry runs at most once, then falls back deterministically', async () => {
    const calls = [];
    const res = await run({
      deliverProse: async (args) => {
        calls.push(args);
        return { content: 'Vague notes with no stops named.', provider: 'claude', model: 'm' };
      },
    });

    expect(calls.length).toBeLessThanOrEqual(2);
    expect(res.outcome).toBe(RECOVERY_OUTCOME.PROSE_READY);
    expect(res.revisionTwo.response.lifecycleStatus).toBe('fallback_complete');
    expect(res.meta.deterministicFallbackUsed).toBe(true);
  });

  test('deterministic fallback still carries the stored itinerary hash', async () => {
    const res = await run({ deliverProse: async () => ({ content: 'nope', provider: 'c', model: 'm' }) });
    expect(res.revisionTwo.response.itineraryHash).toBe(ITIN_HASH);
    expect(res.revisionTwo.response.content.length).toBeGreaterThan(0);
  });

  test('an aborted provider call yields no revision and no prose', async () => {
    const res = await run({ deliverProse: fakeProvider('', { aborted: true }) });

    expect(res.outcome).toBe(RECOVERY_OUTCOME.ABORTED);
    expect(res.revisionTwo).toBeUndefined();
  });

  test('an aborted signal short-circuits without a revision', async () => {
    const controller = new AbortController();
    controller.abort();
    const res = await run({ signal: controller.signal });
    expect(res.outcome).toBe(RECOVERY_OUTCOME.ABORTED);
  });

  test('refuses before any provider call when the stored hash disagrees', async () => {
    const provider = fakeProvider(GOOD_PROSE);
    const stored = storedRevision();
    const res = await runProseRecovery({
      storedRevision: { ...stored, itineraryHash: 'a-different-hash' },
      deliverProse: provider,
      proseConfig: PROSE_CONFIG,
    });

    expect(res.outcome).toBe(RECOVERY_OUTCOME.FAILED);
    expect(res.code).toBe('stored_itinerary_hash_mismatch');
    expect(provider.calls).toHaveLength(0);
  });

  test('artifact-bearing prose is sanitized before it reaches the revision', async () => {
    const dirty = `${GOOD_PROSE}\n\n[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]`;
    const res = await run({ deliverProse: fakeProvider(dirty) });

    expect(res.revisionTwo.response.content).not.toContain('[ITINERARY_JSON]');
    expect(JSON.stringify(res.revisionTwo)).not.toContain('[ITINERARY_JSON]');
  });

  test('alignment markers never survive into the revision', async () => {
    const marked = `<!-- TRAILIE_DAY:1 -->${GOOD_PROSE}`;
    const res = await run({ deliverProse: fakeProvider(marked) });
    expect(res.revisionTwo.response.content).not.toMatch(/TRAILIE_/);
  });

  test('the revision-2 plan is a valid successor payload for the existing writer', async () => {
    const { resolveCanonicalResponsePersistence } = require('../../utils/canonicalPersistence');
    const res = await run();

    const resolution = resolveCanonicalResponsePersistence({
      incomingPlan: res.revisionTwo.canonicalPlan,
      incomingConversation: [
        { role: 'user', content: 'x' },
        {
          role: 'assistant',
          content: res.revisionTwo.response.content,
          responseId: RID,
          responseVersion: 4,
          responseRevision: 2,
          lifecycleStatus: res.revisionTwo.response.lifecycleStatus,
          contentHash: res.revisionTwo.response.contentHash,
          itineraryHash: ITIN_HASH,
        },
      ],
      expectedPreviousRevision: 1,
      existingPlan: storedRevision().plan,
      existingConversation: [
        { role: 'user', content: 'x' },
        {
          role: 'assistant', content: '', responseId: RID, responseVersion: 4,
          responseRevision: 1, lifecycleStatus: 'itinerary_ready',
          contentHash: hashPayload(''), itineraryHash: ITIN_HASH,
        },
      ],
    });

    expect(resolution.success).toBe(true);
    expect(resolution.revisionSuccession).toBe(true);
  });
});

describe('Stage 14.4 §4 — forbidden dependencies', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '../proseRecoveryService.js'), 'utf8');

  test.each([
    ['Phase A orchestration', /toolFirstItineraryOrchestrator/],
    ['structured itinerary generation', /structuredItineraryGenerator/],
    ['itinerary correction', /itineraryCorrector/],
    ['the trip model', /models\/TripPlan/],
    ['the trip controller', /tripController/],
    ['private evaluation capture', /privateDraftCapture/],
  ])('never imports %s', (_label, pattern) => {
    expect(source).not.toMatch(pattern);
  });

  test('performs no model write', () => {
    expect(source).not.toMatch(/\.save\(|findOneAndUpdate|updateOne|create\(/);
  });
});
