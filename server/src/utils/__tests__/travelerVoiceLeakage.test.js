'use strict';

/**
 * P1-2/P1-3 traveler-facing itinerary quality — presentation-boundary
 * regression pins.
 *
 * These tests do not exercise generation, validation, or repair behavior.
 * They pin two things:
 *   1. The scanner itself catches the literal phrases the 2026-08-31 product
 *      audit found leaking to travelers (docs/plan-ai-audit-2026-08-31), plus
 *      the rest of the internal vocabulary named in the presentation-boundary
 *      spec — so a future regression has somewhere to be caught.
 *   2. Real captured output from the current producers (ordinary itinerary,
 *      RV/operationally-constrained itinerary + its refinement, and a
 *      preference-constrained itinerary + its refinement — all 2026-08-31/
 *      2026-09-02 successful live captures) stays inside the boundary.
 */

const {
  scanTextForVoiceLeakage,
  scanPlanForVoiceLeakage,
} = require('../travelerVoiceLeakage');

const fs = require('fs');
const path = require('path');

const captures = require('./__fixtures__/travelerVoiceCaptures/successfulPlans2026-09.json');

const LIVE_TRANSCRIPT = fs.readFileSync(
  path.join(__dirname, '__fixtures__/travelerVoiceCaptures/live-ordinary-and-refinement-2026-09-03.txt'),
  'utf8',
);

describe('scanTextForVoiceLeakage — catches the known leaks', () => {
  test('the exact repair-chain phrase that leaked live (2026-08-31 audit)', () => {
    const text = 'This adds a genuine scenic experience that follows naturally from Apgar and '
      + 'requires no changes to the existing stop.';
    const hits = scanTextForVoiceLeakage(text).map((h) => h.id);
    expect(hits).toEqual(expect.arrayContaining(['requires_no_changes', 'existing_stop']));
  });

  test('an evidence-restraint disclaimer written in pipeline voice', () => {
    const text = 'I have not invented one, since the evidence bundle does not name a canonical plan for this day.';
    const hits = scanTextForVoiceLeakage(text).map((h) => h.id);
    expect(hits).toEqual(expect.arrayContaining(['have_not_invented', 'evidence_bundle', 'canonical_plan']));
  });

  test.each([
    ['a validator flagged this stop', 'validator'],
    ['added to satisfy the day\'s coverage obligation', 'coverage'],
    ['added to satisfy the day\'s coverage obligation', 'obligation'],
    ['this is a compatible candidate for the afternoon', 'candidate'],
    ['selected because it is evidence-supported', 'evidence_supported'],
    ['no supplied information about the trail', 'supplied_information'],
    ['constraint eligibility could not be confirmed', 'constraint_eligibility'],
    ['see placeRef 4 for the replacement', 'place_ref'],
    ['stopId abc123 was targeted', 'stop_id'],
    ['a bounded patch operation applied here', 'patch_mechanics'],
  ])('flags %j (%s)', (text, id) => {
    expect(scanTextForVoiceLeakage(text).map((h) => h.id)).toContain(id);
  });

  test('ordinary trip prose with none of the vocabulary is clean', () => {
    const text = 'I made Day 2 easier — later start, one less stop, and a gentler afternoon. '
      + 'Check the morning road status before heading out.';
    expect(scanTextForVoiceLeakage(text)).toEqual([]);
  });
});

describe('real successful captures stay inside the presentation boundary', () => {
  const cases = Object.keys(captures);

  test.each(cases)('%s: no leak beyond the one documented pre-fix case', (name) => {
    const hits = scanPlanForVoiceLeakage(captures[name]);

    // KNOWN, NAMED CASE: the live Gate-6 coverage-repair addition ("Green
    // River Overlook") wrote `why: "...without repeating an existing stop."`
    // — the exact class of leak this pass's schema/instruction fixes
    // (itineraryToolSchema.js note/why descriptions, dayContainedAnchorRepair.js
    // and dayContainedCoverageRepair.js note/why fields + instruction text)
    // target. It predates this pass and was found BY this scanner, not fixed
    // by re-running generation (that would spend live money and is out of
    // scope here) — so it is named and allowed here rather than hidden, and
    // this test fails the moment any OTHER leak appears anywhere in the
    // fixture set.
    const known = hits.filter((h) => h.id === 'existing_stop'
      && /Green River Overlook/i.test(h.field)
      && /without repeating an existing stop/i.test(h.text));
    const unexpected = hits.filter((h) => !known.includes(h));

    expect(unexpected).toEqual([]);
    if (name === 'ordinary_canyonlands') {
      expect(known.length).toBe(1);
    } else {
      expect(known.length).toBe(0);
    }
  });
});

describe('live /plan-ai verification, 2026-09-03 (post-fix, this pass)', () => {
  // Rendered transcript from a real guest run against the local backend with
  // this pass's producer/field-contract changes live: an ordinary Badlands
  // itinerary (create_itinerary), then "Make day 2 more relaxed." (patch_itinerary
  // refinement). Full transcript, verbatim, in the sibling .txt fixture.
  test('the full rendered transcript (plan + refinement) has zero leaked vocabulary', () => {
    expect(scanTextForVoiceLeakage(LIVE_TRANSCRIPT)).toEqual([]);
  });

  test('the refinement response reads as a continuation, not patch machinery', () => {
    const responseLine = 'I made Day 2 a gentler central-Badlands outing: three close-together overlooks, '
      + 'two easy boardwalk pauses, and plenty of room to linger over the scenery rather than chase a full '
      + 'schedule. Check morning road and site access before heading out.';
    expect(LIVE_TRANSCRIPT).toContain(responseLine);
    expect(scanTextForVoiceLeakage(responseLine)).toEqual([]);
  });
});
