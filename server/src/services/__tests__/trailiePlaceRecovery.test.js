'use strict';
const { buildPlaceRecovery, requiredPlaceRecoveryIssues } = require('../trailiePlaceRecovery');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const NOW = new Date('2026-10-16T12:00:00Z');
function identity(name, requestedName, id = 'place:second') {
  return normalizeEvidenceLocation({ evidenceId: id, topic: 'activities', claim: { identity: id,
    normalizedValue: { name, requestedName, providerSource: 'google', latitude: 40, longitude: -110 } },
    source: { provider: 'named_place', sourceClass: 'commercial_structured' },
    observation: { observedAt: NOW.toISOString(), expiresAt: '2026-10-17T12:00:00Z' } });
}
test.each([
  ['Bryce', 'Bryce Canyon National Park'], ['Portland', 'Portland, Maine'], ['Harbor Hotel', 'Harbor Hotel Downtown'],
])('confirmed alias %s remains required after canonicalization', (requested, canonical) => {
  const recovery = buildPlaceRecovery({ unresolved: [{ place: requested }], travelerText: `Visit ${requested}`, now: NOW });
  const row = identity(canonical, requested);
  const plan = { days: [{ stops: [{ name: canonical, canonicalPlaceId: row.claim.identity }] }] };
  expect(requiredPlaceRecoveryIssues(recovery, plan, [row], NOW)).toEqual([]);
  expect(requiredPlaceRecoveryIssues(recovery, { days: [] }, [row], NOW)).toEqual(['traveler_required_place_unresolved']);
  for (const change of [r => { r.claim.normalizedValue.alternativeFor = requested; },
    r => { r.observation.expiresAt = '2020-01-01'; }, r => { r.source.provider = 'tavily'; }]) {
    const invalid = structuredClone(row); change(invalid);
    expect(requiredPlaceRecoveryIssues(recovery, plan, [invalid], NOW)).toEqual(['traveler_required_place_unresolved']);
  }
  expect(requiredPlaceRecoveryIssues(recovery, plan, [row, identity(canonical, requested, 'other')], NOW)).toEqual(['traveler_required_place_unresolved']);
});
test('a destination is represented by its official activity, never just overview prose', () => {
  const row = identity('Second National Park', null, 'nps:park:second');
  row.source = { provider: 'nps', sourceClass: 'official_owner' };
  row.topic = 'destination_identity'; row.claim.normalizedValue.identityAliases = ['Second'];
  const activity = identity('Lake walk', null, 'walk');
  activity.claim.normalizedValue.destinationId = row.claim.identity;
  const recovery = buildPlaceRecovery({ unresolved: [{ place: 'Second' }], travelerText: 'Visit Second', now: NOW });
  expect(requiredPlaceRecoveryIssues(recovery, { days: [{ stops: [{ name: 'Lake walk', evidenceRef: 'walk' }] }] }, [row, activity], NOW)).toEqual([]);
  expect(requiredPlaceRecoveryIssues(recovery, { intro: 'Visit Second', days: [] }, [row, activity], NOW)).toEqual(['traveler_required_place_unresolved']);
});

test('a confirmed hotel survives folding into the overnight base; an outing does not', () => {
  const row = identity('Harbor Hotel Downtown', 'Harbor Hotel');
  row.claim.normalizedValue.placeKind = 'lodging';
  const recovery = buildPlaceRecovery({ unresolved: [{ place: 'Harbor Hotel' }], travelerText: 'Stay at Harbor Hotel', now: NOW });
  const plan = { days: [{ overnightLocation: 'Harbor Hotel Downtown', stops: [] }] };
  expect(requiredPlaceRecoveryIssues(recovery, plan, [row], NOW)).toEqual([]);
  row.claim.normalizedValue.placeKind = 'attraction';
  expect(requiredPlaceRecoveryIssues(recovery, plan, [row], NOW)).toEqual(['traveler_required_place_unresolved']);
});
