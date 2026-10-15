'use strict';

const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const { evaluateUsPlanGeography, countryFromEvidence } = require('../../utils/usPlanGeography');

const now = new Date('2026-10-05T12:00:00Z');
const observation = {
  observedAt: now.toISOString(),
  expiresAt: new Date(+now + 86400000).toISOString(),
};

function placeEvidence({
  evidenceId = 'e-us',
  name = 'Recorded place',
  countryCode = 'US',
  lat = 38.5,
  lon = -78.4,
  identity = 'official-e',
  provider = 'named_place',
} = {}) {
  return normalizeEvidenceLocation({
    evidenceId,
    topic: 'activities',
    entityId: identity,
    claim: {
      identity,
      status: 'resolved_place_identity',
      normalizedValue: {
        name,
        latitude: lat,
        longitude: lon,
        ...(countryCode ? { countryCode } : {}),
      },
    },
    source: { provider, sourceClass: provider === 'nps' ? 'official_owner' : 'commercial_structured', sourceId: identity },
    observation,
  });
}

function sightseeingDay({
  dayNumber = 1,
  stops = [],
  overnightLocation = 'Base town',
  experienceOnly = false,
} = {}) {
  const blocks = experienceOnly
    ? [
      {
        kind: 'experience',
        periods: ['morning', 'afternoon'],
        label: 'Flexible exploration',
        note: 'Wander without map pins.',
        stopIds: [],
      },
      {
        kind: 'meal',
        periods: ['evening'],
        label: 'Dinner',
        note: 'Evening meal.',
        stopIds: [],
      },
    ]
    : [
      {
        kind: 'outing',
        periods: ['morning'],
        label: 'Morning outing',
        note: 'Main outing.',
        stopIds: stops.map((s) => s.id),
      },
      {
        kind: 'downtime',
        periods: ['midday', 'evening'],
        label: 'Rest',
        note: 'Lunch and free time.',
        stopIds: [],
      },
    ];
  return {
    id: `d${dayNumber}`,
    dayNumber,
    label: `Day ${dayNumber}`,
    overnightLocation,
    stops,
    dayStructure: {
      type: 'sightseeing',
      startPeriod: 'morning',
      endPeriod: 'evening',
      summary: experienceOnly ? 'A flexible day without pins.' : 'A grounded outing day.',
      blocks,
    },
  };
}

function stop({
  id = 's1',
  name = 'Recorded place',
  evidenceRef = 'e-us',
  duration = 60,
} = {}) {
  return {
    id,
    order: 1,
    type: 'viewpoint',
    name,
    note: '',
    startTime: '',
    timeWindow: 'Morning',
    duration,
    evidenceRef,
  };
}

function propose(days, response = 'A plan.') {
  return {
    response,
    plan: {
      intro: response,
      days,
    },
  };
}

test('experience-only Tokyo plan is rejected (prior bypass)', () => {
  const proposal = propose([
    sightseeingDay({ dayNumber: 1, overnightLocation: 'Tokyo', experienceOnly: true }),
    sightseeingDay({ dayNumber: 2, overnightLocation: 'Tokyo', experienceOnly: true }),
    sightseeingDay({ dayNumber: 3, overnightLocation: 'Tokyo', experienceOnly: true }),
  ], 'Three days in Tokyo.');
  const result = validateSimpleMutation({
    proposal,
    message: 'Plan a three-day trip to Tokyo.',
    evidence: [],
    now,
  });
  expect(result.ok).toBe(false);
  expect(result.issues).toContain('us_geography_unsupported');
});

test.each([
  ['Trunk Bay', 'VI', 18.3516, -64.7437],
  ['Pola Island', 'AS', -14.23, -170.68],
  ['Old San Juan', 'PR', 18.4663, -66.1057],
])('U.S. territory stop accepts with jurisdiction country %s', (name, countryCode, lat, lon) => {
  const evidenceId = `e-${countryCode}`;
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({
      overnightLocation: name,
      stops: [stop({ name, evidenceRef: evidenceId })],
    })]),
    message: `Plan a day at ${name}.`,
    evidence: [placeEvidence({ evidenceId, name, countryCode, lat, lon, identity: `place:${name}` })],
    now,
  });
  expect(result.ok).toBe(true);
  expect(result.plan.days[0].stops[0].countryCode).toBe(countryCode);
});

test.each([
  ['Asheville', 35.5951, -82.5515],
  ['Sedona', 34.8697, -111.761],
])('pinless experience-only %s accepts with U.S. destination_identity', (name, lat, lon) => {
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({ overnightLocation: name, experienceOnly: true })]),
    message: `Plan a flexible weekend in ${name}.`,
    evidence: [normalizeEvidenceLocation({
      evidenceId: `dest-${name}`,
      topic: 'destination_identity',
      entityId: `place:query:${name.toLowerCase()}`,
      claim: {
        identity: `place:query:${name.toLowerCase()}`,
        normalizedValue: { name, countryCode: 'US', latitude: lat, longitude: lon },
      },
      source: { provider: 'named_place', sourceClass: 'commercial_structured', sourceId: `place:query:${name.toLowerCase()}` },
      observation,
    })],
    now,
  });
  expect(result.ok).toBe(true);
});

test('pinless NPS destination_identity still accepts without stops', () => {
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({ overnightLocation: 'Springdale', experienceOnly: true })]),
    message: 'Flexible Zion day without pins.',
    evidence: [normalizeEvidenceLocation({
      evidenceId: 'dest-zion',
      topic: 'destination_identity',
      entityId: 'nps:park:zion',
      claim: {
        identity: 'nps:park:zion',
        normalizedValue: { name: 'Zion National Park', countryCode: 'US', latitude: 37.3, longitude: -113.05 },
      },
      source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'nps:park:zion' },
      observation,
    })],
    now,
  });
  expect(result.ok).toBe(true);
});

test('provider-unavailable pinless plan with no evidence rejects closed', () => {
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({ overnightLocation: 'Asheville', experienceOnly: true })]),
    message: 'Plan Asheville with no research.',
    evidence: [],
    now,
  });
  expect(result.ok).toBe(false);
  expect(result.issues).toContain('us_geography_unsupported');
});

test.each([
  ['Paris, Texas', 33.66, -95.55],
  ['Moscow, Idaho', 46.73, -117.0],
  ['Athens, Georgia', 33.95, -83.38],
  ['Versailles, Kentucky', 38.05, -84.73],
])('domestic place with foreign-sounding name accepts when country evidence is US: %s', (name, lat, lon) => {
  const evidenceId = `e-${name}`;
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({
      overnightLocation: name,
      stops: [stop({ name, evidenceRef: evidenceId })],
    })]),
    message: `Plan a day in ${name}.`,
    evidence: [placeEvidence({ evidenceId, name, countryCode: 'US', lat, lon, identity: `place:${name}` })],
    now,
  });
  expect(result.ok).toBe(true);
  expect(result.plan.days[0].stops[0].countryCode).toBe('US');
});

test('confirmed foreign stop evidence rejects even alongside US stops', () => {
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({
      overnightLocation: 'St. Mary',
      stops: [
        stop({ id: 's1', name: 'Logan Pass', evidenceRef: 'e-glac' }),
        stop({ id: 's2', name: 'Waterton Lakes', evidenceRef: 'e-waterton', duration: 90 }),
      ],
    })]),
    message: 'Plan Glacier and Waterton.',
    evidence: [
      placeEvidence({
        evidenceId: 'e-glac',
        name: 'Logan Pass',
        countryCode: 'US',
        lat: 48.69,
        lon: -113.71,
        identity: 'nps:place:logan',
        provider: 'nps',
      }),
      placeEvidence({
        evidenceId: 'e-waterton',
        name: 'Waterton Lakes',
        countryCode: 'CA',
        lat: 49.05,
        lon: -113.91,
        identity: 'place:waterton',
      }),
    ],
    now,
  });
  expect(result.ok).toBe(false);
  expect(result.issues).toContain('foreign_place_in_plan');
});

test('Niagara Falls Canadian-side evidence cannot be saved', () => {
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({
      overnightLocation: 'Niagara Falls, ON',
      stops: [stop({ name: 'Niagara Falls Canadian Side', evidenceRef: 'e-niagara' })],
    })]),
    message: 'Plan Niagara Falls Canada.',
    evidence: [placeEvidence({
      evidenceId: 'e-niagara',
      name: 'Niagara Falls Canadian Side',
      countryCode: 'CA',
      lat: 43.08,
      lon: -79.07,
      identity: 'place:niagara-ca',
    })],
    now,
  });
  expect(result.ok).toBe(false);
  expect(result.issues).toContain('foreign_place_in_plan');
});

test('Big Bend US plan near the Mexican border remains acceptable', () => {
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({
      overnightLocation: 'Terlingua',
      stops: [stop({ name: 'Santa Elena Canyon', evidenceRef: 'e-bibe' })],
    })]),
    message: 'Plan Big Bend near the Mexican border.',
    evidence: [placeEvidence({
      evidenceId: 'e-bibe',
      name: 'Santa Elena Canyon',
      countryCode: 'US',
      lat: 29.16,
      lon: -103.61,
      identity: 'nps:place:santa-elena',
      provider: 'nps',
    })],
    now,
  });
  expect(result.ok).toBe(true);
});

test('Alaska US destination with only US stops accepts; Canada may stay conversational', () => {
  const result = validateSimpleMutation({
    proposal: propose([sightseeingDay({
      overnightLocation: 'Seward',
      stops: [stop({ name: 'Exit Glacier', evidenceRef: 'e-kenai' })],
    })]),
    message: 'Alaska road trip that may pass through Canada — keep the saved plan in Alaska.',
    evidence: [placeEvidence({
      evidenceId: 'e-kenai',
      name: 'Exit Glacier',
      countryCode: 'US',
      lat: 60.17,
      lon: -149.66,
      identity: 'nps:place:exit',
      provider: 'nps',
    })],
    now,
  });
  expect(result.ok).toBe(true);
});

test('foreign destination_identity evidence rejects the mutation', () => {
  const issues = evaluateUsPlanGeography({
    plan: {
      days: [sightseeingDay({ experienceOnly: true, overnightLocation: 'Tokyo' })],
    },
    evidence: [normalizeEvidenceLocation({
      evidenceId: 'dest-tokyo',
      topic: 'destination_identity',
      entityId: 'place:tokyo',
      claim: {
        identity: 'place:tokyo',
        normalizedValue: { name: 'Tokyo', countryCode: 'JP', latitude: 35.68, longitude: 139.69 },
      },
      source: { provider: 'known_place', sourceClass: 'trusted_specialist', sourceId: 'place:tokyo' },
      observation,
    })],
  });
  expect(issues).toEqual(expect.arrayContaining(['foreign_place_in_plan', 'us_geography_unsupported']));
});

test('patch preserving US days stays valid; rejected foreign patch leaves prior plan untouched', () => {
  const priorEvidence = placeEvidence({
    evidenceId: 'e-us',
    name: 'Recorded place',
    countryCode: 'US',
    identity: 'official-e',
    provider: 'nps',
  });
  const created = validateSimpleMutation({
    proposal: propose([sightseeingDay({
      stops: [stop({ name: 'Recorded place', evidenceRef: 'e-us' })],
    })]),
    message: 'Plan a visit',
    evidence: [priorEvidence],
    now,
  });
  expect(created.ok).toBe(true);
  const priorPlan = created.plan;

  const rejected = validateSimpleMutation({
    proposal: {
      response: 'Add Tokyo.',
      plan_patch: {
        response: 'Add Tokyo.',
        operations: [{
          op: 'update_day',
          dayNumber: 1,
          day: sightseeingDay({
            overnightLocation: 'Tokyo',
            experienceOnly: true,
          }),
        }],
      },
    },
    snapshot: { plan: priorPlan, planningState: {} },
    message: 'Replace day 1 with Tokyo experiences.',
    evidence: [],
    now,
  });
  expect(rejected.ok).toBe(false);
  expect(rejected.issues).toContain('us_geography_unsupported');
  // Candidate plan may be returned for diagnosis; acceptance is false so stores must not commit.
  expect(priorPlan.days[0].overnightLocation).not.toBe('Tokyo');
  expect(priorPlan.days[0].stops).toHaveLength(1);

  const kept = validateSimpleMutation({
    proposal: {
      response: 'Softer afternoon.',
      plan_patch: {
        response: 'Softer afternoon.',
        operations: [{
          op: 'update_day',
          dayNumber: 1,
          day: {
            ...sightseeingDay({
              stops: [{
                ...stop({ name: 'Recorded place', evidenceRef: 'e-us' }),
                note: 'A quieter visit.',
              }],
            }),
          },
        }],
      },
    },
    snapshot: { plan: priorPlan, planningState: {} },
    message: 'Make day 1 quieter.',
    evidence: [priorEvidence],
    now,
  });
  expect(kept.ok).toBe(true);
  expect(kept.plan.days[0].stops[0].note).toBe('A quieter visit.');
});

test('countryFromEvidence never invents country from a place name', () => {
  expect(countryFromEvidence(placeEvidence({ name: 'Paris, Texas', countryCode: 'US' }))).toBe('US');
  expect(countryFromEvidence(placeEvidence({ name: 'Tokyo', countryCode: null }))).toBeNull();
  expect(countryFromEvidence({
    claim: { normalizedValue: { name: 'Tokyo Tower' } },
  })).toBeNull();
});
