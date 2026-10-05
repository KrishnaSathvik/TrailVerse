'use strict';

/**
 * PHASE 2 — traveler-fit findings reach the shared day diagnostics.
 *
 * The 2026-08-28 scope audit found 40 of 41 creation-path failures machine
 * resolvable. The single hold-out was `unverified_access_dependency_anchor`:
 * traveler fit knew the day, and the day was dropped before the shared
 * `dayDiagnostics` shape the repair machinery resolves scope from.
 *
 * The fixture in the first test is the REAL finding captured on
 * `_pre-rerun-gate5/conversation-B` attempt 3, not a synthetic one.
 */

const {
  buildTravelerFitDayDiagnostics,
  evaluateTravelerFit,
  FIT,
} = require('../travelerFitEvaluation');

/** Verbatim from the historical plan-stage capture. */
const HISTORICAL_FINDING = {
  dayNumber: 3,
  stopName: 'Petrified Forest trailhead photography outing',
  fit: 'unknown',
  kinds: ['vehicle_capability'],
  source: 'official',
};

describe('the day survives the trip into shared diagnostics', () => {
  it('places the real historical finding on its own day', () => {
    const { ok, dayDiagnostics } = buildTravelerFitDayDiagnostics({ findings: [HISTORICAL_FINDING] });
    expect(ok).toBe(true);
    expect(dayDiagnostics).toEqual([{
      dayIndex: null,
      dayNumber: 3,
      codes: ['unverified_access_dependency'],
      stopNames: ['Petrified Forest trailhead photography outing'],
    }]);
  });

  it('preserves the existing code semantics per fit verdict', () => {
    const { dayDiagnostics } = buildTravelerFitDayDiagnostics({
      findings: [
        { dayNumber: 1, stopName: 'A', fit: FIT.INCOMPATIBLE },
        { dayNumber: 2, stopName: 'B', fit: FIT.UNKNOWN },
      ],
    });
    expect(dayDiagnostics.map((d) => d.codes)).toEqual([
      ['traveler_fit_incompatible'],
      ['unverified_access_dependency'],
    ]);
  });

  it('produces a deterministic multi-day scope, ordered and de-duplicated', () => {
    const { ok, dayDiagnostics } = buildTravelerFitDayDiagnostics({
      findings: [
        { dayNumber: 3, stopName: 'C', fit: FIT.UNKNOWN },
        { dayNumber: 1, stopName: 'A', fit: FIT.INCOMPATIBLE },
        { dayNumber: 3, stopName: 'D', fit: FIT.UNKNOWN },
        { dayNumber: 1, stopName: 'A', fit: FIT.INCOMPATIBLE },
      ],
    });
    expect(ok).toBe(true);
    expect(dayDiagnostics.map((d) => d.dayNumber)).toEqual([1, 3]);
    expect(dayDiagnostics[0].stopNames).toEqual(['A']);
    expect(dayDiagnostics[1].stopNames).toEqual(['C', 'D']);
    expect(dayDiagnostics[1].codes).toEqual(['unverified_access_dependency']);
  });

  it('collects several codes on one day without inventing a new one', () => {
    const { dayDiagnostics } = buildTravelerFitDayDiagnostics({
      findings: [
        { dayNumber: 2, stopName: 'A', fit: FIT.INCOMPATIBLE },
        { dayNumber: 2, stopName: 'B', fit: FIT.UNKNOWN },
      ],
    });
    expect(dayDiagnostics).toHaveLength(1);
    expect(dayDiagnostics[0].codes.sort())
      .toEqual(['traveler_fit_incompatible', 'unverified_access_dependency']);
  });
});

describe('it fails closed rather than guessing a scope', () => {
  it('refuses the whole projection when a finding has no day', () => {
    const r = buildTravelerFitDayDiagnostics({ findings: [{ stopName: 'A', fit: FIT.UNKNOWN }] });
    expect(r.ok).toBe(false);
    expect(r.dayDiagnostics).toEqual([]);
    expect(r.unplaced).toBe(1);
  });

  it('refuses even when only ONE finding of several is unplaced', () => {
    const r = buildTravelerFitDayDiagnostics({
      findings: [
        { dayNumber: 1, stopName: 'A', fit: FIT.INCOMPATIBLE },
        { dayNumber: null, stopName: 'B', fit: FIT.UNKNOWN },
      ],
    });
    // A partial map would look like a fully resolved scope. Unresolved is correct.
    expect(r.ok).toBe(false);
    expect(r.dayDiagnostics).toEqual([]);
  });

  it.each([[undefined], [null], ['two'], [NaN], [{}]])('treats dayNumber %p as unplaceable', (bad) => {
    expect(buildTravelerFitDayDiagnostics({ findings: [{ dayNumber: bad, fit: FIT.UNKNOWN }] }).ok)
      .toBe(false);
  });

  it('is empty, not failed, when there are no findings at all', () => {
    expect(buildTravelerFitDayDiagnostics({ findings: [] }))
      .toEqual({ ok: true, dayDiagnostics: [], unplaced: 0 });
    expect(buildTravelerFitDayDiagnostics({})).toEqual({ ok: true, dayDiagnostics: [], unplaced: 0 });
  });

  it('drops findings that imply no code rather than emitting an empty day', () => {
    const { ok, dayDiagnostics } = buildTravelerFitDayDiagnostics({
      findings: [{ dayNumber: 1, stopName: 'A', fit: FIT.COMPATIBLE }],
    });
    expect(ok).toBe(true);
    expect(dayDiagnostics).toEqual([]);
  });
});

describe('the projection changes nothing about traveler-fit evaluation', () => {
  it('evaluateTravelerFit still returns exactly its own shape', () => {
    const result = evaluateTravelerFit({
      itineraryData: { days: [{ dayNumber: 1, stops: [{ name: 'Visitor Center', type: 'visitor_center', duration: 60 }] }] },
      constraints: { dates: { durationDays: 1 } },
      userPrompt: 'an easy relaxed day',
      evidenceBundle: null,
    });
    // PHASE 4Q adds `requirements`: ACTION_REQUIRED obligations that travel WITH
    // a valid recommendation instead of invalidating it.
    expect(Object.keys(result).sort()).toEqual(['findings', 'ok', 'reasonCodes', 'requirements']);
    expect(result).not.toHaveProperty('dayDiagnostics');
  });
});
