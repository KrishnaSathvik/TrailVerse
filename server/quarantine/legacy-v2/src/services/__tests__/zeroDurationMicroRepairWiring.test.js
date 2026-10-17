'use strict';

/**
 * PHASE 1 — ZERO-DURATION MICRO-REPAIR, WIRING PROOF.
 *
 * Runs the REAL `executeTrailieV2Turn` against a scripted provider replaying the
 * live 2026-08-24 Canyonlands candidates, whose attempt 1 carried
 * `[0,0,0,0,0,0,0,0]` durations. No provider, no network, no model.
 *
 * What these prove that the utility tests cannot: that the branch fires in the
 * right place, that a refused merge leaves the pre-existing repair ladder
 * running unchanged, and that a sub-dispatch is never mistaken for an attempt.
 */

const path = require('path');
const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/services/evidenceBrokerService');
const { ZERO_DURATION_REPAIR_TOOL } = require('../../../../../src/utils/zeroDurationRepair');

const CANYONLANDS = require(path.join(require('path').resolve(__dirname, '../../../../../src/services/__tests__'), 'fixtures/constructorLadder/canyonlands.json'));
const PROMPT = 'Give us three relaxed days in Canyonlands. We care most about scenery, '
  + "sunset views, and easy walks, and we don't want to spend the whole trip rushing between stops.";
const candidate = (n) => CANYONLANDS.attempts.find((a) => a.attempt === n).rawPlan;

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

const isMicroRepair = (request) => (request?.tools || [])
  .some((t) => (t?.name || t?.function?.name) === ZERO_DURATION_REPAIR_TOOL.name);

/** Parses the refs the machine actually offered this dispatch. */
function refsOffered(request) {
  const text = String(request?.input?.[0]?.content || '');
  return [...text.matchAll(/ref (\d+) — Day/g)].map((m) => Number(m[1]));
}

/**
 * @param {Function} answerMicro (request, refs) -> durationUpdates | 'malformed'
 */
function scriptedDeps({ candidates, answerMicro }) {
  const generation = [];
  const micro = [];
  return {
    generation,
    micro,
    deps: {
      enableZeroDurationMicroRepair: true,
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
      newTurnId: () => 'turn-zero-duration-micro-repair',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async (request) => {
        if (isMicroRepair(request)) {
          micro.push(request);
          const answer = answerMicro(request, refsOffered(request));
          if (answer === 'malformed') {
            return {
              text: '', toolCalls: [{ id: 'c', name: 'create_itinerary', input: {} }],
              completionStatus: 'complete', stopReason: 'stop',
              usage: { inputTokens: 200, outputTokens: 30 },
            };
          }
          return {
            text: '',
            toolCalls: [{
              id: 'micro_1',
              name: ZERO_DURATION_REPAIR_TOOL.name,
              input: { durationUpdates: answer },
            }],
            completionStatus: 'complete', stopReason: 'stop',
            usage: { inputTokens: 200, outputTokens: 40 },
          };
        }
        generation.push(request);
        return toolResult(candidates[Math.min(generation.length - 1, candidates.length - 1)]);
      },
    },
  };
}

const turnInput = () => ({
  userMessage: PROMPT,
  conversationContext: { history: [] },
  tripState: null,
  constraints: CANYONLANDS.constraints,
  resolvedContext: {},
});

const repairs = (result) => result?.telemetrySummary?.zeroDurationRepairs || [];

describe('the branch fires on the defect it was built for', () => {
  it('dispatches ONE bounded micro-repair for a zero-duration candidate and merges it', async () => {
    const { deps, micro, generation } = scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: 60 })),
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });

    const applied = repairs(result).filter((r) => r.mergeStatus === 'applied');
    expect(applied.length).toBeGreaterThanOrEqual(1);
    const first = applied[0];
    expect(first.kind).toBe('zero_duration_micro_repair');
    expect(first.attempt).toBe(1);
    expect(first.targetCount).toBeGreaterThan(0);
    expect(first.acceptedCount).toBe(first.targetCount);
    expect(first.resolvedReasonCodes).toEqual(['zero_duration_stops']);
    // The defect it was aimed at is gone from the revalidated verdict.
    expect(first.remainingReasonCodes || []).not.toContain('zero_duration_stops');
    // The repair asked for integers, not for a plan.
    // The repair asks for integers, not for a plan: a token budget sized to the
    // target list, and a tool surface that cannot express an itinerary.
    expect(micro[0].generation.maxOutputTokens).toBeLessThan(1000);
    expect(micro[0].tools.map((t) => t.name)).toEqual([ZERO_DURATION_REPAIR_TOOL.name]);
    expect(JSON.stringify(micro[0].input)).not.toContain('create_itinerary');
    expect(generation.length).toBeGreaterThanOrEqual(1);
  });

  it('carries per-dispatch cost and timing separately from generation attempts', async () => {
    const { deps } = scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: 60 })),
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const first = repairs(result)[0];
    expect(first.outputTokens).toBe(40);
    expect(typeof first.dispatchMs).toBe('number');
    expect(first).toHaveProperty('costUsd');
    expect(first).toHaveProperty('costStatus');
    // A sub-dispatch is NOT an attempt. Squashing them would destroy the very
    // comparison the optimization has to be judged on.
    expect(result.telemetrySummary.attemptCount).toBeLessThanOrEqual(3);
  });

  it('never carries the merged plan into telemetry', async () => {
    const { deps } = scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: 60 })),
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    for (const row of repairs(result)) {
      expect(row).not.toHaveProperty('plan');
      expect(row).not.toHaveProperty('budgetTicket');
    }
  });
});

describe('the ladder separates the attempt axis from the dispatch axis', () => {
  it('lists the micro-repair as a sub-dispatch without counting it as an attempt', async () => {
    const { deps } = scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: 60 })),
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const ladder = result.attempts || [];
    expect(ladder.length).toBe(result.telemetrySummary.attemptCount);

    const first = ladder[0];
    expect(first.action).toBe('generation');
    expect(first.dispatchIndex).toBe(1);
    // ROLLOUT GATE 6: anchor and coverage repair now default ON, so a fixture
    // with latent defects of those classes produces their rows too. This suite
    // is about the zero-duration class, so it asserts about that class rather
    // than about the total. The co-firing classes are pinned below.
    const micros = first.subDispatches.filter((x) => x.action === 'zero_duration_micro_repair');
    expect(micros).toHaveLength(1);
    // The dispatch axis advanced; the attempt axis did not. Zero-duration is
    // the NARROWEST class, so it still runs first, immediately after generation.
    expect(first.subDispatches[0].action).toBe('zero_duration_micro_repair');
    expect(micros[0].dispatchIndex).toBe(2);
    expect(micros[0].mergeStatus).toBe('applied');
    expect(micros[0].outputTokens).toBe(40);
    // These fixtures carry no place evidence, so the two creation repairs have
    // no catalogue to recommend from and decline BEFORE spending anything —
    // the 4M fail-closed path, which is what should happen here.
    for (const other of first.subDispatches.filter((x) => x.action !== 'zero_duration_micro_repair')) {
      expect(other.mergeStatus).toBe('catalog_declined');
      expect(other.costUsd).toBeNull();
    }

    // Every provider dispatch has a distinct index across both axes.
    const indices = ladder.flatMap((a) => [a.dispatchIndex, ...a.subDispatches.map((s) => s.dispatchIndex)]);
    expect(new Set(indices).size).toBe(indices.length);
    // A later generation attempt is dispatch 3, not dispatch 2.
    if (ladder[1]) expect(ladder[1].dispatchIndex).toBeGreaterThan(2);
  });

  it('leaves subDispatches empty on attempts that had none', async () => {
    const { deps } = scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: 60 })),
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    for (const a of result.attempts || []) expect(Array.isArray(a.subDispatches)).toBe(true);
  });
});

describe('a bad micro artifact is refused, and the existing ladder runs unchanged', () => {
  const badAnswers = {
    'unknown ref': (_r, refs) => [...refs.map((ref) => ({ ref, durationMinutes: 60 })), { ref: 999, durationMinutes: 30 }],
    'duplicate ref': (_r, refs) => {
      const base = refs.map((ref) => ({ ref, durationMinutes: 60 }));
      return [...base, base[0]];
    },
    'missing target': (_r, refs) => refs.slice(0, 1).map((ref) => ({ ref, durationMinutes: 60 })),
    'string duration': (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: '60' })),
    'malformed artifact': () => 'malformed',
  };

  it.each(Object.keys(badAnswers))('refuses atomically on %s and falls back', async (label) => {
    const { deps, generation } = scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: badAnswers[label],
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });

    const rows = repairs(result);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].mergeStatus).not.toBe('applied');
    expect(rows[0].acceptedCount).toBe(0);
    // The original candidate was untouched, so the pre-existing repair path ran:
    // a real second generation dispatch happened.
    expect(generation.length).toBeGreaterThanOrEqual(2);
  });
});

describe('loop guard', () => {
  it('never dispatches more than one micro-repair per generation attempt', async () => {
    const { deps, micro, generation } = scriptedDeps({
      // Every attempt carries the zero-duration defect.
      candidates: [candidate(1), candidate(1), candidate(1)],
      answerMicro: () => 'malformed',
    });
    await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    expect(micro.length).toBeLessThanOrEqual(generation.length);
    expect(micro.length).toBeLessThanOrEqual(3);
  });
});

describe('default-on, with a working kill switch', () => {
  it('micro-repairs a zero-duration candidate with NO explicit override', async () => {
    const { deps, micro } = scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: 60 })),
    });
    // No caller opinion at all — this is the production default path.
    delete deps.enableZeroDurationMicroRepair;
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    expect(micro.length).toBeGreaterThanOrEqual(1);
    expect(repairs(result).some((r) => r.mergeStatus === 'applied')).toBe(true);
  });

  it('does not regenerate when the only legal duration operator is disabled', async () => {
    const { deps, micro, generation } = scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: 60 })),
    });
    const result = await executeTrailieV2Turn(turnInput(), {
      ...deps, enabled: true, enableZeroDurationMicroRepair: false,
    });
    expect(micro).toHaveLength(0);
    expect(repairs(result)).toHaveLength(0);
    // A disabled operator is not permission for a broader full-plan rewrite.
    expect(generation).toHaveLength(1);
    expect(result.attempts[0].retryability).toBe('deterministic_blocker');
    // ROLLOUT GATE 6: this kill switch silences its OWN class and nothing else,
    // so the assertion is per-class rather than "no sub-dispatch at all". The
    // anchor/coverage rows that remain are `catalog_declined` — these fixtures
    // carry no place evidence — so they cost nothing and change no plan.
    for (const a of result.attempts || []) {
      expect(a.subDispatches.filter((x) => x.action === 'zero_duration_micro_repair')).toHaveLength(0);
      for (const other of a.subDispatches) {
        expect(other.mergeStatus).toBe('catalog_declined');
        expect(other.costUsd).toBeNull();
      }
    }
  });

  it('counts only generation attempts, whatever the flag says', async () => {
    const build = (flag) => scriptedDeps({
      candidates: [candidate(1), candidate(2), candidate(3)],
      answerMicro: (_r, refs) => refs.map((ref) => ({ ref, durationMinutes: 60 })),
    });
    const onRun = build();
    const onResult = await executeTrailieV2Turn(turnInput(), { ...onRun.deps, enabled: true });
    const offRun = build();
    const offResult = await executeTrailieV2Turn(turnInput(), {
      ...offRun.deps, enabled: true, enableZeroDurationMicroRepair: false,
    });
    for (const r of [onResult, offResult]) {
      expect(r.attempts.length).toBe(r.telemetrySummary.attemptCount);
      // attemptCount tracks generation dispatches, never sub-dispatches.
      expect(r.telemetrySummary.attemptCount)
        .toBe(r.attempts.filter((a) => a.action === 'generation').length);
    }
    expect(onRun.micro.length).toBeGreaterThanOrEqual(1);
    expect(offRun.micro).toHaveLength(0);
  });
});
