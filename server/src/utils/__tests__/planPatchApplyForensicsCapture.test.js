'use strict';

/**
 * THE CANDIDATE PATCH MUST SURVIVE A TARGET FAILURE.
 *
 * The 2026-08-25 live refinement burned two terra attempts on
 * `plan_patch_target_not_found` and left `candidatePlanPatch: null` in both
 * captures, because `plan_patch_apply` was the one structured failure stage
 * with no capture call. Error diagnostics say what did not match; only the
 * candidate artifact says what the model actually emitted.
 *
 * Capture is eval-only and off by default, so this test turns it on for real —
 * otherwise it would pass vacuously on the inactive-capturer early return.
 */

const fs = require('fs');
const path = require('path');

const RUN_ID = 'plan-patch-forensics-test';
const CAPTURE_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'artifacts', 'private', 'plan_stages');
const captureFile = (attempt) => path.join(CAPTURE_DIR, `${RUN_ID}__attempt-${attempt}.json`);

const PRIOR_PLAN = {
  intro: 'Three days at Hawaiʻi Volcanoes.',
  days: [
    { day: 1, dayNumber: 1, stops: [{ id: 'welcome', name: 'Welcome Center', type: 'visitor_center', duration: 40 }] },
    {
      day: 2,
      dayNumber: 2,
      stops: [{
        id: 'mauna-loa-road', order: 1, type: 'scenic_drive',
        name: 'Mauna Loa Road scenic drive', timeWindow: 'Morning through midday',
        duration: 105, difficulty: 'easy', exposureLevel: 'moderate',
      }],
    },
    { day: 3, dayNumber: 3, stops: [{ id: 'overlook', name: 'Kīlauea Overlook', type: 'viewpoint', duration: 50 }] },
  ],
};

describe('plan_patch_apply forensics', () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES = 'true';
    process.env.NODE_ENV = 'test';
    process.env.TRAILIE_EVAL_PLAN_CAPTURE_RUN_ID = RUN_ID;
    for (const attempt of [1, 2, 3]) fs.rmSync(captureFile(attempt), { force: true });
  });
  afterEach(() => {
    process.env = { ...realEnv };
    for (const attempt of [1, 2, 3]) fs.rmSync(captureFile(attempt), { force: true });
  });

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
    const { executeTrailieV2Turn } = require('../../services/trailieV2ExecutionService');
    const { buildEvidenceBundle } = require('../evidenceBundle');
    return executeTrailieV2Turn({
      userMessage,
      conversationContext: { history: [] },
      tripState: { canonicalPlan: PRIOR_PLAN },
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
      newTurnId: () => 'plan-patch-forensics',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async () => ({
        provider: 'openai', model: 'gpt-5.6-terra', outputText: '',
        toolCalls: [{ name: 'patch_itinerary', id: 'call_1', input: patchInput, rawArgs: JSON.stringify(patchInput) }],
        completionStatus: 'complete', stopReason: 'stop', refusal: null,
        usage: { inputTokens: 5000, outputTokens: 400, reasoningTokens: 100, cachedInputTokens: 0 },
      }),
    });
  }

  // Unresolved reference: no machine target to inject, raw matching applies.
  test('a target miss leaves the patch the model actually emitted on disk', async () => {
    await replay({
      response: 'Softened the second morning.',
      operations: [{
        op: 'update_stop', dayNumber: 2, stopName: 'Mauna Loa Rd', stop: { duration: 120 },
      }],
    });

    expect(fs.existsSync(captureFile(1))).toBe(true);
    const captured = JSON.parse(fs.readFileSync(captureFile(1), 'utf8'));
    expect(captured.reasonCodes).toContain('plan_patch_target_not_found');
    // The decisive evidence: what was sent, not merely that it did not match.
    expect(captured.candidatePlanPatch).not.toBeNull();
    expect(captured.candidatePlanPatch.operations[0]).toMatchObject({
      op: 'update_stop',
      dayNumber: 2,
      stopName: 'Mauna Loa Rd',
      stopId: null,
    });
  });

  test('an evidence-bound mutation is captured with the offending stop', async () => {
    await replay({
      response: 'Made it easier.',
      operations: [{
        op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
        stop: { duration: 120, exposureLevel: 'low' },
      }],
    });

    const captured = JSON.parse(fs.readFileSync(captureFile(1), 'utf8'));
    expect(captured.reasonCodes).toContain('plan_patch_evidence_field_mutation');
    expect(captured.candidatePlanPatch.operations[0].stopId).toBe('mauna-loa-road');
    expect(captured.candidatePlanPatch.operations[0].stop).toMatchObject({ exposureLevel: 'low' });
  });

  test('a scope-bound patch records a deterministic mutation summary', async () => {
    const patchInput = {
      response: 'Softened the second morning.',
      operations: [{
        op: 'update_stop', dayNumber: 2, stopName: 'Mauna Loa Rd',
        stop: { duration: 120, timeWindow: 'Morning · flexible and unhurried' },
      }],
    };
    // Resolves to day 2 morning -> the single stop, so the abbreviated name
    // never has to match: the machine supplies the target.
    await replay(patchInput, 'The second morning sounds like a little too much.');

    const captured = JSON.parse(fs.readFileSync(captureFile(1), 'utf8'));
    expect(captured.mutationSummary).not.toBeNull();
    expect(captured.mutationSummary.changedStops).toEqual([{
      dayNumber: 2,
      stopId: 'mauna-loa-road',
      name: 'Mauna Loa Road scenic drive',
      fieldChanges: expect.arrayContaining([
        { field: 'duration', before: 105, after: 120 },
      ]),
    }]);
    expect(captured.mutationSummary.removedStops).toEqual([]);
    expect(captured.mutationSummary.addedStops).toEqual([]);
  });
});
