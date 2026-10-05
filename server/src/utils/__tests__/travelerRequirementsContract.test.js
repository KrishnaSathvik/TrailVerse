'use strict';

/**
 * P1-6 — END-TO-END PROOF, REAL PRODUCER + REAL NPS DATA.
 *
 * This is not a mocked unit test of `attachTravelerRequirements` alone: it runs
 * the actual production chain — `extractOperationalFacts` (the real producer,
 * unmodified) → `evaluateTravelerFit` (the real evaluator, unmodified) →
 * `attachTravelerRequirements` (this pass's new projection) — over a REAL NPS
 * `/thingstodo` record (Redwood National and State Parks, "Hike to the Tall
 * Trees Grove", captured from the local warmed NPS activities snapshot on
 * 2026-09-03). That record happens to carry BOTH a reservation/permit
 * obligation (`isReservationRequired: true`) and a real RV/trailer parking
 * limit in its `longDescription` — exactly the two requirement classes this
 * pass adds a contract for — so it doubles as a live-data proof for the
 * Glacier-shaped "24-ft RV vs a shorter limit" arithmetic without inventing a
 * fixture.
 *
 * See [[trailie-requirements-contract-2026-09-03]] for why this test exists:
 * every live `/plan-ai` prompt tried during this pass had the model paraphrase
 * or omit the exact NPS activity title, which fails the identity-equivalent
 * name binding `bindFactsToStop` uses — a separate, pre-existing binding
 * fragility this pass documents but does not fix (touching binding/generation
 * behavior is out of scope). Running the real functions directly, the way a
 * plan that DID keep the exact name would exercise them, is what proves the
 * requirements contract itself is correct.
 */

const { evaluateTravelerFit } = require('../travelerFitEvaluation');
const { extractOperationalFacts } = require('../operationalFactExtraction');
const { attachTravelerRequirements } = require('../travelerRequirementsContract');

// Trimmed to the fields extractOperationalFacts actually reads. Verbatim
// wording from the real NPS record (id 0FD71670-95F5-4546-8B4B-6FBE299ECE8C,
// https://www.nps.gov/thingstodo/talltreeshike.htm), not paraphrased.
const TALL_TREES_ITEM = {
  id: '0FD71670-95F5-4546-8B4B-6FBE299ECE8C',
  title: 'Hike to the Tall Trees Grove',
  url: 'https://www.nps.gov/thingstodo/talltreeshike.htm',
  shortDescription: 'A half-day hike in the southern part of the parks for those ready for an '
    + 'adventure. A free reservation is needed. This trail is one the more strenuous hikes in '
    + 'Redwood National and State Parks.',
  isReservationRequired: 'true',
  reservationDescription: 'A free <a href="https://www.nps.gov/redw/planyourvisit/talltreespermits.htm">'
    + 'Tall Trees Grove permit</a> is required. These are only issued online.',
  longDescription: 'Visitors wishing to go to the Tall Trees Grove must apply online for a free '
    + 'reservation. These are limited to 50 parties for each day. This 4.5-mile (6.5km) round trip '
    + 'backcountry hike descends 800 feet down to the alluvial floodplain of Redwood Creek. '
    + 'Access: Allow a 1-hour drive (including 7-miles on a dirt road) from the nearest visitor '
    + 'center to the trailhead. The small parking lot does not accommodate RVs over 21 feet or '
    + 'vehicles towing trailers.',
};

const parkCode = 'redw';

/**
 * The REAL Tall Trees record's own vehicle-limit sentence ("does not
 * accommodate RVs over 21 feet") does NOT match `parseVehicleLengthLimit`'s
 * patterns — those are anchored on "longer than / over N feet ... prohibited /
 * not permitted" wording (the confirmed Going-to-the-Sun-Road phrasing). That
 * is a real, narrow-regex-coverage gap in `vehicleDimensionContract.js`,
 * observed while writing this test; fixing extraction wording coverage is
 * detection logic, out of this pass's scope (see the P1-6 report). This
 * second fixture reuses the SAME already-validated GTSR-style wording
 * (`vehicleDimensionContract.test.js`) on the same real place, purely to
 * prove the requirement-record enrichment (`observedValue`/`limitValue`) and
 * the "never reaches an accepted plan" architecture point — not to claim the
 * real Tall Trees prose parses today.
 */
const TALL_TREES_ITEM_WITH_PARSEABLE_LIMIT = {
  ...TALL_TREES_ITEM,
  longDescription: `${TALL_TREES_ITEM.longDescription} Vehicles, and vehicle combinations, longer `
    + 'than 21 feet (6.4 m) are prohibited on the access road.',
};

function bundleFor(item) {
  return {
    evidence: [{
      topic: 'activities',
      evidenceId: 'e:tall-trees',
      claim: {
        text: item.title,
        normalizedValue: {
          name: item.title,
          operationalFacts: extractOperationalFacts({ item, parkCode }),
        },
      },
    }],
  };
}

const stop = (name, duration, extra = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'), order: 1, type: 'trail', name, note: '', startTime: '', duration, ...extra,
});

const dayWith = (extraStop) => ([{
  dayNumber: 1,
  stops: [
    stop('Redwood National and State Parks Visitor Center', 30, { type: 'visitor_center' }),
    extraStop,
  ],
}]);

describe('P1-6 — real NPS record produces an ACTION_REQUIRED permit obligation', () => {
  it('an ordinary traveler: plan is ACCEPTED, and the permit obligation is on travelerFit.requirements', () => {
    const itineraryData = { intro: 'x', days: dayWith(stop('Hike to the Tall Trees Grove', 240)) };
    const result = evaluateTravelerFit({
      itineraryData,
      constraints: { durationDays: 2 },
      userPrompt: 'two days at Redwood, I want to hike to the Tall Trees Grove',
      evidenceBundle: bundleFor(TALL_TREES_ITEM),
    });

    // A permit obligation is ACTION_REQUIRED, not HARD_CAPABILITY — the stop
    // stays in the plan; it does not fail the gate the way a 4WD-only or
    // oversized-vehicle road does.
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.requirements).toHaveLength(1);
    const req = result.requirements[0];
    expect(req.kind).toBe('permit');
    expect(req.dependencyClass).toBe('action_required');
    expect(req.stopName).toBe('Hike to the Tall Trees Grove');
    expect(req.dayNumber).toBe(1);
    expect(req.source).toBe('official');
  });

  it('attachTravelerRequirements places it on the EXACT stop, and no other stop is touched', () => {
    const itineraryData = { intro: 'x', days: dayWith(stop('Hike to the Tall Trees Grove', 240)) };
    const fit = evaluateTravelerFit({
      itineraryData,
      constraints: { durationDays: 2 },
      userPrompt: 'two days at Redwood, hike to the Tall Trees Grove',
      evidenceBundle: bundleFor(TALL_TREES_ITEM),
    });

    const projected = attachTravelerRequirements({ itineraryData, requirements: fit.requirements });

    const [visitorCenter, tallTrees] = projected.days[0].stops;
    expect(visitorCenter.requirements).toBeUndefined();

    expect(tallTrees.requirements).toHaveLength(1);
    const card = tallTrees.requirements[0];
    expect(card).toMatchObject({
      kind: 'permit',
      category: 'action_required',
      severity: 'required',
      scope: 'stop',
      title: 'Permit required',
    });
    expect(card.requirement).toMatch(/reservation|permit/i);
    // Day/trip level stay untouched — no duplication of the same obligation.
    expect(projected.days[0].requirements).toBeUndefined();
    expect(projected.requirements).toBeUndefined();

    // The input itineraryData is never mutated.
    expect(itineraryData.days[0].stops[1].requirements).toBeUndefined();
  });

  it('a traveler with an oversized RV wanting to DRIVE there: gate fails closed (hard incompatibility), never silently accepted', () => {
    const itineraryData = { intro: 'x', days: dayWith(stop('Hike to the Tall Trees Grove', 240)) };
    const fit = evaluateTravelerFit({
      itineraryData,
      constraints: { durationDays: 2, vehicle: { kind: 'rv', lengthFeet: 24, raw: '24-foot RV' } },
      userPrompt: 'two days at Redwood in our 24-foot RV, drive to the Tall Trees Grove trailhead',
      evidenceBundle: bundleFor(TALL_TREES_ITEM_WITH_PARSEABLE_LIMIT),
    });

    expect(fit.ok).toBe(false);
    expect(fit.reasonCodes).toContain('traveler_fit_incompatible');
    const finding = fit.findings.find((f) => f.stopName === 'Hike to the Tall Trees Grove');
    expect(finding).toBeTruthy();
    const requirement = finding.requirements[0];
    // Exact numbers, machine-owned — never re-derived from the traveler's or
    // the official prose downstream.
    expect(requirement.kind).toBe('vehicle_dimension');
    expect(requirement.observedValue).toBe('24 ft');
    expect(requirement.limitValue).toBe('21 ft');
    expect(requirement.requirement).toMatch(/24 ft/);
    expect(requirement.requirement).toMatch(/21 ft/);

    // DOCUMENTED, NOT FIXED (out of scope for this pass): because this
    // classification fails the `traveler_fit` gate, an ACCEPTED plan can never
    // carry a hard-incompatibility requirement on this stop — the stop is
    // repaired/regenerated away before a response is ever returned. See the
    // module header in travelerRequirementsContract.js.
    const projected = attachTravelerRequirements({ itineraryData, requirements: fit.requirements });
    expect(projected).toBe(itineraryData); // unchanged: no ACTION_REQUIRED rows to attach
  });

  /**
   * ACCEPTANCE CASE 4 — REFINEMENT REMOVES THE STALE REQUIREMENT.
   *
   * Live-verify note (P1-6 report): a live `/plan-ai` refinement turn on this
   * exact plan (guest, local, 2026-09-03) failed 4/4 times at the
   * `itinerary_completeness`/`stop_identity` stages — pre-existing generation
   * reliability issues (unrelated files: itineraryCompleteness.js,
   * stopIdentityResolution.js) that this pass does not touch and that run
   * BEFORE `traveler_fit` in trailieExecutionService.js, so they never
   * reached this pass's code. What this test proves instead, with the real
   * production functions: `attachTravelerRequirements` and
   * `evaluateTravelerFit` hold NO state between calls — every call recomputes
   * fresh from whatever `itineraryData` it is given. A requirement can
   * therefore never survive a refinement that changes the stop it was bound
   * to, because nothing carries it forward; it is not cached, not merged, not
   * trip-level fallback baggage.
   */
  it('after a refinement replaces the Day 1 stop, the permit requirement is gone — not carried over, not orphaned at trip level', () => {
    // Turn N — accepted plan, permit requirement on the exact stop.
    const turnN = { intro: 'x', days: dayWith(stop('Hike to the Tall Trees Grove', 240)) };
    const fitN = evaluateTravelerFit({
      itineraryData: turnN,
      constraints: { durationDays: 2 },
      userPrompt: 'two days at Redwood, hike to the Tall Trees Grove',
      evidenceBundle: bundleFor(TALL_TREES_ITEM),
    });
    const projectedN = attachTravelerRequirements({ itineraryData: turnN, requirements: fitN.requirements });
    expect(projectedN.days[0].stops[1].requirements).toHaveLength(1);

    // Turn N+1 — the SAME evidence bundle (nothing about the park changed),
    // but the refinement replaced Day 1's stop with an ordinary one with no
    // operational facts of its own. This is what a successful `update_day` /
    // stop-substitution patch produces: a NEW itineraryData object.
    const turnNPlus1 = {
      intro: 'x',
      days: dayWith(stop('Lady Bird Johnson Grove Trail', 60, { type: 'trail' })),
    };
    const fitNPlus1 = evaluateTravelerFit({
      itineraryData: turnNPlus1,
      constraints: { durationDays: 2 },
      userPrompt: 'swap the tall trees grove hike for something easier',
      evidenceBundle: bundleFor(TALL_TREES_ITEM), // same bundle — the fact still exists, just unbound
    });
    expect(fitNPlus1.requirements).toEqual([]); // no stop named/identity-matched to the fact anymore

    const projectedNPlus1 = attachTravelerRequirements({ itineraryData: turnNPlus1, requirements: fitNPlus1.requirements });
    // Identical input/output reference: nothing to attach, so it's a no-op —
    // the SAME guarantee an ordinary Badlands-shaped plan gets.
    expect(projectedNPlus1).toBe(turnNPlus1);
    expect(projectedNPlus1.days[0].stops.every((s) => !s.requirements)).toBe(true);
    expect(projectedNPlus1.requirements).toBeUndefined();
  });
});

describe('P1-6 — an ordinary stop with no operational facts renders unchanged', () => {
  it('attachTravelerRequirements is a no-op when there is nothing to attach', () => {
    const itineraryData = {
      intro: 'x',
      days: [{ dayNumber: 1, stops: [stop('Big Badlands Overlook', 30), stop('Door Trailhead', 90)] }],
    };
    const projected = attachTravelerRequirements({ itineraryData, requirements: [] });
    expect(projected).toBe(itineraryData);
  });
});
