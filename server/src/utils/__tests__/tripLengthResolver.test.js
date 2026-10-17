'use strict';

const {
  resolveExpectedTripDays,
  resolveFromRequestText,
  daysFromDateRange,
  RESOLUTION_SOURCE,
} = require('../tripLengthResolver');
const { getItineraryGenerationConfig, selectStructuredMaxTokens } = require('../../config/itineraryGenerationConfig');

const days = (userRequest) => resolveExpectedTripDays({ userRequest }).days;

describe('Stage 13.9 §8 — deterministic trip-length resolver', () => {
  describe('explicit week phrases resolve to seven days', () => {
    const cases = [
      'Plan a week in Yellowstone.',
      'One week in Yosemite',
      'a week-long Grand Canyon trip',
      'week long trip to Zion',
      'I want to spend a week at Glacier',
    ];
    it.each(cases)('%s → 7', (text) => {
      const r = resolveExpectedTripDays({ userRequest: text });
      expect(r.days).toBe(7);
      expect(r.source).toBe(RESOLUTION_SOURCE.EXPLICIT_WEEK_PHRASE);
      expect(r.confidence).toBe('exact');
    });
  });

  describe('explicit day phrases', () => {
    it('resolves "7-day Yellowstone itinerary" numerically', () => {
      const r = resolveExpectedTripDays({ userRequest: '7-day Yellowstone itinerary' });
      expect(r).toMatchObject({ days: 7, source: RESOLUTION_SOURCE.EXPLICIT_NUMERIC_PHRASE, confidence: 'exact' });
    });

    it('resolves "7 day itinerary" and "for 7 days"', () => {
      expect(days('7 day itinerary')).toBe(7);
      expect(days('for 7 days')).toBe(7);
    });

    it('resolves spelled-out durations', () => {
      const r = resolveExpectedTripDays({ userRequest: 'a seven-day itinerary please' });
      expect(r).toMatchObject({ days: 7, source: RESOLUTION_SOURCE.EXPLICIT_WORD_PHRASE });
      expect(days('for seven days')).toBe(7);
    });

    it('resolves two weeks to 14 days', () => {
      expect(days('two weeks in Alaska')).toBe(14);
    });
  });

  describe('ambiguous phrases NEVER resolve', () => {
    const ambiguous = [
      'next week in Yellowstone',
      'sometime this week',
      'the week of September 1',
      'during the weekend',
      'a few days in Zion',
      'several days at Acadia',
      'a long weekend trip',
      'leaving in a week',
      'a week from Tuesday I fly out',
    ];
    it.each(ambiguous)('%s → unknown', (text) => {
      const r = resolveExpectedTripDays({ userRequest: text });
      expect(r.days).toBeNull();
      expect(r.source).toBe(RESOLUTION_SOURCE.UNKNOWN);
      expect(r.confidence).toBe('unknown');
    });

    it('"the week of September 1" stays unknown without dates', () => {
      expect(resolveExpectedTripDays({ userRequest: 'Plan the week of September 1' }).days).toBeNull();
    });

    it('conflicting explicit counts fail closed', () => {
      expect(resolveFromRequestText('a 3-day or 5-day trip')).toBeNull();
      expect(days('a 3-day or 5-day trip')).toBeNull();
    });
  });

  describe('precedence', () => {
    it('structured numDays overrides request prose', () => {
      const r = resolveExpectedTripDays({
        structuredConstraints: { dates: { numDays: 3 } },
        userRequest: 'Plan a week in Yellowstone.',
      });
      expect(r).toMatchObject({ days: 3, source: RESOLUTION_SOURCE.STRUCTURED_NUM_DAYS });
    });

    it('a valid date range overrides request prose', () => {
      const r = resolveExpectedTripDays({
        dates: { start: '2026-09-01', end: '2026-09-04' },
        userRequest: 'Plan a week in Yellowstone.',
      });
      expect(r).toMatchObject({ days: 4, source: RESOLUTION_SOURCE.DATE_RANGE });
    });

    it('conflicting structured sources follow documented precedence and record the conflict', () => {
      const r = resolveExpectedTripDays({
        structuredConstraints: { dates: { numDays: 7, start: '2026-09-01', end: '2026-09-03' } },
      });
      expect(r.days).toBe(7); // numDays wins
      expect(r.source).toBe(RESOLUTION_SOURCE.STRUCTURED_NUM_DAYS);
      expect(r.notes).toContain('date_range_conflict');
    });

    it('the week of September 1 DOES resolve when a date range supplies the duration', () => {
      const r = resolveExpectedTripDays({
        dates: { start: '2026-09-01', end: '2026-09-07' },
        userRequest: 'the week of September 1',
      });
      expect(r).toMatchObject({ days: 7, source: RESOLUTION_SOURCE.DATE_RANGE });
    });
  });

  describe('date ranges', () => {
    it('counts an inclusive range', () => {
      expect(daysFromDateRange({ start: '2026-09-01', end: '2026-09-07' })).toBe(7);
      expect(daysFromDateRange({ startDate: '2026-09-01', endDate: '2026-09-01' })).toBe(1);
    });

    it('reversed or invalid ranges do not resolve', () => {
      expect(daysFromDateRange({ start: '2026-09-07', end: '2026-09-01' })).toBeNull();
      expect(daysFromDateRange({ start: 'not-a-date', end: '2026-09-07' })).toBeNull();
      expect(daysFromDateRange({ start: '2026-09-01', end: null })).toBeNull();
    });

    it('a reversed range falls through to the request phrase rather than guessing', () => {
      const r = resolveExpectedTripDays({
        dates: { start: '2026-09-07', end: '2026-09-01' },
        userRequest: 'Plan a week in Yellowstone.',
      });
      expect(r).toMatchObject({ days: 7, source: RESOLUTION_SOURCE.EXPLICIT_WEEK_PHRASE });
    });
  });

  describe('purity and sanitation', () => {
    it('does not alter the original request', () => {
      const request = 'Plan a week in Yellowstone.';
      const before = String(request);
      resolveExpectedTripDays({ userRequest: request });
      expect(request).toBe(before);
    });

    it('does not mutate the supplied constraints', () => {
      const constraints = { dates: { numDays: 5, start: '2026-09-01', end: '2026-09-05' } };
      const snapshot = JSON.parse(JSON.stringify(constraints));
      resolveExpectedTripDays({ structuredConstraints: constraints });
      expect(constraints).toEqual(snapshot);
    });

    it('never carries the request text into the resolution metadata (§5)', () => {
      const r = resolveExpectedTripDays({ userRequest: 'Plan a week in Yellowstone with Aunt Marge.' });
      expect(JSON.stringify(r)).not.toMatch(/Yellowstone|Marge/);
      expect(Object.keys(r).sort()).toEqual(['confidence', 'days', 'source']);
    });

    it('is deterministic across repeated calls', () => {
      const args = { userRequest: 'a week-long trip', structuredConstraints: null };
      expect(resolveExpectedTripDays(args)).toEqual(resolveExpectedTripDays(args));
    });

    it('handles missing input without throwing', () => {
      expect(resolveExpectedTripDays()).toMatchObject({ days: null, source: RESOLUTION_SOURCE.UNKNOWN });
      expect(resolveExpectedTripDays({ userRequest: '' }).days).toBeNull();
    });
  });

  describe('§6 — the resolved day count drives token selection', () => {
    const config = getItineraryGenerationConfig();

    it('"Plan a week in Yellowstone." selects the 12,000 budget, never 6,000', () => {
      const resolution = resolveExpectedTripDays({ userRequest: 'Plan a week in Yellowstone.' });
      expect(resolution).toMatchObject({ days: 7, source: RESOLUTION_SOURCE.EXPLICIT_WEEK_PHRASE });
      const selected = selectStructuredMaxTokens({ expectedDays: resolution.days, config });
      expect(selected).toBe(12000);
      expect(selected).not.toBe(6000);
    });

    it('a three-day request still starts at 6,000', () => {
      const resolution = resolveExpectedTripDays({ userRequest: 'A 3-day trip to Zion' });
      expect(resolution.days).toBe(3);
      expect(selectStructuredMaxTokens({ expectedDays: resolution.days, config })).toBe(6000);
    });

    it('an unresolved length keeps the conservative short budget', () => {
      const resolution = resolveExpectedTripDays({ userRequest: 'next week in Yellowstone' });
      expect(selectStructuredMaxTokens({ expectedDays: resolution.days, config })).toBe(6000);
    });

    it('the bounded policy is unchanged: 1–4 → 6,000, ≥5 → 12,000, hard cap 16,000', () => {
      for (const d of [1, 2, 3, 4]) expect(selectStructuredMaxTokens({ expectedDays: d, config })).toBe(6000);
      for (const d of [5, 7, 14]) expect(selectStructuredMaxTokens({ expectedDays: d, config })).toBe(12000);
      expect(config.structuredMaxTokensHardCap).toBe(16000);
    });
  });
});
