'use strict';

/**
 * Fix Pass #3G — hard-constraint eligibility for unknown exposure.
 * Generic candidate names only — no park/trail selection hardcodes.
 */

const {
  evaluateItineraryCompleteness,
  buildCompletenessRepairInstructions,
} = require('../itineraryCompleteness');
const {
  applyOperationalConstraints,
  CONSTRAINT_TYPE,
  userRejectsExposure,
} = require('../trailieOperationalConstraints');
const {
  ELIGIBILITY,
  classifyExposureEligibility,
  evaluateHardExposureEligibility,
  isExposureRelevantStop,
  enrichItineraryExposureFromEvidenceBundle,
} = require('../hardConstraintEligibility');
const { getTaskContractV2 } = require('../../prompts/trailieTaskContractsV2');
const fs = require('fs');
const path = require('path');

const NO_EXPOSURE =
  'Plan a realistic 2-day trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.';
const GENERIC_HIKES = 'Give me some scenic hikes for a weekend trip.';

function plan(days) {
  return { days };
}
function day(n, stops) {
  return { day: n, stops };
}

describe('Fix Pass #3G — hard-constraint eligibility helpers', () => {
  test('classifies low / moderate-high / unknown', () => {
    expect(classifyExposureEligibility('low')).toBe(ELIGIBILITY.COMPATIBLE);
    expect(classifyExposureEligibility('moderate')).toBe(ELIGIBILITY.INCOMPATIBLE);
    expect(classifyExposureEligibility('high')).toBe(ELIGIBILITY.INCOMPATIBLE);
    expect(classifyExposureEligibility(null)).toBe(ELIGIBILITY.UNKNOWN);
    expect(classifyExposureEligibility('unknown')).toBe(ELIGIBILITY.UNKNOWN);
    expect(classifyExposureEligibility('')).toBe(ELIGIBILITY.UNKNOWN);
  });

  test('lunch/hotel are not exposure-relevant', () => {
    expect(isExposureRelevantStop({ name: 'Lodge lunch', type: 'restaurant' })).toBe(false);
    expect(isExposureRelevantStop({ name: 'Canyon Lodge', type: 'lodging', note: 'Overnight stay' })).toBe(false);
    expect(isExposureRelevantStop({ name: 'Visitor Center', type: 'visitor_center' })).toBe(false);
    expect(isExposureRelevantStop({ name: 'Park museum', type: 'museum' })).toBe(false);
    expect(isExposureRelevantStop({ name: 'Scenic Drive', type: 'scenic_drive' })).toBe(false);
    expect(isExposureRelevantStop({ name: 'Picnic area', type: 'picnic' })).toBe(false);
    expect(isExposureRelevantStop({ name: 'Riverwalk Path', type: 'trail' })).toBe(true);
    expect(isExposureRelevantStop({ name: 'Ridge Viewpoint', type: 'viewpoint' })).toBe(true);
  });

  test('CASE D — no hard constraint → unknown experiential is applicable-pass', () => {
    const result = evaluateHardExposureEligibility(
      { name: 'Mystery Spur', type: 'trail', exposureLevel: null },
      { hardConstraintActive: false }
    );
    expect(result.status).toBe(ELIGIBILITY.NOT_APPLICABLE);
    expect(result.reasonCodes).toEqual([]);
  });
});

describe('Fix Pass #3G — completeness under hard no-exposure', () => {
  test('CASE A — exposure=low PASSES', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          { name: 'Riverwalk Path', type: 'trail', duration: 90, exposureLevel: 'low', note: 'Low-exposure paved walk.' },
          { name: 'Quiet Bend Viewpoint', type: 'landmark', duration: 45, exposureLevel: 'low' },
        ]),
      ]),
      userPrompt: NO_EXPOSURE,
    });
    expect(result.ok).toBe(true);
    expect(result.reasonCodes).not.toContain('constraint_eligibility_unknown');
  });

  test('CASE B — exposure=moderate FAILS', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          {
            name: 'Ridge Crest Trail',
            type: 'trail',
            duration: 120,
            exposureLevel: 'moderate',
            note: 'Moderate drop-offs.',
          },
        ]),
      ]),
      userPrompt: NO_EXPOSURE,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('exposure_constraint_violation');
  });

  test('CASE C — exposure=unknown cannot satisfy hard constraint', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          { name: 'Creek Canyon Trail', type: 'trail', duration: 180, exposureLevel: null },
        ]),
      ]),
      userPrompt: NO_EXPOSURE,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('constraint_eligibility_unknown');
  });

  test('CASE D — unknown OK when user did not ask about exposure', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          { name: 'Creek Canyon Trail', type: 'trail', duration: 180, exposureLevel: null },
          { name: 'Quiet Bend Viewpoint', type: 'landmark', duration: 45 },
        ]),
      ]),
      userPrompt: GENERIC_HIKES,
    });
    expect(result.reasonCodes).not.toContain('constraint_eligibility_unknown');
    expect(result.ok).toBe(true);
  });

  test('CASE E — Day1 low + Day2 unknown does NOT pass', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          { name: 'Riverwalk Path', type: 'trail', duration: 90, exposureLevel: 'low' },
          { name: 'Lower Pool Walk', type: 'trail', duration: 120, exposureLevel: 'low' },
        ]),
        day(2, [
          { name: 'Creek Canyon Trail', type: 'trail', duration: 210, exposureLevel: null },
          { name: 'Timber Ridge Overlook', type: 'viewpoint', duration: 60, exposureLevel: null },
        ]),
      ]),
      constraints: { dates: { numDays: 2 } },
      userPrompt: NO_EXPOSURE,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('constraint_eligibility_unknown');
  });

  test('logistics-only null exposure does not trigger eligibility unknown', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          { name: 'Riverwalk Path', type: 'trail', duration: 120, exposureLevel: 'low' },
          { name: 'Quiet Bend Viewpoint', type: 'viewpoint', duration: 40, exposureLevel: 'low' },
          { name: 'Lodge lunch', type: 'restaurant', duration: 45, note: 'Sit-down lunch.' },
        ]),
      ]),
      userPrompt: NO_EXPOSURE,
    });
    expect(result.reasonCodes).not.toContain('constraint_eligibility_unknown');
    expect(result.ok).toBe(true);
  });
});

describe('Fix Pass #3G — operational filter + enrichment', () => {
  test('CASE B ops — moderate/high removed when exposure rules active', () => {
    const rules = [{
      id: 'hard-exposure',
      type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT,
      subjects: ['Ridge Crest Trail'],
      exposureLevel: 'moderate',
      sourceClass: 'official_nps',
    }];
    const out = applyOperationalConstraints(plan([
      day(1, [
        { name: 'Riverwalk Path', type: 'trail', duration: 90, exposureLevel: 'low' },
        { name: 'Ridge Crest Trail', type: 'trail', duration: 120, exposureLevel: 'moderate' },
      ]),
    ]), rules);
    expect(out.itinerary.days[0].stops.map((s) => s.name)).toEqual(['Riverwalk Path']);
  });

  test('unknown experiential removed under active exposure hard rules', () => {
    const rules = [{
      id: 'hard-exposure-active',
      type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT,
      subjects: ['__sentinel_never_match__'],
      exposureLevel: 'high',
      sourceClass: 'official_nps',
    }];
    const out = applyOperationalConstraints(plan([
      day(1, [
        { name: 'Riverwalk Path', type: 'trail', duration: 90, exposureLevel: 'low' },
        { name: 'Creek Canyon Trail', type: 'trail', duration: 180, exposureLevel: null },
      ]),
    ]), rules);
    expect(out.itinerary.days[0].stops.map((s) => s.name)).toEqual([
      'Riverwalk Path',
      'Creek Canyon Trail',
    ]);
    expect(out.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ stop: 'Creek Canyon Trail', reasonCode: 'constraint_eligibility_unknown' }),
    ]));
  });

  test('CASE F/G — enrich from evidence bundle before validation', () => {
    const itinerary = plan([
      day(1, [
        { name: 'Riverwalk Path', type: 'trail', duration: 100, exposureLevel: null },
        { name: 'Quiet Bend Viewpoint', type: 'viewpoint', duration: 40, exposureLevel: 'low' },
      ]),
    ]);
    const bundle = {
      evidence: [{
        evidenceId: 'e1',
        claim: {
          normalizedValue: { name: 'Riverwalk Path', exposureLevel: 'low', difficulty: 'easy' },
          text: 'Paved accessible easy walk with scenic views.',
        },
      }],
    };
    const enriched = enrichItineraryExposureFromEvidenceBundle(itinerary, bundle);
    expect(enriched.days[0].stops[0].exposureLevel).toBe('low');
    const result = evaluateItineraryCompleteness({
      itineraryData: enriched,
      userPrompt: NO_EXPOSURE,
    });
    expect(result.ok).toBe(true);
  });

  test('CASE H — insufficient evidence stays unknown; does not invent safety', () => {
    const itinerary = plan([
      day(1, [{ name: 'Mystery Spur', type: 'trail', duration: 100, exposureLevel: null }]),
    ]);
    const bundle = {
      evidence: [{
        evidenceId: 'e2',
        claim: {
          normalizedValue: { name: 'Mystery Spur', exposureLevel: null },
          text: 'A scenic canyon hike with woodland sections.',
        },
      }],
    };
    const enriched = enrichItineraryExposureFromEvidenceBundle(itinerary, bundle);
    expect(enriched.days[0].stops[0].exposureLevel == null).toBe(true);
    const result = evaluateItineraryCompleteness({
      itineraryData: enriched,
      userPrompt: NO_EXPOSURE,
    });
    expect(result.reasonCodes).toContain('constraint_eligibility_unknown');
  });
});

describe('Fix Pass #3G — repair + prompt', () => {
  test('repair asks to replace unresolved with evidence-supported compatible candidates', () => {
    const text = buildCompletenessRepairInstructions({
      reasonCodes: ['constraint_eligibility_unknown'],
      dayDiagnostics: [],
    });
    expect(text).toMatch(/unresolved|unknown/i);
    expect(text).toMatch(/low-exposure|visitor-center|scenic-drive|trip facts/i);
    expect(text).toMatch(/hard.*exposure|no-exposure/i);
    expect(text).not.toMatch(/Taylor Creek|Timber Creek|Pa'?rus|Emerald|Zion/i);
  });

  test('architect contract: unknown exposure is not proven compatible', () => {
    const contract = getTaskContractV2('architect');
    expect(contract.text).toMatch(/unknown exposure|exposure.*unknown|unresolved exposure/i);
    expect(contract.text).not.toMatch(/Taylor Creek|Timber Creek Overlook/i);
  });

  test('userRejectsExposure still detects hard preference', () => {
    expect(userRejectsExposure(NO_EXPOSURE)).toBe(true);
    expect(userRejectsExposure(GENERIC_HIKES)).toBe(false);
  });
});

describe('Fix Pass #3G — Probe B #4 deterministic replay', () => {
  test('captured attempt-1 Day2 unknown fails; known-low Day1 alone is eligible', () => {
    const capturePath = path.join(
      __dirname,
      '../../../../artifacts/trailie-demo-recapture-v2/capture-4/probe-b-zion-retest-4/plan-stages/probe-b-retest-4__attempt-1.json'
    );
    expect(fs.existsSync(capturePath)).toBe(true);
    const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
    const replay = {
      days: (capture.postConstraintPlan || capture.rawPlan).days.map((d) => ({
        day: d.day,
        stops: (d.stops || []).map((s) => ({
          name: s.name,
          type: s.type,
          duration: s.duration,
          exposureLevel: s.exposureLevel,
          note: s.note,
          why: s.why,
        })),
      })),
    };

    const liveLike = evaluateItineraryCompleteness({
      itineraryData: replay,
      constraints: { dates: { numDays: 2 } },
      userPrompt: NO_EXPOSURE,
    });
    expect(liveLike.ok).toBe(false);
    expect(liveLike.reasonCodes).toContain('constraint_eligibility_unknown');

    // Generic corrected plan: confirmed-compatible only (no named hardcodes of replacements).
    const corrected = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          { name: 'Known Low Walk A', type: 'trail', duration: 90, exposureLevel: 'low' },
          { name: 'Known Low Walk B', type: 'trail', duration: 120, exposureLevel: 'low' },
        ]),
        day(2, [
          { name: 'Known Low Walk C', type: 'trail', duration: 150, exposureLevel: 'low' },
          { name: 'Known Low Viewpoint', type: 'viewpoint', duration: 45, exposureLevel: 'low' },
        ]),
      ]),
      constraints: { dates: { numDays: 2 } },
      userPrompt: NO_EXPOSURE,
    });
    expect(corrected.ok).toBe(true);
    expect(corrected.reasonCodes).toEqual([]);
  });
});

describe('identity-bound exposure evaluation before substitution', () => {
  test('resolves an unknown alias using the exact bound evidence identity', () => {
    const original = plan([day(2, [{ name: 'Short river stroll', evidenceRef: 'ev:river', exposureLevel: 'unknown' }])]);
    const bundle = { evidence: [{ evidenceId: 'ev:river', claim: { normalizedValue: { name: 'Official River Path', exposureLevel: 'low' } } }] };
    expect(enrichItineraryExposureFromEvidenceBundle(original, bundle).days[0].stops[0].exposureLevel).toBe('low');
    expect(original.days[0].stops[0].exposureLevel).toBe('unknown');
  });
  test('conflicting names and unrelated identities remain unknown', () => {
    const bundle = { evidence: ['low', 'high'].map((exposureLevel, i) => ({ evidenceId: `ev:${i}`, claim: { normalizedValue: { name: 'River Path', exposureLevel } } })) };
    for (const evidenceRef of [undefined, 'ev:unrelated']) {
      const result = enrichItineraryExposureFromEvidenceBundle(plan([day(1, [{ name: 'River Path', exposureLevel: 'unknown', evidenceRef }])]), bundle);
      expect(result.days[0].stops[0].exposureLevel).toBe('unknown');
    }
  });
  test('unknown diagnostics identify the day when a stop name repeats', () => {
    const result = applyOperationalConstraints(plan([day(1, [{ name: 'Mystery Trail', type: 'trail' }]), day(2, [{ name: 'Mystery Trail', type: 'trail' }])]), [{ type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT, subjects: [] }]);
    expect(result.conflicts.map(c => c.dayNumber)).toEqual([1, 2]);
  });
});
