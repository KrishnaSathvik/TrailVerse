'use strict';

/**
 * Fix Pass #3F — offline matrix for day coverage + exposure prose consistency.
 * Generic candidate names only — no park/trail selection hardcodes in assertions
 * about production selection.
 */

const {
  evaluateItineraryCompleteness,
  buildCompletenessRepairInstructions,
  hasUnsafeExposureProse,
  evaluateStopExposureConsistency,
  SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES,
} = require('../itineraryCompleteness');
const {
  applyOperationalConstraints,
  CONSTRAINT_TYPE,
} = require('../trailieOperationalConstraints');
const { getTaskContractV2 } = require('../../prompts/trailieTaskContractsV2');
const {
  isPlanStageCaptureEnabled,
  makePlanStageCapturer,
  sanitizePlan,
  PRIVATE_DIR,
} = require('../planStageCapture');
const fs = require('fs');
const path = require('path');
const os = require('os');

const NO_EXPOSURE_PROMPT =
  'Plan a realistic 2-day trip for a couple who want scenic views, easy-to-moderate walking, and no exposed scary trails.';

function plan(days) {
  return { days };
}

function day(n, stops) {
  return { day: n, stops };
}

describe('Fix Pass #3F — insufficient_day_coverage', () => {
  test(`CASE A — relaxed two-day with substantial + supporting experiences PASSES (threshold=${SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES}m solo)`, () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          { name: 'Riverwalk Path', type: 'trail', duration: 120, exposureLevel: 'low', note: 'Low-exposure paved walk.' },
          { name: 'Canyon Mouth Viewpoint', type: 'landmark', duration: 45, exposureLevel: 'low', note: 'Scenic overlook.' },
        ]),
        day(2, [
          { name: 'Meadow Loop Trail', type: 'trail', duration: 150, exposureLevel: 'low' },
          { name: 'Quiet Bend Picnic Area', type: 'landmark', duration: 40, exposureLevel: 'low', note: 'Relaxed scenic stop.' },
        ]),
      ]),
      constraints: { dates: { numDays: 2 } },
      userPrompt: NO_EXPOSURE_PROMPT,
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('CASE B — lunch-only day fails with missing_experience_anchor (not logistics-as-sightseeing)', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [{ name: 'Riverwalk Path', type: 'trail', duration: 120 }]),
        day(2, [{ name: 'Lodge lunch', type: 'restaurant', duration: 60, note: 'Sit-down lunch break.' }]),
      ]),
      userPrompt: 'Plan a relaxed 2-day sightseeing trip with easy walks.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_experience_anchor');
    expect(result.dayDiagnostics.some((d) => d.dayNumber === 2)).toBe(true);
  });

  test('CASE C — post-filter thinning leaves substantial solo experience → PASS', () => {
    const rules = [{
      id: 'generic-high-exposure',
      type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT,
      subjects: ['Ridge Drop Viewpoint'],
      exposureLevel: 'high',
      sourceClass: 'official_nps',
    }];
    const raw = plan([
      day(1, [
        {
          name: 'Riverwalk Path',
          type: 'trail',
          duration: 120,
          exposureLevel: 'low',
          note: 'Paved low-exposure walk.',
        },
        {
          name: 'River Bend Overlook',
          type: 'viewpoint',
          duration: 40,
          exposureLevel: 'low',
          note: 'Low-exposure roadside viewpoint.',
        },
        {
          name: 'Ridge Drop Viewpoint',
          type: 'landmark',
          duration: 60,
          exposureLevel: 'high',
          note: 'Long exposed drop-offs.',
        },
      ]),
    ]);
    const filtered = applyOperationalConstraints(raw, rules);
    expect(filtered.itinerary.days[0].stops.map((s) => s.name)).toEqual([
      'Riverwalk Path',
      'River Bend Overlook',
    ]);
    const result = evaluateItineraryCompleteness({
      itineraryData: filtered.itinerary,
      userPrompt: NO_EXPOSURE_PROMPT,
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('CASE D — post-filter empty experiential day → FAIL', () => {
    const rules = [{
      id: 'generic-high-only',
      type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT,
      subjects: ['Ridge Drop Viewpoint'],
      exposureLevel: 'high',
      sourceClass: 'official_nps',
    }];
    const filtered = applyOperationalConstraints(plan([
      day(1, [{
        name: 'Ridge Drop Viewpoint',
        type: 'landmark',
        duration: 90,
        exposureLevel: 'high',
      }]),
    ]), rules);
    expect(filtered.itinerary.days[0].stops).toHaveLength(0);
    const result = evaluateItineraryCompleteness({
      itineraryData: filtered.itinerary,
      userPrompt: NO_EXPOSURE_PROMPT,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('empty_day');
  });

  test('short solo experiential (< substantial threshold) still fails insufficient_day_coverage', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [{ name: 'Short Spur Walk', type: 'trail', duration: 45 }]),
      ]),
      userPrompt: 'Plan a sightseeing day with easy walking.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('insufficient_day_coverage');
  });

  test('repair instructions name the thin day and avoid inventing places', () => {
    const completeness = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [{ name: 'Riverwalk Path', type: 'trail', duration: 120 }]),
        day(2, [{ name: 'Short Spur Walk', type: 'trail', duration: 40 }]),
      ]),
      userPrompt: 'Plan two full sightseeing days.',
    });
    const text = buildCompletenessRepairInstructions({
      reasonCodes: completeness.reasonCodes,
      dayDiagnostics: completeness.dayDiagnostics,
    });
    expect(text).toMatch(/Day 2/);
    expect(text).toMatch(/frozen EvidenceBundle/);
    expect(text).not.toMatch(/Pa'?rus|Watchman|Zion|Emerald/i);
  });
});

describe('Fix Pass #3F — exposure_prose_conflict matrix', () => {
  test('CASE E — structured low + low-exposure prose PASSES', () => {
    const codes = evaluateStopExposureConsistency({
      name: 'Riverwalk Path',
      exposureLevel: 'low',
      note: 'This is a low-exposure paved walk.',
    }, NO_EXPOSURE_PROMPT);
    expect(codes).toEqual([]);
    expect(hasUnsafeExposureProse('This is a low-exposure paved walk.')).toBe(false);
  });

  test('CASE F — negated exposure prose PASSES', () => {
    const phrases = [
      'Avoid exposed routes.',
      'No exposed sections are recommended.',
      'This option avoids significant drop-offs.',
      'Choose the low-exposure alternative.',
      'This trail was selected because it avoids exposed terrain.',
    ];
    for (const note of phrases) {
      expect(hasUnsafeExposureProse(note)).toBe(false);
      expect(evaluateStopExposureConsistency({
        name: 'Riverwalk Path',
        exposureLevel: 'low',
        note,
      }, NO_EXPOSURE_PROMPT)).toEqual([]);
    }
  });

  test('CASE G — structured low + contradictory drop-off prose FAILS', () => {
    const codes = evaluateStopExposureConsistency({
      name: 'Riverwalk Path',
      exposureLevel: 'low',
      note: 'This trail has long exposed cliff-edge drop-offs.',
    }, NO_EXPOSURE_PROMPT);
    expect(codes).toContain('exposure_prose_conflict');
  });

  test('CASE H — structured unknown + unsupported absolute safety FAILS', () => {
    const codes = evaluateStopExposureConsistency({
      name: 'Mystery Spur',
      exposureLevel: 'unknown',
      note: 'Completely safe and non-exposed.',
    }, NO_EXPOSURE_PROMPT);
    expect(codes).toContain('exposure_prose_conflict');
  });

  test('unsafe prose still conflicts under no-exposure constraint', () => {
    expect(hasUnsafeExposureProse('This trail has long exposed drop-offs.')).toBe(true);
    expect(hasUnsafeExposureProse('This route includes narrow ledges.')).toBe(true);
    expect(hasUnsafeExposureProse('This route includes narrow exposed ledges.')).toBe(true);
    expect(hasUnsafeExposureProse('There are substantial cliff-edge sections.')).toBe(true);
  });

  test('ranger concern check does not establish safety or conflict by itself', () => {
    expect(hasUnsafeExposureProse('Check with a ranger if exposure concerns you.')).toBe(false);
  });

  test('Watchman-like moderate still fails structured + prose', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          {
            name: 'Ridge Crest Trail',
            type: 'trail',
            duration: 120,
            exposureLevel: 'moderate',
            note: 'Moderate drop-offs; skip it if uncomfortable.',
          },
          { name: 'Riverwalk Path', type: 'trail', duration: 90, exposureLevel: 'low' },
        ]),
      ]),
      userPrompt: NO_EXPOSURE_PROMPT,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['exposure_constraint_violation', 'exposure_prose_conflict'])
    );
  });
});

describe('Fix Pass #3F — CASE I repair contract + Prompt v2', () => {
  test('CASE I — repair text requires frozen-bundle day fill without constraint change', () => {
    const text = buildCompletenessRepairInstructions({
      reasonCodes: ['insufficient_day_coverage', 'exposure_prose_conflict'],
      dayDiagnostics: [{ dayIndex: 1, dayNumber: 2, codes: ['insufficient_day_coverage'] }],
    });
    expect(text).toMatch(/Day 2/);
    expect(text).toMatch(/same user constraints/);
    expect(text).toMatch(/low-exposure|avoids exposed terrain/i);
    expect(text).not.toMatch(/Pa'?rus|Watchman|Zion/i);
  });

  test('architect contract communicates multi-day coverage + safe exposure prose', () => {
    const contract = getTaskContractV2('architect');
    expect(contract.text).toMatch(/substantial evidence-backed experience/i);
    expect(contract.text).toMatch(/low-exposure|avoids exposed terrain/i);
    expect(contract.text).toMatch(/do not narrate rejected high-exposure/i);
    expect(contract.text).not.toMatch(/Pa'?rus|Watchman|Zion National Park/i);
  });
});

describe('Fix Pass #3F — Zion-like offline replay (generic selection, frozen-like pool)', () => {
  test('known-low survive; high removed; safe prose ok; contradiction fails', () => {
    const rules = [{
      id: 'pool-high',
      type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT,
      subjects: ['High Ledge Spur', 'Moderate Rim Walk'],
      exposureLevel: 'high',
      sourceClass: 'official_nps',
    }, {
      id: 'pool-moderate',
      type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT,
      subjects: ['Moderate Rim Walk'],
      exposureLevel: 'moderate',
      sourceClass: 'official_nps',
    }];

    const candidate = plan([
      day(1, [
        {
          name: 'Known Low Walk',
          type: 'trail',
          duration: 100,
          exposureLevel: 'low',
          note: 'Low-exposure paved walk selected to avoid exposed terrain.',
        },
        {
          name: 'Canyon Mouth Overlook',
          type: 'viewpoint',
          duration: 40,
          exposureLevel: 'low',
          note: 'Roadside scenic overlook.',
        },
        {
          name: 'High Ledge Spur',
          type: 'trail',
          duration: 90,
          exposureLevel: 'high',
          note: 'Long exposed drop-offs.',
        },
      ]),
      day(2, [
        {
          name: 'Second Low Pool Trail',
          type: 'trail',
          duration: 110,
          exposureLevel: 'low',
          note: 'Easy low-exposure option.',
        },
        {
          name: 'Quiet Bend Overlook',
          type: 'viewpoint',
          duration: 35,
          exposureLevel: 'low',
          note: 'Low-exposure viewpoint.',
        },
        {
          name: 'Moderate Rim Walk',
          type: 'trail',
          duration: 120,
          exposureLevel: 'moderate',
          note: 'Moderate exposure along the rim.',
        },
      ]),
    ]);

    const filtered = applyOperationalConstraints(candidate, rules);
    const names = filtered.itinerary.days.flatMap((d) => d.stops.map((s) => s.name));
    expect(names).toEqual(expect.arrayContaining(['Known Low Walk', 'Second Low Pool Trail']));
    expect(names).not.toContain('High Ledge Spur');
    expect(names).not.toContain('Moderate Rim Walk');

    const ok = evaluateItineraryCompleteness({
      itineraryData: filtered.itinerary,
      constraints: { dates: { numDays: 2 } },
      userPrompt: NO_EXPOSURE_PROMPT,
    });
    expect(ok).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));

    const contradictory = JSON.parse(JSON.stringify(filtered.itinerary));
    contradictory.days[0].stops[0].note = 'Paved, but long exposed cliff-edge drop-offs.';
    const bad = evaluateItineraryCompleteness({
      itineraryData: contradictory,
      userPrompt: NO_EXPOSURE_PROMPT,
    });
    expect(bad.reasonCodes).toContain('exposure_prose_conflict');
  });
});

describe('Fix Pass #3F — sanitized plan-stage capture', () => {
  const prevFlag = process.env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES;
    else process.env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES = prevFlag;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  test('disabled by default', () => {
    delete process.env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES;
    process.env.NODE_ENV = 'test';
    expect(isPlanStageCaptureEnabled()).toBe(false);
    expect(makePlanStageCapturer({ runId: 'x' }).active).toBe(false);
  });

  test('when enabled in non-production, writes sanitized raw vs post-constraint plans', () => {
    process.env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES = 'true';
    process.env.NODE_ENV = 'test';
    const capturer = makePlanStageCapturer({ runId: `3f-${Date.now()}` });
    expect(capturer.active).toBe(true);
    const file = capturer.capture({
      attempt: 1,
      modelTier: 'terra-low',
      rawPlan: plan([
        day(1, [
          { name: 'Known Low Walk', type: 'trail', duration: 100, exposureLevel: 'low', note: 'ok' },
          { name: 'High Ledge Spur', exposureLevel: 'high', note: 'secret-token-should-not-matter' },
        ]),
      ]),
      postConstraintPlan: plan([
        day(1, [{ name: 'Known Low Walk', type: 'trail', duration: 100, exposureLevel: 'low', note: 'ok' }]),
      ]),
      reasonCodes: ['insufficient_day_coverage'],
      dayDiagnostics: [{ dayIndex: 0, dayNumber: 1, codes: ['insufficient_day_coverage'] }],
    });
    expect(file && fs.existsSync(file)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(parsed.rawPlan.days[0].stops).toHaveLength(2);
    expect(parsed.postConstraintPlan.days[0].stops).toHaveLength(1);
    expect(parsed.reasonCodes).toEqual(['insufficient_day_coverage']);
    expect(JSON.stringify(parsed)).not.toMatch(/Authorization|api[_-]?key|Bearer /i);
    fs.unlinkSync(file);
  });

  test('sanitizePlan strips to bounded stop fields', () => {
    const sanitized = sanitizePlan({
      days: [{ day: 1, stops: [{ name: 'A', note: 'x'.repeat(500), authToken: 'secret' }] }],
      systemPrompt: 'nope',
    });
    expect(sanitized.days[0].stops[0].note.length).toBeLessThanOrEqual(240);
    expect(sanitized.days[0].stops[0].authToken).toBeUndefined();
    expect(sanitized.systemPrompt).toBeUndefined();
    expect(PRIVATE_DIR).toContain(path.join('artifacts', 'private', 'plan_stages'));
    void os; // keep import intentional for future temp-dir variants
  });
});
