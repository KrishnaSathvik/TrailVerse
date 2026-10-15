'use strict';

const { createNamedPlaceEvidenceProvider } = require('../providers/namedPlaceEvidenceProvider');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { createSimpleTravelTools } = require('../trailieTravelData');
const { evaluateUsPlanGeography } = require('../../utils/usPlanGeography');
const { validateSimpleMutation } = require('../trailieSimpleGuard');

const NOW = new Date('2026-10-05T12:00:00Z');

function locality(name, placeId, countryCode, lat, lon) {
  return {
    name,
    place_id: placeId,
    types: ['locality', 'political'],
    formatted_address: `${name}`,
    address_components: [{ short_name: countryCode, types: ['country'] }],
    geometry: { location: { lat, lon: undefined, lng: lon } },
  };
}

function toolsFor(lookup) {
  const named = createNamedPlaceEvidenceProvider({ lookup, catalog: {}, now: () => NOW });
  const broker = createEvidenceBroker({
    providers: [named],
    now: () => NOW,
    refreshHashSecret: 'offline-locality-test',
    recordRefreshEvent: async () => {},
    acquireLease: async () => { throw new Error('ephemeral only'); },
    releaseLease: async () => { throw new Error('ephemeral only'); },
  });
  return createSimpleTravelTools({
    broker,
    now: () => NOW,
    destinationResolver: async (name) => ({
      entityId: `place:query:${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      displayName: name,
    }),
  });
}

function experiencePlan(overnight, parkName = overnight) {
  return {
    response: `A flexible stay in ${overnight}.`,
    plan: {
      parkName,
      intro: `A flexible stay in ${overnight}.`,
      days: [{
        id: 'd1',
        dayNumber: 1,
        label: 'Day 1',
        overnightLocation: overnight,
        stops: [],
        dayStructure: {
          type: 'sightseeing',
          startPeriod: 'morning',
          endPeriod: 'evening',
          summary: 'Flexible exploration without map pins.',
          blocks: [
            {
              kind: 'experience',
              periods: ['morning', 'afternoon'],
              label: 'Explore the area',
              note: 'Wander without fixed pins.',
              stopIds: [],
            },
            {
              kind: 'meal',
              periods: ['evening'],
              label: 'Dinner',
              note: 'Evening meal.',
              stopIds: [],
            },
          ],
        },
      }],
    },
  };
}

test.each([
  ['Asheville', 'US', 35.5951, -82.5515],
  ['Sedona', 'US', 34.8697, -111.761],
])('read_travel writes U.S. destination_identity for place:query %s', async (name, countryCode, lat, lon) => {
  const travel = toolsFor(async () => [locality(name, `${name}-id`, countryCode, lat, lon)]);
  const result = await travel.execute('read_travel', {
    destination: name,
    question: `Flexible weekend in ${name}`,
    topics: ['activities'],
    places: [],
  }, { requestId: `locality-${name}`, userMessage: `Plan ${name}` });
  const dest = result.evidence.find((e) => e.topic === 'destination_identity');
  expect(dest).toBeTruthy();
  expect(dest.claim.normalizedValue.countryCode).toBe('US');
  expect(evaluateUsPlanGeography({
    plan: experiencePlan(name).plan,
    evidence: result.evidence,
  })).toEqual([]);
});

test('foreign locality destination_identity rejects pinless plan', async () => {
  const travel = toolsFor(async () => [locality('Tokyo', 'tokyo-id', 'JP', 35.68, 139.69)]);
  const result = await travel.execute('read_travel', {
    destination: 'Tokyo',
    question: 'Flexible Tokyo weekend',
    topics: ['activities'],
    places: [],
  }, { requestId: 'locality-tokyo', userMessage: 'Plan Tokyo' });
  const dest = result.evidence.find((e) => e.topic === 'destination_identity');
  expect(dest?.claim?.normalizedValue?.countryCode).toBe('JP');
  const issues = evaluateUsPlanGeography({
    plan: experiencePlan('Tokyo').plan,
    evidence: result.evidence,
  });
  expect(issues).toEqual(expect.arrayContaining(['foreign_place_in_plan', 'us_geography_unsupported']));
});

test('finalizeProposal grounds pinless U.S. locality when no prior research ran', async () => {
  const travel = toolsFor(async () => [locality('Asheville', 'ash-id', 'US', 35.5951, -82.5515)]);
  const proposal = experiencePlan('Asheville');
  const grounded = await travel.finalizeProposal(proposal, {
    requestId: 'finalize-ash',
    userMessage: 'Plan Asheville',
    snapshot: { plan: null, planningState: {} },
    evidence: [],
    signal: undefined,
  });
  const dest = grounded.evidence.find((e) => e.topic === 'destination_identity');
  expect(dest?.claim?.normalizedValue?.countryCode).toBe('US');
  const verdict = validateSimpleMutation({
    proposal,
    message: 'Plan Asheville',
    evidence: grounded.evidence,
    now: NOW,
  });
  expect(verdict.ok).toBe(true);
});

test('unavailable locality lookup fails closed for pinless plans', async () => {
  const travel = toolsFor(async () => { throw new Error('provider down'); });
  const result = await travel.execute('read_travel', {
    destination: 'Asheville',
    question: 'Flexible weekend',
    topics: ['activities'],
    places: [],
  }, { requestId: 'locality-down', userMessage: 'Plan Asheville' });
  expect(result.evidence.some((e) => e.topic === 'destination_identity')).toBe(false);
  expect(evaluateUsPlanGeography({
    plan: experiencePlan('Asheville').plan,
    evidence: result.evidence,
  })).toContain('us_geography_unsupported');
});
