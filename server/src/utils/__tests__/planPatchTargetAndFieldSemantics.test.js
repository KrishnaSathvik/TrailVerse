'use strict';

/**
 * PATCH TARGET RELIABILITY + FIELD SEMANTICS.
 *
 * Two questions the 2026-08-25 live refinement left open.
 *
 * TARGET. Recognition, daypart resolution and the source plan were all correct,
 * and two terra attempts still failed `plan_patch_target_not_found`. The
 * failing patches were never captured, so the cause is unattributable; what IS
 * checkable is that matching behaves deterministically where the answer is
 * unambiguous and refuses where it is not. Today `findIndex` silently mutates
 * the FIRST stop sharing a name, which is a guess wearing a match's clothes.
 *
 * FIELDS. The accepted patch rewrote `exposureLevel` from `moderate` to `low`
 * on a stop whose identity did not change, because the traveler asked for an
 * easier morning. Exposure is evidence-derived (`npsEvidenceProvider`
 * normalizedValue), `itineraryCompleteness` calls structured `exposureLevel`
 * authoritative, and `enrichItineraryExposureFromEvidenceBundle` only fills a
 * value the model OMITTED — so a model-supplied value wins over the evidence.
 * A preference must not be able to relabel a place.
 *
 * Deterministic offline fixtures. No providers. No model calls. No network.
 */

const { applyPlanPatch, describePatchMutation } = require('../itineraryPlanPatch');

function planWith(day2Stops, extra = {}) {
  return {
    intro: 'A 3-day trip.',
    days: [
      { day: 1, dayNumber: 1, stops: [{ id: 'welcome', name: 'Welcome Center', type: 'visitor_center', duration: 40 }] },
      { day: 2, dayNumber: 2, stops: day2Stops },
      { day: 3, dayNumber: 3, stops: [{ id: 'overlook', name: 'Kīlauea Overlook', type: 'viewpoint', duration: 50 }] },
    ],
    ...extra,
  };
}

/** The real Day 2 morning stop from the live Hawaiʻi plan. */
function maunaLoa(overrides = {}) {
  return {
    id: 'mauna-loa-road',
    order: 1,
    type: 'scenic_drive',
    name: 'Mauna Loa Road scenic drive',
    timeWindow: 'Morning through midday',
    duration: 105,
    difficulty: 'easy',
    physicalDifficulty: 'easy',
    exposureLevel: 'moderate',
    walkingDistanceMiles: null,
    note: 'Use the open road as a relaxed scenic-drive anchor.',
    ...overrides,
  };
}

const patch = (operations, response = 'Softened the second morning.') => ({ response, operations });

describe('patch target resolution', () => {
  test('a canonical stop id resolves deterministically', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: { duration: 120 },
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops[0].duration).toBe(120);
    expect(result.plan.days[1].stops[0].name).toBe('Mauna Loa Road scenic drive');
  });

  test('an exact stop name resolves when it is unique', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopName: 'Mauna Loa Road scenic drive',
        stop: { duration: 120 },
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops[0].duration).toBe(120);
  });

  test('a display-name variation does not silently match something else', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopName: 'Mauna Loa Road',
        stop: { duration: 120 },
      }]),
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('plan_patch_target_not_found');
    // The whole point of the forensics gap: say what was asked for and what existed.
    expect(result.targetDiagnostics).toMatchObject({
      operationIndex: 0,
      requestedStopId: null,
      requestedStopName: 'Mauna Loa Road',
      dayNumber: 2,
      availableStopNames: ['Mauna Loa Road scenic drive'],
      availableStopIds: ['mauna-loa-road'],
      matchedCount: 0,
    });
  });

  test('an ambiguous name on one day fails closed instead of taking the first', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([
        maunaLoa({ id: 'mlr-am', timeWindow: 'Morning' }),
        maunaLoa({ id: 'mlr-pm', timeWindow: 'Afternoon', order: 2 }),
      ]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopName: 'Mauna Loa Road scenic drive',
        stop: { duration: 120 },
      }]),
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('plan_patch_target_ambiguous');
    expect(result.targetDiagnostics.matchedCount).toBe(2);
  });

  test('an ambiguous name is resolvable by canonical id', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([
        maunaLoa({ id: 'mlr-am', timeWindow: 'Morning' }),
        maunaLoa({ id: 'mlr-pm', timeWindow: 'Afternoon', order: 2 }),
      ]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mlr-pm', stop: { duration: 120 },
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops[1].duration).toBe(120);
    expect(result.plan.days[1].stops[0].duration).toBe(105);
  });

  test('the same place on a different day is not reachable through the wrong day', () => {
    const prior = planWith([maunaLoa()]);
    prior.days[2].stops.push(maunaLoa({ id: 'mauna-loa-road-d3', order: 2 }));
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{
        op: 'update_stop', dayNumber: 1, stopName: 'Mauna Loa Road scenic drive',
        stop: { duration: 120 },
      }]),
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('plan_patch_target_not_found');
    expect(result.targetDiagnostics.dayNumber).toBe(1);
  });

  test('a stop operation with no target reference at all is refused explicitly', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{ op: 'update_stop', dayNumber: 2, stop: { duration: 120 } }]),
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('plan_patch_target_missing');
  });

  test('remove_stop obeys the same ambiguity rule', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([
        maunaLoa({ id: 'mlr-am' }),
        maunaLoa({ id: 'mlr-pm', order: 2 }),
      ]),
      planPatch: patch([{
        op: 'remove_stop', dayNumber: 2, stopName: 'Mauna Loa Road scenic drive',
      }]),
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('plan_patch_target_ambiguous');
  });
});

describe('evidence-bound field semantics', () => {
  test('pace, timing and narration are freely patchable on the same stop', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: {
          timeWindow: 'Morning · flexible and unhurried',
          duration: 120,
          note: 'Take this as a slow out-and-back drive; turn around whenever you feel ready.',
          why: 'More time to linger over the views.',
        },
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops[0]).toMatchObject({
      timeWindow: 'Morning · flexible and unhurried',
      duration: 120,
      exposureLevel: 'moderate',
    });
  });

  test('a preference may not relabel the exposure of a stop that did not change', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: { duration: 120, exposureLevel: 'low' },
      }]),
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('plan_patch_evidence_field_mutation');
    expect(result.targetDiagnostics).toMatchObject({
      operationIndex: 0,
      evidenceFieldChanges: [{ field: 'exposureLevel', before: 'moderate', after: 'low' }],
    });
  });

  test('difficulty and walking distance are protected the same way', () => {
    for (const [field, after] of [['difficulty', 'moderate'], ['physicalDifficulty', 'moderate'], ['walkingDistanceMiles', 0.1]]) {
      const result = applyPlanPatch({
        priorPlan: planWith([maunaLoa({ walkingDistanceMiles: 2.4 })]),
        planPatch: patch([{
          op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road', stop: { [field]: after },
        }]),
      });
      expect(result.ok).toBe(false);
      expect(result.reasonCodes).toContain('plan_patch_evidence_field_mutation');
    }
  });

  test('restating an evidence-bound value unchanged is not a mutation', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: { duration: 120, exposureLevel: 'moderate', difficulty: 'easy' },
      }]),
    });
    expect(result.ok).toBe(true);
  });

  test('replacing the stop outright may carry different evidence-bound values', () => {
    // "Swap the exposed segment for roadside viewpoints" is a different place,
    // so it legitimately has different characteristics.
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([
        { op: 'remove_stop', dayNumber: 2, stopId: 'mauna-loa-road' },
        {
          op: 'add_stop',
          dayNumber: 2,
          stop: { id: 'kilauea-iki-overlook', name: 'Kīlauea Iki Overlook', type: 'viewpoint',
            duration: 60, exposureLevel: 'low', difficulty: 'easy' },
        },
      ]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops[0]).toMatchObject({
      name: 'Kīlauea Iki Overlook', exposureLevel: 'low',
    });
  });
});

describe('a partial stop omits with null, it does not erase with null', () => {
  /**
   * The patch tool's PARTIAL_STOP_SCHEMA has `required: []` and nullable types,
   * so structured output fills every unset field with an explicit `null`. The
   * live 2026-08-25 attempt-1 patch carried
   * `name: null, type: null, difficulty: null, exposureLevel: null`.
   * Spreading that over the prior stop erases what the model never meant to
   * touch — and, worse, a null `name` reads as a RENAME, which is precisely the
   * condition that switches the evidence-bound guard off.
   */
  const livePartialStop = {
    name: null, type: null, order: null, startTime: '',
    timeWindow: 'Late morning · unhurried scenic drive', duration: 60,
    exposureLevel: null, difficulty: null, note: null, why: null,
    alternatives: [], backupOptions: [],
  };

  test('null fields leave the prior values intact', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road', stop: livePartialStop,
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops[0]).toMatchObject({
      name: 'Mauna Loa Road scenic drive',
      type: 'scenic_drive',
      difficulty: 'easy',
      exposureLevel: 'moderate',
      note: 'Use the open road as a relaxed scenic-drive anchor.',
      timeWindow: 'Late morning · unhurried scenic drive',
      duration: 60,
    });
  });

  test('a null name is not a rename, so the evidence guard still applies', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: { ...livePartialStop, exposureLevel: 'low' },
      }]),
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('plan_patch_evidence_field_mutation');
  });

  test('a rename does not inherit the replaced place\'s facts', () => {
    // "Swap this for Court of the Patriarchs" describes a different place, and
    // what is not stated about it is genuinely unknown — inheriting the old
    // stop's exposure would let a replacement launder an eligibility answer.
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: { name: 'Court of the Patriarchs', type: 'viewpoint', duration: 45,
          exposureLevel: null, difficulty: null },
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops[0]).toMatchObject({
      name: 'Court of the Patriarchs', exposureLevel: null, difficulty: null,
    });
  });

  test('a real rename is still a rename', () => {
    const result = applyPlanPatch({
      priorPlan: planWith([maunaLoa()]),
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: { name: 'Mauna Loa Road lower section', exposureLevel: 'low' },
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops[0].name).toBe('Mauna Loa Road lower section');
  });
});

describe('deterministic mutation diff', () => {
  test('names what actually changed and what did not', () => {
    const prior = planWith([maunaLoa()]);
    const applied = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: { timeWindow: 'Morning · flexible and unhurried', duration: 120 },
      }]),
    });
    expect(applied.ok).toBe(true);

    const diff = describePatchMutation({ priorPlan: prior, nextPlan: applied.plan });
    expect(diff.changedStops).toEqual([{
      dayNumber: 2,
      name: 'Mauna Loa Road scenic drive',
      changed: {
        timeWindow: { before: 'Morning through midday', after: 'Morning · flexible and unhurried' },
        duration: { before: 105, after: 120 },
      },
    }]);
    expect(diff.unchangedFields).toEqual(
      expect.arrayContaining(['difficulty', 'exposureLevel', 'name', 'type'])
    );
    expect(diff.addedStops).toEqual([]);
    expect(diff.removedStops).toEqual([]);
    expect(diff.unchangedDayNumbers).toEqual([1, 3]);
  });

  test('a diff over an unchanged plan claims nothing', () => {
    const prior = planWith([maunaLoa()]);
    const diff = describePatchMutation({ priorPlan: prior, nextPlan: prior });
    expect(diff.changedStops).toEqual([]);
    expect(diff.addedStops).toEqual([]);
    expect(diff.removedStops).toEqual([]);
  });
});

/**
 * ATTRIBUTABILITY. The live run's two terra failures are unattributable because
 * the failing patch was discarded: `plan_patch_apply` is the one structured
 * failure stage with no capture, and the public attempt record carried the
 * reason code without the evidence for it. Same shape as the 2026-08-20 Zion
 * defect the attempt record already documents, one level deeper.
 */
describe('a patch target failure survives as evidence', () => {
  const { executeTrailieV2Turn } = require('../../services/trailieV2ExecutionService');
  const { buildEvidenceBundle } = require('../evidenceBundle');

  const PRIOR_PLAN = {
    intro: 'Three days at Hawaiʻi Volcanoes.',
    days: [
      { day: 1, dayNumber: 1, stops: [{ id: 'welcome', name: 'Welcome Center', type: 'visitor_center', duration: 40 }] },
      { day: 2, dayNumber: 2, stops: [maunaLoa()] },
      { day: 3, dayNumber: 3, stops: [{ id: 'overlook', name: 'Kīlauea Overlook', type: 'viewpoint', duration: 50 }] },
    ],
  };

  function refinementClassification() {
    return {
      primaryIntent: 'trip_refinement',
      travelerJob: 'itinerary_refinement',
      verticals: ['itinerary'],
      depth: 'planning',
      freshness: 'current',
      confidence: 0.95,
      requestedArtifact: 'itinerary_patch',
      structurePolicy: 'required',
      understanding: {
        contractVersion: 2,
        taskFamily: 'itinerary_refinement',
        taskStrength: 'explicit',
        confidence: 0.98,
        requestedArtifact: 'itinerary_patch',
        forbiddenArtifacts: [],
        structurePolicy: 'required',
        destinationRelationship: 'single',
        destinationRefs: [{ entityId: 'nps:park:havo', parkCode: 'havo', displayName: 'Hawaiʻi Volcanoes' }],
        temporalScope: { visitWindow: null, durationDays: 3, durationSource: 'prior_state' },
        operationalSubjects: [],
        explicitConstraints: [],
        softPreferences: [],
        underspecified: false,
        continuationOfActiveDecision: false,
        priorJob: 'day_by_day_itinerary',
        topicShift: false,
        understandingSource: 'deterministic',
        reasonCodes: ['refines_existing_plan'],
      },
    };
  }

  async function replay(patchInput, userMessage = 'Can we take that part easier?') {
    return executeTrailieV2Turn({
      userMessage,
      conversationContext: { history: [] },
      tripState: { existingCanonicalPlan: PRIOR_PLAN },
      constraints: {},
      resolvedContext: {},
    }, {
      enabled: true,
      liveBudget: null,
      classifyIntent: () => refinementClassification(),
      planRequirements: () => [],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requestId }) => buildEvidenceBundle({
        requestId, resolutions: [], candidates: [],
      }),
      now: () => new Date('2026-08-25T18:00:00.000Z'),
      newTurnId: () => 'patch-target-forensics',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async () => ({
        provider: 'openai',
        model: 'gpt-5.6-terra',
        outputText: '',
        toolCalls: [{
          name: 'patch_itinerary', id: 'call_1',
          input: patchInput, rawArgs: JSON.stringify(patchInput),
        }],
        completionStatus: 'complete',
        stopReason: 'stop',
        refusal: null,
        usage: { inputTokens: 5000, outputTokens: 400, reasoningTokens: 100, cachedInputTokens: 0 },
      }),
    });
  }

  // An UNRESOLVED reference leaves the raw matcher in charge: there is no
  // machine-resolved target to inject, so a free-typed name must still be
  // refused, and refused legibly.
  test('the attempt record says what was targeted and what was there', async () => {
    const result = await replay(patch([{
      op: 'update_stop', dayNumber: 2, stopName: 'Mauna Loa Road', stop: { duration: 120 },
    }]));

    const attempt = result.attempts[0];
    expect(attempt.validationStage).toBe('plan_patch_apply');
    expect(attempt.validationReasonCodes).toContain('plan_patch_target_not_found');
    expect(attempt.validationTargetDiagnostics).toMatchObject({
      op: 'update_stop',
      dayNumber: 2,
      requestedStopName: 'Mauna Loa Road',
      requestedStopId: null,
      availableStopNames: ['Mauna Loa Road scenic drive'],
      availableStopIds: ['mauna-loa-road'],
      matchedCount: 0,
    });
  });

  test('a resolved daypart binds the target, so an abbreviated name no longer misses', async () => {
    // The exact operation terra emitted live on 2026-08-25 attempt 1.
    const result = await replay(
      patch([{ op: 'update_stop', dayNumber: 2, stopName: 'Mauna Loa Road', stop: { duration: 120 } }]),
      'The second morning sounds like a little too much.'
    );
    const attempt = result.attempts[0];
    // The target resolved, so the turn got past targeting entirely. (This
    // minimal fixture then fails completeness on its own thinness — that is the
    // fixture, not the patch, and it is downstream of the point being made.)
    expect(attempt.validationReasonCodes).not.toContain('plan_patch_target_not_found');
    expect(attempt.validationStage).not.toBe('plan_patch_apply');
    expect(attempt.validationStage).not.toBe('plan_patch_scope');
  });

  test('an evidence-field mutation is attributable to the field that caused it', async () => {
    const result = await replay(patch([{
      op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
      stop: { duration: 120, exposureLevel: 'low' },
    }]));

    const attempt = result.attempts[0];
    expect(attempt.validationReasonCodes).toContain('plan_patch_evidence_field_mutation');
    expect(attempt.validationTargetDiagnostics.evidenceFieldChanges)
      .toEqual([{ field: 'exposureLevel', before: 'moderate', after: 'low' }]);
  });
});
