'use strict';
const { validLocation, normalizeEvidenceLocation } = require('../trailieCanonicalLocation');

const row = (latitude, longitude) => ({ evidenceId: 'e1', topic: 'activities', entityId: 'nps:park:yell',
  claim: { identity: 'thingstodo:1', normalizedValue: { name: 'Grand Canyon of the Yellowstone', latitude, longitude } },
  source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'x' } });

test('a 0,0 placeholder from a provider is a missing coordinate, never a resolved pin', () => {
  expect(normalizeEvidenceLocation(row(0, 0)).claim.normalizedValue.location).toBeUndefined();
  expect(validLocation({ lat: 0, lon: 0, status: 'resolved', source: 'resolved_metadata', authority: 'official_owner', sourceRef: 'e1' })).toBe(false);
});

test('real coordinates, including ones on the equator or prime meridian, stay valid', () => {
  expect(normalizeEvidenceLocation(row(44.72, -110.48)).claim.normalizedValue.location).toMatchObject({ lat: 44.72, lon: -110.48, status: 'resolved' });
  expect(normalizeEvidenceLocation(row(51.48, 0)).claim.normalizedValue.location).toMatchObject({ lat: 51.48, lon: 0 });
});

test('a coordinate read from a place record belongs to that place, not its park', () => {
  const r = normalizeEvidenceLocation({ evidenceId: 'e2', topic: 'activities', entityId: 'nps:park:shen',
    claim: { identity: 'thingstodo:stony-man', subjectId: 'nps:park:shen', normalizedValue: { name: 'Stony Man', latitude: 38.59, longitude: -78.37 } },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'x' } });
  expect(r.claim.normalizedValue.location.sourceEntity).toBe('thingstodo:stony-man');
});
