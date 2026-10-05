'use strict';

/**
 * RELIABILITY PASS R1/R2 — wiring proof: machine-composed operational
 * directives reach generation ATTEMPT 1.
 *
 * Real `executeTrailieV2Turn`, scripted provider, no network. The thing under
 * test is the seam: the frozen bundle's operational facts, resolved against
 * this traveler, must appear in the FIRST dispatched generation request —
 * before any validator has rejected anything — and must appear in NO request
 * on an ordinary turn (bar 3: no rule → no block).
 *
 * Pattern lifted from anchorContainedRepairWiring.test.js.
 */

const path = require('path');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { extractOperationalFacts } = require('../../utils/operationalFactExtraction');

const GLACIER = require(path.join(__dirname, 'fixtures/reliabilityPass/glacier-rv.json'));
const ZION = require(path.join(__dirname, 'fixtures/reliabilityPass/zion-knee.json'));

/** Producer-shaped evidence candidates from fixture NPS items — operational
 * facts come from the REAL extractor, never hand-typed (capture fidelity). */
function evidenceFrom(fixture) {
  return fixture.npsItems.map((item) => ({
    evidenceId: `ev:${item.id.toLowerCase()}`,
    entityId: `nps:park:${fixture.parkCode}`,
    topic: 'activities',
    evidenceType: 'fact',
    privacyScope: 'public',
    claim: {
      identity: `place:${item.title}`,
      text: item.longDescription,
      normalizedValue: {
        name: item.title,
        category: 'thingstodo',
        activityTypes: item.activityTypes || [],
        entityId: `nps:park:${fixture.parkCode}:thingstodo:${item.id}`,
        destinationId: `nps:park:${fixture.parkCode}`,
        ...(item.exposureLevel ? { exposureLevel: item.exposureLevel } : {}),
        operationalFacts: extractOperationalFacts({ item, parkCode: fixture.parkCode }),
      },
    },
  }));
}

const stop = (name, type, duration, order = 1, over = {}) => ({
  id: `s-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  order, type, name, duration,
  note: `${name} note.`, why: `${name} why.`, startTime: '', timeWindow: 'Morning', ...over,
});

/** A benign structured answer; validation outcome is irrelevant to this test —
 * the assertion is about the DISPATCHED request, not the accepted plan. */
function toolResult(days) {
  return {
    text: 'Here is the shape I would give these days.',
    toolCalls: [{
      id: 'call_1',
      name: 'create_itinerary',
      input: {
        intro: 'Here is the shape I would give these days.',
        days,
      },
    }],
    structuredOutputStatus: 'complete',
    completionStatus: 'complete',
    stopReason: 'stop',
    usage: { inputTokens: 4000, outputTokens: 900, cachedInputTokens: 0 },
  };
}

const benignDays = (labels) => labels.map((label, i) => ({
  id: `d${i + 1}`, dayNumber: i + 1, label,
  stops: [stop(`${label} morning walk`, 'trail', 120, 1), stop(`${label} viewpoint`, 'viewpoint', 90, 2)],
}));

function scriptedDeps({ evidence, days }) {
  const generation = [];
  return {
    generation,
    deps: {
      enabled: true,
      planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'optional' }],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requirements = [], requestId }) => buildEvidenceBundle({
        requestId,
        resolutions: requirements.map((r) => ({
          requirementId: r.requirementId,
          status: 'satisfied_fresh',
          evidenceIds: evidence.map((c) => c.evidenceId),
        })),
        candidates: evidence,
      }),
      now: () => new Date('2026-09-01T12:00:00.000Z'),
      newTurnId: () => 'turn-operational-directives',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async (request) => {
        generation.push(request);
        return toolResult(days);
      },
    },
  };
}

const run = (fixtureLikeInput, deps) => executeTrailieV2Turn({
  userMessage: fixtureLikeInput.userPrompt,
  conversationContext: { history: [] },
  tripState: null,
  constraints: fixtureLikeInput.constraints,
  resolvedContext: {},
}, deps);

const promptOf = (request) => `${request?.instructions || ''}\n${String(request?.input?.[0]?.content || '')}`;

describe('R1 — the Glacier 24-ft RV prohibition reaches attempt 1', () => {
  it('the first dispatched generation request carries both numbers and the subject, before any validation', async () => {
    const s = scriptedDeps({
      evidence: evidenceFrom(GLACIER),
      days: benignDays(['Lake McDonald', 'Many Glacier', 'Two Medicine', 'Whitefish', 'Departure']),
    });
    await run(GLACIER, s.deps);
    expect(s.generation.length).toBeGreaterThanOrEqual(1);
    const attempt1 = promptOf(s.generation[0]);
    expect(attempt1).toContain('operationalRules');
    expect(attempt1).toContain('Going-to-the-Sun Road');
    expect(attempt1).toContain('24');
    expect(attempt1).toContain('21');
    expect(attempt1).toMatch(/Do not plan any segment/i);
  });
});

describe('R2 — the Zion exposure directive reaches attempt 1', () => {
  it('names the confirmed-low pool and forbids authored exposure ratings', async () => {
    const s = scriptedDeps({
      evidence: evidenceFrom(ZION),
      days: benignDays(['Zion Canyon', 'East Side', 'Kolob']),
    });
    await run(ZION, s.deps);
    expect(s.generation.length).toBeGreaterThanOrEqual(1);
    const attempt1 = promptOf(s.generation[0]);
    expect(attempt1).toContain('operationalRules');
    expect(attempt1).toContain("Pa'rus Trail");
    expect(attempt1).toMatch(/Never author, guess, or invent an exposureLevel/i);
  });
});

describe('bar 3 — an ordinary turn composes nothing', () => {
  it('the Canyonlands prompt carries no operationalRules block in any dispatched request', async () => {
    const evidence = evidenceFrom({
      parkCode: 'cany',
      npsItems: [
        { id: 'MESA-ARCH', title: 'Mesa Arch Trail', longDescription: 'A short walk to an iconic arch.', activityTypes: ['hiking', 'hike'] },
        { id: 'GRAND-VIEW', title: 'Grand View Point', longDescription: 'A sweeping canyon panorama.', activityTypes: ['viewpoint'] },
      ],
    });
    const s = scriptedDeps({ evidence, days: benignDays(['Island in the Sky', 'Needles', 'Sunset']) });
    await run({
      userPrompt: 'Give us three relaxed days in Canyonlands without rushing between stops.',
      constraints: { parkCode: 'cany', pace: 'relaxed', dates: { numDays: 3 }, planningState: { mobility: {}, preferences: { pace: 'relaxed' } } },
    }, s.deps);
    expect(s.generation.length).toBeGreaterThanOrEqual(1);
    for (const request of s.generation) {
      expect(promptOf(request)).not.toContain('operationalRules');
    }
  });
});
