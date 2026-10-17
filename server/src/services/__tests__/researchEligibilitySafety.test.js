'use strict';
const { assessPlaceEligibility } = require('../../utils/modelFirstPlaceEligibility');
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const { withDayStructure } = require('../../../tests/helpers/dayStructure');
const NOW = new Date('2026-10-12T12:00:00Z');
const source = (name, value) => normalizeEvidenceLocation({ evidenceId: 'e', entityId: 'e', topic: 'activities',
  claim: { identity: 'e', text: 'Original official source detail.', normalizedValue: { name, latitude: 37, longitude: -113, ...value } },
  source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/' },
  observation: { observedAt: NOW.toISOString(), expiresAt: new Date(+NOW + 86400000).toISOString() } });

test.each([
  ['Kolob Canyons Picnic Area', { category: 'picnic_area' }, 'unknown'],
  ['Cliff Visitor Center', { category: 'visitor_center', exposureLevel: 'high' }, 'incompatible'],
  ['Museum Overlook', { placeTypes: ['museum', 'natural_feature'] }, 'unknown'],
  ['Typed Museum', { placeTypes: ['museum'], exposureLevel: 'high' }, 'incompatible'],
  ['Museum Trail', { placeTypes: ['museum'], activityTypes: ['hiking'] }, 'unknown'],
  ['Museum Walk', { placeTypes: ['museum'], walkingDistanceMiles: 1 }, 'unknown'],
  ['Typed Museum', { placeTypes: ['museum'] }, 'eligible'],
  ['Angels Landing', { category: 'thingstodo', exposureLevel: 'high' }, 'incompatible'],
  ['Canyon Overlook', { exposureLevel: 'moderate' }, 'incompatible'],
  ['Low Path', { exposureLevel: 'low' }, 'eligible'],
  ['Typed Museum', { placeTypes: ['museum'] }, 'unknown', { type: 'walk' }],
  ['Typed Museum', { placeTypes: ['museum'] }, 'unknown', { note: 'Take an outdoor walk along the rim.' }],
])('research and actual guard agree for %s (%j)', (name, value, status, activity = {}) => {
  const row = source(name, value);
  const before = JSON.stringify(row);
  const assessment = assessPlaceEligibility(row, [row], { avoidExposure: true }, activity);
  expect(assessment.status).toBe(status);
  expect(JSON.stringify(row)).toBe(before);
  const verdict = validateSimpleMutation({ evidence: [row], now: NOW, message: 'No exposed hikes.',
    turnConstraints: [{ avoidExposure: true }], proposal: { response: 'A day.', plan: withDayStructure({ intro: 'A day.',
      days: [{ id: 'd', dayNumber: 1, label: 'Day', stops: [{ id: 's', order: 1, type: 'picnic', name,
        evidenceRef: 'e', duration: 30, note: '', startTime: '', ...activity }] }] }) } });
  expect(verdict.ok).toBe(status === 'eligible');
  if (status !== 'eligible') expect(verdict.issues).toEqual(expect.arrayContaining(assessment.reasonCodes));
  else expect(verdict.planningState.validationConstraints).toEqual({ avoidExposure: true });
});

test('a typed facility cannot certify an outdoor outing from it', () => {
  const row = source('Typed Museum', { placeTypes: ['museum'] });
  expect(assessPlaceEligibility(row, [row], { avoidExposure: true }, { type: 'walk' }).status).toBe('unknown');
  expect(assessPlaceEligibility(row, [row], { avoidExposure: true }, { note: 'Take an outdoor walk along the rim.' }).status).toBe('unknown');
});
