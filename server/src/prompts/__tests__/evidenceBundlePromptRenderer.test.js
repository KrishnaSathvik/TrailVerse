const { countPromptTokens } = require('../../utils/promptTokenAccounting');
const { renderEvidenceBundleForPrompt } = require('../evidenceBundlePromptRenderer');

const evidence = (overrides = {}) => ({
  evidenceId: 'ev:fees',
  topic: 'fees',
  claim: { text: 'Entrance fee: $35 per private vehicle.', normalizedValue: 35 },
  source: {
    provider: 'nps',
    sourceClass: 'official_owner',
    sourceId: 'yose-fees',
    url: 'https://www.nps.gov/yose/planyourvisit/fees.htm',
    title: 'Fees & Passes',
  },
  observation: { observedAt: '2026-08-08T12:00:00.000Z' },
  quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
  retention: { storeClaimText: true },
  ...overrides,
});

const bundle = {
  resolutions: [
    { requirementId: 'req-fees', status: 'satisfied_fresh', evidenceIds: ['ev:fees'] },
    { requirementId: 'req-weather', status: 'satisfied_fresh', evidenceIds: ['ev:weather'] },
  ],
  evidence: [
    evidence(),
    evidence({
      evidenceId: 'ev:weather', topic: 'weather_forecast',
      claim: { text: 'High 72F.', normalizedValue: { highF: 72 } },
      source: { provider: 'weather', sourceClass: 'official', url: 'https://weather.gov/example' },
      quality: { authorityClass: 'official', conflictStatus: 'none' },
    }),
  ],
};

describe('WP7 EvidenceBundle prompt renderer', () => {
  test('renders only evidence selected by the active requirement set as compact blocks', () => {
    const result = renderEvidenceBundleForPrompt({
      bundle,
      requirements: [{ requirementId: 'req-fees', topic: 'fees' }],
      maxTokens: 300,
    });

    expect(result.text).toContain('[NPS | fees | fresh | official_owner]');
    expect(result.text).toContain('Entrance fee: $35 per private vehicle.');
    expect(result.text).toContain('Observed: 2026-08-08T12:00:00.000Z');
    expect(result.text).toContain('Source: Fees & Passes — https://www.nps.gov/yose/planyourvisit/fees.htm');
    expect(result.text).not.toContain('72F');
    expect(result.includedEvidenceIds).toEqual(['ev:fees']);
  });

  test('does not dump storage, identity, or provenance fields into the prompt', () => {
    const result = renderEvidenceBundleForPrompt({
      bundle,
      requirements: [{ requirementId: 'req-fees', topic: 'fees' }],
      maxTokens: 300,
    });
    expect(result.text).not.toMatch(/evidenceId|sourceId|logicalKey|canonicalKey|provenance|retention|requestId/);
  });

  test('renders suitability metadata for named activity candidates', () => {
    const activityBundle = {
      resolutions: [{ requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:act'] }],
      evidence: [evidence({
        evidenceId: 'ev:act',
        topic: 'activities',
        claim: {
          text: "Pa'rus Trail: Paved accessible walk.",
          normalizedValue: {
            name: "Pa'rus Trail",
            difficulty: 'easy',
            exposureLevel: 'low',
            activityTypes: ['walk', 'hike'],
          },
          qualifiers: ['named_activity_candidate'],
        },
      })],
    };
    const result = renderEvidenceBundleForPrompt({
      bundle: activityBundle,
      requirements: [{
        requirementId: 'req-act',
        topic: 'activities',
        reasonCodes: ['requested_low_exposure_candidates'],
      }],
      maxTokens: 300,
    });
    expect(result.text).toContain('Suitability: difficulty=easy; exposureLevel=low; activityTypes=walk,hike');
  });

  test('enforces a hard token budget at complete-block boundaries', () => {
    const result = renderEvidenceBundleForPrompt({
      bundle,
      requirements: [
        { requirementId: 'req-fees', topic: 'fees' },
        { requirementId: 'req-weather', topic: 'weather_forecast' },
      ],
      maxTokens: 35,
    });
    expect(result.tokens).toBe(countPromptTokens(result.text));
    expect(result.tokens).toBeLessThanOrEqual(35);
    expect(result.truncated).toBe(true);
    expect(result.includedEvidenceIds.length + result.omittedEvidenceIds.length).toBe(2);
  });

  test('does not render mismatched topics or claim text forbidden by retention policy', () => {
    const guardedBundle = {
      resolutions: [{ requirementId: 'req-fees', status: 'satisfied_fresh', evidenceIds: ['ev:fees'] }],
      evidence: [evidence({ retention: { storeClaimText: false } })],
    };
    const hidden = renderEvidenceBundleForPrompt({
      bundle: guardedBundle,
      requirements: [{ requirementId: 'req-fees', topic: 'fees' }],
      maxTokens: 300,
    });
    expect(hidden.text).not.toContain('Entrance fee: $35');
    expect(hidden.text).toContain('Value: 35');

    const wrongTopic = renderEvidenceBundleForPrompt({
      bundle,
      requirements: [{ requirementId: 'req-fees', topic: 'closures' }],
      maxTokens: 300,
    });
    expect(wrongTopic.text).toBe('');
    expect(wrongTopic.includedEvidenceIds).toEqual([]);
  });

  test('late-September hiking evidence excludes winter and skiing-specific candidates', () => {
    const activityBundle = {
      resolutions: [{
        requirementId: 'req-act', status: 'satisfied_fresh',
        evidenceIds: ['ev:big-trees', 'ev:winter'],
      }],
      evidence: [
        evidence({
          evidenceId: 'ev:big-trees', entityId: 'nps:park:sequ', topic: 'activities',
          claim: {
            text: 'Big Trees Trail: An easy accessible path around a meadow of mature sequoias.',
            normalizedValue: {
              name: 'Big Trees Trail', difficulty: 'easy', activityTypes: ['walk', 'hike'],
            },
            qualifiers: ['named_activity_candidate'],
          },
        }),
        evidence({
          evidenceId: 'ev:winter', entityId: 'nps:park:sequ', topic: 'activities',
          claim: {
            text: 'Crescent Winter Trail: The skiing is mostly easy.',
            normalizedValue: {
              name: 'Crescent Winter Trail', difficulty: 'easy',
              activityTypes: ['cross-country skiing', 'hike'],
            },
            qualifiers: ['named_activity_candidate'],
          },
        }),
      ],
    };
    const result = renderEvidenceBundleForPrompt({
      bundle: activityBundle,
      requirements: [{
        requirementId: 'req-act', topic: 'activities',
        temporalScope: { mode: 'season', validFrom: null, validThrough: null },
        reasonCodes: ['compare_named_hike_parity'],
      }],
      userRequest: 'Easy hikes in late September',
      maxTokens: 600,
    });

    expect(result.text).toContain('Big Trees Trail');
    expect(result.text).not.toContain('Crescent Winter Trail');
    expect(result.seasonallyExcludedEvidenceIds).toEqual(['ev:winter']);
  });

  test('winter-specific candidates remain eligible for an explicit January trip', () => {
    const winter = evidence({
      evidenceId: 'ev:winter', entityId: 'nps:park:sequ', topic: 'activities',
      claim: {
        text: 'Sunset Rock Winter Trail: Ski or snowshoe to a sunset viewpoint.',
        normalizedValue: {
          name: 'Sunset Rock Winter Trail', difficulty: 'easy',
          activityTypes: ['cross-country skiing', 'snowshoeing'],
        },
        qualifiers: ['named_activity_candidate'],
      },
    });
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [{ requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:winter'] }],
        evidence: [winter],
      },
      requirements: [{ requirementId: 'req-act', topic: 'activities' }],
      userRequest: 'Easy winter activities in January',
      maxTokens: 400,
    });

    expect(result.text).toContain('Sunset Rock Winter Trail');
    expect(result.seasonallyExcludedEvidenceIds).toEqual([]);
  });

  test('winter trips exclude explicit summer-only evidence', () => {
    const summer = evidence({
      evidenceId: 'ev:summer', entityId: 'nps:park:test', topic: 'activities',
      claim: {
        text: 'Summer Lake Tour: This activity operates only from June through August.',
        normalizedValue: {
          name: 'Summer Lake Tour', difficulty: 'easy', activityTypes: ['walk'],
        },
        qualifiers: ['named_activity_candidate'],
      },
    });
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [{ requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:summer'] }],
        evidence: [summer],
      },
      requirements: [{ requirementId: 'req-act', topic: 'activities' }],
      userRequest: 'What can I do here in January?',
      maxTokens: 400,
    });

    expect(result.text).toBe('');
    expect(result.seasonallyExcludedEvidenceIds).toEqual(['ev:summer']);
  });

  test('authoritative year-round hiking language overrides a seasonal-looking title', () => {
    const yearRound = evidence({
      evidenceId: 'ev:year-round', entityId: 'nps:park:test', topic: 'activities',
      claim: {
        text: 'Winter Ridge Trail: Open year-round for hiking; skiing is an additional winter use.',
        normalizedValue: {
          name: 'Winter Ridge Trail', difficulty: 'easy', activityTypes: ['hike', 'skiing'],
        },
        qualifiers: ['named_activity_candidate'],
      },
    });
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [{ requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:year-round'] }],
        evidence: [yearRound],
      },
      requirements: [{ requirementId: 'req-act', topic: 'activities' }],
      userRequest: 'Easy hiking in September',
      maxTokens: 400,
    });

    expect(result.text).toContain('Winter Ridge Trail');
    expect(result.seasonallyExcludedEvidenceIds).toEqual([]);
  });

  test('retains seasonally uncertain evidence with an explicit non-primary warning', () => {
    const uncertain = evidence({
      evidenceId: 'ev:uncertain', entityId: 'nps:park:test', topic: 'activities',
      claim: {
        text: 'Meadow Loop: This seasonal route follows a quiet meadow edge.',
        normalizedValue: {
          name: 'Meadow Loop', difficulty: 'easy', activityTypes: ['hike'],
          seasonalStatus: 'season_unknown',
        },
        qualifiers: ['named_activity_candidate'],
      },
    });
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [{ requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:uncertain'] }],
        evidence: [uncertain],
      },
      requirements: [{ requirementId: 'req-act', topic: 'activities' }],
      userRequest: 'Easy hiking in September',
      maxTokens: 400,
    });

    expect(result.text).toContain('Meadow Loop');
    expect(result.text).toContain('Seasonal suitability: uncertain for the requested timing');
    expect(result.seasonallyExcludedEvidenceIds).toEqual([]);
  });

  test('does not infer a hard season restriction from an incidental season word', () => {
    const historical = evidence({
      evidenceId: 'ev:summer-home', entityId: 'nps:park:test', topic: 'activities',
      claim: {
        text: 'A Summer Home: Learn how this historic cabin was used by an early park family.',
        normalizedValue: { name: 'A Summer Home', activityTypes: [] },
        qualifiers: ['named_place_candidate'],
      },
    });
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [{ requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:summer-home'] }],
        evidence: [historical],
      },
      requirements: [{ requirementId: 'req-act', topic: 'activities' }],
      userRequest: 'What can I do here in January?',
      maxTokens: 400,
    });

    expect(result.text).toContain('A Summer Home');
    expect(result.seasonallyExcludedEvidenceIds).toEqual([]);
  });

  test('packs access/parking decision evidence before a pile of named wildlife activities', () => {
    const activityIds = Array.from({ length: 8 }, (_, index) => `ev:wildlife-${index + 1}`);
    const accessBundle = {
      resolutions: [
        { requirementId: 'req-roads', status: 'satisfied_fresh', evidenceIds: ['ev:roads'] },
        { requirementId: 'req-transit', status: 'satisfied_fresh', evidenceIds: ['ev:transit'] },
        { requirementId: 'req-permits', status: 'satisfied_fresh', evidenceIds: ['ev:permits'] },
        { requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: activityIds },
      ],
      evidence: [
        evidence({
          evidenceId: 'ev:roads',
          topic: 'roads',
          claim: { text: 'Going-to-the-Sun Road access and Logan Pass parking are first-come, first-served.' },
          source: { provider: 'nps', sourceClass: 'official_owner', title: 'Road Status' },
        }),
        evidence({
          evidenceId: 'ev:transit',
          topic: 'transit',
          claim: { text: 'A shuttle reservation is the hedge when Logan Pass parking is full.' },
          source: { provider: 'nps', sourceClass: 'official_owner', title: 'Shuttle' },
        }),
        evidence({
          evidenceId: 'ev:permits',
          topic: 'permits_reservations',
          claim: { text: 'No vehicle reservation is required for this day trip.' },
          source: { provider: 'nps', sourceClass: 'official_owner', title: 'Reservations' },
        }),
        ...activityIds.map((evidenceId, index) => evidence({
          evidenceId,
          topic: 'activities',
          claim: {
            text: `Wildlife stop ${index + 1}: bighorn sheep and birdwatching from a parking area.`,
            normalizedValue: {
              name: `Wildlife stop ${index + 1}`,
              difficulty: 'easy',
              exposureLevel: 'low',
              activityTypes: ['wildlife watching'],
            },
            qualifiers: ['named_activity_candidate'],
          },
        })),
      ],
    };

    const result = renderEvidenceBundleForPrompt({
      bundle: accessBundle,
      requirements: [
        { requirementId: 'req-roads', topic: 'roads', reasonCodes: ['access_decision_support'] },
        { requirementId: 'req-transit', topic: 'transit', reasonCodes: ['access_decision_support'] },
        { requirementId: 'req-permits', topic: 'permits_reservations', reasonCodes: ['access_decision_support'] },
        { requirementId: 'req-act', topic: 'activities', reasonCodes: ['access_decision_support'] },
      ],
      maxTokens: 220,
    });

    expect(result.includedEvidenceIds).toEqual(expect.arrayContaining(['ev:roads', 'ev:transit', 'ev:permits']));
    expect(result.includedEvidenceIds.indexOf('ev:roads')).toBeLessThan(
      result.includedEvidenceIds.findIndex((id) => String(id).startsWith('ev:wildlife-'))
    );
    expect(result.text).toContain('Logan Pass parking');
    expect(result.text).toContain('shuttle reservation');
  });

  test('does not let a wrong-park official-page dump starve access mechanics for the requested park', () => {
    const glac = { entityId: 'nps:park:glac', displayName: 'Glacier National Park' };
    const dump = `${'North Cascades trail conditions. '.repeat(80)}Ross Lake has been very hazy.`;
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [
          { requirementId: 'req-roads', status: 'satisfied_stale_safe', evidenceIds: ['ev:wrong-park', 'ev:logan-parking'] },
          { requirementId: 'req-transit', status: 'satisfied_fresh', evidenceIds: ['ev:shuttle'] },
        ],
        evidence: [
          evidence({
            evidenceId: 'ev:wrong-park',
            entityId: 'nps:park:glac',
            topic: 'roads',
            claim: { text: dump, subjectId: 'nps:park:glac' },
            source: {
              provider: 'direct_official_page',
              sourceClass: 'official_owner',
              title: 'Trail Conditions - North Cascades',
              url: 'https://www.nps.gov/noca/planyourvisit/trail-conditions.htm',
            },
          }),
          evidence({
            evidenceId: 'ev:logan-parking',
            entityId: 'nps:park:glac',
            topic: 'roads',
            claim: { text: 'Logan Pass parking is first-come, first-served and often fills by mid-morning.' },
            source: {
              provider: 'nps',
              sourceClass: 'official_owner',
              title: 'Logan Pass',
              url: 'https://www.nps.gov/glac/planyourvisit/loganpass.htm',
            },
          }),
          evidence({
            evidenceId: 'ev:shuttle',
            entityId: 'nps:park:glac',
            topic: 'transit',
            claim: { text: 'The Going-to-the-Sun Road shuttle is the backup when Logan Pass parking is full.' },
            source: {
              provider: 'nps',
              sourceClass: 'official_owner',
              title: 'Shuttle',
              url: 'https://www.nps.gov/glac/planyourvisit/shuttle.htm',
            },
          }),
        ],
      },
      requirements: [
        {
          requirementId: 'req-roads',
          topic: 'roads',
          entity: glac,
          reasonCodes: ['access_decision_support'],
          renderBudgetTokens: 180,
        },
        {
          requirementId: 'req-transit',
          topic: 'transit',
          entity: glac,
          reasonCodes: ['access_decision_support'],
          renderBudgetTokens: 180,
        },
      ],
      userRequest:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
      maxTokens: 260,
    });

    expect(result.includedEvidenceIds).toEqual(expect.arrayContaining(['ev:logan-parking', 'ev:shuttle']));
    expect(result.text).toContain('Logan Pass parking');
    expect(result.text).toContain('shuttle');
    expect(result.text).not.toMatch(/North Cascades/);
  });

  test('Grand Canyon operational pages cannot crowd Glacier access evidence', () => {
    const glac = { entityId: 'nps:park:glac', displayName: 'Glacier National Park' };
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [
          { requirementId: 'req-roads', status: 'satisfied_fresh', evidenceIds: ['ev:grca', 'ev:glac-parking'] },
        ],
        evidence: [
          evidence({
            evidenceId: 'ev:grca',
            entityId: 'nps:park:glac',
            topic: 'roads',
            claim: { text: 'Grand Canyon shuttle, parking, and timed entry details. '.repeat(40) },
            source: {
              provider: 'direct_official_page',
              sourceClass: 'official_owner',
              title: 'Grand Canyon Operations',
              url: 'https://www.nps.gov/grca/planyourvisit/operations.htm',
            },
          }),
          evidence({
            evidenceId: 'ev:glac-parking',
            entityId: 'nps:park:glac',
            topic: 'roads',
            claim: { text: 'Logan Pass parking is first-come, first-served and often fills by mid-morning.' },
            source: {
              provider: 'nps',
              sourceClass: 'official_owner',
              title: 'Logan Pass',
              url: 'https://www.nps.gov/glac/planyourvisit/loganpass.htm',
            },
          }),
        ],
      },
      requirements: [{
        requirementId: 'req-roads',
        topic: 'roads',
        entity: glac,
        reasonCodes: ['access_decision_support'],
        renderBudgetTokens: 180,
      }],
      userRequest: "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
      maxTokens: 400,
    });
    expect(result.includedEvidenceIds).toEqual(['ev:glac-parking']);
    expect(result.text).toContain('Logan Pass parking');
    expect(result.text).not.toMatch(/Grand Canyon/);
  });

  test('a giant official HTML dump cannot consume the whole access prompt', () => {
    const dump = `${'Official page navigation footer cookie banner '.repeat(200)}Logan Pass parking fills early.`;
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [
          { requirementId: 'req-roads', status: 'satisfied_fresh', evidenceIds: ['ev:dump'] },
          { requirementId: 'req-transit', status: 'satisfied_fresh', evidenceIds: ['ev:shuttle'] },
        ],
        evidence: [
          evidence({
            evidenceId: 'ev:dump',
            topic: 'roads',
            claim: { text: dump },
            source: { provider: 'direct_official_page', sourceClass: 'official_owner', title: 'Huge page' },
          }),
          evidence({
            evidenceId: 'ev:shuttle',
            topic: 'transit',
            claim: { text: 'The Going-to-the-Sun Road shuttle requires a reservation on Recreation.gov.' },
            source: { provider: 'nps', sourceClass: 'official_owner', title: 'Shuttle' },
          }),
        ],
      },
      requirements: [
        { requirementId: 'req-roads', topic: 'roads', reasonCodes: ['access_decision_support'], renderBudgetTokens: 80 },
        { requirementId: 'req-transit', topic: 'transit', reasonCodes: ['access_decision_support'], renderBudgetTokens: 80 },
      ],
      userRequest: 'What if Logan Pass parking does not work out?',
      maxTokens: 220,
    });
    expect(result.text).toContain('shuttle requires a reservation');
    expect(countPromptTokens(result.text)).toBeLessThanOrEqual(220);
    expect(result.text.length).toBeLessThan(dump.length);
  });

  test('parking and shuttle mechanics outrank a wildlife parking-lot mention on an access question', () => {
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [
          { requirementId: 'req-roads', status: 'satisfied_fresh', evidenceIds: ['ev:sheep', 'ev:parking'] },
          { requirementId: 'req-transit', status: 'satisfied_fresh', evidenceIds: ['ev:shuttle'] },
        ],
        evidence: [
          evidence({
            evidenceId: 'ev:sheep',
            topic: 'activities',
            claim: {
              text: 'Bighorn sheep can often be seen in the parking lot of Logan Pass licking antifreeze from the pavement.',
              normalizedValue: {
                name: 'Bighorn Sheep',
                difficulty: 'easy',
                exposureLevel: 'low',
                activityTypes: ['wildlife watching'],
              },
              qualifiers: ['named_activity_candidate'],
            },
          }),
          evidence({
            evidenceId: 'ev:parking',
            topic: 'roads',
            claim: { text: 'Logan Pass parking is first-come, first-served and often fills by mid-morning.' },
            source: { provider: 'nps', sourceClass: 'official_owner', title: 'Parking' },
          }),
          evidence({
            evidenceId: 'ev:shuttle',
            topic: 'transit',
            claim: { text: 'A ticketed shuttle is available; reserve on Recreation.gov rather than treating it as a same-day overflow lot.' },
            source: { provider: 'nps', sourceClass: 'official_owner', title: 'Shuttle' },
          }),
        ],
      },
      requirements: [
        { requirementId: 'req-roads', topic: 'roads', reasonCodes: ['access_decision_support'] },
        { requirementId: 'req-transit', topic: 'transit', reasonCodes: ['access_decision_support'] },
        { requirementId: 'req-act', topic: 'activities', reasonCodes: ['access_decision_support'] },
      ],
      userRequest: "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
      maxTokens: 160,
    });
    expect(result.includedEvidenceIds).toEqual(expect.arrayContaining(['ev:parking', 'ev:shuttle']));
    expect(result.includedEvidenceIds.indexOf('ev:parking')).toBeLessThan(
      result.includedEvidenceIds.indexOf('ev:sheep') === -1
        ? Number.POSITIVE_INFINITY
        : result.includedEvidenceIds.indexOf('ev:sheep')
    );
    expect(result.text).toContain('first-come');
    expect(result.text).toContain('shuttle');
    expect(result.text).not.toMatch(/licking antifreeze/i);
  });

  test('does not prefer easy/low-exposure activities unless the traveler asked for that', () => {
    const mixed = {
      resolutions: [{
        requirementId: 'req-act', status: 'satisfied_fresh',
        evidenceIds: ['ev:highline', 'ev:easy-walk'],
      }],
      evidence: [
        evidence({
          evidenceId: 'ev:highline',
          topic: 'activities',
          claim: {
            text: 'Highline Trail: dramatic cliffside path starting at Logan Pass.',
            normalizedValue: {
              name: 'Highline Trail',
              difficulty: 'moderate',
              exposureLevel: 'high',
              activityTypes: ['hike', 'trail'],
            },
            qualifiers: ['named_activity_candidate'],
          },
        }),
        evidence({
          evidenceId: 'ev:easy-walk',
          topic: 'activities',
          claim: {
            text: 'ZZZ Easy Walk: a paved accessible stroll.',
            normalizedValue: {
              name: 'ZZZ Easy Walk',
              difficulty: 'easy',
              exposureLevel: 'low',
              activityTypes: ['hike', 'walk'],
            },
            qualifiers: ['named_activity_candidate'],
          },
        }),
      ],
    };

    const hikeAsk = renderEvidenceBundleForPrompt({
      bundle: mixed,
      requirements: [{
        requirementId: 'req-act',
        topic: 'activities',
        reasonCodes: ['requested_named_hike_or_walk'],
      }],
      maxTokens: 90,
    });
    expect(hikeAsk.includedEvidenceIds[0]).toBe('ev:highline');
    expect(hikeAsk.includedEvidenceIds).not.toContain('ev:easy-walk');

    const easyAsk = renderEvidenceBundleForPrompt({
      bundle: mixed,
      requirements: [{
        requirementId: 'req-act',
        topic: 'activities',
        reasonCodes: ['requested_named_hike_or_walk', 'requested_low_exposure_candidates'],
      }],
      maxTokens: 90,
    });
    expect(easyAsk.includedEvidenceIds[0]).toBe('ev:easy-walk');
  });

  test('low-exposure packing prefers mixed non-trail experiences over unknown trails', () => {
    const named = (id, name, types, exposureLevel, topic = 'activities') => evidence({
      evidenceId: id,
      topic,
      claim: {
        text: `${name} candidate`,
        normalizedValue: { name, activityTypes: types, exposureLevel },
        qualifiers: types.includes('visitor_center') ? ['named_place_candidate'] : ['named_activity_candidate'],
      },
    });
    const mixed = {
      resolutions: [
        { requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:unknown-trail', 'ev:drive', 'ev:museum', 'ev:walk'] },
        { requirementId: 'req-vs', status: 'satisfied_fresh', evidenceIds: ['ev:vc'] },
      ],
      evidence: [
        named('ev:unknown-trail', 'Unknown Ridge Trail', ['hike', 'trail'], null),
        named('ev:drive', 'Canyon Scenic Drive', ['scenic_drive'], null),
        named('ev:museum', 'History Museum', ['museum'], null),
        named('ev:walk', 'Paved River Walk', ['walk'], 'low'),
        named('ev:vc', 'Visitor Center', ['visitor_center'], null, 'visitor_services'),
      ],
    };
    const result = renderEvidenceBundleForPrompt({
      bundle: mixed,
      requirements: [
        { requirementId: 'req-act', topic: 'activities', reasonCodes: ['requested_low_exposure_candidates'] },
        { requirementId: 'req-vs', topic: 'visitor_services', reasonCodes: ['mobility_short_experience'] },
      ],
      maxTokens: 400,
    });
    expect(result.includedEvidenceIds).toEqual(expect.arrayContaining(['ev:drive', 'ev:vc']));
    expect(result.includedEvidenceIds.indexOf('ev:unknown-trail'))
      .toBeGreaterThan(result.includedEvidenceIds.indexOf('ev:drive'));
  });

  test('mobility packing prefers explicitly measured short walks over unknown or longer trails', () => {
    const named = (id, name, miles) => evidence({
      evidenceId: id,
      topic: 'activities',
      claim: {
        text: `${name} is a walking experience.`,
        normalizedValue: {
          name,
          activityTypes: ['hike', 'walk'],
          difficulty: 'easy',
          walkingDistanceMiles: miles,
        },
        qualifiers: ['named_activity_candidate'],
      },
    });
    const bundle = {
      resolutions: [{
        requirementId: 'req-mobility',
        status: 'satisfied_fresh',
        evidenceIds: ['ev-long', 'ev-unknown', 'ev-short'],
      }],
      evidence: [
        named('ev-long', 'Long Loop', 2.4),
        named('ev-unknown', 'Unknown Loop', null),
        named('ev-short', 'Short Loop', 0.7),
      ],
    };
    const result = renderEvidenceBundleForPrompt({
      bundle,
      requirements: [{
        requirementId: 'req-mobility',
        topic: 'activities',
        reasonCodes: ['mobility_short_experience', 'requested_low_walking_candidates'],
      }],
      maxTokens: 300,
    });
    expect(result.includedEvidenceIds[0]).toBe('ev-short');
    expect(result.includedEvidenceIds.indexOf('ev-unknown'))
      .toBeGreaterThan(result.includedEvidenceIds.indexOf('ev-short'));
  });
});
