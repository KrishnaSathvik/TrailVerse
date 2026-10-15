'use strict';

const { withDayStructure } = require('../../../tests/helpers/dayStructure');
const { normalizeEvidenceLocation } = require('../trailieCanonicalLocation');
const { validateClaimedExperienceMapAnchor } = require('../experienceMapAnchorTruth');
const { validateSimpleMutation } = require('../../services/trailieSimpleGuard');

const now = new Date('2026-10-11T12:00:00Z');

function placeEvidence({
  evidenceId = 'place-1',
  name = 'Mingus Mill',
  canonicalPlaceName = name,
  identity = 'nps:place:mingus',
  experience = null,
  mapAnchor = null,
  alternativeFor = null,
  lat = 35.5,
  lon = -83.3,
} = {}) {
  return normalizeEvidenceLocation({
    evidenceId,
    entityId: identity,
    topic: 'activities',
    claim: {
      identity,
      normalizedValue: {
        name,
        canonicalPlaceName,
        latitude: lat,
        longitude: lon,
        providerSource: 'nps',
        ...(alternativeFor
          ? { alternativeFor, resolutionKind: 'grounded_alternative' }
          : { requestedName: name, resolutionKind: experience ? 'supported_map_anchor' : 'exact' }),
        ...(experience && mapAnchor ? { experience, mapAnchor } : {}),
      },
    },
    source: { provider: 'named_place', sourceClass: 'official_owner', url: 'https://www.nps.gov/places/example.htm' },
    observation: { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() },
    quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
  });
}

function dayPlan(stops, blocks) {
  return {
    intro: 'A short trip.',
    days: [{
      id: 'd1',
      dayNumber: 1,
      label: 'A day',
      overnightLocation: 'Park base',
      stops,
      dayStructure: {
        type: stops.length ? 'sightseeing' : 'rest',
        startPeriod: 'morning',
        endPeriod: 'evening',
        summary: 'Purpose of the day.',
        blocks: blocks || [
          { kind: 'outing', periods: ['morning'], label: 'Outing', note: 'Enjoy it.', stopIds: stops.map(s => s.id) },
          { kind: 'downtime', periods: ['midday', 'afternoon', 'evening'], label: 'Rest', note: 'Lunch and rest.', stopIds: [] },
        ],
      },
    }],
  };
}

function validate(plan, evidence) {
  return validateSimpleMutation({
    proposal: { response: 'Here is the day.', plan },
    message: 'Plan a day',
    evidence: [{ evidenceId: 'destination-us', topic: 'destination_identity', claim: { normalizedValue: { countryCode: 'US' } }, source: { provider: 'named_place', sourceClass: 'commercial_structured' }, observation: { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() } }, ...(Array.isArray(evidence) ? evidence : evidence ? [evidence] : [])],
    now,
  });
}

test('1 pinless experience block with no stop is accepted', () => {
  const plan = dayPlan([], [
    { kind: 'experience', periods: ['afternoon'], label: 'Easy riverside time',
      note: 'Wander near the river at your own pace.', stopIds: [], duration: 90 },
    { kind: 'downtime', periods: ['morning', 'midday', 'evening'], label: 'Rest of day',
      note: 'Breakfast, lunch and dinner.', stopIds: [] },
  ]);
  // Dayparts must stay ordered morning → evening.
  plan.days[0].dayStructure.blocks = [
    { kind: 'downtime', periods: ['morning', 'midday'], label: 'Morning ease', note: 'Breakfast and a slow start.', stopIds: [] },
    { kind: 'experience', periods: ['afternoon'], label: 'Easy riverside time',
      note: 'Wander near the river at your own pace.', stopIds: [], duration: 90 },
    { kind: 'downtime', periods: ['evening'], label: 'Evening', note: 'Dinner and rest.', stopIds: [] },
  ];
  expect(validate(plan, []).issues).toEqual([]);
});

test('2 outing at its own canonical place needs no experience/mapAnchor relationship', () => {
  const evidence = placeEvidence({ name: 'Mingus Mill' });
  const plan = dayPlan([{
    id: 's1', order: 1, type: 'viewpoint', name: 'Mingus Mill',
    note: 'Explore the historic mill area.', duration: 60, timeWindow: 'Morning', startTime: '', evidenceRef: 'place-1',
  }]);
  const verdict = validate(plan, evidence);
  expect(verdict.issues).toEqual([]);
  expect(verdict.plan.days[0].stops[0]).toMatchObject({ name: 'Mingus Mill', canonicalPlaceId: 'nps:place:mingus' });
  expect(verdict.plan.days[0].stops[0].experience).toBeUndefined();
  expect(verdict.plan.days[0].stops[0].mapAnchor).toBeUndefined();
});

test('3 distinct map anchor with trusted relationship evidence is accepted', () => {
  const experience = { id: 'nps:experience:river', name: 'Oconaluftee River Trail' };
  const mapAnchor = {
    canonicalPlaceId: 'nps:place:trailhead', name: 'Oconaluftee River Trailhead',
    relationship: 'trailhead_for', sourceRecordId: 'nps:place:trailhead',
    sourceUrl: 'https://www.nps.gov/places/trailhead.htm',
  };
  const evidence = placeEvidence({
    evidenceId: 'link', identity: 'nps:place:trailhead',
    name: 'Oconaluftee River Trail', canonicalPlaceName: 'Oconaluftee River Trailhead',
    experience, mapAnchor,
  });
  const plan = dayPlan([{
    id: 's1', order: 1, type: 'walk', name: 'Oconaluftee River Trail',
    note: 'Walk from the grounded access point.', duration: 90, timeWindow: 'Morning', startTime: '', evidenceRef: 'link',
  }]);
  const verdict = validate(plan, evidence);
  expect(verdict.issues).toEqual([]);
  expect(verdict.plan.days[0].stops[0]).toMatchObject({
    name: 'Oconaluftee River Trail',
    canonicalPlaceName: 'Oconaluftee River Trailhead',
    experience: { id: 'nps:experience:river' },
    mapAnchor: { relationship: 'trailhead_for' },
  });
});

test('4 distinct map anchor without relationship evidence is rejected', () => {
  const evidence = placeEvidence({
    name: 'Oconaluftee River Trail',
    canonicalPlaceName: 'Oconaluftee River Trailhead',
    identity: 'nps:place:trailhead',
  });
  const plan = dayPlan([{
    id: 's1', order: 1, type: 'walk', name: 'Oconaluftee River Trail',
    note: 'Walk the riverside path.', duration: 90, timeWindow: 'Morning', startTime: '', evidenceRef: 'place-1',
  }]);
  expect(validate(plan, evidence).issues).toContain('unsupported_experience_map_anchor');
});

test('5 similar-name alternative cannot claim the experience without relationship', () => {
  const evidence = placeEvidence({
    name: 'Oconaluftee River Trailhead',
    identity: 'nps:place:trailhead',
    alternativeFor: 'Oconaluftee River Trail',
  });
  const plan = dayPlan([{
    id: 's1', order: 1, type: 'walk', name: 'Oconaluftee River Trail',
    note: 'Try to map the trail via a similar-name pin.', duration: 90, timeWindow: 'Morning', startTime: '',
    evidenceRef: 'place-1',
  }]);
  expect(validate(plan, evidence).issues).toContain('stop_name_identity_mismatch');
});

test('6 nearby place without relationship is rejected when names diverge', () => {
  expect(validateClaimedExperienceMapAnchor({
    stop: {
      name: 'River Walk',
      canonicalPlaceName: 'Nearby Picnic Area',
      canonicalPlaceId: 'nps:place:picnic',
    },
    evidenceValue: { name: 'River Walk', canonicalPlaceName: 'Nearby Picnic Area' },
  })).toBe('unsupported_experience_map_anchor');
});

test('7 model-asserted relationship without trusted evidence fields is rejected by the truth check', () => {
  // Tool schema does not accept model-authored experience/mapAnchor on stops;
  // those fields only survive when copied from trusted evidence. A forged
  // evidence-shaped claim without a real relationship still fails the check.
  expect(validateClaimedExperienceMapAnchor({
    stop: {
      name: 'Secret River Walk',
      canonicalPlaceName: 'Mingus Mill',
      canonicalPlaceId: 'nps:place:mingus',
      experience: { id: 'forged:experience', name: 'Secret River Walk' },
      mapAnchor: { canonicalPlaceId: 'nps:place:mingus', name: 'Mingus Mill', relationship: 'trailhead_for' },
    },
    evidenceValue: { name: 'Mingus Mill', canonicalPlaceName: 'Mingus Mill' },
  })).toBe('unsupported_experience_map_anchor');
});

test('8 correction to pinless experience is accepted', () => {
  const plan = dayPlan([], [
    { kind: 'downtime', periods: ['morning', 'midday'], label: 'Morning ease', note: 'Breakfast and a slow start.', stopIds: [] },
    { kind: 'experience', periods: ['afternoon'], label: 'Easy riverside time in the Oconaluftee area',
      note: 'Keep this flexible; the exact trail identity is unverified.', stopIds: [], duration: 90 },
    { kind: 'downtime', periods: ['evening'], label: 'Evening', note: 'Dinner and rest.', stopIds: [] },
  ]);
  expect(validate(plan, []).issues).toEqual([]);
});

test('9 correction chooses another properly grounded outing', () => {
  const evidence = placeEvidence({ name: 'Mingus Mill', identity: 'nps:place:mingus' });
  const plan = dayPlan([{
    id: 's1', order: 1, type: 'viewpoint', name: 'Mingus Mill',
    note: 'A grounded historic mill stop.', duration: 45, timeWindow: 'Morning', startTime: '', evidenceRef: 'place-1',
  }]);
  expect(validate(plan, evidence).issues).toEqual([]);
});

test('10 existing grounded trip without experience/mapAnchor is unchanged', () => {
  const evidence = placeEvidence({ name: 'Recorded Overlook', identity: 'place-1' });
  const plan = withDayStructure({
    intro: 'Two mornings',
    days: [{
      id: 'd1', dayNumber: 1, label: 'Morning', overnightLocation: 'West side',
      stops: [{ id: 's1', order: 1, type: 'viewpoint', name: 'Recorded Overlook',
        evidenceRef: 'place-1', duration: 30, note: '', startTime: '' }],
    }],
  });
  expect(validate(plan, evidence).issues).toEqual([]);
});
