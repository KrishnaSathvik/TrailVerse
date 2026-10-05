'use strict';

/**
 * PHASE 3B.3 — day-contained anchor repair, wiring proof.
 *
 * Real `executeTrailieV2Turn`, scripted provider replaying the live 2026-08-24
 * Canyonlands candidates. No provider, no network, no model.
 *
 * The architectural point these defend: a sub-repair is work INSIDE a generation
 * attempt, the narrowest contract runs first, each class gets exactly one
 * allowance per attempt, and containment never claims the result is good.
 */

const path = require('path');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
// NOTE: buildEvidenceBundle lives in utils/evidenceBundle. Importing it from
// the broker service yields undefined — harmless only while a test plans zero
// requirements and never resolves evidence.
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { ZERO_DURATION_REPAIR_TOOL } = require('../../utils/zeroDurationRepair');
const { DAY_CONTAINED_ANCHOR_REPAIR_TOOL } = require('../../utils/dayContainedAnchorRepair');

const CANYONLANDS = require(path.join(__dirname, 'fixtures/constructorLadder/canyonlands.json'));
const PROMPT = 'Give us three relaxed days in Canyonlands. We care most about scenery, '
  + "sunset views, and easy walks, and we don't want to spend the whole trip rushing between stops.";
const candidate = (n) => {
  const plan = JSON.parse(JSON.stringify(CANYONLANDS.attempts.find((a) => a.attempt === n).rawPlan));
  // Isolate anchor repair: the frozen first day must satisfy current day value.
  if (n === 2) plan.days[0].stops.find(s => s.type === 'viewpoint').duration = 90;
  return plan;
};

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

const toolNameOf = (req) => (req?.tools || []).map((t) => t?.name || t?.function?.name)[0] || 'create_itinerary';
const dayRefsOffered = (req) => [...String(req?.input?.[0]?.content || '')
  .matchAll(/dayRef (\d+) currently/g)].map((m) => Number(m[1]));
const zeroRefsOffered = (req) => [...String(req?.input?.[0]?.content || '')
  .matchAll(/ref (\d+) — Day/g)].map((m) => Number(m[1]));

/**
 * PHASE 4M — the model selects an identity from the catalogue the frozen
 * EvidenceBundle defines; it cannot author one. So these runs seed the bundle
 * with real places and answer with a `placeRef` read out of the instruction the
 * dispatcher actually sent.
 */
/** PHASE 4O — producer-shaped, exactly as the coverage wiring fixtures are. */
const CATALOG_PLACES = [
  // The primary plan's own stops. Since the stop-identity boundary
  // (2026-09-02), a generated experiential stop must resolve to the frozen
  // catalogue — these fixtures' plans must be evidence-consistent, exactly as
  // a real model's accepted output is.
  ['Mesa Arch Trail', ['hiking', 'hike']],
  ['Grand View Point Overlook', ['viewpoint']],
  ['Shafer Canyon Road Viewpoint', ['viewpoint']],
  ['Green River Overlook', ['viewpoint']],
  ['Slickrock Foot Trail', ['hiking', 'hike']],
  ['Pothole Point Trail', ['hiking', 'hike']],
  ['Murphy Point', ['viewpoint']],
  ['Big Spring Canyon Overlook', ['viewpoint']],
  ['Aztec Butte Trail', ['hiking', 'hike']],
];
const evIdOf = (n) => `ev:${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const EVIDENCE = CATALOG_PLACES.map(([n, activityTypes]) => ({
  evidenceId: evIdOf(n), entityId: 'nps:park:cany', topic: 'activities',
  evidenceType: 'fact', privacyScope: 'public',
  claim: { identity: `place:${n}`, text: n,
    normalizedValue: { name: n, category: 'thingstodo', activityTypes, destinationId: 'nps:park:cany' } },
}));
const offeredRefs = (req) => [...String(req?.input?.[0]?.content || '')
  .matchAll(/placeRef (\d+) — /g)].map((m) => Number(m[1]));

const goodStop = (over = {}) => ({
  durationMinutes: 120,
  timeWindow: 'Late afternoon', note: 'An unhurried walk along the canyon rim.',
  why: 'It gives the day a real experience rather than a pull-out.', ...over,
});

/** @param answerAnchor (req, dayRefs) -> dayRepairs | 'malformed' */
function scriptedDeps({ candidates, answerAnchor, answerZero } = {}) {
  const generation = []; const anchor = []; const zero = [];
  return {
    generation, anchor, zero,
    deps: {
      enableAnchorContainedRepair: true,
      enableZeroDurationMicroRepair: false,
      // One requirement so the broker is consulted; with none, the service builds
      // an EMPTY bundle inline and — correctly, after 4M — the repair declines
      // before spending anything.
      planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'optional' }],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requirements = [], requestId }) => buildEvidenceBundle({
        requestId,
        // The resolutions must REFERENCE the candidates, or the bundle keeps none
        // and the repair catalogue is empty.
        resolutions: requirements.map((r) => ({
          requirementId: r.requirementId,
          status: 'satisfied_fresh',
          evidenceIds: EVIDENCE.map((c) => c.evidenceId),
        })),
        candidates: EVIDENCE,
      }),
      now: () => new Date('2026-08-24T12:00:00.000Z'),
      newTurnId: () => 'turn-anchor-contained-repair',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async (request) => {
        const tool = toolNameOf(request);
        if (tool === DAY_CONTAINED_ANCHOR_REPAIR_TOOL.name) {
          anchor.push(request);
          const answer = answerAnchor(request, dayRefsOffered(request));
          if (answer === 'malformed') {
            return { text: '', toolCalls: [{ id: 'x', name: 'create_itinerary', input: {} }], completionStatus: 'complete', stopReason: 'stop', usage: { inputTokens: 300, outputTokens: 50 } };
          }
          return {
            text: '',
            toolCalls: [{ id: 'a1', name: DAY_CONTAINED_ANCHOR_REPAIR_TOOL.name, input: { dayRepairs: answer } }],
            completionStatus: 'complete', stopReason: 'stop',
            usage: { inputTokens: 300, outputTokens: 120 },
          };
        }
        if (tool === ZERO_DURATION_REPAIR_TOOL.name) {
          zero.push(request);
          const refs = zeroRefsOffered(request);
          const answer = answerZero ? answerZero(request, refs) : refs.map((ref) => ({ ref, durationMinutes: 60 }));
          return {
            text: '',
            toolCalls: [{ id: 'z1', name: ZERO_DURATION_REPAIR_TOOL.name, input: { durationUpdates: answer } }],
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
const run = (deps) => executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
const anchorRows = (r) => (r?.telemetrySummary?.anchorContainedRepairs || []);
const subs = (r) => (r?.telemetrySummary?.subDispatches || []);
const answerAll = (refs, over, req) => {
  const offered = offeredRefs(req);
  return refs.map((dayRef, i) => ({
    dayRef,
    operations: [{ op: 'add_stop', stop: goodStop({ placeRef: offered[i % offered.length], ...over }) }],
  }));
};

describe('the anchor branch fires and stays contained', () => {
  it('dispatches a bounded contained repair and reports zero containment breaches', async () => {
    const s = scriptedDeps({ candidates: [candidate(2), candidate(2), candidate(3)], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    const result = await run(s.deps);
    const applied = anchorRows(result).filter((x) => x.mergeStatus === 'applied');
    expect(applied.length).toBeGreaterThanOrEqual(1);
    const row = applied[0];
    expect(row.kind).toBe('missing_experience_anchor_repair');
    expect(row.affectedDayCount).toBeGreaterThan(0);
    expect(row.operationBudgetPerDay).toBe(1);
    expect(row.acceptedOperationCount).toBe(row.affectedDayCount);
    expect(row.operationTypes).toEqual(['add_stop']);
    // The invariants that make containment a guarantee rather than a hope.
    expect(row.frozenDayMutationCount).toBe(0);
    expect(row.untargetedStopMutationCount).toBe(0);
    expect(row.resolvedReasonCodes).toEqual(['missing_experience_anchor']);
    // It asked for stops, not for a plan.
    expect(s.anchor[0].tools.map((t) => t.name)).toEqual([DAY_CONTAINED_ANCHOR_REPAIR_TOOL.name]);
  });

  it('never carries plan content or a budget ticket into telemetry', async () => {
    const s = scriptedDeps({ candidates: [candidate(2), candidate(2), candidate(3)], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    const result = await run(s.deps);
    for (const row of subs(result)) {
      expect(row).not.toHaveProperty('plan');
      expect(row).not.toHaveProperty('budgetTicket');
    }
  });
});

/**
 * A candidate carrying BOTH defects at once: every duration is 0, and day 3 has
 * nothing but logistics. Built here rather than taken from the ladder fixture,
 * because no captured candidate happens to fail both ways in one attempt — and
 * the same-attempt ordering is the architectural claim worth proving.
 */
const bothDefects = () => ({
  intro: 'Three unhurried days in Canyonlands.',
  days: [
    { day: 1, label: 'Island in the Sky', stops: [
      { name: 'Mesa Arch Trail', type: 'trail', order: 1, duration: 0, note: 'Short rim walk.', why: 'An easy classic.', timeWindow: 'Morning' },
      { name: 'Grand View Point Overlook', type: 'viewpoint', order: 2, duration: 0, note: 'Canyon panorama.', why: 'Wide views.', timeWindow: 'Afternoon' },
    ] },
    { day: 2, label: 'Scenic drives', stops: [
      { name: 'Shafer Canyon Road viewpoint', type: 'viewpoint', order: 1, duration: 0, note: 'Switchback views.', why: 'Dramatic overlook.', timeWindow: 'Morning' },
      { name: 'Green River Overlook', type: 'viewpoint', order: 2, duration: 0, note: 'Sunset panorama.', why: 'Best evening light.', timeWindow: 'Evening' },
    ] },
    { day: 3, label: 'Logistics day', stops: [
      { name: 'Island in the Sky Visitor Center', type: 'visitor_center', order: 1, duration: 0, note: 'Orientation and maps.', why: 'Practical start.', timeWindow: 'Morning' },
      { name: 'Picnic area near the visitor center', type: 'picnic', order: 2, duration: 0, note: 'A quiet lunch stop.', why: 'A pause in the day.', timeWindow: 'Midday' },
    ] },
  ],
});

describe('mixed defects run narrowest-first inside ONE generation attempt', () => {
  it('dispatches duration repair FIRST, then anchor repair, in the same attempt', async () => {
    const s = scriptedDeps({ candidates: [bothDefects()], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    s.deps.enableZeroDurationMicroRepair = true;
    const result = await run(s.deps);

    const first = subs(result).filter((x) => x.attempt === 1);
    const kinds = first.map((x) => x.kind);
    // Both classes fired, inside one generation attempt, narrowest first.
    expect(kinds).toContain('zero_duration_micro_repair');
    expect(kinds).toContain('missing_experience_anchor_repair');
    expect(kinds.indexOf('zero_duration_micro_repair'))
      .toBeLessThan(kinds.indexOf('missing_experience_anchor_repair'));
    for (const row of first) expect(row.mergeStatus).toBe('applied');

    // The anchor repair consumed the candidate the duration repair produced:
    // it targets only day 3, which is where the anchor was actually missing.
    const anchorRow = first.find((x) => x.kind === 'missing_experience_anchor_repair');
    expect(anchorRow.affectedDays).toEqual([3]);
    expect(anchorRow.frozenDayMutationCount).toBe(0);
    expect(anchorRow.untargetedStopMutationCount).toBe(0);

    // Distinct, monotonic dispatch indices; generation is 1.
    const idx = first.map((x) => x.dispatchIndex);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(new Set(idx).size).toBe(idx.length);
    expect(Math.min(...idx)).toBeGreaterThan(1);

    // Two sub-dispatches, still ONE generation attempt.
    expect(result.telemetrySummary.attemptCount).toBe(1);
    expect(s.generation).toHaveLength(1);
  });

  it('leaves Day 1 untouched when the anchor defect is elsewhere', async () => {
    // The regression bar from the provisional-reveal audit: 3 of 5 historical
    // Day-1 rewrites happened while the anchor was missing on another day.
    const s = scriptedDeps({ candidates: [bothDefects()], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    s.deps.enableZeroDurationMicroRepair = true;
    const result = await run(s.deps);

    const anchorRow = subs(result).find((x) => x.kind === 'missing_experience_anchor_repair');
    expect(anchorRow.affectedDays).not.toContain(1);
    // Day 1 is frozen, and frozen days are proved byte-identical by the merge.
    expect(anchorRow.frozenDayMutationCount).toBe(0);

    const day1 = (result.canonicalPlan?.days || []).find((d) => (d.dayNumber ?? d.day) === 1);
    if (day1) {
      expect(day1.stops.map((x) => x.name))
        .toEqual(['Mesa Arch Trail', 'Grand View Point Overlook']);
    }
  });
});

describe('containment is not safety', () => {
  it('a merged repair is still judged by the full validation path', async () => {
    // A contained repair may be a bad recommendation — the 2026-08-24 "Maze
    // district" anchor was entirely inside the day that needed repair. The merge
    // accepts it; the downstream validators decide. Here the anchor is resolved
    // and the plan is STILL not declared valid until everything else passes.
    const s = scriptedDeps({ candidates: [bothDefects()], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    s.deps.enableZeroDurationMicroRepair = true;
    const result = await run(s.deps);

    const anchorRow = subs(result).find((x) => x.kind === 'missing_experience_anchor_repair');
    expect(anchorRow.mergeStatus).toBe('applied');
    expect(anchorRow.resolvedReasonCodes).toEqual(['missing_experience_anchor']);
    // The merge never asserts validity: it reports what revalidation said.
    expect(anchorRow).toHaveProperty('revalidatedStatus');
    expect(anchorRow).toHaveProperty('remainingReasonCodes');
    expect(Array.isArray(anchorRow.remainingReasonCodes)).toBe(true);
  });
});

describe('unavailable duration operator is contained', () => {
  it('does not regenerate when required duration repair is disabled', async () => {
    // candidate(1) fails structurally; with duration repair off, the anchor
    // stage is never reached, so no anchor dispatch may occur.
    const s = scriptedDeps({ candidates: [candidate(1), candidate(1), candidate(1)], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    const result = await run(s.deps);
    const attempted = anchorRows(result).filter((x) => x.mergeStatus === 'applied');
    expect(attempted).toHaveLength(0);
    expect(s.generation).toHaveLength(1);
    expect(result.attempts[0].retryability).toBe('deterministic_blocker');
  });

  it('records scope_declined rather than dispatching when scope is whole-plan', async () => {
    const s = scriptedDeps({ candidates: [candidate(2), candidate(2), candidate(3)], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    const result = await run(s.deps);
    const declined = anchorRows(result).filter((x) => x.mergeStatus === 'scope_declined');
    for (const d of declined) {
      expect(d.reasonCodes).toContain('anchor_repair_whole_plan_scope');
      // A declined scope must not have cost a provider call.
      expect(d.dispatchMs).toBeNull();
      expect(d.outputTokens).toBeNull();
    }
  });
});

describe('a bad anchor artifact is refused atomically and stops', () => {
  const bad = {
    'frozen day targeted': (_r, refs) => [{ dayRef: Math.max(...refs) + 90, operations: [{ op: 'add_stop', stop: goodStop() }] }],
    'unknown stop ref': (_r, refs) => refs.map((dayRef) => ({ dayRef, operations: [{ op: 'replace_stop', stopRef: 99, stop: goodStop() }] })),
    'forbidden op': (_r, refs) => refs.map((dayRef) => ({ dayRef, operations: [{ op: 'remove_stop', stopRef: 1, stop: goodStop() }] })),
    'over budget': (_r, refs) => refs.map((dayRef) => ({ dayRef, operations: [{ op: 'add_stop', stop: goodStop() }, { op: 'add_stop', stop: goodStop({ name: 'Second walk' }) }] })),
    'server-owned field': (_r, refs) => answerAll(refs, { parkCode: 'cany' }),
    'malformed artifact': () => 'malformed',
  };

  it.each(Object.keys(bad))('refuses on %s', async (label) => {
    const s = scriptedDeps({ candidates: [candidate(2), candidate(2), candidate(3)], answerAnchor: bad[label] });
    const result = await run(s.deps);
    for (const row of anchorRows(result)) expect(row.mergeStatus).not.toBe('applied');
    // A spent focused repair never grants a whole-plan regeneration.
    expect(s.generation).toHaveLength(1);
  });
});

describe('per-class one-shot guard', () => {
  it('never dispatches anchor repair twice for one generation attempt', async () => {
    const s = scriptedDeps({ candidates: [candidate(2), candidate(2), candidate(2)], answerAnchor: () => 'malformed' });
    const result = await run(s.deps);
    const perAttempt = {};
    for (const row of subs(result)) {
      const k = `${row.attempt}:${row.kind}`;
      perAttempt[k] = (perAttempt[k] || 0) + 1;
    }
    for (const count of Object.values(perAttempt)) expect(count).toBe(1);
    expect(s.anchor.length).toBeLessThanOrEqual(s.generation.length);
  });

  it('running one class does not consume the other class allowance', async () => {
    const s = scriptedDeps({ candidates: [candidate(1), candidate(2), candidate(3)], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    s.deps.enableZeroDurationMicroRepair = true;
    const result = await run(s.deps);
    const attempt1 = subs(result).filter((x) => x.attempt === 1).map((x) => x.kind);
    expect(new Set(attempt1).size).toBe(attempt1.length);
  });
});

/**
 * ROLLOUT GATE 6 (2026-08-31) — ANCHOR REPAIR SHIPS ON.
 *
 * This block used to assert the opposite ("makes no anchor dispatch by
 * default"). The sequence that flag was waiting on is complete: utility proof ->
 * wiring proof -> one live chained replay on a real non-empty frozen bundle
 * (A1/Canyonlands, $0.0099 for this dispatch, day 1 byte-identical,
 * existingStopMutation 0 / frozenDayMutation 0 / crossDayMove 0).
 *
 * The DEFAULT is now the contract, and so is the way back out of it: `false`
 * disables this class and nothing else. That is the rollback path, so it is
 * pinned rather than assumed.
 */
describe('ROLLOUT GATE 6 — default ON, with an independent kill switch', () => {
  it('dispatches anchor repair with the flag omitted', async () => {
    const s = scriptedDeps({ candidates: [candidate(2), candidate(2), candidate(3)], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    delete s.deps.enableAnchorContainedRepair;
    const result = await run(s.deps);
    expect(s.anchor.length).toBeGreaterThanOrEqual(1);
    expect(anchorRows(result).filter((x) => x.mergeStatus === 'applied').length).toBeGreaterThanOrEqual(1);
  });

  it('explicit false disables anchor repair independently', async () => {
    const s = scriptedDeps({ candidates: [candidate(2), candidate(2), candidate(3)], answerAnchor: (r, refs) => answerAll(refs, undefined, r) });
    s.deps.enableAnchorContainedRepair = false;
    const result = await run(s.deps);
    expect(s.anchor).toHaveLength(0);
    expect(anchorRows(result)).toHaveLength(0);
    // The kill switch rolls back to the untouched ladder, not to a broken turn.
    expect(s.generation.length).toBeGreaterThanOrEqual(1);
  });
});
