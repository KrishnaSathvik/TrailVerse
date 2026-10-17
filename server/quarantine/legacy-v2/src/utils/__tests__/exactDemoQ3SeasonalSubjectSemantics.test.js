'use strict';

/**
 * Exact Demo Q3 — seasonal subject identity semantics (offline).
 * No providers / network / paid runs.
 */

const fs = require('fs');
const path = require('path');
const {
  resolveOperationalConstraints,
  applyOperationalConstraints,
  subjectMatches,
  CONSTRAINT_TYPE,
} = require('../../../../../src/utils/trailieOperationalConstraints');
const { evaluateItineraryCompleteness } = require('../../../../../src/utils/itineraryCompleteness');
const { candidatesForEntity } = require('../../../../../src/data/officialPlaceActivityCandidates');
const { createKnownPlaceEvidenceProvider } = require('../../../../../src/services/providers/knownPlaceEvidenceProvider');

const Q3_PROMPT =
  'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.';

const PLAN_STAGES_DIR = path.resolve(
  require('path').resolve(__dirname, '../../../../../src/utils/__tests__'),
  '../../../../artifacts/trailie-v2-demo-final-validation/q3-paid-reval/plan-stages'
);

function loadAttempt(n) {
  return JSON.parse(
    fs.readFileSync(path.join(PLAN_STAGES_DIR, `q3-paid-reval__attempt-${n}.json`), 'utf8')
  );
}

function vofRules(now = '2026-08-12T12:00:00Z') {
  return resolveOperationalConstraints({
    destination: 'Valley of Fire State Park',
    now,
    userText: Q3_PROMPT,
    constraints: {
      dates: { durationDays: 2 },
      operationalEvidence: [{
        id: 'seasonal-trail-closures',
        type: 'seasonal_closure',
        destination: 'Valley of Fire State Park',
        subjects: ['Fire Wave', 'White Domes', 'White Domes Trail', 'White Domes Loop', 'Seven Wonders Loop'],
        plannerRule: 'Named trails are seasonally closed; this does not mean the approach road or the entire area is closed.',
        closureScope: 'trail_only',
        effectiveFrom: '2026-05-01',
        effectiveThrough: '2026-09-30',
      }],
    },
  });
}

function seasonalRule(rules = vofRules()) {
  return rules.find((r) => r.type === CONSTRAINT_TYPE.SEASONAL_CLOSURE);
}

function stopNames(itinerary) {
  return (itinerary?.days || []).flatMap((d) => (d.stops || []).map((s) => s.name));
}

describe('Exact Demo Q3 — seasonal subject identity semantics', () => {
  test('seasonal rule is active in August and includes Fire Wave', () => {
    const rule = seasonalRule();
    expect(rule).toBeTruthy();
    expect(rule.type).toBe(CONSTRAINT_TYPE.SEASONAL_CLOSURE);
    expect(rule.subjects).toEqual(expect.arrayContaining(['Fire Wave', 'White Domes']));
  });

  test('A — avoidance note does not identify stop as Fire Wave', () => {
    const rule = seasonalRule();
    const stop = {
      name: 'Easy morning walk',
      note: 'Do not use Fire Wave, Seven Wonders Loop, or White Domes.',
      why: 'Avoid closed trails.',
    };
    expect(subjectMatches(stop, rule)).toBe(false);
  });

  test('B — stop named Fire Wave Trail matches', () => {
    expect(subjectMatches({ name: 'Fire Wave Trail' }, seasonalRule())).toBe(true);
  });

  test('C — "instead of Fire Wave" note does not match', () => {
    expect(subjectMatches({
      name: 'Alternative easy walk',
      note: 'Choose this instead of Fire Wave.',
    }, seasonalRule())).toBe(false);
  });

  test('D — structured accessDependency matches', () => {
    expect(subjectMatches({
      name: 'Morning hike',
      accessDependency: 'Fire Wave Trail',
    }, seasonalRule())).toBe(true);
  });

  test('E — Seven Wonders Loop name matches', () => {
    expect(subjectMatches({ name: 'Seven Wonders Loop' }, seasonalRule())).toBe(true);
  });

  test('F — why-text avoidance of White Domes does not match viewpoint', () => {
    expect(subjectMatches({
      name: 'Scenic viewpoint',
      why: 'Avoid White Domes because it is closed.',
    }, seasonalRule())).toBe(false);
  });

  test('true closures still remove named closed trails and closed alternatives', () => {
    const rules = vofRules();
    const out = applyOperationalConstraints({
      days: [{
        day: 1,
        stops: [
          {
            name: 'Fire Wave',
            type: 'trail',
            duration: 90,
            alternatives: [{ name: 'White Domes Loop' }],
          },
          { name: 'White Domes Trail', type: 'trail', duration: 60 },
          { name: 'White Domes Road Scenic Drive', type: 'transport', duration: 45 },
          { name: 'Rainbow Vista', type: 'landmark', duration: 60 },
          {
            name: 'Open easy walk',
            type: 'trail',
            duration: 90,
            note: 'Do not use Fire Wave, Seven Wonders Loop, Pastel Canyon, Pink Canyon, Prospect Trail, Arrowhead Trail, Pinnacles Loop, White Domes, Charlie Springs, or Natural Arch Trail',
          },
        ],
      }],
    }, rules);

    const names = stopNames(out.itinerary);
    expect(names).toEqual([
      'White Domes Road Scenic Drive',
      'Rainbow Vista',
      'Open easy walk',
    ]);
    expect(names).not.toContain('Fire Wave');
    expect(names).not.toContain('White Domes Trail');
  });

  test('exposure subject is name/dependency based, not note avoidance', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Example National Park',
      now: '2026-08-12T12:00:00Z',
      userText: 'no exposed scary trails',
      constraints: {
        avoidExposure: true,
        operationalEvidence: [{
          id: 'named-exposure',
          type: 'exposure_constraint',
          destination: 'Example National Park',
          subjects: ['Watchman Trail'],
          plannerRule: 'This trail has drop-offs.',
        }],
      },
    });
    const exposure = rules.find((r) => r.id === 'named-exposure');
    expect(exposure).toBeTruthy();
    expect(subjectMatches({
      name: 'Pa\'rus Trail sunset',
      note: 'Avoid Watchman Trail because of drop-offs.',
    }, exposure)).toBe(false);
    expect(subjectMatches({ name: 'Watchman Trail' }, exposure)).toBe(true);
    expect(subjectMatches({
      name: 'Overlook stroll',
      dependsOn: 'Watchman Trail',
    }, exposure)).toBe(true);
  });

  test('parking subject matches the named area, not avoidance prose on another stop', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Example National Park',
      now: '2026-08-08T12:00:00Z',
      constraints: {
        operationalEvidence: [{
          id: 'named-parking',
          type: 'parking_time_limit',
          destination: 'Example National Park',
          subjects: ['Logan Pass'],
          maxMinutes: 180,
          plannerRule: 'Parking is limited to 180 minutes.',
        }],
      },
    });
    const parking = rules.find((r) => r.id === 'named-parking');
    expect(subjectMatches({
      name: 'Many Glacier shoreline walk',
      note: 'Does not depend on Logan Pass parking.',
      duration: 120,
    }, parking)).toBe(false);
    expect(subjectMatches({
      name: 'Logan Pass wildlife watching',
      duration: 180,
    }, parking)).toBe(true);
  });

  test('captured attempt 1: easy hike survives; false seasonal match gone', () => {
    const cap = loadAttempt(1);
    const out = applyOperationalConstraints({ days: cap.rawPlan.days }, vofRules());
    const names = stopNames(out.itinerary);
    expect(names).toContain('Early-morning ranger-confirmed easy walk in Valley of Fire');
    expect(out.corrections.join(' ')).not.toMatch(/Early-morning ranger-confirmed easy walk/);

    const completeness = evaluateItineraryCompleteness({
      itineraryData: out.itinerary,
      userPrompt: Q3_PROMPT,
      constraints: { dates: { durationDays: 2 } },
    });
    // Day-2 hike survives; remaining day-1 thin coverage is model shape, not false closure.
    expect(completeness.reasonCodes).not.toContain('missing_experience_anchor');
    expect(completeness.reasonCodes).not.toContain('missing_requested_hike');
  });

  test('captured attempt 3: postConstraint + completeness pass after identity fix', () => {
    const cap = loadAttempt(3);
    const out = applyOperationalConstraints({ days: cap.rawPlan.days }, vofRules());
    const names = stopNames(out.itinerary);
    expect(names).toContain('Open easy trail selected after date and access check');
    expect(names).toContain('Valley of Fire State Park sunset viewing');
    expect(out.corrections).toEqual([]);

    const completeness = evaluateItineraryCompleteness({
      itineraryData: {
        ...out.itinerary,
        alternatives: cap.rawPlan.alternatives,
      },
      userPrompt: Q3_PROMPT,
      constraints: { dates: { durationDays: 2 } },
    });
    expect(completeness.ok).toBe(true);
    expect(completeness.reasonCodes).toEqual([]);
  });
});

describe('known-place activity evidence alias resolution (generic)', () => {
  test('short entity id still resolves official activity candidates', () => {
    const viaShort = candidatesForEntity('place:known:valley-of-fire');
    const viaFull = candidatesForEntity('place:known:valley-of-fire-state-park');
    expect(viaShort.length).toBeGreaterThanOrEqual(4);
    expect(viaShort).toEqual(viaFull);
    expect(viaShort.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Mouse's Tank Trail", 'Atlatl Rock', 'Elephant Rock'])
    );
    const easyOpenish = viaShort.filter((c) =>
      c.difficulty === 'easy'
      && c.seasonalStatus === 'typically_available'
      && (c.activityTypes || []).some((t) => /hike|walk/i.test(t))
    );
    expect(easyOpenish.length).toBeGreaterThanOrEqual(1);
    const sunsetish = viaShort.filter((c) =>
      c.sunsetSuitability === 'supported' || c.sunsetSuitability === 'possible'
    );
    expect(sunsetish.length).toBeGreaterThanOrEqual(1);
  });

  test('known_place provider returns activities for short entity id + displayName', async () => {
    const provider = createKnownPlaceEvidenceProvider({
      now: () => new Date('2026-08-12T12:00:00.000Z'),
    });
    const requirement = {
      topic: 'activities',
      entity: {
        entityId: 'place:known:valley-of-fire',
        displayName: 'Valley of Fire State Park',
      },
    };
    expect(provider.supports(requirement)).toBe(true);
    const request = provider.buildRequest(requirement);
    const fetched = await provider.fetch(request);
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidates.length).toBeGreaterThanOrEqual(4);
    expect(candidates.map((c) => c.claim.normalizedValue.name)).toEqual(
      expect.arrayContaining(["Mouse's Tank Trail"])
    );
  });

  test('unrelated known place without catalog still returns empty (no invented hikes)', () => {
    expect(candidatesForEntity('place:known:mono-lake')).toEqual([]);
  });
});
