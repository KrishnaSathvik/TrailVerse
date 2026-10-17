'use strict';

/**
 * §B — LIVE-STATE TOPICS MUST COMPOSE.
 *
 * `live_in_trip_assistance` planned exactly ONE topic through an if/else-if
 * chain, and the wildfire test ran first. So on 2026-08-27 the live turn:
 *
 *   "Is the Petrified Forest Trail open right now, and is there any wildfire
 *    smoke affecting Theodore Roosevelt National Park?"
 *
 * planned `wildfire_smoke` and silently dropped the trail half entirely. The
 * traveler asked two independent live-state questions and the planner forced
 * them into one bucket.
 *
 * Applicable topics now accumulate. Criticality is NOT weakened: each remains
 * `hard`, each must remain serviceable.
 */

const { planEvidenceRequirements } = require('../evidencePlannerService');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');

const NOW = new Date('2026-08-27T12:00:00.000Z');
const THRO = {
  entityId: 'nps:park:thro',
  entityType: 'national_park',
  displayName: 'Theodore Roosevelt National Park',
  latitude: 46.979,
  longitude: -103.538,
  resolutionConfidence: 1,
};
const nps = createNpsEvidenceProvider({});

function plan(prompt) {
  const intent = classifyTrailieIntent({ userPrompt: prompt });
  return {
    intent,
    requirements: planEvidenceRequirements({
      turnId: 'turn:composition',
      userPrompt: prompt,
      intent,
      resolvedEntities: [THRO],
      now: NOW,
    }),
  };
}

const topicsOf = (requirements) => requirements.map((r) => r.topic);
const hardTopics = (requirements) => requirements
  .filter((r) => r.criticality === 'hard').map((r) => r.topic).sort();

describe('the exact live prompt plans both live-state topics', () => {
  const prompt = 'Is the Petrified Forest Trail open right now, and is there any wildfire '
    + 'smoke affecting Theodore Roosevelt National Park?';

  test('trail_conditions AND wildfire_smoke are both planned, both hard', () => {
    const { requirements } = plan(prompt);
    expect(topicsOf(requirements)).toEqual(expect.arrayContaining([
      'trail_conditions', 'wildfire_smoke',
    ]));
    expect(hardTopics(requirements)).toEqual(expect.arrayContaining([
      'trail_conditions', 'wildfire_smoke',
    ]));
  });

  test('neither suppresses the other', () => {
    const { requirements } = plan(prompt);
    const trail = requirements.find((r) => r.topic === 'trail_conditions');
    const smoke = requirements.find((r) => r.topic === 'wildfire_smoke');
    expect(trail).toBeDefined();
    expect(smoke).toBeDefined();
    expect(trail.criticality).toBe('hard');
    expect(smoke.criticality).toBe('hard');
  });

  test('every hard requirement is serviceable', () => {
    const { requirements } = plan(prompt);
    for (const requirement of requirements.filter((r) => r.criticality === 'hard')) {
      const served = (requirement.preferredProviders || [])
        .some((id) => (id === 'nps' ? nps.supports(requirement) : false));
      expect({ topic: requirement.topic, served }).toEqual({ topic: requirement.topic, served: true });
    }
  });
});

describe('all live-state combinations compose', () => {
  const CASES = [
    ['trail + smoke', 'Is the trail open right now, and is there wildfire smoke?', ['trail_conditions', 'wildfire_smoke']],
    ['road + smoke', 'Is the road open right now, and is there any smoke?', ['roads', 'wildfire_smoke']],
    ['trail + road', 'Are the trails and the road open right now?', ['roads', 'trail_conditions']],
    ['trail + road + smoke', 'Right now, are the trails open, is the road open, and is there wildfire smoke?', ['roads', 'trail_conditions', 'wildfire_smoke']],
  ];

  test.each(CASES)('%s', (_label, prompt, expected) => {
    const { requirements } = plan(prompt);
    for (const topic of expected) {
      const requirement = requirements.find((r) => r.topic === topic);
      expect({ topic, planned: Boolean(requirement), criticality: requirement?.criticality })
        .toEqual({ topic, planned: true, criticality: 'hard' });
    }
  });

  test('operational alerts still accompany a specific live question', () => {
    const { requirements } = plan('Is the trail open right now?');
    expect(topicsOf(requirements)).toContain('alerts_closures');
  });

  test('a single-topic question keeps its topic, plus the park-wide alert feed', () => {
    // `alerts_closures` now accompanies every specific live question: a
    // park-wide closure answers "is there smoke" too, and it costs no extra
    // provider call because it shares the nps|alerts dedupe key.
    const { requirements } = plan('Is there wildfire smoke right now?');
    expect(hardTopics(requirements))
      .toEqual(['alerts_closures', 'destination_identity', 'wildfire_smoke']);
  });

  test('a bare open-now question still falls back to alerts', () => {
    const { requirements } = plan('Is the park open right now?');
    expect(topicsOf(requirements)).toContain('alerts_closures');
  });
});

describe('composition does not weaken the contract', () => {
  const PROMPTS = [
    'Is the Petrified Forest Trail open right now, and is there any wildfire smoke affecting Theodore Roosevelt National Park?',
    'Right now, are the trails open, is the road open, and is there wildfire smoke?',
    'Is the shuttle running right now?',
    'Is the park open right now?',
  ];

  test.each(PROMPTS)('no hard requirement is providerless: %s', (prompt) => {
    const { requirements } = plan(prompt);
    const providerless = requirements
      .filter((r) => r.criticality === 'hard')
      .filter((r) => (r.preferredProviders || []).length === 0)
      .map((r) => r.topic);
    expect(providerless).toEqual([]);
  });

  test('absence semantics survive composition', () => {
    const { requirements } = plan(
      'Is the Petrified Forest Trail open right now, and is there any wildfire '
      + 'smoke affecting Theodore Roosevelt National Park?'
    );
    for (const topic of ['trail_conditions', 'wildfire_smoke']) {
      expect({ topic, absence: requirements.find((r) => r.topic === topic)?.absenceSemantics })
        .toEqual({ topic, absence: 'proves_absent' });
    }
  });
});
