const {
  makeWeatherFact,
  buildFactBundle,
  WEATHER_MODE,
  WEATHER_STATUS,
  WEATHER_AUTHORITY,
  AUTHORITY,
  STATUS,
  makeFact,
} = require('../canonicalFacts');
const {
  POLICY_STATUS,
  POLICY_BASIS,
  CLAIM,
  classifyClaims,
  factAuthorizesClaim,
  buildSectionScope,
  evaluateIssuePolicy,
} = require('../responsePatchPolicy');
const { splitIntoSections } = require('../responseSections');
const { MATCH_STATUS } = require('../responsePatching');

const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

// Today's bucket from /data/2.5/forecast — freshly retrieved, still a forecast.
const todayForecastFact = makeWeatherFact({
  source: 'openweather',
  weatherMode: WEATHER_MODE.FORECAST,
  status: WEATHER_STATUS.FORECAST,
  retrievalMode: 'live',
  text: 'Port Angeles — Wed: High 68°F, Low 51°F, light rain',
  locationName: 'Port Angeles',
  parkCode: 'olym',
  validFrom: '2026-07-22T07:00:00.000Z',
  validTo: '2026-07-23T06:59:59.999Z',
  dayLabel: 'Wed',
  localDate: '2026-07-22',
  timezoneOffsetSeconds: -25200,
  timezoneSource: 'provider_offset',
  retrievedAt: RETRIEVED_AT,
});

const forecastFact = makeWeatherFact({
  source: 'openweather',
  weatherMode: WEATHER_MODE.FORECAST,
  status: WEATHER_STATUS.FORECAST,
  text: 'Port Angeles — Wed: High 74°F, Low 55°F, clear sky',
  locationName: 'Port Angeles',
  parkCode: 'olym',
  retrievalMode: 'live',
  validFrom: '2026-07-24T07:00:00.000Z',
  validTo: '2026-07-25T06:59:59.999Z',
  dayLabel: 'Fri',
  localDate: '2026-07-24',
  timezoneOffsetSeconds: -25200,
  timezoneSource: 'provider_offset',
  retrievedAt: RETRIEVED_AT,
});

const estimateFact = makeWeatherFact({
  source: 'trailverse_climate_estimate',
  weatherMode: WEATHER_MODE.CLIMATE_ESTIMATE,
  status: WEATHER_STATUS.ESTIMATED,
  retrievalMode: 'generated',
  text: 'Olympic in July typically sees highs near 70°F',
  locationName: 'Olympic National Park',
  parkCode: 'olym',
  retrievedAt: RETRIEVED_AT,
});

function contextFor(content, quote) {
  const sections = splitIntoSections(content);
  const start = content.indexOf(quote);
  return {
    section: sections.find((s) => start >= s.startOffset && start < s.endOffset),
    match: {
      status: MATCH_STATUS.CANDIDATE,
      absoluteStart: start,
      absoluteEnd: start + quote.length,
      matchedText: quote,
      matchTier: 'exact',
    },
  };
}

describe('Stage 4.5A — canonical weather facts', () => {
  test("today's forecast bucket stays a forecast, never an observation", () => {
    expect(todayForecastFact.weatherMode).toBe(WEATHER_MODE.FORECAST);
    expect(todayForecastFact.status).toBe(WEATHER_STATUS.FORECAST);
    expect(todayForecastFact.authority).toBe(WEATHER_AUTHORITY.LIVE_PROVIDER);
  });

  test('retrievalMode live is not weatherMode current', () => {
    expect(todayForecastFact.retrievalMode).toBe('live');
    expect(todayForecastFact.weatherMode).not.toBe(WEATHER_MODE.CURRENT);
    expect(factAuthorizesClaim(todayForecastFact, CLAIM.ASSERTS_CURRENT_WEATHER)).toBe(false);
  });

  test("today's forecast may support forecast wording", () => {
    expect(factAuthorizesClaim(todayForecastFact, CLAIM.ASSERTS_FORECAST_WEATHER)).toBe(true);
    expect(classifyClaims('Rain is forecast today.')).toContain(CLAIM.ASSERTS_FORECAST_WEATHER);
  });

  test('forecast facts carry destination-local date metadata', () => {
    expect(todayForecastFact.localDate).toBe('2026-07-22');
    expect(todayForecastFact.timezoneOffsetSeconds).toBe(-25200);
    expect(todayForecastFact.timezoneSource).toBe('provider_offset');
  });

  test('two forecast facts have non-overlapping local-day windows', () => {
    expect(Date.parse(todayForecastFact.validTo)).toBeLessThan(Date.parse(forecastFact.validFrom));
    expect(todayForecastFact.localDate).not.toBe(forecastFact.localDate);
  });

  test('forecast facts retain their validity window and day label', () => {
    expect(forecastFact.weatherMode).toBe(WEATHER_MODE.FORECAST);
    expect(forecastFact.validFrom).toBe('2026-07-24T07:00:00.000Z');
    expect(forecastFact.validTo).toBe('2026-07-25T06:59:59.999Z');
    expect(forecastFact.dayLabel).toBe('Fri');
    expect(forecastFact.localDate).toBe('2026-07-24');
  });

  test('per-day facts get distinct ids so one day cannot stand in for another', () => {
    const bundle = buildFactBundle([[todayForecastFact, forecastFact]]);
    expect(todayForecastFact.id).not.toBe(forecastFact.id);
    expect(bundle.facts).toHaveLength(2);
  });

  test('climate estimate keeps its own mode and never claims live authority', () => {
    expect(estimateFact.weatherMode).toBe(WEATHER_MODE.CLIMATE_ESTIMATE);
    expect(estimateFact.status).toBe(WEATHER_STATUS.ESTIMATED);
    expect(estimateFact.authority).toBe(WEATHER_AUTHORITY.CLIMATE_ESTIMATE);
  });

  test('weather facts can never authorize closure or permit claims', () => {
    for (const fact of [todayForecastFact, forecastFact, estimateFact]) {
      expect(factAuthorizesClaim(fact, CLAIM.ASSERTS_CLOSED)).toBe(false);
      expect(factAuthorizesClaim(fact, CLAIM.ASSERTS_REQUIRED)).toBe(false);
      expect(factAuthorizesClaim(fact, CLAIM.ASSERTS_NOT_REQUIRED)).toBe(false);
    }
  });

  test('a climate estimate cannot support current-condition wording', () => {
    expect(factAuthorizesClaim(estimateFact, CLAIM.ASSERTS_CURRENT_WEATHER)).toBe(false);
    expect(factAuthorizesClaim(estimateFact, CLAIM.ASSERTS_FORECAST_WEATHER)).toBe(false);
    expect(factAuthorizesClaim(estimateFact, CLAIM.ASSERTS_ESTIMATE)).toBe(true);
  });

  test('no forecast fact can support "right now" wording', () => {
    expect(factAuthorizesClaim(forecastFact, CLAIM.ASSERTS_CURRENT_WEATHER)).toBe(false);
    expect(factAuthorizesClaim(todayForecastFact, CLAIM.ASSERTS_CURRENT_WEATHER)).toBe(false);
  });

  test('"It is currently raining" cannot be authorized by any available fact', () => {
    const doc = '## Day 1 — Olympic National Park\nPack layers.\n';
    const { section, match } = contextFor(doc, 'Pack layers.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'unsupported_claim',
        action: 'replace',
        replacementText: 'It is currently raining at the coast.',
        evidenceFactIds: [todayForecastFact.id],
      },
      match,
      section,
      sectionScope: { sectionParkCodes: ['olym'], scopeSource: 'resolved_metadata' },
      canonicalFactBundle: buildFactBundle([[todayForecastFact]]),
    });

    expect(res.status).not.toBe(POLICY_STATUS.APPROVED);
  });

  test('definitive current wording backed only by an estimate is rejected', () => {
    const doc = '## Day 1 — Olympic National Park\nPack layers for the coast.\n';
    const { section, match } = contextFor(doc, 'Pack layers for the coast.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'unsupported_claim',
        action: 'replace',
        replacementText: 'It is currently sunny and clear at the coast.',
        evidenceFactIds: [estimateFact.id],
      },
      match,
      section,
      sectionScope: { sectionParkCodes: ['olym'], scopeSource: 'resolved_metadata' },
      canonicalFactBundle: buildFactBundle([[estimateFact]]),
    });

    expect(res.status).not.toBe(POLICY_STATUS.APPROVED);
  });

  test('estimate wording backed by an estimate is classified as an estimate', () => {
    expect(classifyClaims('Olympic typically sees highs near 70°F in July.')).toContain(
      CLAIM.ASSERTS_ESTIMATE
    );
    expect(classifyClaims('It is currently raining.')).toContain(CLAIM.ASSERTS_CURRENT_WEATHER);
    expect(classifyClaims('Rain is forecast today.')).toContain(CLAIM.ASSERTS_FORECAST_WEATHER);
  });

  test('a weather provider failure yields no facts, never a "clear" claim', () => {
    const bundle = buildFactBundle([[]]);
    const doc = '## Day 1 — Olympic National Park\nSkies look uncertain.\n';
    const { section, match } = contextFor(doc, 'Skies look uncertain.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'unsupported_claim',
        action: 'replace',
        replacementText: 'Conditions are clear and safe.',
        evidenceFactIds: [],
      },
      match,
      section,
      sectionScope: { sectionParkCodes: ['olym'], scopeSource: 'resolved_metadata' },
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.EVIDENCE_MISSING);
    expect(res.patch).toBeNull();
  });
});

describe('Stage 4.5B — explicit section scope', () => {
  const olymFact = makeFact({
    source: 'nps',
    category: 'closure',
    sourceId: 'o1',
    text: 'Hoh Road closed',
    parkCode: 'olym',
    parkName: 'Olympic National Park',
    authority: AUTHORITY.AUTHORITATIVE,
    status: STATUS.ACTIVE_CLOSURE,
    retrievedAt: RETRIEVED_AT,
  });

  const glacFact = makeFact({
    source: 'nps',
    category: 'closure',
    sourceId: 'g1',
    text: 'Going-to-the-Sun Road closed',
    parkCode: 'glac',
    parkName: 'Glacier National Park',
    authority: AUTHORITY.AUTHORITATIVE,
    status: STATUS.ACTIVE_CLOSURE,
    retrievedAt: RETRIEVED_AT,
  });

  test('a single-park section inherits resolved park metadata', () => {
    const section = { text: 'Day 1: drive the coast and walk the mossy trail.\n' };
    const scope = buildSectionScope({ section, resolvedParkCodes: ['olym'] });

    expect(scope.sectionParkCodes).toEqual(['olym']);
    expect(scope.scopeSource).toBe('resolved_metadata');
  });

  test('a section naming another park does not inherit the resolved park', () => {
    const section = { text: 'For contrast, Glacier National Park is very different.\n' };
    const scope = buildSectionScope({ section, resolvedParkCodes: ['olym'] });

    expect(scope.sectionParkCodes).toEqual(['glac']);
    expect(scope.scopeSource).toBe('section_mentions');
  });

  test('day sections take park codes from their itinerary stops', () => {
    const itineraryData = {
      days: [
        {
          id: 'day-2',
          stops: [{ id: 's2-1', name: 'Logan Pass', parkCode: 'glac' }],
        },
      ],
    };
    const section = { text: '## Day 2\nStart at Logan Pass early.\n' };
    const scope = buildSectionScope({ section, itineraryData, resolvedParkCodes: ['olym'] });

    expect(scope.sectionParkCodes).toEqual(['glac']);
    expect(scope.scopeSource).toBe('itinerary_stops');
  });

  test('a section mentioning no park is unknown scope', () => {
    const scope = buildSectionScope({ section: { text: 'Pack layers and snacks.\n' } });
    expect(scope.scopeSource).toBe('unknown');
    expect(scope.sectionParkCodes).toEqual([]);
  });

  test('Glacier evidence cannot patch an Olympic section when both appear', () => {
    const doc = [
      'Comparing two parks.',
      '',
      '## Day 1 — Olympic National Park',
      'The Hoh Road is open right now.',
      '',
      '## Day 2 — Glacier National Park',
      'Alpine views all day.',
    ].join('\n');

    const { section, match } = contextFor(doc, 'The Hoh Road is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [glacFact.id],
      },
      match,
      section,
      sectionScope: { sectionParkCodes: ['olym'], scopeSource: 'resolved_metadata' },
      canonicalFactBundle: buildFactBundle([[olymFact, glacFact]]),
    });

    expect(res.status).toBe(POLICY_STATUS.EVIDENCE_OUT_OF_SCOPE);
    expect(res.scopeSource).toBeNull();
  });

  test('unknown scope does not allow cross-park mutation', () => {
    const doc = '## Getting ready\nThe road is open right now.\n';
    const { section, match } = contextFor(doc, 'The road is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [glacFact.id],
      },
      match,
      section,
      sectionScope: { sectionParkCodes: [], scopeSource: 'unknown' },
      canonicalFactBundle: buildFactBundle([[glacFact]]),
    });

    expect(res.status).toBe(POLICY_STATUS.EVIDENCE_OUT_OF_SCOPE);
  });

  test('unknown scope still permits a park-naming warning', () => {
    const doc = '## Getting ready\nA wilderness permit is required for the coast.\n';
    const { section, match } = contextFor(doc, 'A wilderness permit is required for the coast.');
    const listingOnly = makeFact({
      source: 'recreation_gov',
      category: 'permit',
      sourceId: 'F2',
      text: 'Wilderness Permit — listing only',
      parkCode: 'olym',
      parkName: 'Olympic National Park',
      url: 'https://www.recreation.gov/permits/72940',
      authority: AUTHORITY.LISTING_ONLY,
      status: STATUS.LISTING_ONLY,
      retrievedAt: RETRIEVED_AT,
    });

    const res = evaluateIssuePolicy({
      issue: {
        type: 'missing_permit_warning',
        action: 'add_warning',
        replacementText: 'x',
        evidenceFactIds: [listingOnly.id],
      },
      match,
      section,
      sectionScope: { sectionParkCodes: [], scopeSource: 'unknown' },
      canonicalFactBundle: buildFactBundle([[listingOnly]]),
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.allowedAction).not.toBe('delete');
    expect(res.patch.issue.replacementText).toContain('Olympic National Park');
  });
});

describe('Stage 4.5C — policyBasis distinguishes certainty from falsehood', () => {
  const listingOnly = makeFact({
    source: 'recreation_gov',
    category: 'permit',
    sourceId: 'F1',
    text: 'Wilderness Permit — Recreation.gov listing only',
    parkCode: 'olym',
    parkName: 'Olympic National Park',
    url: 'https://www.recreation.gov/permits/72940',
    authority: AUTHORITY.LISTING_ONLY,
    status: STATUS.LISTING_ONLY,
    retrievedAt: RETRIEVED_AT,
  });

  const closure = makeFact({
    source: 'nps',
    category: 'closure',
    sourceId: 'c1',
    text: 'Hoh Road closed',
    parkCode: 'olym',
    parkName: 'Olympic National Park',
    authority: AUTHORITY.AUTHORITATIVE,
    status: STATUS.ACTIVE_CLOSURE,
    retrievedAt: RETRIEVED_AT,
  });

  const scope = { sectionParkCodes: ['olym'], scopeSource: 'resolved_metadata' };

  test('a listing_only rewrite is a certainty downgrade, not a contradiction', () => {
    const doc = '## Day 1 — Olympic National Park\nTimed entry is required.\n';
    const { section, match } = contextFor(doc, 'Timed entry is required.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'missing_permit_warning',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [listingOnly.id],
      },
      match,
      section,
      sectionScope: scope,
      canonicalFactBundle: buildFactBundle([[listingOnly]]),
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.policyBasis).toBe(POLICY_BASIS.CERTAINTY_DOWNGRADE);
    expect(res.replacementSource).toBe('renderer');
    expect(res.scopeSource).toBe('resolved_metadata');
    expect(res.patch.issue.replacementText).not.toMatch(/\bis required\b/i);
  });

  test('an authoritative closure rewrite is a positive contradiction', () => {
    const doc = '## Day 1 — Olympic National Park\nThe Hoh Road is open right now.\n';
    const { section, match } = contextFor(doc, 'The Hoh Road is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [closure.id],
      },
      match,
      section,
      sectionScope: scope,
      canonicalFactBundle: buildFactBundle([[closure]]),
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.policyBasis).toBe(POLICY_BASIS.POSITIVE_CONTRADICTION);
  });

  test('an itinerary-driven deletion is an itinerary conflict', () => {
    const itineraryData = {
      days: [{ id: 'day-1', stops: [{ id: 's1-1', name: 'Hall of Mosses' }] }],
    };
    const doc = '## Day 1 — Olympic National Park\nThen head to Hurricane Ridge.\n';
    const { section, match } = contextFor(doc, 'Then head to Hurricane Ridge.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'prose_json_mismatch',
        action: 'delete',
        evidenceFactIds: ['itinerary:day-1:stop:s1-1'],
      },
      match,
      section,
      sectionScope: scope,
      canonicalFactBundle: buildFactBundle([[]]),
      itineraryData,
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.policyBasis).toBe(POLICY_BASIS.ITINERARY_CONFLICT);
  });
});
