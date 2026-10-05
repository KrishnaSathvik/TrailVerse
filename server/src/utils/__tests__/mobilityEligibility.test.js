'use strict';

const {
  ELIGIBILITY,
  inferWalkingDistanceMiles,
  evaluateHardMobilityEligibility,
  enrichItineraryMobilityFromEvidenceBundle,
  evaluateMobilityClaimConsistency,
} = require('../hardConstraintEligibility');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { createNpsEvidenceProvider } = require('../../services/providers/npsEvidenceProvider');

const constraints = { mobility: { maxWalkMilesPerSegment: 1 } };

function plan(stop, intro = 'A mobility-aware trip.') {
  return {
    intro,
    days: [{ day: 1, stops: [
      stop,
      { name: 'History Museum', type: 'museum', duration: 60 },
    ] }],
  };
}

describe('walking-distance evidence extraction', () => {
  test.each([
    ['A 2.4-mile round-trip trail.', 2.4],
    ['Walk 0.5 mile one way to the overlook.', 0.5],
    ['This one-mile loop is paved.', 1],
    ['A 900-foot accessible path.', null],
    ['A short, easy walk.', null],
    ['Length: 2,565 feet, .49 miles Surface Type: Compacted gravel', 0.49],
    ['There are 14 miles of recreational river area in the park.', null],
  ])('%s -> %s miles', (text, expected) => {
    expect(inferWalkingDistanceMiles(text)).toBe(expected);
  });

  test('NPS named-activity normalization carries explicit mileage into candidate metadata', () => {
    const provider = createNpsEvidenceProvider();
    const request = provider.buildRequest({
      topic: 'activities',
      entity: { entityId: 'nps:park:abcd' },
    });
    const candidates = provider.normalize({
      thingstodo: [{ id: 'loop', title: 'River Loop', shortDescription: 'A paved 0.8-mile loop.' }],
      places: [],
    }, request, { observedAt: '2026-08-13T00:00:00.000Z', sourceIngestionComplete: true });
    expect(candidates[0].claim.normalizedValue.walkingDistanceMiles).toBe(0.8);
  });
});

describe('hard mobility eligibility', () => {
  test('known trail distance within the limit is eligible', () => {
    expect(evaluateHardMobilityEligibility(
      { name: 'Short Loop', type: 'trail', walkingDistanceMiles: 0.8 },
      { maxWalkMilesPerSegment: 1 }
    )).toMatchObject({ status: ELIGIBILITY.COMPATIBLE, reasonCodes: [] });
  });

  test('known trail distance over the limit is rejected', () => {
    expect(evaluateHardMobilityEligibility(
      { name: 'Long Loop', type: 'trail', walkingDistanceMiles: 2.4 },
      { maxWalkMilesPerSegment: 1 }
    )).toMatchObject({ status: ELIGIBILITY.INCOMPATIBLE, reasonCodes: ['mobility_distance_exceeds_limit'] });
  });

  test('unknown trail distance cannot be certified compatible', () => {
    expect(evaluateHardMobilityEligibility(
      { name: 'Unknown Loop', type: 'trail' },
      { maxWalkMilesPerSegment: 1 }
    )).toMatchObject({ status: ELIGIBILITY.UNKNOWN, reasonCodes: ['mobility_eligibility_unknown'] });
  });

  test('evidence metadata, not model assertion, supplies walking distance', () => {
    const enriched = enrichItineraryMobilityFromEvidenceBundle(
      plan({ name: 'Verified Loop', type: 'trail', duration: 60 }),
      { evidence: [{ claim: { normalizedValue: { name: 'Verified Loop', walkingDistanceMiles: 0.7 } } }] }
    );
    expect(enriched.days[0].stops[0].walkingDistanceMiles).toBe(0.7);
  });
});

describe('mobility plan and prose validation', () => {
  test('completeness rejects over-limit and unknown trail outings', () => {
    const over = evaluateItineraryCompleteness({
      itineraryData: plan({ name: 'Long Loop', type: 'trail', duration: 120, walkingDistanceMiles: 2.4 }),
      constraints,
      userPrompt: 'Plan a day with no walk over one mile.',
    });
    expect(over.reasonCodes).toContain('mobility_distance_exceeds_limit');

    const unknown = evaluateItineraryCompleteness({
      itineraryData: plan({ name: 'Unknown Loop', type: 'trail', duration: 120 }),
      constraints,
      userPrompt: 'Plan a day with no walk over one mile.',
    });
    expect(unknown.reasonCodes).toContain('mobility_eligibility_unknown');
  });

  test('unsupported universal compatibility claim fails, grounded claim passes', () => {
    const unsupported = evaluateMobilityClaimConsistency({
      text: 'Everything here stays under roughly one mile.',
      itineraryData: plan({ name: 'Unknown Loop', type: 'trail', duration: 120 }),
      constraints,
    });
    expect(unsupported.reasonCodes).toContain('mobility_prose_claim_unsupported');

    const supported = evaluateMobilityClaimConsistency({
      text: 'Each walk stays under one mile.',
      itineraryData: plan({ name: 'Verified Loop', type: 'trail', duration: 120, walkingDistanceMiles: 0.8 }),
      constraints,
    });
    expect(supported.reasonCodes).toEqual([]);
  });

  test('plain-answer recommendations are grounded against mentioned evidence candidates', () => {
    const evidenceBundle = {
      evidence: [
        {
          evidenceId: 'unknown',
          claim: {
            text: 'Mystery Lake Trail is an easy scenic hike.',
            normalizedValue: { name: 'Mystery Lake Trail', activityTypes: ['hike'] },
          },
        },
        {
          evidenceId: 'long',
          claim: {
            text: 'Long Lake Loop is a 2.4-mile round-trip hike.',
            normalizedValue: { name: 'Long Lake Loop', activityTypes: ['hike'], walkingDistanceMiles: 2.4 },
          },
        },
      ],
    };
    const result = evaluateMobilityClaimConsistency({
      text: 'Keep each outing comfortably under their one-mile walking limit. Focus on Mystery Lake Trail and Long Lake Loop.',
      constraints,
      evidenceBundle,
    });
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'mobility_prose_claim_unsupported',
      'mobility_distance_exceeds_limit',
    ]));

    const safeRejection = evaluateMobilityClaimConsistency({
      text: 'Skip Long Lake Loop because it is over the limit. I could not verify Mystery Lake Trail closely enough to promise it stays within one mile.',
      constraints,
      evidenceBundle,
    });
    expect(safeRejection.reasonCodes).not.toContain('mobility_distance_exceeds_limit');
    expect(safeRejection.reasonCodes).not.toContain('mobility_prose_claim_unsupported');
  });
});
