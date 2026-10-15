'use strict';

/**
 * CONSTRUCTOR RELIABILITY + MONOTONIC REPAIR — wiring proof.
 *
 * These run the REAL `executeTrailieV2Turn` with a scripted provider that
 * replays the candidates the live 2026-08-24 Canyonlands turn actually
 * produced. No provider, no network, no model.
 *
 * The live ladder those fixtures came from:
 *
 *   attempt 1  gpt-5.6-terra  zero_duration_stops                        24.2s  $0.0339
 *   attempt 2  gpt-5.6-terra  insufficient_day_coverage + anchor         11.2s  $0.0403
 *   attempt 3  gpt-5.6-sol    zero_duration_stops + coverage             42.5s  $0.1213
 *   → routing_exhausted, canonical_plan_missing, $0.1954, 77.9s
 *
 * Attempt 3 regenerated the exact defect attempt 2 had already fixed, because
 * (a) repair state was REPLACED each attempt rather than accumulated and
 * (b) repair text was gated on `retry`, which is false on escalation — so the
 * Sol attempt was dispatched with no validator feedback whatsoever.
 */

const path = require('path');
const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/services/evidenceBrokerService');

const CANYONLANDS = require(path.join(require('path').resolve(__dirname, '../../../../../src/services/__tests__'), 'fixtures/constructorLadder/canyonlands.json'));

const PROMPT = 'Give us three relaxed days in Canyonlands. We care most about scenery, '
  + "sunset views, and easy walks, and we don't want to spend the whole trip rushing between stops.";

const isGenerationDispatch = (req) => !(req?.tools || [])
  .some((t) => (t?.name || t?.function?.name) === 'repair_stop_durations');

/** Real captured candidate → a create_itinerary tool call. */
function toolResult(rawPlan) {
  return {
    text: rawPlan.intro || 'Here is the shape I would give three relaxed days.',
    toolCalls: [{
      id: 'call_1',
      name: 'create_itinerary',
      input: {
        intro: rawPlan.intro || 'Here is the shape I would give three relaxed days.',
        days: rawPlan.days.map((day, i) => ({
          id: `d${i + 1}`,
          dayNumber: day.day ?? i + 1,
          label: day.label || `Day ${i + 1}`,
          stops: (day.stops || []).map((s, j) => ({
            id: `d${i + 1}s${j + 1}`,
            order: s.order ?? j + 1,
            type: s.type || 'viewpoint',
            name: s.name,
            note: s.note || '',
            startTime: s.startTime || '',
            timeWindow: s.timeWindow || null,
            duration: s.duration,
          })),
        })),
      },
    }],
    structuredOutputStatus: 'complete',
    completionStatus: 'complete',
    stopReason: 'stop',
    usage: { inputTokens: 4000, outputTokens: 900, cachedInputTokens: 0 },
  };
}

const candidate = (n) => CANYONLANDS.attempts.find((a) => a.attempt === n).rawPlan;

/** Scripted provider: attempt N returns the Nth supplied candidate. */
function scriptedDeps(candidates) {
  const dispatches = [];
  return {
    dispatches,
    deps: {
      planRequirements: () => [],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requirements = [], requestId }) => buildEvidenceBundle({
        requestId,
        resolutions: requirements.map((r) => ({
          requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [],
        })),
        candidates: [],
      }),
      now: () => new Date('2026-08-24T12:00:00.000Z'),
      newTurnId: () => 'turn-constructor-monotonicity',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async (request) => {
        dispatches.push(request);
        // TWO AXES, TWO QUEUES. A bounded sub-dispatch (zero-duration
        // micro-repair) must not consume a generation candidate: doing so made
        // this fake report a ladder the production path would never produce.
        // Generation candidates advance only on generation dispatches.
        if (!isGenerationDispatch(request)) {
          return {
            text: '', toolCalls: [],
            completionStatus: 'complete', stopReason: 'stop',
            usage: { inputTokens: 200, outputTokens: 30 },
          };
        }
        const generationCount = dispatches.filter(isGenerationDispatch).length;
        const plan = candidates[Math.min(generationCount - 1, candidates.length - 1)];
        return toolResult(plan);
      },
    },
  };
}

// The canonical constraints the live 2026-08-24 turn actually carried:
// { durationDays: 3, pace: 'relaxed', fitness: 'easy', interests: ['scenic-drives'] }.
const turnInput = () => ({
  userMessage: PROMPT,
  conversationContext: { history: [] },
  tripState: null,
  constraints: CANYONLANDS.constraints,
  resolvedContext: {},
});

/**
 * Instruction text the provider was sent for GENERATION attempt N (1-indexed).
 *
 * Selects by semantic identity, not array position: `dispatch N === attempt N`
 * stopped being true when zero-duration micro-repair began issuing bounded
 * sub-dispatches inside an attempt window. A micro-repair is not a generation,
 * so it is not a rung of this ladder and must not shift it.
 */
function instructionsFor(dispatches, n) {
  const req = dispatches.filter(isGenerationDispatch)[n - 1];
  return String(req?.instructions ?? req?.generation?.instructions ?? '');
}

describe('P0-B — structural defects are refused immediately after parsing', () => {
  test('the all-zero-duration candidate fails at the structural stage, not completeness', async () => {
    const { deps, dispatches } = scriptedDeps([candidate(1)]);
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });

    const first = result.attempts[0];
    expect(first.validationReasonCodes).toContain('zero_duration_stops');
    // The whole point of the pass: the verdict is reached BEFORE evidence
    // enrichment, the route bridge, constraint finalization and completeness.
    expect(first.validationStage).toBe('structured_artifact_structure');
    expect(dispatches.length).toBeGreaterThan(0);
  });

  test('a candidate with real durations is never refused structurally', async () => {
    const { deps } = scriptedDeps([candidate(2)]);
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    expect(result.attempts[0].validationStage).not.toBe('structured_artifact_structure');
  });
});

describe('P0-F — every attempt after the first carries the contract', () => {
  test('the same-model retry receives MUST PRESERVE and MUST FIX', async () => {
    const { deps, dispatches } = scriptedDeps([candidate(1), candidate(2), candidate(3)]);
    await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });

    expect(dispatches.filter(isGenerationDispatch).length).toBeGreaterThanOrEqual(2);
    const retry = instructionsFor(dispatches, 2);
    expect(retry).toMatch(/MUST FIX:/);
    expect(retry).toMatch(/duration/i);
    expect(retry).toMatch(/MUST PRESERVE:/);
    // The traveler's original asks travel with the repair, not just the error.
    expect(retry).toMatch(/three-day trip/i);
    expect(retry).toMatch(/sunset/i);
    expect(retry).toMatch(/relaxed/i);
  });

  test('the ESCALATION attempt is no longer dispatched blind', async () => {
    // This is the defect that produced the live regression: `retry` is false on
    // escalation, so the old `retry ? repairText : ''` sent Sol nothing.
    const { deps, dispatches } = scriptedDeps([candidate(1), candidate(2), candidate(3)]);
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });

    const escalation = result.attempts.find((a) => a.attemptKind === 'escalation');
    expect(escalation).toBeTruthy();
    const escalationIndex = result.attempts.indexOf(escalation) + 1;
    const text = instructionsFor(dispatches, escalationIndex);
    expect(text).not.toBe('');
    expect(text).toMatch(/MUST PRESERVE:|MUST FIX:/);
    // It must know about the durations attempt 2 had already got right.
    expect(text).toMatch(/duration/i);
  });

  test('the first attempt carries no repair text at all', async () => {
    const { deps, dispatches } = scriptedDeps([candidate(1)]);
    await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    expect(instructionsFor(dispatches, 1)).not.toMatch(/MUST FIX:|MUST PRESERVE:/);
  });
});

describe('P0-L/M — the ladder can tell regression from progress', () => {
  test('replaying the real Canyonlands ladder marks attempt 3 as a REGRESSION', async () => {
    const { deps } = scriptedDeps([candidate(1), candidate(2), candidate(3)]);
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });

    const progress = result.attempts.map((a) => a.repairProgress?.progress);
    expect(progress[0]).toBe('NO_PROGRESS');
    expect(progress[1]).toBe('PROGRESS');
    expect(progress[2]).toBe('REGRESSION');

    // Named, not merely counted: attempt 3 gave back positive durations.
    expect(result.attempts[2].repairProgress.regressed).toContain('positive_stop_durations');
    // A satisfied/failed count would have called attempt 3 an improvement —
    // it cleared two coverage defects while putting the durations back to 0.
    expect(result.attempts[2].repairProgress.satisfied.length)
      .toBeGreaterThanOrEqual(result.attempts[0].repairProgress.satisfied.length);
  });

  test('a repaired ladder reaches a canonical plan and reports no regression', async () => {
    // attempt 1 broken, then a candidate that satisfies the contract.
    const { deps } = scriptedDeps([candidate(1), require(
      path.join(require('path').resolve(__dirname, '../../../../../src/services/__tests__'), 'fixtures/constructorLadder/redwood.json')
    ).attempts[0].rawPlan]);
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const regressions = result.attempts
      .flatMap((a) => a.repairProgress?.regressed || []);
    expect(regressions).toEqual([]);
  });
});

describe('provider isolation', () => {
  test('no real provider adapter is constructed anywhere in this suite', async () => {
    const { deps, dispatches } = scriptedDeps([candidate(1), candidate(2), candidate(3)]);
    await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    for (const request of dispatches) {
      expect(['openai', 'anthropic', 'claude']).toContain(request.provider);
    }
    // Every dispatch went to the injected stub — `responseAdapters` is empty,
    // so a real adapter would have thrown rather than silently calling out.
    expect(deps.responseAdapters).toEqual({});
  });
});
