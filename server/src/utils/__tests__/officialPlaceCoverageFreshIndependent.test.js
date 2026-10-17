'use strict';

/**
 * Phase 12E — fresh independent coverage over real official NPS rows.
 *
 * Uses the cached Yosemite activities fixture (official npsEvidenceProvider
 * output). Not a 12A–12D eval destination and not Hurricane Ridge / Mormon Row
 * / Phelps Lake goldens. Measures rates; does not patch failed names.
 */

const path = require('path');
const {
  buildOfficialPlaceIndex,
  lookupOfficialPlace,
  extractOfficialCoordinates,
} = require('../officialPlaceIndex');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const { resolveDestinationsFromMessage } = require('../genericDestinationResolver');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
  evaluateNamedExperienceSatisfaction,
} = require('../namedExperienceRequirements');
const { hasAuthoritativeCoordinates } = require('../coordinateValidation');

const FIXTURE = require(path.join(
  __dirname,
  '../../services/__tests__/fixtures/namedExperience/yose-activities-2026-09-15.json',
));

function officialNamedRows(candidates) {
  return (candidates || []).filter((item) => (
    item?.evidenceType === 'fact'
    && item?.source?.provider === 'nps'
    && typeof item?.claim?.normalizedValue?.name === 'string'
    && item.claim.normalizedValue.category !== 'taxonomy'
  ));
}

const ROWS = officialNamedRows(FIXTURE.candidates);
const BUNDLE = { evidence: ROWS };
const INDEX = buildOfficialPlaceIndex(ROWS);

describe('fresh independent — real official NPS rows (Yosemite fixture)', () => {
  test('fixture has a meaningful official named-place corpus', () => {
    expect(ROWS.length).toBeGreaterThan(50);
  });

  test('exact official names bind generically with Yosemite as parent park', () => {
    let exact = 0;
    let parent = 0;
    for (const row of ROWS) {
      const name = row.claim.normalizedValue.name;
      const hit = lookupOfficialPlace({ name, index: INDEX });
      if (hit.status === 'exact') {
        exact += 1;
        if (hit.place.parkCode === 'yose') parent += 1;
      }
    }
    expect(exact / ROWS.length).toBe(1);
    expect(parent / ROWS.length).toBe(1);
  });

  test('official nested coordinates promote on identity bind when present', () => {
    const withCoords = ROWS.filter((row) => extractOfficialCoordinates(row.claim.normalizedValue));
    expect(withCoords.length).toBeGreaterThan(0);
    let promoted = 0;
    let unresolved = 0;
    for (const row of withCoords) {
      const name = row.claim.normalizedValue.name;
      const identity = resolveStopIdentities({
        itineraryData: {
          days: [{ dayNumber: 1, stops: [{ id: `s-${row.evidenceId}`, name, type: 'trail', duration: 60 }] }],
        },
        evidenceBundle: BUNDLE,
      });
      if (identity.violations.length > 0) {
        unresolved += 1;
        continue;
      }
      const stop = identity.itineraryData.days[0].stops[0];
      if (hasAuthoritativeCoordinates(stop) && stop.coordinateSource === 'resolved_metadata') {
        promoted += 1;
      }
    }
    expect(unresolved).toBe(0);
    expect(promoted / withCoords.length).toBe(1);
  });

  test('a unique official place-only prompt infers Yosemite as destination', () => {
    const dests = resolveDestinationsFromMessage('I want to visit Cathedral Beach.', {
      officialPlaces: ROWS,
    });
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe('yose');
    expect(dests[0].displayName).toMatch(/yosemite/i);
    expect(dests[0].displayName).not.toMatch(/cathedral beach/i);
    expect(dests[0].mentionedPlaces?.some((p) => /cathedral beach/i.test(p.name))).toBe(true);
  });

  test('traveler-required and model-selected official names bind without landmark aliases', () => {
    const placeName = 'Chilnualna Falls Trailhead';
    const prompt = `I absolutely want to hike ${placeName} at Yosemite National Park.`;
    const requirements = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests(prompt),
      evidenceBundle: BUNDLE,
    });
    expect(requirements.some((r) => r.status === 'resolved' && r.canonicalPlaceName === placeName)).toBe(true);
    const identity = resolveStopIdentities({
      itineraryData: {
        days: [{ dayNumber: 1, stops: [{ id: 's-chil', name: placeName, type: 'trail', duration: 80 }] }],
      },
      evidenceBundle: BUNDLE,
    });
    expect(identity.violations).toEqual([]);
    const named = evaluateNamedExperienceSatisfaction({
      itineraryData: identity.itineraryData,
      requirements,
      evidenceBundle: BUNDLE,
    });
    expect(named.ok).toBe(true);
  });
});
