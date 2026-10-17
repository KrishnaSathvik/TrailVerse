const { correctItinerary } = require('../itineraryCorrector');
const { CREATE_ITINERARY_TOOL } = require('../itineraryToolSchema');
const { buildSectionScope, evaluateIssuePolicy, POLICY_STATUS } = require('../responsePatchPolicy');
const { buildFactBundle, makeFact, AUTHORITY, STATUS } = require('../canonicalFacts');
const { splitIntoSections } = require('../responseSections');
const { MATCH_STATUS } = require('../responsePatching');

const stopItems =
  CREATE_ITINERARY_TOOL.input_schema.properties.days.items.properties.stops.items;
const stopSchema = stopItems.properties;

describe('optional park identity on itinerary stops', () => {
  test('the tool schema accepts park identity as nullable, not required', () => {
    expect(stopSchema.parkCode).toEqual({ type: ['string', 'null'] });
    expect(stopSchema.parkName).toEqual({ type: ['string', 'null'] });

    const required = stopItems.required || [];
    expect(required).not.toContain('parkCode');
    expect(required).not.toContain('parkName');
  });

  test('single-park stops retain their resolved park code', () => {
    const itinerary = {
      days: [
        {
          id: 'day-1',
          dayNumber: 1,
          label: 'Day 1',
          stops: [
            { id: 's1-1', order: 0, name: 'Hall of Mosses', type: 'trail', duration: 90, parkCode: 'olym', parkName: 'Olympic National Park' },
          ],
        },
      ],
    };

    const { correctedItinerary } = correctItinerary(itinerary, { hasConstraints: false }, [], null, {});
    expect(correctedItinerary.days[0].stops[0].parkCode).toBe('olym');
    expect(correctedItinerary.days[0].stops[0].parkName).toBe('Olympic National Park');
  });

  test('multi-park stops keep distinct park codes', () => {
    const itinerary = {
      days: [
        { id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [{ id: 's1-1', order: 0, name: 'Hall of Mosses', parkCode: 'olym' }] },
        { id: 'day-2', dayNumber: 2, label: 'Day 2', stops: [{ id: 's2-1', order: 0, name: 'Logan Pass', parkCode: 'glac' }] },
      ],
    };

    const { correctedItinerary } = correctItinerary(itinerary, { hasConstraints: false }, [], null, {});
    expect(correctedItinerary.days.map((d) => d.stops[0].parkCode)).toEqual(['olym', 'glac']);
  });

  test('non-NPS stops keep a null park code', () => {
    const itinerary = {
      days: [
        { id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [{ id: 's1-1', order: 0, name: 'Downtown diner', type: 'restaurant', parkCode: null, parkName: null }] },
      ],
    };

    const { correctedItinerary } = correctItinerary(itinerary, { hasConstraints: false }, [], null, {});
    expect(correctedItinerary.days[0].stops[0].parkCode).toBeNull();
  });

  test('legacy itineraries without park identity remain valid', () => {
    const legacy = {
      days: [{ id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [{ id: 's1-1', order: 0, name: 'Hall of Mosses', duration: 90 }] }],
    };

    const { correctedItinerary } = correctItinerary(legacy, { hasConstraints: false }, [], null, {});
    expect(correctedItinerary.days[0].stops[0].name).toBe('Hall of Mosses');
    expect(correctedItinerary.days[0].stops[0].parkCode).toBeUndefined();
  });

  test('a fitness replacement carries park identity onto the rebuilt stop', () => {
    const itinerary = {
      days: [
        {
          id: 'day-1',
          dayNumber: 1,
          label: 'Day 1',
          stops: [
            {
              id: 's1-1',
              order: 0,
              name: 'Mount Storm King',
              type: 'trail',
              difficulty: 'strenuous',
              duration: 240,
              latitude: 48.05,
              longitude: -123.79,
              parkCode: 'olym',
              parkName: 'Olympic National Park',
            },
            {
              id: 's1-2',
              order: 1,
              name: 'Marymere Falls',
              type: 'trail',
              difficulty: 'easy',
              duration: 60,
              parkCode: 'olym',
              parkName: 'Olympic National Park',
            },
          ],
        },
      ],
    };

    const constraints = { hasConstraints: true, fitnessLevel: 'beginner' };
    const issues = [
      {
        type: 'fitness',
        severity: 'high',
        dayIndex: 0,
        stopName: 'Mount Storm King',
        stopDifficulty: 'strenuous',
        maxAllowed: 'easy',
        details: 'strenuous hike for a beginner',
      },
    ];

    const { correctedItinerary } = correctItinerary(itinerary, constraints, issues, null, {});
    const stop = correctedItinerary.days[0].stops[0];

    // Whether it was replaced or downgraded, park identity must survive.
    expect(stop.parkCode).toBe('olym');
    expect(stop.parkName).toBe('Olympic National Park');
  });
});

describe('section scope uses stop park codes when available', () => {
  const glacFact = makeFact({
    source: 'nps',
    category: 'closure',
    sourceId: 'g1',
    text: 'Going-to-the-Sun Road closed',
    parkCode: 'glac',
    parkName: 'Glacier National Park',
    authority: AUTHORITY.AUTHORITATIVE,
    status: STATUS.ACTIVE_CLOSURE,
    retrievedAt: '2026-07-22T16:41:00.000Z',
  });

  test('stop park codes outrank resolved metadata for a day section', () => {
    const itineraryData = {
      days: [{ id: 'day-2', stops: [{ id: 's2-1', name: 'Logan Pass', parkCode: 'glac' }] }],
    };
    const section = { text: '## Day 2\nStart at Logan Pass at sunrise.\n' };

    const scope = buildSectionScope({ section, itineraryData, resolvedParkCodes: ['olym'] });
    expect(scope.scopeSource).toBe('itinerary_stops');
    expect(scope.sectionParkCodes).toEqual(['glac']);
  });

  test('without stop park codes a multi-park section stays conservative', () => {
    const doc = '## Day 2\nThe road is open right now.\n';
    const sections = splitIntoSections(doc);
    const quote = 'The road is open right now.';
    const start = doc.indexOf(quote);

    // No park named, no stop park codes — scope is unknown.
    const scope = buildSectionScope({
      section: sections[0],
      itineraryData: { days: [{ id: 'day-2', stops: [{ id: 's2-1', name: 'Logan Pass' }] }] },
    });
    expect(scope.scopeSource).toBe('unknown');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [glacFact.id],
      },
      match: {
        status: MATCH_STATUS.CANDIDATE,
        absoluteStart: start,
        absoluteEnd: start + quote.length,
        matchedText: quote,
        matchTier: 'exact',
      },
      section: sections[0],
      sectionScope: scope,
      canonicalFactBundle: buildFactBundle([[glacFact]]),
    });

    expect(res.status).toBe(POLICY_STATUS.EVIDENCE_OUT_OF_SCOPE);
  });
});
