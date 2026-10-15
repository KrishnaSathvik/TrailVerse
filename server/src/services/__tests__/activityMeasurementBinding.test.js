'use strict';

const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const { assessPlaceEligibility } = require('../../utils/modelFirstPlaceEligibility');
const { evaluateHardMobilityEligibility } = require('../../utils/hardConstraintEligibility');
const { evaluateEvidenceContractCompatibility } = require('../../utils/evidenceContractVersions');
const NOW = new Date('2026-10-13T12:00:00Z');
// Public source excerpt, no traveler capture. The number describes the Rim Trail.
const bodyText = 'Sunrise Point is the northernmost of the four major viewpoints that overlook the iconic Bryce Amphitheater. The 5.5 mile (8.9 km) Rim Trail connects this view to Sunrise and Fairyland Points further north and Inspiration and Bryce Points further south.';

async function evidence() {
  const provider = createNpsEvidenceProvider({ npsClient: {
    getParkActivities: async () => [],
    getParkPlaces: async () => [{ id: 'sunrise', title: 'Sunrise Point', bodyText,
      url: 'https://www.nps.gov/places/sunrise-point.htm', latitude: '37.6282', longitude: '-112.163' }],
  }, now: () => NOW });
  const request = provider.buildRequest({ topic: 'activities', entity: { entityId: 'nps:park:brca' } });
  const fetched = await provider.fetch(request, {});
  const rows = provider.normalize(fetched.raw, request, { ...fetched.metadata, sourceIngestionComplete: true });
  return normalizeEvidenceLocation({ ...rows.find(r => r.claim.normalizedValue.name === 'Sunrise Point'),
    evidenceId: 'sunrise-source', observation: { observedAt: NOW.toISOString(), expiresAt: new Date(+NOW + 86400000).toISOString() } });
}

test('source → evidence → canonical viewpoint preserves prose and never creates trail mileage', async () => {
  const row = await evidence();
  expect(row.claim.normalizedValue.walkingDistanceMiles).toBeNull();
  expect(row.claim.normalizedValue.sourceDetails.bodyText).toBe(bodyText);
  const stop = { id: 's', order: 1, type: 'viewpoint', name: 'Sunrise Point', evidenceRef: row.evidenceId,
    duration: 45, timeWindow: 'Morning', note: 'Stay at the rim viewpoint without a trail descent.' };
  const proposal = { response: 'A brief viewpoint visit.', plan: { intro: 'A relaxed day.', days: [{
    id: 'd', dayNumber: 1, label: 'A rim view', stops: [stop], dayStructure: {
      type: 'sightseeing', startPeriod: 'morning', endPeriod: 'afternoon', summary: 'A viewpoint and recovery.',
      blocks: [{ kind: 'outing', periods: ['morning'], label: 'Viewpoint', note: 'Stay at the rim.', stopIds: ['s'] },
        { kind: 'downtime', periods: ['midday', 'afternoon'], label: 'Rest', note: 'Take the afternoon slowly.', stopIds: [] }],
    },
  }] } };
  const result = validateSimpleMutation({ proposal, evidence: [row], snapshot: {}, message: '', now: NOW });
  expect(result.issues).toEqual([]);
  expect(result.plan.days[0].stops[0].walkingDistanceMiles).toBeUndefined();
  expect(result.plan.days[0].stops[0]).toMatchObject({ duration: 45, note: stop.note });
  // A viewpoint is not automatically a walking route in the existing guard.
  expect(assessPlaceEligibility(row, [row], { planningState: { mobility: { maxWalkMilesPerSegment: 1 } } }, stop).reasonCodes)
    .not.toContain('mobility_distance_exceeds_limit');
  // If a measured walking activity is required, unknown cannot certify a short walk.
  expect(evaluateHardMobilityEligibility({ type: 'walk', walkingDistanceMiles: row.claim.normalizedValue.walkingDistanceMiles },
    { maxWalkMilesPerSegment: 1 }).reasonCodes)
    .toContain('mobility_eligibility_unknown');
});

test('fresh but obsolete normalized evidence must miss the contract gate', async () => {
  const row = await evidence();
  expect(evaluateEvidenceContractCompatibility(row)).toEqual({ ok: true });
  const old = { ...row, provenance: { ...row.provenance, extractorVersion: 'nps-activities-v10' } };
  expect(evaluateEvidenceContractCompatibility(old)).toMatchObject({ ok: false, reasonCode: 'candidate_schema_version_mismatch' });
});
