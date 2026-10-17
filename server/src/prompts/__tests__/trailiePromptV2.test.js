const { countPromptTokens } = require('../../utils/promptTokenAccounting');
const { buildTrailiePromptV2 } = require('../trailiePromptV2');

const evidenceBundle = {
  resolutions: [{ requirementId: 'req-fees', status: 'satisfied_fresh', evidenceIds: ['ev:fees'] }],
  evidence: [{
    evidenceId: 'ev:fees', topic: 'fees',
    claim: { text: 'Entrance fee: $35.', normalizedValue: 35 },
    source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/yose/fees' },
    observation: { observedAt: '2026-08-08T12:00:00.000Z' },
    quality: { authorityClass: 'official_owner' },
    retention: { storeClaimText: true },
  }],
};

const input = {
  mode: 'buddy',
  evidenceBundle,
  requirements: [{ requirementId: 'req-fees', topic: 'fees' }],
  tripState: { destination: 'Yosemite', privateReservation: 'ABC-SECRET' },
  constraints: { mobility: 'avoid stairs' },
  history: [
    { role: 'user', content: 'We prefer quiet campsites.' },
    { role: 'assistant', content: 'Understood.' },
  ],
  userRequest: 'What is the entrance fee?',
};

describe('WP7 prompt-v2 assembly', () => {
  test('assembles sections in the required order', () => {
    const result = buildTrailiePromptV2(input);
    const markers = [
      '--- CORE POLICY ---',
      '--- TASK CONTRACT: buddy ---',
      '--- PUBLIC EVIDENCE ---',
      '--- PRIVATE TRIP STATE ---',
      '--- RECENT HISTORY ---',
      '--- USER REQUEST ---',
    ];
    let prior = -1;
    for (const marker of markers) {
      const index = result.prompt.indexOf(marker);
      expect(index).toBeGreaterThan(prior);
      prior = index;
    }
  });

  test('keeps the cacheable public prefix separate from all private turn state', () => {
    const result = buildTrailiePromptV2(input);
    expect(result.publicPrefix).toContain('Entrance fee: $35.');
    expect(result.publicPrefix).not.toContain('ABC-SECRET');
    expect(result.publicPrefix).not.toContain('avoid stairs');
    expect(result.publicPrefix).not.toContain('quiet campsites');
    expect(result.publicPrefix).not.toContain(input.userRequest);
    expect(result.privateSuffix).toContain('ABC-SECRET');
    expect(result.cachePolicy).toEqual({ publicPrefix: 'public_only', combinedPrompt: 'never_cache' });
  });

  test('reports exact additive section token accounting', () => {
    const result = buildTrailiePromptV2(input);
    const keys = [
      'coreTokens', 'contractTokens', 'evidenceTokens', 'tripStateTokens',
      'historyTokens', 'userTokens',
    ];
    expect(result.accounting.tokenizerId).toBe('trailie_prompt_token_v1');
    expect(result.accounting.coreSourceTokens).toBeLessThan(result.accounting.coreTokens);
    expect(result.accounting.coreSectionTokens).toBe(result.accounting.coreTokens);
    expect(result.accounting.coreWrapperTokens).toBe(
      result.accounting.coreSectionTokens - result.accounting.coreSourceTokens
    );
    expect(result.accounting.totalTokens).toBe(
      keys.reduce((sum, key) => sum + result.accounting[key], 0)
    );
    expect(result.accounting.totalTokens).toBe(countPromptTokens(result.prompt));
    expect(result.accounting).not.toHaveProperty('prompt');
  });

  test('enforces section budgets and bounds history to the most recent messages', () => {
    const result = buildTrailiePromptV2({
      ...input,
      history: [
        { role: 'user', content: `old-private ${'old '.repeat(200)}` },
        { role: 'assistant', content: `recent ${'useful '.repeat(20)}` },
      ],
      budgets: { evidenceTokens: 80, tripStateTokens: 80, historyTokens: 35, userTokens: 50, totalTokens: 3000 },
    });
    expect(result.accounting.evidenceTokens).toBeLessThanOrEqual(80);
    expect(result.accounting.tripStateTokens).toBeLessThanOrEqual(80);
    expect(result.accounting.historyTokens).toBeLessThanOrEqual(35);
    expect(result.accounting.userTokens).toBeLessThanOrEqual(50);
    expect(result.accounting.totalTokens).toBeLessThanOrEqual(3000);
    expect(result.privateSuffix).toContain('recent');
    expect(result.privateSuffix).not.toContain('old-private');
  });

  test('fails closed when immutable core and contract cannot fit the total budget', () => {
    expect(() => buildTrailiePromptV2({ ...input, budgets: { totalTokens: 10 } })).toThrow(
      expect.objectContaining({ code: 'prompt_v2_budget_infeasible' })
    );
  });

  test('applies the user-request month when rendering activity evidence', () => {
    const result = buildTrailiePromptV2({
      ...input,
      evidenceBundle: {
        resolutions: [{ requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:trees', 'ev:winter'] }],
        evidence: [
          {
            evidenceId: 'ev:trees', entityId: 'nps:park:sequ', topic: 'activities',
            claim: {
              text: 'Big Trees Trail: An easy accessible path around a sequoia meadow.',
              normalizedValue: { name: 'Big Trees Trail', difficulty: 'easy', activityTypes: ['hike'] },
              qualifiers: ['named_activity_candidate'],
            },
            source: { provider: 'nps', sourceClass: 'official_owner' },
            observation: { observedAt: '2026-08-12T00:00:00.000Z' },
            quality: { authorityClass: 'official_owner' },
            retention: { storeClaimText: true },
          },
          {
            evidenceId: 'ev:winter', entityId: 'nps:park:sequ', topic: 'activities',
            claim: {
              text: 'Crescent Winter Trail: The skiing is mostly easy.',
              normalizedValue: {
                name: 'Crescent Winter Trail', difficulty: 'easy',
                activityTypes: ['cross-country skiing', 'hike'],
              },
              qualifiers: ['named_activity_candidate'],
            },
            source: { provider: 'nps', sourceClass: 'official_owner' },
            observation: { observedAt: '2026-08-12T00:00:00.000Z' },
            quality: { authorityClass: 'official_owner' },
            retention: { storeClaimText: true },
          },
        ],
      },
      requirements: [{ requirementId: 'req-act', topic: 'activities' }],
      userRequest: 'Compare easy hikes for late September.',
    });

    expect(result.publicPrefix).toContain('Big Trees Trail');
    expect(result.publicPrefix).not.toContain('Crescent Winter Trail');
  });

  test('park operating rules stay out of traveler constraints and are labeled as access rules', () => {
    const result = buildTrailiePromptV2({
      ...input,
      constraints: {
        mobility: 'avoid stairs',
        operational: [{
          id: 'glac-logan-parking-2026',
          type: 'parking_time_limit',
          subjects: ['Logan Pass'],
          maxMinutes: 180,
          plannerRule: 'A self-drive Logan Pass stop must fit within three hours including the visitor center and parking-to-trail transition.',
        }],
      },
      userRequest: "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    });
    expect(result.privateSuffix).toMatch(/park operating rule|access rule|parking is limited/i);
    expect(result.privateSuffix).not.toMatch(/your trip['’]s 180-minute|maxDailyDriveMinutes"?\s*:\s*180/);
    expect(result.privateSuffix).toContain('avoid stairs');
    expect(result.privateSuffix).not.toMatch(/"operational"\s*:/);
  });

  test('drops optional history before the current request, mobility state, and decision evidence', () => {
    const request = 'Where should we park, and keep every walk under one mile?';
    const result = buildTrailiePromptV2({
      ...input,
      evidenceBundle: {
        resolutions: [{ requirementId: 'req-parking', status: 'satisfied_fresh', evidenceIds: ['ev-parking'] }],
        evidence: [{
          evidenceId: 'ev-parking', entityId: 'nps:park:yose', topic: 'parking', evidenceType: 'rule',
          claim: { text: 'Official parking access uses the visitor lot and shuttle connection.' },
          source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/yose/parking' },
          observation: { observedAt: '2026-08-13T00:00:00.000Z' },
          quality: { authorityClass: 'official_owner' }, retention: { storeClaimText: true },
        }],
      },
      requirements: [{ requirementId: 'req-parking', topic: 'parking', reasonCodes: ['access_decision_support'], renderBudgetTokens: 180 }],
      tripState: { activeDecision: { kind: 'access_contingency' }, travelerPreferences: { pace: 'relaxed' } },
      constraints: { mobility: { maxWalkMilesPerSegment: 1, requiresFrequentBreaks: true } },
      history: Array.from({ length: 20 }, (_, index) => ({ role: 'user', content: `obsolete history ${index} ${'noise '.repeat(35)}` })),
      userRequest: request,
      budgets: { evidenceTokens: 250, tripStateTokens: 300, historyTokens: 700, userTokens: 200, totalTokens: 1700 },
    });
    expect(result.privateSuffix).toContain(request);
    expect(result.privateSuffix).toContain('maxWalkMilesPerSegment');
    expect(result.privateSuffix).toContain('access_contingency');
    expect(result.publicPrefix).toContain('Official parking access');
    expect(result.privateSuffix).not.toContain('obsolete history 0');
  });
});

describe('R1 — machine-composed operational directives in the private state', () => {
  const directives = {
    hardProhibitions: [{
      subjectName: 'Going-to-the-Sun Road',
      kind: 'vehicle_dimension',
      text: "The traveler's RV is 24 ft. Going-to-the-Sun Road permits vehicles up to 21 ft. Do not plan any segment that requires driving this RV on Going-to-the-Sun Road — use the park shuttle, a smaller legal vehicle, or an alternate route it permits.",
    }],
    obligations: [{
      subjectName: 'Fiery Furnace',
      kind: 'permit',
      text: 'Fiery Furnace requires a permit. You may still recommend it — if included, state that requirement with the recommendation. Do not treat it as excluded.',
    }],
    exposure: null,
  };

  test('directives land in the private suffix, never the cacheable prefix', () => {
    const result = buildTrailiePromptV2({ ...input, operationalDirectives: directives });
    expect(result.privateSuffix).toContain('Going-to-the-Sun Road permits vehicles up to 21 ft');
    expect(result.privateSuffix).toContain('Fiery Furnace requires a permit');
    expect(result.privateSuffix).toContain('operationalRules');
    expect(result.publicPrefix).not.toContain('Going-to-the-Sun Road');
  });

  test('an exposure directive lands alongside the rules', () => {
    const result = buildTrailiePromptV2({
      ...input,
      operationalDirectives: {
        hardProhibitions: [], obligations: [],
        exposure: { confirmedLowNames: ['Riverside Walk'], text: 'Exposure legal pool: Riverside Walk. Never author an exposureLevel value.' },
      },
    });
    expect(result.privateSuffix).toContain('Never author an exposureLevel value');
  });

  test('absent or null directives leave the prompt byte-identical (bar 3)', () => {
    const baseline = buildTrailiePromptV2(input);
    const withNull = buildTrailiePromptV2({ ...input, operationalDirectives: null });
    expect(withNull.prompt).toBe(baseline.prompt);
    expect(withNull.prompt).not.toContain('operationalRules');
  });
});
