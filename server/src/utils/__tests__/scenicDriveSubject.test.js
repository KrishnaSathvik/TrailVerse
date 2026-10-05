'use strict';

const { createNpsEvidenceProvider } = require('../../services/providers/npsEvidenceProvider');
const { normalizeEvidencePlaceCandidate } = require('../evidencePlaceCandidate');
const { classifyCandidateDimensions, evaluateRequestedExperienceCoverage } = require('../requestedExperienceCoverage');
const { createRepairLedger } = require('../repairLedger');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');
const { evaluateEvidenceContractCompatibility } = require('../evidenceContractVersions');
const { normalizeDayActivityGroups } = require('../activityGroupValidation');

const positive = [
  { title: 'Cedar Terrace Drive', bodyText: '<p>Cedar Terrace Drive is a one-way scenic road among rock formations. Optional hiking trails and a boardwalk start beside the road. Continue 0.7 miles around the drive to accessible parking and a short boardwalk.</p>', tags: ['Scenic Drive'] },
  { title: 'Drive Ridge Road', shortDescription: 'Drive the mountain road with its own pullouts.', longDescription: 'Hike a nearby trail or walk to an overlook.', activities: [{ name: 'Scenic Driving' }] },
  { title: 'Enjoy a Scenic Drive on Summit Road', shortDescription: 'The road ends at a visitor center with picnic tables and hiking trails.' },
  { title: 'Forest Auto Tour', shortDescription: 'A named driving tour through the forest.' },
];
const negative = [
  { title: 'Meadow Pullout', listingDescription: 'A scenic drive passes this pullout.', tags: ['Scenic Drive'] },
  { title: 'Winter Driving in the Park', activities: [{ name: 'Scenic Driving' }], shortDescription: 'Learn about winter driving.' },
  { title: 'Mountain-Prairie Parkway', bodyText: 'This spot has orientation panels in a kiosk beside the scenic road.' },
  { title: 'Engineer Road', bodyText: 'The road was built by an engineer in 1900.', tags: ['wayside exhibit', 'Scenic Drive'] },
  { title: 'Lake Trail', bodyText: 'Drive along the scenic road to reach the trailhead.' },
  { title: 'Highest Point on Ridge Drive', shortDescription: 'This overlook is on a scenic drive.', activities: [{ name: 'Scenic Driving' }] },
];

function candidate(item, collection = 'places') {
  const official = collection === 'thingstodo'
    ? { ...item, longDescription: item.longDescription || item.bodyText, shortDescription: item.shortDescription || item.listingDescription }
    : item;
  return createNpsEvidenceProvider({}).normalize({ [collection]: [{ id: 'official-stable-id', latitude: 40, longitude: -105, ...official }] },
    { operation: 'named_activities', parameters: { parkCode: 'test' } },
    { observedAt: '2026-09-21T12:00:00Z', sourceIngestionComplete: true })
    .map((r) => ({ ...r, evidenceId: 'ev:subject' }))[0];
}
function bundle(rows) {
  return { evidence: rows, resolutions: [{ requirementId: 'a', status: 'satisfied_fresh', evidenceIds: rows.map(r => r.evidenceId) }] };
}
const cover = (rows, stops = [], extraDay = {}) => evaluateRequestedExperienceCoverage({
  userPrompt: 'I want scenic drives.', evidenceBundle: bundle(rows),
  itineraryData: { days: [{ dayNumber: 1, stops, ...extraDay }] },
});

describe.each(['places', 'thingstodo'])('official %s subject classification', (collection) => {
  test.each(positive)('$title retains primary drive identity across consumers', (item) => {
    const row = candidate(item, collection);
    expect(row.claim.normalizedValue.primaryActivityType).toBe('scenic_drive');
    expect(row.claim.normalizedValue.walkingDistanceMiles).toBeNull();
    expect(row.claim.normalizedValue.activityTypes).not.toEqual(expect.arrayContaining(['hike', 'walk']));
    expect(classifyCandidateDimensions(row)).toContain('scenic_drive');
    expect(normalizeEvidencePlaceCandidate(row).canonicalType).toBe('scenic_drive');
    expect(evaluateEvidenceContractCompatibility(row).ok).toBe(true);
    const stop = { id: 'drive', name: item.title, type: 'scenic_drive' };
    const rebound = resolveStopIdentities({ itineraryData: { days: [{ dayNumber: 1, stops: [{ ...stop, type: 'hike', walkingDistanceMiles: 48 }] }] }, evidenceBundle: bundle([row]) });
    expect(rebound.itineraryData.days[0].stops[0]).toMatchObject({ type: 'scenic_drive', walkingDistanceMiles: null });
    expect(resolveStopIdentities({ itineraryData: { days: [{ dayNumber: 1, stops: [stop] }] }, evidenceBundle: bundle([row]) }).violations).toEqual([]);
    expect(cover([row], [stop]).represented).toEqual(['scenic_drive']);
    const packed = renderEvidenceBundleForPrompt({ bundle: bundle([row]), requirements: [{ requirementId: 'a', topic: 'activities' }], userRequest: 'Scenic drives', maxTokens: 1 });
    expect(packed.includedEvidenceIds).toContain(row.evidenceId);
  });
  test.each(negative)('$title does not become a drive', (item) => {
    const row = candidate(item, collection);
    expect(row.claim.normalizedValue.scenicDriveSubject).toBe(false);
    expect(classifyCandidateDimensions(row)).not.toContain('scenic_drive');
    expect(normalizeEvidencePlaceCandidate(row).canonicalType).not.toBe('scenic_drive');
    expect(cover([row], [{ name: item.title, type: 'scenic_drive' }]).represented).toEqual([]);
  });
});

test('taxonomy is availability only; unavailable does not become satisfied', () => {
  const taxonomy = { evidenceId: 'tax', topic: 'activities', claim: { normalizedValue: { name: 'Scenic Driving', category: 'taxonomy', activityTypes: ['scenic driving'] } } };
  expect(classifyCandidateDimensions(taxonomy)).toEqual([]);
  expect(normalizeEvidencePlaceCandidate(taxonomy)).toBeNull();
  const coverage = cover([taxonomy], [{ name: 'Scenic Driving', type: 'scenic_drive' }]);
  expect(coverage).toMatchObject({ unavailable: ['scenic_drive'], represented: [], missing: [], ok: true });
  const ledger = createRepairLedger({ userPrompt: 'I want scenic drives.' });
  const record = ledger.recordAttempt({ evaluatedObligations: ledger.obligationIds(), requestedExperienceCoverage: coverage });
  expect(record.satisfied).not.toContain('requested_scenic_drive');
  expect(record.satisfied).not.toContain('requested_experience_coverage');
  expect(record.unavailable).toContain('requested_scenic_drive');
  expect(record.requestedExperienceCoverage.unavailable).toEqual(['scenic_drive']);
});

test('drive plus pullouts may form one group; pullouts and travel edges alone cannot cover a drive', () => {
  const drive = candidate(positive[0]);
  const point = { ...candidate(negative[0]), evidenceId: 'ev:point' };
  const stops = [{ id: 'd', name: positive[0].title, type: 'scenic_drive' }, { id: 'p', name: negative[0].title, type: 'viewpoint' }];
  const groups = [{ id: 'g', stopIds: ['d', 'p'] }];
  expect(normalizeDayActivityGroups({ stops, activityGroups: groups })).toEqual(groups);
  expect(cover([drive, point], stops, { activityGroups: [{ id: 'g', stopIds: ['d', 'p'] }] }).represented).toEqual(['scenic_drive']);
  const missing = cover([drive, point], [stops[1]], { travelEdges: [{ fromStopId: 'p', toStopId: 'p', modeIntent: 'drive' }] });
  expect(missing).toMatchObject({ missing: ['scenic_drive'], represented: [], ok: false });
  const ledger = createRepairLedger({ userPrompt: 'I want scenic drives.' });
  const result = ledger.recordAttempt({ reasonCodes: missing.reasonCodes, evaluatedObligations: ledger.obligationIds(), requestedExperienceCoverage: missing });
  expect(result.failed).toContain('requested_scenic_drive');
  expect(result.unavailable).toEqual([]);
});

test('older normalization requires ordinary versioned refresh', () => {
  const row = candidate(positive[0]);
  row.provenance.extractorVersion = 'nps-activities-v5';
  expect(evaluateEvidenceContractCompatibility(row)).toMatchObject({ ok: false, reasonCode: 'candidate_schema_version_mismatch' });
});
