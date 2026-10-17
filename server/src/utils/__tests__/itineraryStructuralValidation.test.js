'use strict';

/**
 * P0-B — EARLY STRUCTURAL ARTIFACT VALIDATION.
 *
 * A plan whose stops all carry `duration: 0` can never become a valid delivered
 * itinerary, so it must be rejected immediately after the structured tool
 * artifact is parsed — before evidence enrichment, route bridging, constraint
 * finalization, and semantic completeness spend work on it.
 *
 * This stage is deliberately NARROW: it repeats the deterministic structural
 * verdicts completeness already reaches, at the same thresholds, so no
 * previously-valid plan changes outcome (P0-O).
 */

const {
  evaluateStructuralArtifact,
  buildStructuralRepairInstructions,
  STRUCTURAL_REASON_CODES,
  STRUCTURAL_OBLIGATIONS,
} = require('../itineraryStructuralValidation');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');

const stop = (name, duration, extra = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  order: 1,
  type: 'viewpoint',
  name,
  note: '',
  startTime: '',
  duration,
  ...extra,
});

const plan = (days) => ({ intro: 'x', days });

describe('evaluateStructuralArtifact', () => {
  it('accepts a plan whose stops all carry positive durations', () => {
    const result = evaluateStructuralArtifact({
      itineraryData: plan([
        { day: 1, stops: [stop('Grand View Point', 60), stop('Island in the Sky Visitor Center', 45)] },
      ]),
      constraints: { durationDays: 1 },
    });
    expect(result.ok).toBe(true);
    expect(result.reasonCodes).toEqual([]);
  });

  it('rejects an itinerary with no days', () => {
    const result = evaluateStructuralArtifact({ itineraryData: plan([]), constraints: null });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['empty_itinerary']);
  });

  it('rejects a day whose named stops are all zero-duration, naming the stops', () => {
    const result = evaluateStructuralArtifact({
      itineraryData: plan([
        { day: 1, stops: [stop('Island in the Sky scenic drive', 0), stop('Grand View Point sunset', 0)] },
        { day: 2, stops: [stop('The Needles Visitor Center', 90)] },
      ]),
      constraints: { durationDays: 2 },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['zero_duration_stops']);
    expect(result.dayDiagnostics).toEqual([
      expect.objectContaining({
        dayNumber: 1,
        codes: ['zero_duration_stops'],
        zeroDurationStopNames: ['Island in the Sky scenic drive', 'Grand View Point sunset'],
      }),
    ]);
  });

  it('rejects a day with no named stops', () => {
    const result = evaluateStructuralArtifact({
      itineraryData: plan([{ day: 1, stops: [{ name: '   ', duration: 30 }] }]),
      constraints: null,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['empty_day']);
  });

  it('rejects a plan shorter than the requested day count', () => {
    const result = evaluateStructuralArtifact({
      itineraryData: plan([{ day: 1, stops: [stop('Grand View Point', 60)] }]),
      constraints: { durationDays: 3 },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('underfilled_day_count');
  });

  it('reads the requested day count from either constraint shape', () => {
    const shorter = plan([{ day: 1, stops: [stop('Grand View Point', 60)] }]);
    expect(evaluateStructuralArtifact({ itineraryData: shorter, constraints: { dates: { numDays: 2 } } }).reasonCodes)
      .toContain('underfilled_day_count');
    expect(evaluateStructuralArtifact({ itineraryData: shorter, constraints: { dates: { durationDays: 2 } } }).reasonCodes)
      .toContain('underfilled_day_count');
    expect(evaluateStructuralArtifact({ itineraryData: shorter, constraints: { durationDays: 2 } }).reasonCodes)
      .toContain('underfilled_day_count');
  });

  // P0-C — never invent a duration.
  it('never rewrites a duration; the returned plan reference is untouched', () => {
    const input = plan([{ day: 1, stops: [stop('Island in the Sky scenic drive', 0)] }]);
    const before = JSON.parse(JSON.stringify(input));
    evaluateStructuralArtifact({ itineraryData: input, constraints: null });
    expect(input).toEqual(before);
  });

  it('reports which obligations this stage actually evaluated', () => {
    const result = evaluateStructuralArtifact({
      itineraryData: plan([{ day: 1, stops: [stop('Grand View Point', 60)] }]),
      constraints: { durationDays: 1 },
    });
    expect(result.evaluatedObligations.sort()).toEqual([...STRUCTURAL_OBLIGATIONS].sort());
  });

  it('only ever emits codes from its declared bounded set', () => {
    const result = evaluateStructuralArtifact({
      itineraryData: plan([
        { day: 1, stops: [stop('Island in the Sky scenic drive', 0)] },
        { day: 2, stops: [] },
      ]),
      constraints: { durationDays: 4 },
    });
    for (const code of result.reasonCodes) {
      expect(STRUCTURAL_REASON_CODES).toContain(code);
    }
  });
});

describe('structural verdicts agree with completeness (no plan changes outcome)', () => {
  // P0-O — the early gate repeats existing thresholds. A partial-zero day is
  // NOT structurally rejected, because delivered plans contain them and this
  // pass must not silently change what ships.
  it('does not reject a day that has at least one positive-duration stop', () => {
    const partial = plan([
      { day: 1, stops: [stop('Sunrise Road scenic drive', 0), stop('Paradise Inn area', 120)] },
    ]);
    expect(evaluateStructuralArtifact({ itineraryData: partial, constraints: { durationDays: 1 } }).ok).toBe(true);
    expect(evaluateItineraryCompleteness({ itineraryData: partial, constraints: { durationDays: 1 } }).reasonCodes)
      .not.toContain('zero_duration_stops');
  });

  it('agrees with completeness on the all-zero day', () => {
    const allZero = plan([{ day: 1, stops: [stop('Island in the Sky scenic drive', 0), stop('Grand View Point', 0)] }]);
    expect(evaluateStructuralArtifact({ itineraryData: allZero, constraints: null }).reasonCodes)
      .toContain('zero_duration_stops');
    expect(evaluateItineraryCompleteness({ itineraryData: allZero, constraints: null }).reasonCodes)
      .toContain('zero_duration_stops');
  });
});

describe('buildStructuralRepairInstructions', () => {
  it('names the offending stops and demands a real duration without supplying one', () => {
    const text = buildStructuralRepairInstructions({
      reasonCodes: ['zero_duration_stops'],
      dayDiagnostics: [{
        dayIndex: 0,
        dayNumber: 1,
        codes: ['zero_duration_stops'],
        zeroDurationStopNames: ['Island in the Sky scenic drive'],
      }],
    });
    expect(text).toMatch(/Day 1/);
    expect(text).toMatch(/Island in the Sky scenic drive/);
    expect(text).toMatch(/greater than zero|positive/i);
    // P0-C — no default minutes may be suggested.
    expect(text).not.toMatch(/\b(?:30|45|60|90|120)\b/);
  });

  it('does not tell the model to add stops when the defect is duration', () => {
    const text = buildStructuralRepairInstructions({
      reasonCodes: ['zero_duration_stops'],
      dayDiagnostics: [{ dayIndex: 0, dayNumber: 1, codes: ['zero_duration_stops'], zeroDurationStopNames: ['A Place'] }],
    });
    expect(text).toMatch(/Keep the same stops|do not add/i);
  });

  it('returns empty text when there is nothing to repair', () => {
    expect(buildStructuralRepairInstructions({ reasonCodes: [] })).toBe('');
  });
});
