'use strict';

const {
  evaluateItineraryCompleteness,
  extractRefinementMutations,
  collectStructuredAlternatives,
  buildCompletenessRepairInstructions,
} = require('../itineraryCompleteness');

describe('itineraryCompleteness v2', () => {
  test('rejects visitor-center + lunch as a full sightseeing day', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Zion Canyon Visitor Center', type: 'visitor_center', duration: 45 },
            { name: 'Springdale lunch and heat break', duration: 90 },
          ],
        }],
      },
      userPrompt: 'Plan a realistic 2-day Zion trip with scenic views and easy-to-moderate hikes',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['missing_experience_anchor'])
    );
  });

  test('rejects backup-requested plans that only sequence a later stop without structured alternatives', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Logan Pass area walk', type: 'trail', duration: 90 },
            { name: 'Lake McDonald shoreline finish', duration: 120 },
          ],
        }],
      },
      userPrompt:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('accepts a one-day plan with primary structure plus structured alternatives backup', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            {
              name: 'Logan Pass area walk',
              type: 'trail',
              duration: 90,
              alternatives: [
                { name: 'Avalanche Lake trail from the Going-to-the-Sun corridor' },
                { name: 'Lake McDonald shoreline + Apgar lookouts' },
              ],
            },
            { name: 'Hidden Lake overlook if open', type: 'landmark', duration: 60 },
          ],
        }],
        alternatives: [
          { name: 'Avalanche Creek / Trail of the Cedars loop' },
          { name: 'Lake McDonald shoreline from Apgar' },
        ],
      },
      userPrompt:
        'What should I prioritize, and what is a good backup plan if Logan Pass access or parking does not work out?',
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('requires identifiable easy hike and sunset when explicitly asked', () => {
    const thin = evaluateItineraryCompleteness({
      itineraryData: {
        days: [
          {
            day: 1,
            stops: [
              { name: 'Park orientation stop', duration: 30 },
              { name: 'Midday retreat and lunch break', duration: 150 },
              { name: 'Ranger-confirmed sunset viewpoint', duration: 75 },
            ],
          },
          {
            day: 2,
            stops: [
              { name: 'Atlatl Rock viewing area', type: 'landmark', duration: 35 },
              { name: 'Long cool-down and snack', duration: 90 },
            ],
          },
        ],
      },
      constraints: { dates: { durationDays: 2 } },
      userPrompt: 'Plan a relaxed weekend with easy hikes and sunset spots',
    });
    expect(thin.ok).toBe(false);
    expect(thin.reasonCodes).toEqual(
      expect.arrayContaining(['missing_requested_hike', 'missing_requested_sunset'])
    );

    const good = evaluateItineraryCompleteness({
      itineraryData: {
        days: [
          {
            day: 1,
            stops: [
              { name: 'Mouse’s Tank Trail easy walk', type: 'trail', duration: 60 },
              { name: 'Midday retreat and rest', duration: 180 },
              { name: 'Elephant Rock sunset overlook', type: 'landmark', duration: 60 },
            ],
          },
          {
            day: 2,
            stops: [
              { name: 'Atlatl Rock petroglyph walk', type: 'trail', duration: 45 },
              { name: 'Scenic drive overlooks', type: 'landmark', duration: 90 },
            ],
          },
        ],
      },
      constraints: { dates: { durationDays: 2 } },
      userPrompt: 'Plan a relaxed weekend with easy hikes and sunset spots',
    });
    expect(good).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('rejects under-filled day counts when constraints request more days', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{ day: 1, stops: [{ name: 'Pa’rus Trail', type: 'trail', duration: 120 }, { name: 'Canyon viewpoint', type: 'landmark', duration: 45 }] }],
      },
      constraints: { dates: { numDays: 2 } },
      userPrompt: 'Plan a realistic 2-day Zion trip',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('underfilled_day_count');
  });

  test('rejects empty days', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: { days: [{ day: 1, stops: [] }, { day: 2, stops: [{ name: 'Riverside Walk', type: 'trail', duration: 90 }] }] },
      userPrompt: 'Plan 2 days',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('empty_day');
  });

  test('refinement add-sunset rejects Flexible final scenic hour', () => {
    const mutations = extractRefinementMutations(
      'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.'
    );
    expect(mutations.some((m) => m.type === 'add' && m.target.includes('sunset'))).toBe(true);

    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [
          {
            day: 1,
            stops: [
              { name: 'Pa’rus Trail out-and-back', type: 'trail', duration: 120 },
              { name: 'Springdale lunch & rest break', duration: 120 },
            ],
          },
          {
            day: 2,
            stops: [
              { name: 'Unhurried lunch and scenic pause', duration: 90 },
              { name: 'Flexible final scenic hour', duration: 60 },
            ],
          },
        ],
      },
      userPrompt: 'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.',
      isRefinement: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['missing_requested_sunset', 'refinement_missing_added_sunset'])
    );
  });

  test('refinement add-sunset accepts an identifiable sunset stop', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [
          {
            day: 1,
            stops: [
              { name: 'Pa’rus Trail out-and-back', type: 'trail', duration: 120 },
              { name: 'Springdale lunch & rest break', duration: 90 },
            ],
          },
          {
            day: 2,
            stops: [
              { name: 'Canyon Overlook Trail', type: 'trail', duration: 90 },
              { name: 'Watchman Trail sunset viewpoint', type: 'landmark', duration: 75 },
            ],
          },
        ],
      },
      userPrompt: 'Actually make it more relaxed and add one good sunset spot.',
      isRefinement: true,
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('collectStructuredAlternatives ignores unnamed placeholders', () => {
    expect(collectStructuredAlternatives({
      alternatives: [{ name: 'Flexible scenic hour' }, { name: 'Avalanche Lake trail' }],
    }).map((a) => a.name)).toEqual(['Avalanche Lake trail']);
  });

  test('rejects indoor-only backup when an outdoor access contingency was requested', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Logan Pass short on-foot exploration', type: 'trail', duration: 60 },
            { name: 'Glacier National Park park film', duration: 45 },
          ],
        }],
        alternatives: [{ name: 'Glacier National Park park film' }],
      },
      userPrompt:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('rejects Watchman-like moderate exposure when user forbids exposed trails', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            {
              name: 'Watchman Trail',
              type: 'trail',
              duration: 120,
              exposureLevel: 'moderate',
              note: 'Moderate drop-offs; skip it if uncomfortable.',
            },
            { name: "Pa'rus Trail", type: 'trail', duration: 90 },
          ],
        }],
      },
      userPrompt:
        'Plan a realistic 2-day Zion trip for a couple who want scenic views, easy-to-moderate walking, and no exposed scary trails.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['exposure_constraint_violation', 'exposure_prose_conflict'])
    );
  });

  test('accepts easy named hike when requested', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: "Mouse's Tank Trail", type: 'trail', duration: 60 },
            { name: 'Atlatl Rock sunset viewpoint', type: 'landmark', duration: 45, note: 'Sunset light on the panels.' },
          ],
        }],
      },
      userPrompt: 'Plan a relaxed 2-day Valley of Fire trip from Las Vegas with easy hikes and a sunset spot.',
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('backup A — explicit contingency request requires structured backup', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Main Access overlook walk', type: 'trail', duration: 120 },
            { name: 'Rim scenic pullout', type: 'landmark', duration: 45 },
          ],
        }],
      },
      userPrompt: 'Plan one day in Park X. Give me a backup if Main Access is closed.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('backup B — identical primary and fallback is invalid', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            {
              name: 'Main Access overlook walk',
              type: 'trail',
              duration: 120,
              alternatives: [{ name: 'Main Access overlook walk' }],
            },
          ],
        }],
        alternatives: [{ name: 'Main Access overlook walk' }],
      },
      userPrompt: 'Plan one day in Park X. Give me a backup if Main Access is closed.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('backup C — "check conditions" alone does not count as backup', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            {
              name: 'Main Access overlook walk',
              type: 'trail',
              duration: 120,
              alternatives: [{ name: 'Check conditions with a ranger' }],
            },
          ],
        }],
        alternatives: [{ name: 'Verify access status same-day' }],
      },
      userPrompt: 'Plan one day in Park X. Give me a backup if Main Access is closed.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('backup D — alternate area independent of blocked access is valid', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            {
              name: 'Main Access overlook walk',
              type: 'trail',
              duration: 120,
              alternatives: [{ name: 'Valley Floor boardwalk and lake shoreline' }],
            },
          ],
        }],
        alternatives: [{ name: 'Valley Floor boardwalk and lake shoreline' }],
      },
      userPrompt: 'Plan one day in Park X. Give me a backup if Main Access is closed.',
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('backup independence — explanatory mention of blocked place is NOT dependency', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            {
              name: 'Logan Pass — bighorn sheep viewing',
              type: 'landmark',
              duration: 60,
              note: 'Priority if Logan Pass access and parking work.',
            },
            {
              name: 'Glacier birdwatching and wildlife watching',
              type: 'custom',
              duration: 120,
              note: 'Unhurried wildlife observation in the park.',
            },
          ],
        }],
        alternatives: [
          {
            name: 'Lakeshore View of Many Glacier Hotel',
            note: 'Independent contingency that does not depend on Logan Pass.',
            when: 'If Logan Pass access or parking does not work out',
          },
          {
            name: 'Wild Goose Island: Ice Age Glaciers',
            note: 'Named scenic fallback away from Logan Pass parking.',
            when: 'If Logan Pass access or parking does not work out',
          },
        ],
      },
      userPrompt:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('backup independence — backup place identity that requires blocked access still FAILS', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Hidden Lake overlook', type: 'trail', duration: 120 },
            { name: 'Lake McDonald shoreline', type: 'landmark', duration: 60 },
          ],
        }],
        alternatives: [
          {
            name: 'Highline Trail from Logan Pass',
            note: 'Still starts at the blocked access subject.',
          },
        ],
      },
      userPrompt:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('backup E — no explicit backup request does not require alternatives', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Valley Floor boardwalk', type: 'trail', duration: 90 },
            { name: 'Lake shoreline viewpoint', type: 'landmark', duration: 45 },
          ],
        }],
      },
      userPrompt: 'Plan one day with easy walks and scenic views.',
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('repair instructions for missing_backup_plan require independent outdoor fallback', () => {
    const text = buildCompletenessRepairInstructions({
      reasonCodes: ['missing_backup_plan'],
      dayDiagnostics: [],
    });
    expect(text).toMatch(/alternatives/i);
    expect(text).toMatch(/frozen EvidenceBundle/i);
    expect(text).toMatch(/access|parking|primary/i);
    expect(text).not.toMatch(/check conditions alone counts/i);
  });

  test('refinement completeness rejects a truncated plan that dropped unaffected days', () => {
    const prior = {
      days: [
        { day: 1, stops: [{ name: 'Day 1 place', type: 'viewpoint', duration: 90 }] },
        { day: 2, stops: [{ name: 'Day 2 place', type: 'scenic_drive', duration: 120 }] },
        { day: 3, stops: [{ name: 'Day 3 place', type: 'visitor_center', duration: 60 }] },
      ],
    };
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{ day: 2, stops: [{ name: 'Slower Day 2', type: 'scenic_drive', duration: 90 }] }],
      },
      constraints: { dates: { numDays: 3 } },
      userPrompt: 'Make Day 2 slower and reduce driving.',
      priorItineraryData: prior,
      isRefinement: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('refinement_dropped_unaffected_days');
  });

  test('rejects renamed duplicates of the same place as two experiences', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: "Pa'rus Trail", type: 'trail', duration: 90 },
            { name: "Pa'rus Trail riverside exhibits", type: 'landmark', duration: 45 },
          ],
        }],
      },
      userPrompt: 'Plan a realistic 2-day Zion trip for a couple who want scenic views and easy walking.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('duplicate_base_experience');
  });
});

describe('explicit lighter day edits', () => {
  const days = [
    { dayNumber: 1, stops: [{ name: 'River Trail', type: 'trail', duration: 120 }] },
    { dayNumber: 2, stops: [{ name: 'Canyon Viewpoint', type: 'viewpoint', duration: 30 }] },
  ];
  const evaluate = overrides => evaluateItineraryCompleteness({ itineraryData: { days }, userPrompt: 'Redo day two and make it easier.', isRefinement: true, touchedDayNumbers: [2], ...overrides });
  test('a request for easier sightseeing does not waive absolute day value', () => {
    expect(evaluate().reasonCodes).toContain('insufficient_day_coverage');
  });
  test('fatigue alone does not assert a rest day or a time limit', () => {
    const userPrompt = "We're exhausted. Simplify tomorrow.";
    expect(evaluate({ userPrompt }).reasonCodes).toContain('insufficient_day_coverage');
    expect(evaluate({ userPrompt, touchedDayNumbers: [1] }).reasonCodes).toContain('insufficient_day_coverage');
  });
  test('does not weaken the full-plan or untouched-day coverage requirement', () => {
    expect(evaluate({ isRefinement: false }).reasonCodes).toContain('insufficient_day_coverage');
    expect(evaluate({ touchedDayNumbers: [1] }).reasonCodes).toContain('insufficient_day_coverage');
  });
  test('still rejects empty days and unknown exposure', () => {
    expect(evaluate({ itineraryData: { days: [days[0], { dayNumber: 2, stops: [] }] } }).reasonCodes).toContain('empty_day');
    expect(evaluate({ constraints: { avoidExposure: true } }).reasonCodes).toContain('constraint_eligibility_unknown');
  });
});
