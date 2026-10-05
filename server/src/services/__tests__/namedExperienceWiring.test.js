'use strict';

/**
 * Phase 9C.1D.5B — explicit named-experience preservation, wired end to end.
 *
 * Real `executeTrailieV2Turn`, scripted provider, no network; evidence is the
 * REAL cached Yosemite activities catalogue. Pattern lifted from
 * operationalDirectivesWiring.test.js. What is asserted is what generation was
 * actually SENT on each attempt and what the turn finally accepted.
 */

const path = require('path');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');

const FIXTURE = require(path.join(__dirname, 'fixtures/namedExperience/yose-activities-2026-09-15.json'));

const stop = (name, type, duration, order) => ({
  id: `s-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  order, type, name, duration,
  note: `Spend real time at ${name}.`, why: `${name} fits a relaxed valley day.`, startTime: '', timeWindow: 'Morning',
});

function toolResult(stops) {
  // Provider-normalized shape, as e2eProductRegression.test.js scripts it.
  const input = {
    intro: 'A relaxed Yosemite day with room to linger.',
    days: [{ id: 'd1', dayNumber: 1, label: 'Yosemite viewpoints and a walk', stops }],
  };
  return {
    provider: 'openai', model: 'gpt-5.6-terra', outputText: '',
    toolCalls: [{ id: 'call_1', name: 'create_itinerary', input, rawArgs: JSON.stringify(input) }],
    completionStatus: 'complete', stopReason: 'stop', refusal: null,
    usage: { inputTokens: 4000, outputTokens: 900, cachedInputTokens: 0 },
  };
}

function scripted(attemptStops) {
  const generation = [];
  return {
    generation,
    deps: {
      enabled: true,
      planRequirements: () => [{
        requirementId: 'r1', topic: 'activities', criticality: 'optional',
        reasonCodes: ['itinerary_activity_support', 'requested_named_hike_or_walk'],
      }],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requirements = [], requestId }) => buildEvidenceBundle({
        requestId,
        resolutions: requirements.map((r) => ({
          requirementId: r.requirementId,
          status: 'satisfied_fresh',
          evidenceIds: FIXTURE.candidates.map((c) => c.evidenceId),
        })),
        candidates: FIXTURE.candidates,
      }),
      now: () => new Date('2026-09-14T12:00:00.000Z'),
      newTurnId: () => 'turn-named-experience',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async (request) => {
        generation.push(request);
        const stops = attemptStops[Math.min(generation.length - 1, attemptStops.length - 1)];
        return toolResult(stops);
      },
    },
  };
}

const run = (userMessage, deps) => executeTrailieV2Turn({
  userMessage,
  conversationContext: { history: [] },
  tripState: null,
  constraints: null,
  resolvedContext: {},
}, deps);

const sent = (request) => JSON.stringify(request);
const stopNames = (result) => (result?.canonicalPlan?.days || []).flatMap((d) => (d.stops || []).map((s) => s.name));

const FOUR_MILE = stop('Four Mile Trailhead', 'trail', 150, 1);
const TUNNEL_VIEW = stop('Tunnel View', 'viewpoint', 60, 2);
const WASHBURN = stop('Washburn Point', 'viewpoint', 60, 3);
const MIST = stop('Mist Trail', 'trail', 180, 1);
// Phrased like e2eProductRegression's accepted itinerary turns, so the real
// classifier routes it to structured itinerary generation.
const NAMED_REQUEST = 'Plan a 1 day trip to Yosemite National Park for me. I want to visit Washburn Point and do an easy hike.';

describe('(5) a named experience with no authoritative identity fails closed before any dispatch', () => {
  test('the captured Mist Trail request → honest terminal, zero model dispatch, no plan', async () => {
    const s = scripted([[FOUR_MILE, TUNNEL_VIEW]]);
    const result = await run(
      'Plan me a day in Yosemite Valley. I want to hike the Mist Trail in the morning, including Vernal Fall Footbridge and Vernal Fall as stops, then do one separate scenic experience later in the day.',
      s.deps,
    );
    expect(s.generation).toHaveLength(0);
    expect(result.status).toBe('constraint_infeasible');
    expect(result.terminalReason).toBe('requested_experience_unavailable');
    expect(result.validation.reasonCodes).toEqual(['requested_experience_unavailable']);
    expect(result.canonicalPlan).toBeNull();
    expect(result.response.text).toContain('Mist Trail');
    expect(result.response.text).not.toMatch(/Bridalveil|Four Mile|Chilnualna/);
  });
});

describe('(4) a named identity outside the ordinary evidence window is pinned into attempt 1', () => {
  test('Washburn Point is offered and required in the first request, and a plan that includes it is accepted', async () => {
    const s = scripted([[FOUR_MILE, WASHBURN, TUNNEL_VIEW]]);
    const result = await run(NAMED_REQUEST, s.deps);
    expect(s.generation.length).toBeGreaterThanOrEqual(1);
    const attempt1 = sent(s.generation[0]);
    expect(attempt1).toContain('requiredNamedPlaces');
    expect(attempt1).toContain('Washburn Point');
    expect(result.status).toBe('complete');
    expect(stopNames(result)).toContain('Washburn Point');
  });
});

describe('(1)(7) a plan that drops the named place is rejected and the retry keeps the exact name', () => {
  test('attempt 1 has only other grounded hikes/viewpoints → rejected; attempt 2 is told Washburn Point, not "a hike"', async () => {
    const s = scripted([[FOUR_MILE, TUNNEL_VIEW], [FOUR_MILE, WASHBURN, TUNNEL_VIEW]]);
    const result = await run(NAMED_REQUEST, s.deps);
    expect(s.generation.length).toBeGreaterThanOrEqual(2);
    const attempt2 = sent(s.generation[1]);
    expect(attempt2).toMatch(/MUST FIX:[^"]*explicit traveler requirement: \\"Washburn Point\\"/);
    expect(attempt2).toMatch(/No other place replaces it/);
    expect(attempt2).toContain('missing_requested_named_experience_1');
    expect(result.status).toBe('complete');
    expect(stopNames(result)).toContain('Washburn Point');
    const first = result.attempts[0];
    expect(first.validationReasonCodes).toContain('missing_requested_named_experience_1');
    expect(first.validationReasonCodes).not.toContain('missing_requested_hike');
  });

  test('if no attempt ever includes the named place, the turn is never accepted', async () => {
    const s = scripted([[FOUR_MILE, TUNNEL_VIEW]]);
    const result = await run(NAMED_REQUEST, s.deps);
    expect(result.status).not.toBe('complete');
    expect(result.canonicalPlan).toBeNull();
  });
});

describe('(6)(7) an identity rejection neither satisfies the named obligation nor genericizes it', () => {
  test('attempt 1 authors an unresolvable trail; attempt 2 keeps Washburn Point and requested_hike is not "already right"', async () => {
    const s = scripted([[MIST, TUNNEL_VIEW], [FOUR_MILE, WASHBURN, TUNNEL_VIEW]]);
    const result = await run(NAMED_REQUEST, s.deps);
    const first = result.attempts[0];
    expect(first.validationStage).toBe('stop_identity');
    expect(first.validationReasonCodes).toEqual(expect.arrayContaining(['missing_requested_named_experience_1', 'stop_identity_unresolved']));
    expect(first.repairProgress.satisfied).not.toContain('requested_hike');
    expect(first.repairProgress.satisfied).not.toContain('requested_named_experience_1');
    expect(first.repairProgress.failed).toContain('requested_named_experience_1');

    const attempt2 = sent(s.generation[1]);
    expect(attempt2).toContain('The traveler explicitly asked for: \\"Washburn Point\\"');
    expect(attempt2).toContain('For any other stop, build named stops only from places the PUBLIC EVIDENCE actually names');
    expect(attempt2).not.toMatch(/the walks\/hikes the traveler asked for \(an earlier attempt already got this right/);
    expect(result.status).toBe('complete');
  });
});

describe('(3)(12) ordinary requests without a named experience are unchanged', () => {
  test('a generic hike request carries no named block and any grounded hike satisfies it', async () => {
    const s = scripted([[FOUR_MILE, TUNNEL_VIEW]]);
    const result = await run('Plan a 1 day trip to Yosemite National Park for me with an easy hike and a good viewpoint.', s.deps);
    expect(sent(s.generation[0])).not.toContain('requiredNamedPlaces');
    expect(result.status).toBe('complete');
    expect(s.generation).toHaveLength(1);
  });
});
