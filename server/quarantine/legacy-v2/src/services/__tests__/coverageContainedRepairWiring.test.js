'use strict';

/**
 * PHASE 4J — add-only day-contained coverage repair, wiring proof.
 *
 * Real `executeTrailieV2Turn`, scripted provider. No network, no model.
 *
 * The third machine-owned sub-dispatch, default OFF. What these defend:
 *
 *   - it is work INSIDE one generation attempt, third in a narrowest-first chain;
 *   - it consumes the candidate the ANCHOR step produced, not the original;
 *   - it inherits the parent attempt's FROZEN EvidenceBundle and fetches nothing;
 *   - `mergeStatus: applied` is a containment statement, never a safety one —
 *     the merged plan goes through the whole downstream stack like any candidate;
 *   - and the invariant that distinguishes this class from anchor repair:
 *     `existingStopMutationCount === 0`. Anchor repair may replace a stop.
 *     Coverage repair may not touch one.
 */

const path = require('path');
const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
// NOTE: buildEvidenceBundle lives in utils/evidenceBundle. Importing it from
// the broker service yields undefined — harmless only while a test plans zero
// requirements and never resolves evidence.
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');
const { ZERO_DURATION_REPAIR_TOOL } = require('../../../../../src/utils/zeroDurationRepair');
const { DAY_CONTAINED_ANCHOR_REPAIR_TOOL } = require('../../../../../src/utils/dayContainedAnchorRepair');
const { DAY_CONTAINED_COVERAGE_REPAIR_TOOL } = require('../../../../../src/utils/dayContainedCoverageRepair');
const { hashPayload } = require('../../../../../src/utils/canonicalResponse');
const { buildEvidenceBoundRepairCandidates } = require('../../../../../src/utils/evidenceBoundRepairCandidates');

// Deliberately asks for nothing the fixtures do not contain — a
// `missing_requested_*` obligation would fail the turn for reasons unrelated to
// coverage and mask what these tests are measuring.
const PROMPT = 'Give us three full sightseeing days in Canyonlands.';

const stop = (name, type, duration, over = {}) => ({
  name, type, duration, order: 1, note: `${name} note.`, why: `${name} why.`, timeWindow: 'Morning', ...over,
});

/**
 * A1-SHAPED FIXTURE: day 1 is a full day and stays frozen; days 2 and 3 each
 * have one short experience whose only companions are transport and a meal —
 * `single_short_experience_supporting_only`, exactly the live A1 diagnosis.
 */
const coverageDeficient = () => ({
  intro: 'Three unhurried days in Canyonlands.',
  days: [
    { day: 1, label: 'Island in the Sky', stops: [
      stop('Mesa Arch Trail', 'trail', 120),
      stop('Grand View Point Overlook', 'viewpoint', 120, { order: 2, timeWindow: 'Afternoon' }),
    ] },
    { day: 2, label: 'Needles', stops: [
      stop('Cave Spring Trail', 'trail', 45),
      stop('Parking at the Needles trailhead', 'logistics', 20, { order: 2 }),
    ] },
    { day: 3, label: 'Sunset', stops: [
      stop('Roadside Ruin Trail', 'trail', 40),
      stop('Picnic near the campground', 'picnic', 45, { order: 2, timeWindow: 'Midday' }),
    ] },
  ],
});

/** Same plan, but every duration is zero and day 3 has no experience at all. */
const allThreeDefects = () => ({
  intro: 'Three unhurried days in Canyonlands.',
  days: [
    { day: 1, label: 'Island in the Sky', stops: [
      stop('Mesa Arch Trail', 'trail', 0), stop('Grand View Point Overlook', 'viewpoint', 0, { order: 2 }),
    ] },
    { day: 2, label: 'Needles', stops: [
      stop('Cave Spring Trail', 'trail', 0), stop('Parking at the Needles trailhead', 'logistics', 0, { order: 2 }),
    ] },
    { day: 3, label: 'Logistics', stops: [
      stop('Needles Visitor Center', 'visitor_center', 0), stop('Picnic area', 'picnic', 0, { order: 2 }),
    ] },
  ],
});

function toolResult(rawPlan) {
  return {
    text: rawPlan.intro,
    toolCalls: [{
      id: 'call_1',
      name: 'create_itinerary',
      input: {
        intro: rawPlan.intro,
        days: rawPlan.days.map((day, i) => ({
          id: `d${i + 1}`, dayNumber: day.day ?? i + 1, label: day.label,
          stops: (day.stops || []).map((s, j) => ({
            id: `d${i + 1}s${j + 1}`, order: s.order ?? j + 1, type: s.type, name: s.name,
            note: s.note || '', startTime: '', timeWindow: s.timeWindow || null, duration: s.duration,
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

const toolNameOf = (req) => (req?.tools || []).map((t) => t?.name || t?.function?.name)[0] || 'create_itinerary';
const coverageRefs = (req) => [...String(req?.input?.[0]?.content || '')
  .matchAll(/dayRef (\d+) /g)].map((m) => Number(m[1]));
const anchorRefs = (req) => [...String(req?.input?.[0]?.content || '')
  .matchAll(/dayRef (\d+) currently/g)].map((m) => Number(m[1]));
const zeroRefs = (req) => [...String(req?.input?.[0]?.content || '')
  .matchAll(/ref (\d+) — Day/g)].map((m) => Number(m[1]));

/**
 * PHASE 4M — the model selects an identity from the catalogue the frozen bundle
 * defines. These runs therefore seed the bundle with real places and answer with
 * `placeRef`s taken from the same catalogue the dispatcher builds.
 */
/**
 * PHASE 4O — producer-shaped: `category` is the source bucket and `activityTypes`
 * is what the machine classifies from. `category: 'place'` with no activity types
 * is the real live shape that no longer yields a catalogue at all.
 */
const CATALOG_PLACES = [
  // The primary plan's own stops — evidence-consistent since the stop-identity
  // boundary (2026-09-02), exactly as a real model's accepted output is.
  ['Mesa Arch Trail', ['hiking', 'hike']],
  ['Grand View Point Overlook', ['viewpoint']],
  ['Cave Spring Trail', ['hiking', 'hike']],
  ['Roadside Ruin Trail', ['hiking', 'hike']],
  ['Pothole Point Trail', ['hiking', 'hike']],
  ['Big Spring Canyon Overlook', ['viewpoint']],
  ['Slickrock Foot Trail', ['hiking', 'hike']],
  ['Murphy Point', ['viewpoint']],
  ['Grand View Point Trail', ['hiking', 'hike']],
  ['The Maze District', ['hiking', 'hike']],
];
const evId = (n) => `ev:${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const EVIDENCE = CATALOG_PLACES.map(([n, activityTypes]) => ({
  evidenceId: evId(n), entityId: 'nps:park:cany', topic: 'activities',
  evidenceType: 'fact', privacyScope: 'public',
  claim: { identity: `place:${n}`, text: n,
    normalizedValue: { name: n, category: 'thingstodo', activityTypes, destinationId: 'nps:park:cany' } },
}));
/** The refs the dispatcher will offer, read out of the instruction it sends. */
const offeredRefs = (req) => [...String(req?.input?.[0]?.content || '')
  .matchAll(/placeRef (\d+) — /g)].map((m) => Number(m[1]));

const addition = (placeRef, over = {}) => ({
  op: 'add_stop',
  stop: {
    placeRef, durationMinutes: 90, timeWindow: 'Afternoon',
    note: 'An unhurried walk.', why: 'It gives the day a second real experience.',
    ...over,
  },
});
const oneEach = (refs, req) => {
  const offered = offeredRefs(req);
  return refs.map((dayRef, i) => ({ dayRef, operations: [addition(offered[i % offered.length])] }));
};

function scriptedDeps({ candidates, answerCoverage, answerAnchor, answerZero, evidenceCandidates = EVIDENCE } = {}) {
  const generation = []; const coverage = []; const anchor = []; const zero = [];
  const bundles = [];
  return {
    generation, coverage, anchor, zero, bundles,
    deps: {
      enableCoverageContainedRepair: true,
      enableAnchorContainedRepair: false,
      enableZeroDurationMicroRepair: false,
      // One requirement so the broker is actually consulted; with none, the
      // service builds an EMPTY bundle inline and — correctly, after 4M — both
      // repairs decline before spending anything.
      planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'optional' }],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requirements = [], requestId }) => {
        const bundle = buildEvidenceBundle({
          requestId,
          // The resolutions must REFERENCE the candidates, or the bundle keeps none
          // of them and the repair catalogue is empty.
          resolutions: requirements.map((r) => ({
            requirementId: r.requirementId,
            status: 'satisfied_fresh',
            evidenceIds: evidenceCandidates.map((c) => c.evidenceId),
          })),
          candidates: evidenceCandidates,
        });
        bundles.push(bundle);
        return bundle;
      },
      now: () => new Date('2026-08-30T12:00:00.000Z'),
      newTurnId: () => 'turn-coverage-contained-repair',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async (request) => {
        const tool = toolNameOf(request);
        if(tool === 'repair_plan_viability') return require('../../../../../tests/support/viabilityResponse').viabilityResponse(request);
        if (tool === DAY_CONTAINED_COVERAGE_REPAIR_TOOL.name) {
          coverage.push(request);
          const answer = answerCoverage(request, coverageRefs(request));
          if (answer === 'malformed') {
            return { text: '', toolCalls: [{ id: 'x', name: 'create_itinerary', input: {} }], completionStatus: 'complete', stopReason: 'stop', usage: { inputTokens: 300, outputTokens: 50 } };
          }
          return {
            text: '',
            toolCalls: [{ id: 'c1', name: DAY_CONTAINED_COVERAGE_REPAIR_TOOL.name, input: { dayRepairs: answer } }],
            completionStatus: 'complete', stopReason: 'stop', usage: { inputTokens: 300, outputTokens: 140 },
          };
        }
        if (tool === DAY_CONTAINED_ANCHOR_REPAIR_TOOL.name) {
          anchor.push(request);
          const answer = answerAnchor(request, anchorRefs(request));
          return {
            text: '',
            toolCalls: [{ id: 'a1', name: DAY_CONTAINED_ANCHOR_REPAIR_TOOL.name, input: { dayRepairs: answer } }],
            completionStatus: 'complete', stopReason: 'stop', usage: { inputTokens: 300, outputTokens: 120 },
          };
        }
        if (tool === ZERO_DURATION_REPAIR_TOOL.name) {
          zero.push(request);
          const refs = zeroRefs(request);
          const answer = answerZero ? answerZero(request, refs) : refs.map((ref) => ({ ref, durationMinutes: 60 }));
          return {
            text: '',
            toolCalls: [{ id: 'z1', name: ZERO_DURATION_REPAIR_TOOL.name, input: { durationUpdates: answer } }],
            completionStatus: 'complete', stopReason: 'stop', usage: { inputTokens: 200, outputTokens: 40 },
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
  constraints: { parkCode: 'cany', pace: 'moderate', dates: { numDays: 3 }, planningState: { mobility: {}, preferences: { pace: 'moderate' } } },
  resolvedContext: {},
});
const run = (deps) => executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
const rows = (r) => (r?.telemetrySummary?.coverageContainedRepairs || []);
const subs = (r) => (r?.telemetrySummary?.subDispatches || []);

/**
 * ROLLOUT GATE 6 (2026-08-31) — COVERAGE REPAIR SHIPS ON, COUPLED TO ANCHOR.
 *
 * This block used to assert `default OFF`. Gate 6 closed the last item — one
 * live chained replay on a real non-empty frozen bundle — and the two creation
 * repairs ship as ONE unit, because anchor can REVEAL the very defect coverage
 * exists to repair. Enabling anchor alone would sometimes convert a cheap
 * contained sequence into anchor repair -> coverage failure -> the full ladder.
 *
 * Coupled defaults, independent kill switches. Both halves are pinned here.
 */
describe('ROLLOUT GATE 6 — default ON, with an independent kill switch', () => {
  it('dispatches coverage repair with the flag omitted', async () => {
    const s = scriptedDeps({ candidates: [coverageDeficient()], answerCoverage: (r, refs) => oneEach(refs, r) });
    delete s.deps.enableCoverageContainedRepair;
    const result = await run(s.deps);
    expect(s.coverage.length).toBeGreaterThanOrEqual(1);
    expect(rows(result).filter((x) => x.mergeStatus === 'applied').length).toBeGreaterThanOrEqual(1);
  });

  it('disabling required coverage blocks an incomplete multi-stage repair', async () => {
    const s = scriptedDeps({
      candidates: [allThreeDefects()],
      answerCoverage: (r, refs) => oneEach(refs, r),
      answerAnchor: (r, refs) => {
        const offered = offeredRefs(r);
        return refs.map((dayRef, i) => ({
          dayRef,
          operations: [{ op: 'add_stop', stop: { placeRef: offered[i % offered.length], durationMinutes: 120, note: 'An unhurried loop.', why: 'A real experience for the day.', timeWindow: 'Morning' } }],
        }));
      },
    });
    s.deps.enableCoverageContainedRepair = false;
    delete s.deps.enableAnchorContainedRepair;
    s.deps.enableZeroDurationMicroRepair = true;
    const result = await run(s.deps);
    // The remaining anchor alone cannot fix this mixed-defect transaction.
    expect(s.coverage).toHaveLength(0);
    expect(rows(result)).toHaveLength(0);
    expect(s.anchor).toHaveLength(0);
    expect(result.canonicalPlan).toBeNull();
  });
});

/**
 * THE PRODUCTION PATH, with nothing configured at all.
 *
 * The chain test below sets both flags explicitly, which proves the sequence but
 * no longer proves the DEFAULT. This is the same fixture with every repair flag
 * omitted — what a caller that has never heard of these flags now gets.
 */
describe('the shipped default path', () => {
  it('caps the default chain at two focused dispatches', async () => {
    const s = scriptedDeps({
      candidates: [allThreeDefects()],
      answerCoverage: (r, refs) => oneEach(refs, r),
      answerAnchor: (r, refs) => {
        const offered = offeredRefs(r);
        return refs.map((dayRef, i) => ({
          dayRef,
          operations: [{ op: 'add_stop', stop: { placeRef: offered[i % offered.length], durationMinutes: 120, note: 'An unhurried loop.', why: 'A real experience for the day.', timeWindow: 'Morning' } }],
        }));
      },
    });
    delete s.deps.enableCoverageContainedRepair;
    delete s.deps.enableAnchorContainedRepair;
    delete s.deps.enableZeroDurationMicroRepair;
    const result = await run(s.deps);

    const first = subs(result).filter((x) => x.attempt === 1);
    expect(first.map((x) => x.kind)).toEqual([
      'zero_duration_micro_repair',
      'plan_viability_repair',
    ]);
    // One shot per class, and all of it inside a single generation attempt.
    expect(first.map((x) => x.dispatchIndex)).toEqual([2, 3]);
    expect(result.telemetrySummary.attemptCount).toBe(1);
  });
});

describe('the A1-shaped case: coverage deficient after the anchor is fine', () => {
  it('dispatches a bounded contained repair and reports zero containment breaches', async () => {
    const s = scriptedDeps({ candidates: [coverageDeficient()], answerCoverage: (r, refs) => oneEach(refs, r) });
    const result = await run(s.deps);
    const applied = rows(result).filter((x) => x.mergeStatus === 'applied');
    expect(applied.length).toBeGreaterThanOrEqual(1);
    const row = applied[0];
    expect(row.kind).toBe('insufficient_day_coverage_repair');
    expect(row.affectedDays).toEqual([2, 3]);
    expect(row.operationBudgetPerDay).toBe(1);
    expect(row.returnedOperationCount).toBe(2);
    expect(row.acceptedOperationCount).toBe(2);
    expect(row.resolvedReasonCodes).toEqual(['insufficient_day_coverage']);
    // The three containment invariants, measured rather than claimed.
    expect(row.frozenDayMutationCount).toBe(0);
    expect(row.crossDayMoveCount).toBe(0);
    // The one that distinguishes this class from anchor repair.
    expect(row.existingStopMutationCount).toBe(0);
    // It asked for stops, not for a plan.
    expect(s.coverage[0].tools.map((t) => t.name)).toEqual([DAY_CONTAINED_COVERAGE_REPAIR_TOOL.name]);
  });

  it('carries the full telemetry contract', async () => {
    const s = scriptedDeps({ candidates: [coverageDeficient()], answerCoverage: (r, refs) => oneEach(refs, r) });
    const row = rows(await run(s.deps))[0];
    for (const field of [
      'kind', 'dispatchIndex', 'affectedDays', 'operationBudgetPerDay', 'operationBudgetTotal', 'returnedOperationCount',
      'acceptedOperationCount', 'mergeStatus', 'frozenDayMutationCount', 'existingStopMutationCount',
      'crossDayMoveCount', 'evidenceBundlePresent', 'evidenceBundleFingerprint',
      'resolvedReasonCodes', 'remainingReasonCodes', 'dispatchMs', 'inputTokens', 'outputTokens', 'costUsd',
    ]) {
      expect(row).toHaveProperty(field);
    }
  });

  it('never carries plan content or a budget ticket into telemetry', async () => {
    const s = scriptedDeps({ candidates: [coverageDeficient()], answerCoverage: (r, refs) => oneEach(refs, r) });
    const result = await run(s.deps);
    for (const row of subs(result)) {
      expect(row).not.toHaveProperty('plan');
      expect(row).not.toHaveProperty('budgetTicket');
    }
  });
});

describe('frozen evidence is INHERITED from the parent generation attempt', () => {
  it('sees precisely that bundle and fetches nothing', async () => {
    const s = scriptedDeps({ candidates: [coverageDeficient()], answerCoverage: (r, refs) => oneEach(refs, r) });
    const result = await run(s.deps);
    const row = rows(result).find((x) => x.mergeStatus === 'applied');
    expect(row.evidenceBundlePresent).toBe(true);
    // IDENTITY, not merely presence: the fingerprint must be the one the turn
    // froze. `newTurnId` is fixed by the harness and this turn plans no
    // requirements, so the frozen bundle is exactly this.
    expect(row.evidenceBundleFingerprint).toBe(hashPayload({
      requestId: 'turn-coverage-contained-repair',
      evidenceIds: [...EVIDENCE.map((c) => c.evidenceId)].sort(),
    }));
    // The broker was consulted ONCE, for the turn — never again by the repair.
    expect(s.bundles).toHaveLength(1);
  });

});

describe('existing stops are immutable through the whole wired path', () => {
  it('every original structure survives; affected-day dependent copy is invalidated', async () => {
    const before = coverageDeficient();
    const s = scriptedDeps({ candidates: [before], answerCoverage: (r, refs) => oneEach(refs, r) });
    const result = await run(s.deps);
    const plan = result.canonicalPlan;
    expect(plan).toBeTruthy();
    for (const [i, day] of before.days.entries()) {
      const after = plan.days[i];
      for (const original of day.stops) {
        const match = (after.stops || []).find((x) => x.name === original.name);
        expect(match).toBeTruthy();
        expect(match.duration).toBe(original.duration);
        // Canonical evidence normalizes trail to hike before the repair.
        expect(match.type).toBe(original.type === 'trail' ? 'hike' : original.type);
        expect(match.note).toBe(i === 0 ? original.note : '');
      }
    }
  });
});

describe('budget enforcement', () => {
  it('rejects two additions on one day to prevent padding', async () => {
    const s = scriptedDeps({
      candidates: [coverageDeficient()],
      // Both days answered — leaving one deficient would make the merge
      // "ineffective" for reasons unrelated to the budget.
      answerCoverage: (r, refs) => {
        const o = offeredRefs(r);
        return [
          { dayRef: refs[0], operations: [addition(o[0]), addition(o[1], { durationMinutes: 60 })] },
          { dayRef: refs[1], operations: [addition(o[2])] },
        ];
      },
    });
    const row = rows(await run(s.deps))[0];
    expect(row.acceptedOperationCount).toBe(0);
    expect(row.mergeStatus).toBe('merge_refused');
  });

  it('refuses a third addition atomically', async () => {
    const s = scriptedDeps({
      candidates: [coverageDeficient()],
      answerCoverage: (r, refs) => {
        const o = offeredRefs(r);
        return [{ dayRef: refs[0], operations: [addition(o[0]), addition(o[1]), addition(o[2])] }];
      },
    });
    const result = await run(s.deps);
    const row = rows(result)[0];
    expect(row.mergeStatus).toBe('merge_refused');
    expect(row.acceptedOperationCount).toBe(0);
    expect(row.reasonCodes).toContain('coverage_repair_operation_budget');
  });
});

describe('all failing days can have bounded local operations', () => {
  it('uses one viability dispatch while preserving stop-local containment', async () => {
    // Thin but evidence-consistent: real catalogued trails, just too short —
    // the stop-identity boundary would (correctly) reject invented names
    // before coverage repair could ever see the plan.
    const thinTrails = ['Pothole Point Trail', 'Cave Spring Trail', 'Roadside Ruin Trail'];
    const everyDayThin = () => ({
      intro: 'Three thin days.',
      days: [1, 2, 3].map((d) => ({
        day: d, label: `Day ${d}`,
        stops: [stop(thinTrails[d - 1], 'trail', 40), stop(`Parking ${d}`, 'logistics', 20, { order: 2 })],
      })),
    });
    const s = scriptedDeps({ candidates: [everyDayThin()], answerCoverage: (r, refs) => oneEach(refs, r) });
    const result = await run(s.deps);
    expect(s.coverage).toHaveLength(0);
    const row = subs(result).find(r=>r.repairOperator==='PLAN_VIABILITY_EDIT');
    expect(row.mergeStatus).toBe('applied');
    expect(row.affectedDays).toEqual([1,2,3]);
    expect(row.acceptedOperationCount).toBeLessThanOrEqual(3);
    expect(result.status).toBe('complete');
  });
});

describe('one-shot guard', () => {
  it('does not dispatch coverage a second time when the defect survives its own repair', async () => {
    // A PARTIAL repair: it answers one thin day and leaves the other thin, so
    // the targeted code survives its own repair. That is the realistic shape —
    // any addition at all clears a day, so a surviving defect means a day the
    // model did not answer.
    const s = scriptedDeps({
      candidates: [coverageDeficient(), coverageDeficient(), coverageDeficient()],
      answerCoverage: (r, refs) => [{ dayRef: refs[0], operations: [addition(offeredRefs(r)[0])] }],
    });
    const result = await run(s.deps);
    // One coverage dispatch INSIDE attempt 1. A later generation attempt is a
    // new candidate and earns its own allowance, exactly as anchor repair does.
    const inAttemptOne = subs(result)
      .filter((x) => x.attempt === 1 && x.kind === 'insufficient_day_coverage_repair');
    expect(inAttemptOne).toHaveLength(1);
    const row = rows(result)[0];
    // The incomplete transaction is rejected before replacing the current candidate.
    expect(row.mergeStatus).toBe('merge_refused');
    expect(row.reasonCodes).toContain('repair_projected_validation_failed');
    expect(result.terminalReason).toBe('insufficient_day_coverage');
  });
});

describe('a malformed repair artifact falls back to the ordinary ladder', () => {
  it('leaves the pre-coverage candidate untouched', async () => {
    const s = scriptedDeps({
      candidates: [coverageDeficient(), coverageDeficient(), coverageDeficient()],
      answerCoverage: () => 'malformed',
    });
    const result = await run(s.deps);
    const row = rows(result)[0];
    expect(row.mergeStatus).toBe('artifact_malformed');
    expect(row.acceptedOperationCount).toBe(0);
    // The ordinary ladder still ran: more than one generation dispatch happened.
    expect(s.generation).toHaveLength(1);
  });
});

describe('mergeStatus applied is a containment statement, not a safety one', () => {
  /**
   * MAZE-STYLE. The repair adds a remote, access-dependent place that the frozen
   * bundle cannot certify. Containment succeeds — the merge is add-only and
   * touches nothing — and the merged plan must still be judged by the whole
   * downstream stack rather than accepted because the merge was clean.
   */
  it('a merged plan is revalidated end to end, and an unverifiable dependency is not silently accepted', async () => {
    const s = scriptedDeps({
      candidates: [coverageDeficient(), coverageDeficient(), coverageDeficient()],
      answerCoverage: (r, refs) => {
        const o = offeredRefs(r);
        return refs.map((dayRef, i) => ({
          dayRef,
          operations: [addition(o[i % o.length], {
            durationMinutes: 240,
            note: 'Reached by unmaintained dirt roads; a high-clearance 4WD vehicle and a backcountry permit are required.',
            why: 'A remote landscape few travelers reach.',
          })],
        }));
      },
    });
    const result = await run(s.deps);
    const row = rows(result)[0];
    // Downstream validation now rejects this proposed transaction before applying it.
    expect(row.mergeStatus).toBe('merge_refused');
    expect(row.reasonCodes).toContain('repair_projected_validation_failed');
    expect(row.projectedRemainingReasonCodes).toContain('unverified_access_dependency');
    expect(row.acceptedOperationCount).toBe(0);
    expect(result.canonicalPlan).toBeNull();
  });
});

describe('the full same-attempt chain', () => {
  it('duration and combined viability use two dispatches', async () => {
    const s = scriptedDeps({
      candidates: [allThreeDefects()],
      answerCoverage: (r, refs) => oneEach(refs, r),
      answerAnchor: (r, refs) => {
        const offered = offeredRefs(r);
        return refs.map((dayRef, i) => ({
          dayRef, operations: [{ op: 'add_stop', stop: { placeRef: offered[i % offered.length], durationMinutes: 120, note: 'An unhurried loop.', why: 'A real experience for the day.', timeWindow: 'Morning' } }],
        }));
      },
    });
    s.deps.enableZeroDurationMicroRepair = true;
    s.deps.enableAnchorContainedRepair = true;
    const result = await run(s.deps);

    const first = subs(result).filter((x) => x.attempt === 1);
    expect(first.map((x) => x.kind)).toEqual([
      'zero_duration_micro_repair',
      'plan_viability_repair',
    ]);
    // Dispatch axis: generation is 1, then one dispatch per repair class.
    expect(first.map((x) => x.dispatchIndex)).toEqual([2, 3]);
    // Attempt axis is untouched — all of this is work inside attempt 1.
    expect(result.telemetrySummary.attemptCount).toBe(1);
  });
});

/**
 * PHASE 4M — THE RECOMMENDATION BOUNDARY, end to end.
 *
 * The frozen bundle now fixes both what is true AND which identities a repair may
 * introduce. The consequence the audit predicted: the Phase 4K run, whose current
 * bundle came back with `evidenceCount: 0`, would no longer let the model invent
 * stops inside an evidence boundary that contains no places. It declines, before
 * spending anything.
 */
describe('the frozen bundle defines the recommendation boundary', () => {
  it('offers a catalogue and records which refs the model chose', async () => {
    const s = scriptedDeps({ candidates: [coverageDeficient()], answerCoverage: (r, refs) => oneEach(refs, r) });
    const row = rows(await run(s.deps)).find((x) => x.mergeStatus === 'applied');
    expect(row.repairCandidateCount).toBeGreaterThan(0);
    expect(row.repairCandidateSetFingerprint).toHaveLength(64);
    expect(row.selectedPlaceRefs.length).toBe(row.acceptedOperationCount);
    for (const ref of row.selectedPlaceRefs) {
      expect(ref).toBeGreaterThanOrEqual(1);
      expect(ref).toBeLessThanOrEqual(row.repairCandidateCount);
    }
  });

  it('the instruction offers only catalogued places, and no way to name another', async () => {
    const s = scriptedDeps({ candidates: [coverageDeficient()], answerCoverage: (r, refs) => oneEach(refs, r) });
    await run(s.deps);
    const sent = String(s.coverage[0].input[0].content);
    expect(sent).toMatch(/Choose from these places only, by placeRef/);
    for (const ref of offeredRefs(s.coverage[0])) expect(ref).toBeGreaterThanOrEqual(1);
    const stopSchema = s.coverage[0].tools[0].input_schema
      .properties.dayRepairs.items.properties.operations.items.properties.stop;
    expect(stopSchema.properties.name).toBeUndefined();
  });

  it('an invented identity cannot survive the merge', async () => {
    const s = scriptedDeps({
      candidates: [coverageDeficient(), coverageDeficient(), coverageDeficient()],
      answerCoverage: (_r, refs) => refs.map((dayRef) => ({
        dayRef,
        operations: [{ op: 'add_stop', stop: {
          name: 'Cathedral Rim Overlook Loop', type: 'trail', durationMinutes: 90,
          note: 'An invented place.', why: 'Nothing vouches for this.',
        } }],
      })),
    });
    const row = rows(await run(s.deps))[0];
    expect(row.mergeStatus).toBe('merge_refused');
    expect(row.reasonCodes).toContain('coverage_repair_unknown_place_ref');
    expect(row.acceptedOperationCount).toBe(0);
  });

  it('an empty evidence catalogue declines BEFORE any provider dispatch', async () => {
    const s = scriptedDeps({
      candidates: [coverageDeficient()],
      answerCoverage: (r, refs) => oneEach(refs, r),
      evidenceCandidates: [],
    });
    const result = await run(s.deps);
    // The Phase 4K situation: a bundle with no places in it.
    expect(s.coverage).toHaveLength(0);
    expect(result.status).toBe('evidence_incomplete');
    expect(s.coverage).toHaveLength(0);

  });
});

describe('day-value repair acceptance gate', () => {
  it('K: coalesces anchor and coverage into one operator, with no regeneration or Astra', async () => {
    const plan = coverageDeficient();
    plan.days[2].stops = [stop('Information Desk', 'logistics', 30)];
    plan.intro = 'No specific trail is available for these days.';
    const s = scriptedDeps({ candidates: [plan], answerCoverage: (r, refs) => oneEach(refs, r),
      answerAnchor: (r, refs) => refs.map(dayRef => ({ dayRef, operations: [addition(offeredRefs(r)[0], { durationMinutes: 30 })] })),
    });
    s.deps.enableAnchorContainedRepair = true;
    const result = await run(s.deps);
    const dispatched = subs(result).filter(row => row.dispatched);
    expect(dispatched.map(row => row.kind)).toEqual(['plan_viability_repair']);
    expect(result.status).toBe('complete');
    expect(s.generation).toHaveLength(1);
    expect(result.attempts.every(attempt => !/astra/.test(attempt.model))).toBe(true);
    expect(JSON.stringify(result.canonicalPlan)).not.toContain('No specific trail');
    for (const row of dispatched) {
      expect(row.operationBudgetTotal).toBe(row.operationBudgetPerDay * (row.affectedDayCount ?? row.scopeCount));
      expect(row.acceptedOperationCount).toBeLessThanOrEqual(row.operationBudgetTotal);
    }
  });
  it('L/N: persistent coverage stops and preserves its terminal reason and unsaved-plan message', async () => {
    const s = scriptedDeps({ candidates: [coverageDeficient()], answerCoverage: (r, refs) => {
      const offered = offeredRefs(r);
      return refs.map((dayRef, index) => ({ dayRef, operations: [addition(offered[index], { durationMinutes: 1 })] }));
    } });
    const result = await run(s.deps);
    expect(s.coverage).toHaveLength(1);
    expect(s.generation).toHaveLength(1);
    expect(result.terminalReason).toBe('insufficient_day_coverage');
    expect(result.response.text).toMatch(/no new plan was saved/i);
    expect(result.canonicalPlan).toBeNull();
  });
});
test('new coverage can follow a resolved identity family despite dispatch preference order', async () => {
  const plan = coverageDeficient();
  plan.days[1].stops[0].name = 'Uncatalogued Ridge';
  const s = scriptedDeps({ candidates: [plan], answerCoverage: (r, refs) => oneEach(refs, r) });
  const original = s.deps.executeResponses;
  s.deps.executeResponses = async request => {
    if (toolNameOf(request) !== 'substitute_illegal_stops') return original(request);
    const match = String(request.input[0].content).match(/dayRef (\d+), stopRef (\d+)/);
    return { toolCalls: [{ name: 'substitute_illegal_stops', input: { substitutions: [{
      dayRef: Number(match[1]), stopRef: Number(match[2]), replacement: {
        placeRef: offeredRefs(request)[0], note: 'Explore the viewpoint.', why: 'A grounded outing for the day.',
      },
    }] } }], completionStatus: 'complete', usage: { inputTokens: 200, outputTokens: 100 } };
  };
  s.deps.enableStopSubstitutionRepair = true;
  const result = await run(s.deps);
  expect(subs(result).filter(row => row.dispatched).map(row => row.kind)).toEqual([
    'legal_stop_substitution_repair', 'insufficient_day_coverage_repair',
  ]);
  expect(s.generation).toHaveLength(1);
  expect(result.status).toBe('complete');
});
