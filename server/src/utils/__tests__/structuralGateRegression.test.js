'use strict';

/**
 * P0-O — SUCCESSFUL-PLAN REGRESSION.
 *
 * The early structural stage exists to reach an EXISTING verdict sooner, never
 * to change one. Every canonical plan this system has actually delivered to a
 * traveler — 30 of them across the 2026-08-12 → 2026-08-24 artifact record,
 * including Zion, Redwood, Everglades, Rushmore/Black Hills, Rainier and the
 * Valley of Fire road trips — must still pass.
 *
 * The fixture is extracted verbatim from those captures: names, types and
 * durations only.
 */

const path = require('path');
const { evaluateStructuralArtifact } = require('../itineraryStructuralValidation');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');

const DELIVERED = require(
  path.join(__dirname, '../../services/__tests__/fixtures/constructorLadder/deliveredPlans.json')
);
const LADDER = ['redwood', 'everglades', 'rushmore'].map((slug) => ({
  slug,
  fixture: require(path.join(__dirname, `../../services/__tests__/fixtures/constructorLadder/${slug}.json`)),
}));

/**
 * The invariant that actually matters: the early stage may reach an existing
 * verdict SOONER, never reach a new one. So for every delivered plan, the
 * structural gate rejects it only if today's completeness validator already
 * does.
 */
function completenessStructuralCodes(plan) {
  return evaluateItineraryCompleteness({
    itineraryData: plan,
    constraints: { durationDays: plan.days.length },
    userPrompt: '',
  }).reasonCodes.filter((c) => STRUCTURAL_CODES.includes(c));
}

const STRUCTURAL_CODES = ['zero_duration_stops', 'empty_day', 'empty_itinerary', 'underfilled_day_count'];

describe('the structural gate introduces no new rejection', () => {
  it('has a non-trivial corpus to check', () => {
    expect(DELIVERED.length).toBeGreaterThanOrEqual(25);
  });

  it.each(DELIVERED.map((p, i) => [i, p.source, p]))(
    'delivered plan #%i (%s) gets the same structural verdict as completeness',
    (_i, _source, plan) => {
      const early = evaluateStructuralArtifact({
        itineraryData: plan,
        // Judge against the trip length the plan itself has, so a fixture
        // without captured constraints cannot fail on `underfilled_day_count`
        // for a reason this stage was never asked about.
        constraints: { durationDays: plan.days.length },
      }).reasonCodes;
      expect(early.sort()).toEqual(completenessStructuralCodes(plan).sort());
    }
  );

  /**
   * ONE delivered plan in the record is structurally invalid: the 2026-08-17
   * Acadia "less driving" turn shipped a four-day plan with every stop at
   * `duration: 0`. It predates `zero_duration_stops` (added 2026-08-23) and it
   * was delivered as a `plain_answer` with an EMPTY attempt ladder, so no
   * constructor validation ran on it at all. Today's completeness validator
   * already refuses it; the early stage refuses the same plan for the same
   * reason. That is prior coverage arriving sooner, not a new rejection.
   */
  it('the only structurally-refused delivered plan is the known pre-validator artifact', () => {
    const refused = DELIVERED.filter((p) => !evaluateStructuralArtifact({
      itineraryData: p,
      constraints: { durationDays: p.days.length },
    }).ok);
    expect(refused.map((p) => p.source)).toEqual([
      'artifacts/trailie-broad-unseen-gate-2026-08-17/thread-1/T1-2-less-driving-capture.json :: capture.canonicalPlan',
    ]);
    // Refused by the CURRENT validator too — so this pass changed nothing about it.
    expect(completenessStructuralCodes(refused[0])).toContain('zero_duration_stops');
  });

  it('every other delivered plan still passes cleanly', () => {
    const clean = DELIVERED.filter((p) => !/broad-unseen-gate-2026-08-17\/thread-1/.test(p.source));
    expect(clean.length).toBe(DELIVERED.length - 1);
    for (const plan of clean) {
      const result = evaluateStructuralArtifact({
        itineraryData: plan,
        constraints: { durationDays: plan.days.length },
      });
      expect({ source: plan.source, codes: result.reasonCodes })
        .toEqual({ source: plan.source, codes: [] });
    }
  });

  it('accepts the successful attempt from each captured gate #3 ladder', () => {
    for (const { slug, fixture } of LADDER) {
      const passing = fixture.attemptLadder.find((a) => a.validationStatus === 'pass');
      expect(passing).toBeTruthy();
      const plan = fixture.canonicalPlan;
      expect(plan).toBeTruthy();
      const result = evaluateStructuralArtifact({
        itineraryData: plan,
        constraints: fixture.constraints,
      });
      expect({ slug, codes: result.reasonCodes }).toEqual({ slug, codes: [] });
    }
  });
});

describe('the gate refuses exactly the candidates the live ladders refused', () => {
  it.each([
    ['canyonlands', 1, ['zero_duration_stops']],
    ['everglades', 1, ['zero_duration_stops']],
  ])('%s attempt %i is refused with %j', (slug, attempt, expected) => {
    const fixture = require(
      path.join(__dirname, `../../services/__tests__/fixtures/constructorLadder/${slug}.json`)
    );
    const candidate = fixture.attempts.find((a) => a.attempt === attempt);
    const result = evaluateStructuralArtifact({
      itineraryData: candidate.rawPlan,
      constraints: fixture.constraints,
    });
    expect(result.reasonCodes).toEqual(expected);
  });

  it('does NOT refuse the candidates whose only defects were semantic', () => {
    for (const [slug, attempt] of [['canyonlands', 2], ['everglades', 2]]) {
      const fixture = require(
        path.join(__dirname, `../../services/__tests__/fixtures/constructorLadder/${slug}.json`)
      );
      const candidate = fixture.attempts.find((a) => a.attempt === attempt);
      const result = evaluateStructuralArtifact({
        itineraryData: candidate.rawPlan,
        constraints: fixture.constraints,
      });
      // Coverage and experience-anchor defects need evidence and the traveler's
      // words; they are not this stage's business and must reach completeness.
      expect({ slug, attempt, ok: result.ok }).toEqual({ slug, attempt, ok: true });
    }
  });
});

/**
 * The threshold question, recorded deliberately.
 *
 * Four plans in the delivered record carry SOME zero-duration stops next to
 * real ones (Rainier's "Sunrise Road scenic drive", the Las Vegas → Valley of
 * Fire drive legs, a "lodge — selection required" placeholder). Tightening
 * `zero_duration_stops` from "every named stop on the day" to "any stop" would
 * newly reject all four. That is a real latent quality defect, but changing it
 * here would push previously-shipped plans into the repair ladder — the exact
 * unreliability this pass is fixing. It is left for its own pass.
 */
describe('the partial-zero threshold is unchanged in this pass', () => {
  it('delivered plans containing some zero-duration stops still pass', () => {
    const partial = DELIVERED.filter((p) => {
      const stops = p.days.flatMap((d) => d.stops);
      const zeros = stops.filter((s) => !(Number(s.duration) > 0));
      return zeros.length > 0 && zeros.length < stops.length;
    });
    expect(partial.length).toBeGreaterThan(0);
    for (const plan of partial) {
      expect(evaluateStructuralArtifact({
        itineraryData: plan,
        constraints: { durationDays: plan.days.length },
      }).ok).toBe(true);
    }
  });
});
