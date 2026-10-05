'use strict';

/**
 * CANONICAL PLAN EGRESS INVARIANT AUDIT.
 *
 * The 2026-08-17 Acadia artifact shipped a four-day plan with EVERY stop at
 * `duration: 0`, presented as `plain_answer` on a `trip_refinement` /
 * `general_advice` turn. (Correcting an earlier note: its ladder was not empty —
 * two attempts, the second passing. The capture used `attempts`, not the later
 * `attemptLadder` field. It passed because `zero_duration_stops` did not exist
 * until 2026-08-23.)
 *
 * This suite proves the invariant for CURRENT code:
 *
 *   A. EXISTING PLAN, UNCHANGED  — may ride along with a plain answer.
 *   B. NEW PLAN THIS TURN        — only via a full validation pass.
 *   C. EXISTING PLAN MUTATED     — only via a validated, applied patch.
 *
 * Authorship and mutation are what is constrained. A plain answer coexisting
 * with an already-persisted plan is explicitly allowed and is tested for.
 */

const fs = require('fs');
const path = require('path');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../evidenceBrokerService');

const SERVICE_SRC = fs.readFileSync(
  path.join(__dirname, '../trailieExecutionService.js'), 'utf8'
);
const ACADIA = require(
  path.join(__dirname, 'fixtures/constructorLadder/deliveredPlans.json')
).find((p) => /broad-unseen-gate-2026-08-17\/thread-1/.test(p.source));

const VALID_PLAN = require(path.join(__dirname, 'fixtures/constructorLadder/redwood.json')).canonicalPlan;

function toolCall(plan) {
  return {
    id: 'call_1',
    name: 'create_itinerary',
    input: {
      intro: 'Here is how those days could go, and why this shape works for the pace you want.',
      days: plan.days.map((day, i) => ({
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
          duration: s.duration,
        })),
      })),
    },
  };
}

function deps({ toolCalls = [], text = '' } = {}) {
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
      newTurnId: () => 'turn-egress-audit',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async (request) => {
        dispatches.push(request);
        return {
          text,
          outputText: text,
          toolCalls,
          structuredOutputStatus: toolCalls.length ? 'complete' : 'none',
          completionStatus: 'complete',
          stopReason: 'stop',
          usage: { inputTokens: 3000, outputTokens: 800, cachedInputTokens: 0 },
        };
      },
    },
  };
}

const PLAN_PROMPT = 'Give us three relaxed days in Canyonlands with sunset views and easy walks.';
const ADVICE_PROMPT = 'Roughly how bad is the traffic getting into the park on a Saturday morning in June?';

/* ------------------------------------------------------------------ */
/* B — authorship                                                      */
/* ------------------------------------------------------------------ */

describe('B — a NEW canonical plan requires a full validation pass', () => {
  test('there is exactly one writer of finalizedPlan, and it is guarded by a pass', () => {
    const writes = SERVICE_SRC.split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /^\s*finalizedPlan = /.test(line));
    // One creating write; every other assignment sets it to null.
    const creating = writes.filter(([, line]) => !/= null;\s*$/.test(line));
    expect(creating).toHaveLength(1);
    // …and it sits inside the `validation.status === 'pass'` +
    // `if (validation.finalizedPlan)` branch.
    const [lineNo] = creating[0];
    const context = SERVICE_SRC.split('\n').slice(lineNo - 16, lineNo).join('\n');
    expect(context).toMatch(/validation\.status === 'pass'/);
    expect(context).toMatch(/if \(validation\.finalizedPlan\)/);
  });

  test('canonicalPlan is derived only from finalizedPlan', () => {
    expect(SERVICE_SRC).toMatch(
      /let canonicalPlan = finalizedPlan \? finalizedPlan\.itineraryData : null;/
    );
  });

  test('the historical Acadia plan, re-authored today, never reaches the traveler', async () => {
    expect(ACADIA).toBeTruthy();
    const { deps: d } = deps({ toolCalls: [toolCall(ACADIA)], text: 'Here is a lighter-driving shape for those days.' });
    const result = await executeTrailieV2Turn({
      userMessage: PLAN_PROMPT,
      conversationContext: { history: [] },
      tripState: null,
      constraints: { durationDays: 4, pace: 'relaxed' },
      resolvedContext: {},
    }, { ...d, enabled: true });

    // The exact thing the 2026-08-17 artifact did, which must now be impossible.
    expect(result.canonicalPlan).toBeNull();
    expect(result.itineraryHash).toBeNull();
    expect(result.artifactFulfillment.fulfilled).not.toBe(true);
    const codes = result.attempts.flatMap((a) => a.validationReasonCodes);
    expect(codes).toContain('zero_duration_stops');
    for (const attempt of result.attempts) {
      expect(attempt.validationStatus).toBe('fail');
    }
  });

  test('every non-pass terminal yields a null canonical plan', async () => {
    // Prose-only output on a turn that asked for a plan: no structure, no plan.
    const { deps: d } = deps({ toolCalls: [], text: 'I can talk through the shape of those days if that helps.' });
    const result = await executeTrailieV2Turn({
      userMessage: PLAN_PROMPT,
      conversationContext: { history: [] },
      tripState: null,
      constraints: { durationDays: 3 },
      resolvedContext: {},
    }, { ...d, enabled: true });
    expect(result.canonicalPlan).toBeNull();
    expect(result.itineraryHash).toBeNull();
  });

  test('a fully valid plan DOES become canonical — the audit is not vacuous', async () => {
    const { deps: d } = deps({ toolCalls: [toolCall(VALID_PLAN)], text: 'Here is how I would shape three relaxed days.' });
    const result = await executeTrailieV2Turn({
      userMessage: 'Give us three relaxed days in Redwood with big trees and easy walks.',
      conversationContext: { history: [] },
      tripState: null,
      constraints: { durationDays: 3, pace: 'relaxed' },
      resolvedContext: {},
    }, { ...d, enabled: true });
    expect(result.canonicalPlan).toBeTruthy();
    expect(result.canonicalPlan.days).toHaveLength(3);
    expect(result.itineraryHash).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* A — coexistence (must NOT be overcorrected)                         */
/* ------------------------------------------------------------------ */

describe('A — a plain answer alongside an existing plan is allowed and never mutates it', () => {
  test('plain advice with a persisted plan present neither rebuilds nor replaces it', async () => {
    const persisted = JSON.parse(JSON.stringify(VALID_PLAN));
    const before = JSON.stringify(persisted);
    const { deps: d } = deps({
      toolCalls: [],
      text: 'Saturday mornings in June are the busiest window, so an early start makes a real difference. '
        + 'Arriving before about 8am usually means you are ahead of the queue at the entrance station.',
    });
    const result = await executeTrailieV2Turn({
      userMessage: ADVICE_PROMPT,
      conversationContext: { history: [] },
      tripState: { canonicalPlan: persisted },
      constraints: { durationDays: 3 },
      resolvedContext: {},
    }, { ...d, enabled: true });

    // The turn is answered.
    expect(result.status).toBe('complete');
    expect(String(result.response?.text || '')).toMatch(/Saturday|early start/i);
    // The existing plan is untouched — no silent mutation, no forced rebuild.
    expect(JSON.stringify(persisted)).toBe(before);
    // And this turn did not AUTHOR one.
    expect(result.canonicalPlan).toBeNull();
    // Not overcorrected: the turn was not failed merely because a plan exists.
    expect(result.terminalReason ?? null).toBeNull();
  });

  test('a plain-answer turn is never forced to produce an artifact', async () => {
    const { deps: d } = deps({ toolCalls: [], text: 'Permits are only needed for the backcountry sites, not for day hiking here.' });
    const result = await executeTrailieV2Turn({
      userMessage: 'Do we need a permit for a day hike?',
      conversationContext: { history: [] },
      tripState: { canonicalPlan: JSON.parse(JSON.stringify(VALID_PLAN)) },
      constraints: null,
      resolvedContext: {},
    }, { ...d, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.artifactFulfillment.required).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* C — mutation                                                        */
/* ------------------------------------------------------------------ */

describe('C — mutation is validated, and an unapplied mutation never looks applied', () => {
  test('a required patch that produced no plan returns the not-applied contract', async () => {
    const persisted = JSON.parse(JSON.stringify(VALID_PLAN));
    const { deps: d } = deps({ toolCalls: [], text: 'I have made the second day easier for you.' });
    const result = await executeTrailieV2Turn({
      userMessage: 'Make the second day easier.',
      conversationContext: {
        history: [{ role: 'user', content: 'Give us three relaxed days in Redwood.' }],
      },
      tripState: { canonicalPlan: persisted },
      constraints: { durationDays: 3 },
      resolvedContext: {},
    }, { ...d, enabled: true });

    // Whatever else happened, a mutation that did not apply must not claim to.
    expect(result.canonicalPlan).toBeNull();
    if (result.artifactFulfillment.required) {
      expect(result.artifactFulfillment.fulfilled).toBe(false);
      expect(String(result.response?.text || '')).not.toMatch(/I have made the second day easier/);
    }
    // The saved plan is byte-identical.
    expect(persisted).toEqual(VALID_PLAN);
  });

  test('the merged result of a patch passes through the structural gate too', () => {
    // The early structural stage is placed AFTER applyPlanPatch, so a patch
    // merged onto a zero-duration base is refused on the merged plan rather
    // than only at completeness.
    const gateIndex = SERVICE_SRC.indexOf('evaluateStructuralArtifact({ itineraryData: rawPlan');
    const patchIndex = SERVICE_SRC.indexOf('const applied = applyPlanPatch(');
    const enrichIndex = SERVICE_SRC.indexOf('enrichItineraryExposureFromEvidenceBundle(rawPlan');
    expect(patchIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(patchIndex);
    expect(enrichIndex).toBeGreaterThan(gateIndex);
  });
});

/* ------------------------------------------------------------------ */
/* Route + legacy surfaces                                             */
/* ------------------------------------------------------------------ */

describe('route-layer projection mirrors the funnel and never authors', () => {
  const ROUTE_SRC = fs.readFileSync(path.join(__dirname, '../../routes/ai.js'), 'utf8');

  test('every chat itinerary projection reads v2Result.canonicalPlan', () => {
    const projections = ROUTE_SRC.split('\n').filter((l) => /^\s*itinerary:/.test(l));
    expect(projections.length).toBeGreaterThan(0);
    for (const line of projections) {
      expect(line).toMatch(/v2Result\.canonicalPlan/);
    }
  });

  test('the legacy buildCanonicalOutbound plan builder is unreachable from any route', () => {
    // It builds a plan document straight from `processed.itineraryData` with no
    // V2 validation. It survives only as a test seam; if a route ever calls it,
    // this test must fail and the call must be audited.
    const callSites = ROUTE_SRC.split('\n')
      .filter((l) => /buildCanonicalOutbound/.test(l))
      .filter((l) => !/^async function |^module\.exports/.test(l.trim()));
    expect(callSites).toEqual([]);
  });

  test('the MCP endpoint delegates to the canonical planner and never promotes legacy schedules', () => {
    const planner = fs.readFileSync(
      path.join(__dirname, '../fastItineraryPlannerService.js'), 'utf8'
    );
    // The adapter has no separate provider or curated scheduling path.
    expect(planner).not.toMatch(/executeResponses|createResponsesRequest|fastPlannerStops|buildDeterministicItinerary/);
    expect(planner).toContain('runTrailieFromPreparedContext');
    expect(planner).toContain('result.canonicalPlan');
    // Its output is stored under formData.lastItinerary, which only the planner
    // route and the planner itself read — it never seeds tripState.canonicalPlan.
    const readers = ROUTE_SRC.split('\n').filter((l) => /lastItinerary/.test(l));
    expect(readers.length).toBeGreaterThan(0);
    expect(ROUTE_SRC).not.toMatch(/canonicalPlan\s*[:=]\s*[^;\n]*lastItinerary/);
  });
});
