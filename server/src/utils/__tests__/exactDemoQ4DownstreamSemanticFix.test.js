'use strict';

/**
 * Exact Demo Q4 — downstream semantic fix (offline).
 * classifyStop identity-first + exposure prose safety/negation.
 * No providers / network / paid runs. No completeness rule changes.
 */

const fs = require('fs');
const path = require('path');
const {
  classifyStop,
  hasUnsafeExposureProse,
  evaluateItineraryCompleteness,
  evaluateStopExposureConsistency,
} = require('../itineraryCompleteness');
const {
  applyOperationalConstraints,
  resolveOperationalConstraints,
  CONSTRAINT_TYPE,
} = require('../trailieOperationalConstraints');
const { evaluateHardExposureEligibility } = require('../hardConstraintEligibility');

const Q4_PROMPT =
  'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.';

const PLAN_STAGES_DIR = path.resolve(
  __dirname,
  '../../../../artifacts/trailie-v2-demo-final-validation/q4-zion-paid-reval/plan-stages'
);

function loadAttempt(n) {
  return JSON.parse(
    fs.readFileSync(path.join(PLAN_STAGES_DIR, `q4-zion-paid-reval__attempt-${n}.json`), 'utf8')
  );
}

const Q4_CONSTRAINTS = {
  dates: { numDays: 2 },
  avoidExposure: true,
  travelParty: 'couple',
  fitness: 'moderate',
};

describe('Exact Demo Q4 — classifyStop identity vs narrative', () => {
  test('A — type=trail + Visitor Center endpoint note remains experiential', () => {
    expect(classifyStop({
      name: "Pa'rus Trail",
      type: 'trail',
      note: 'Starts near the Visitor Center.',
    })).toBe('experiential');
  });

  test('B — typed Visitor Center remains logistics_meta', () => {
    expect(classifyStop({
      name: 'Visitor Center',
      type: 'visitor_center',
    })).toBe('logistics_meta');
  });

  test('C — trail identity beats parking/visitor-center narration', () => {
    expect(classifyStop({
      name: 'Easy Riverside Walk',
      type: 'trail',
      why: 'Parking is near the visitor center.',
    })).toBe('experiential');
  });

  test('D — typed logistics stays logistics', () => {
    expect(classifyStop({
      name: 'Parking at Visitor Center',
      type: 'logistics',
    })).toBe('logistics_meta');
  });

  test('E — viewpoint identity not redefined by shuttle/visitor-center narration', () => {
    expect(classifyStop({
      name: 'Scenic viewpoint',
      type: 'landmark',
      note: 'Take the shuttle from the visitor center.',
    })).toBe('experiential');
  });

  test('non-Zion: name trail + visitor center note is experiential', () => {
    expect(classifyStop({
      name: 'Rim Village Path',
      type: 'trail',
      note: 'Begins at the Grand Canyon Visitor Center plaza.',
    })).toBe('experiential');
  });

  test('true logistics name still logistics_meta', () => {
    expect(classifyStop({
      name: 'Visitor Center orientation',
      note: 'Pick up maps before your hike.',
    })).toBe('logistics_meta');
    expect(classifyStop({
      name: 'Parking setup',
      type: 'parking',
    })).toBe('logistics_meta');
    expect(classifyStop({
      name: 'Shuttle transfer',
      type: 'transport',
    })).toBe('logistics_meta');
    expect(classifyStop({
      name: 'Hotel check-in',
      type: 'lodging',
    })).toBe('rest_meal');
    expect(classifyStop({
      name: 'Lunch at Lodge Cafe',
      type: 'restaurant',
    })).toBe('rest_meal');
  });
});

describe('Exact Demo Q4 — exposure prose safety/negation', () => {
  test('safety instructions do not conflict', () => {
    const safe = [
      'Keep away from cliff edges.',
      'Stay back from exposed drop-offs.',
      'Remain clear of steep edges.',
      'Stay away from cliff edges.',
      'Keep clear of exposed ledges.',
      'Avoid the exposed ledge route.',
    ];
    for (const note of safe) {
      expect(hasUnsafeExposureProse(note)).toBe(false);
      expect(evaluateStopExposureConsistency({
        name: 'Riverwalk Path',
        type: 'trail',
        exposureLevel: 'low',
        note,
      }, Q4_PROMPT, Q4_CONSTRAINTS)).toEqual([]);
    }
  });

  test('affirmative exposure claims still conflict', () => {
    const bad = [
      'The trail follows exposed cliff edges.',
      'Short exposed ledge section.',
      'Walk along exposed cliff edge.',
      'Narrow ledge with drop-off.',
      'Steep exposed section.',
    ];
    for (const note of bad) {
      expect(hasUnsafeExposureProse(note)).toBe(true);
      expect(evaluateStopExposureConsistency({
        name: 'Riverwalk Path',
        type: 'trail',
        exposureLevel: 'low',
        note,
      }, Q4_PROMPT, Q4_CONSTRAINTS)).toContain('exposure_prose_conflict');
    }
  });

  test('non-Zion: keep away from heights is safety language', () => {
    expect(hasUnsafeExposureProse(
      'Easy lakeshore stroll. Keep away from heights near the overlook railing.'
    )).toBe(false);
  });

  test('without cliffside commitment is avoidance, not exposure claim', () => {
    expect(hasUnsafeExposureProse(
      'Low-exposure trail without committing to a cliffside route.'
    )).toBe(false);
  });
});

describe('Exact Demo Q4 — captured attempt replay', () => {
  test('attempt 2: Pa\'rus experiential + completeness PASS', () => {
    const cap = loadAttempt(2);
    const plan = cap.postConstraintPlan;
    const parus = plan.days[0].stops[0];
    const emerald = plan.days[1].stops[0];

    expect(parus.name).toMatch(/Pa'?rus/i);
    expect(classifyStop(parus)).toBe('experiential');
    expect(classifyStop(emerald)).toBe('experiential');
    expect(hasUnsafeExposureProse(`${parus.note} ${parus.why}`)).toBe(false);
    expect(hasUnsafeExposureProse(`${emerald.note} ${emerald.why}`)).toBe(false);

    const result = evaluateItineraryCompleteness({
      itineraryData: plan,
      constraints: Q4_CONSTRAINTS,
      userPrompt: Q4_PROMPT,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic']);
    expect(result.dayDiagnostics).toEqual([]);
    expect(result.reasonCodes).not.toContain('missing_experience_anchor');
    expect(result.reasonCodes).not.toContain('exposure_prose_conflict');
  });

  test('attempt 3: same downstream semantic improvements → semantic predicates pass, scenic coverage remains missing', () => {
    const cap = loadAttempt(3);
    const plan = cap.postConstraintPlan;
    const emerald = plan.days[0].stops[0];
    const parus = plan.days[1].stops[0];

    expect(classifyStop(parus)).toBe('experiential');
    expect(classifyStop(emerald)).toBe('experiential');
    expect(hasUnsafeExposureProse(`${parus.note} ${parus.why}`)).toBe(false);

    const result = evaluateItineraryCompleteness({
      itineraryData: plan,
      constraints: Q4_CONSTRAINTS,
      userPrompt: Q4_PROMPT,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic']);
    expect(result.dayDiagnostics).toEqual([]);
    expect(result.reasonCodes).not.toContain('missing_experience_anchor');
    expect(result.reasonCodes).not.toContain('exposure_prose_conflict');
  });
});

describe('Exact Demo Q4 — hard exposure regressions remain strict', () => {
  test('Watchman / Angels Landing / Canyon Overlook stay ineligible', () => {
    for (const stop of [
      { name: 'Watchman Trail', type: 'trail', exposureLevel: 'moderate' },
      { name: 'Angels Landing', type: 'trail', exposureLevel: 'high' },
      { name: 'Canyon Overlook', type: 'trail', exposureLevel: 'high' },
    ]) {
      const elig = evaluateHardExposureEligibility(stop, { hardConstraintActive: true });
      expect(elig.status).toBe('incompatible');
      expect(elig.reasonCodes).toContain('exposure_constraint_violation');
    }
  });

  test('Zion operational rules still remove known exposed trails', () => {
    const filtered = applyOperationalConstraints({
      days: [{
        day: 1,
        stops: [
          { name: "Pa'rus Trail", type: 'trail', duration: 120, exposureLevel: 'low' },
          { name: 'Watchman Trail', type: 'trail', duration: 120, exposureLevel: 'moderate' },
          { name: 'Angels Landing', type: 'trail', duration: 180, exposureLevel: 'high' },
          { name: 'Canyon Overlook', type: 'trail', duration: 60, exposureLevel: 'high' },
        ],
      }],
    }, [{
      type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT,
      destination: 'Zion National Park',
      subjects: [],
      plannerRule: 'Do not use trails with moderate or high exposure.',
    }]);
    const names = filtered.itinerary.days[0].stops.map((s) => s.name);
    expect(names).toContain("Pa'rus Trail");
    expect(names).not.toContain('Watchman Trail');
    expect(names).not.toContain('Angels Landing');
    expect(names).not.toContain('Canyon Overlook');
  });

  test('UNKNOWN remains fail-closed under avoidExposure', () => {
    const elig = evaluateHardExposureEligibility(
      { name: 'Mystery Spur', type: 'trail', exposureLevel: 'unknown' },
      { hardConstraintActive: true }
    );
    expect(elig.status).toBe('unknown');
    expect(elig.reasonCodes).toContain('constraint_eligibility_unknown');
  });
});
