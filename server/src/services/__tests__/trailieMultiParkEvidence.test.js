'use strict';

const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');
const { createSimpleTravelTools } = require('../trailieTravelData');
const { assessPlaceEligibility } = require('../../utils/modelFirstPlaceEligibility');

const NOW = new Date('2026-10-12T12:00:00Z');
const observation = {
  observedAt: NOW.toISOString(),
  expiresAt: new Date(+NOW + 86400000).toISOString(),
};

function activity(parkCode, name, index, { requested = false } = {}) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    evidenceId: `nps:${parkCode}:${slug}`,
    entityId: `nps:park:${parkCode}`,
    topic: 'activities',
    claim: {
      identity: `place:${parkCode}:${slug}`,
      text: `${name}: ${'Official activity detail and practical visitor information. '.repeat(24 + index)}`,
      normalizedValue: {
        name,
        category: 'place',
        activityTypes: ['scenic viewing'],
        exposureLevel: 'low',
        location: {
          lat: parkCode === 'zion' ? 37.2 + index / 1000 : 37.6 + index / 1000,
          lon: parkCode === 'zion' ? -112.9 : -112.1,
          source: 'resolved_metadata', authority: 'official_owner', status: 'resolved',
          sourceRef: `nps:${parkCode}:${slug}`, sourceEntity: `place:${parkCode}:${slug}`,
        },
        requested,
      },
    },
    source: {
      provider: 'nps', sourceClass: 'official_owner',
      url: `https://www.nps.gov/places/${parkCode}-${slug}.htm`,
    },
    quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
    observation,
  };
}

function transit(parkCode, provider, url) {
  return {
    evidenceId: `${provider}:${parkCode}:transit`,
    entityId: `nps:park:${parkCode}`,
    topic: 'transit',
    claim: {
      identity: `transit:${parkCode}`,
      text: `${parkCode} official shuttle and access instructions. ${'Seasonal operating detail. '.repeat(35)}`,
      normalizedValue: {
        parkRules: parkCode === 'zion' ? [{ kind: 'private_vehicle_restriction', parkCode, text: 'Use the shuttle when the scenic drive is restricted.', source: url }] : [],
      },
    },
    source: { provider, sourceClass: provider === 'direct_official_page' ? 'official_owner' : 'search_discovery', url },
    quality: { authorityClass: provider === 'direct_official_page' ? 'official_owner' : 'search_discovery', conflictStatus: 'none' },
    observation,
  };
}

describe('NPS place classification follows identity before incidental prose', () => {
  test('viewpoints and support places stay places while actual facilities retain their type', async () => {
    const places = [
      ['Sunrise Point', 'Lodge visitors often walk here for sunrise.', 'place'],
      ['Bryce Canyon Lodge', 'Historic overnight accommodations.', 'lodging'],
      ['Zion Canyon Visitor Center', 'Trip planning information.', 'visitor_center'],
      ['Zion Human History Museum', 'Museum exhibits and a scenic patio.', 'museum'],
      ['Shuttle Stop 12', 'Serves lodge visitors and nearby paths.', 'place'],
      ['Rainbow Point Shelter', 'A shelter near a museum exhibit.', 'place'],
      ['Lava Point Overlook', 'An overlook across from a lodge.', 'place'],
      ['Yosemite Valley Lodge Bike Stand', 'Bicycles beside the lodge.', 'place'],
      ['Museum Parking', 'Parking for museum visitors.', 'place'],
    ].map(([title, listingDescription], index) => ({
      id: `p-${index}`, title, listingDescription, bodyText: listingDescription,
      latitude: String(37 + index / 100), longitude: '-112',
      url: `https://www.nps.gov/places/p-${index}.htm`,
    }));
    const expected = new Map(places.map((place, index) => [place.title,
      ['place', 'lodging', 'visitor_center', 'museum', 'place', 'place', 'place', 'place', 'place'][index]]));
    const provider = createNpsEvidenceProvider({ now: () => NOW });
    const request = provider.buildRequest({ topic: 'activities', entity: { entityId: 'nps:park:brca' } });
    const rows = provider.normalize({ thingstodo: [], places }, request,
      { observedAt: NOW.toISOString(), sourceIngestionComplete: true });

    for (const row of rows.filter(row => row.claim.identity.startsWith('place:'))) {
      expect(row.claim.normalizedValue.category).toBe(expected.get(row.claim.normalizedValue.name));
    }
  });

  test('category correction does not change guard eligibility authority', () => {
    const base = activity('brca', 'Sunrise Point', 0);
    const corrected = structuredClone(base);
    corrected.claim.normalizedValue.category = 'place';
    const historical = structuredClone(base);
    historical.claim.normalizedValue.category = 'lodging';
    expect(assessPlaceEligibility(corrected, [corrected], { avoidExposure: true }))
      .toMatchObject({ status: 'eligible', reasonCodes: [] });
    expect(assessPlaceEligibility(historical, [historical], { avoidExposure: true }))
      .toMatchObject({ status: 'eligible', reasonCodes: [] });
  });
});

describe('multi-park evidence fan-out and model-facing selection', () => {
  test('researches every official park and retains activities plus direct access facts under the existing cap', async () => {
    const urls = {
      zion: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm',
      brca: 'https://www.nps.gov/brca/planyourvisit/shuttle.htm',
    };
    const requested = { zion: ['Riverside Walk', "Pa'rus Trail"], brca: ['Sunrise Point', 'Sunset Point'] };
    const activities = Object.fromEntries(Object.entries(requested).map(([parkCode, names]) => [parkCode,
      [...names, ...Array.from({ length: 7 }, (_, index) => `${parkCode} optional activity ${index}`)]
        .map((name, index) => activity(parkCode, name, index))]));
    const calls = [];
    const broker = { dispatchEphemeral: jest.fn(async ({ requirement }) => {
      const provider = requirement.preferredProviders[0];
      const parkCode = requirement.entity?.entityId?.split(':').at(-1);
      calls.push({ provider, topic: requirement.topic, parkCode });
      if (provider === 'nps' && requirement.topic === 'activities') {
        return { status: 'fulfilled', normalizedCandidates: activities[parkCode] || [], providerAttemptCount: 0 };
      }
      if (provider === 'brave' && requirement.topic === 'transit') {
        return { status: 'fulfilled', normalizedCandidates: [transit(parkCode, 'brave', urls[parkCode])], providerAttemptCount: 0 };
      }
      if (provider === 'direct_official_page' && requirement.topic === 'transit') {
        return { status: 'fulfilled', normalizedCandidates: [transit(parkCode, provider, requirement.webScope.sourceUrl)], providerAttemptCount: 0 };
      }
      return { status: 'unavailable', normalizedCandidates: [], providerAttemptCount: 0 };
    }) };
    const anchors = [
      { name: 'Zion National Park', parkCode: 'zion', source: 'nps', sourceId: 'nps:park:zion' },
      { name: 'Bryce Canyon National Park', parkCode: 'brca', source: 'nps', sourceId: 'nps:park:brca' },
    ];
    const tools = createSimpleTravelTools({ broker, now: () => NOW, reserveDiscovery: false,
      destinationResolver: async () => ({
        entityId: 'place:query:zion-and-bryce', displayName: 'Zion and Bryce', destinationAnchors: anchors,
      }) });
    const result = await tools.execute('read_travel', {
      destination: 'Zion and Bryce',
      question: 'Plan easy signature outings and preserve shuttle and access guidance.',
      topics: ['activities'],
      places: [...requested.zion, ...requested.brca],
      constraints: { avoidExposure: true },
    }, { requestId: 'multi-park-selection', userMessage: 'Plan Zion and Bryce with easy walks and shuttle guidance.', snapshot: { planningState: {} } });

    expect(calls.filter(call => call.provider === 'nps' && call.topic === 'activities'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ parkCode: 'zion' }),
        expect.objectContaining({ parkCode: 'brca' }),
      ]));
    expect(calls.filter(call => call.provider === 'nps' && call.topic === 'activities')).toHaveLength(2);
    expect(calls.some(call => ['named_place', 'geocode_coordinate'].includes(call.provider))).toBe(false);

    const factRows = result.modelContext.facts.map(fact => ({ fact,
      row: result.evidence.find(row => row.evidenceId === fact.evidenceId) }));
    for (const parkCode of ['zion', 'brca']) {
      expect(factRows.some(({ row }) => row?.entityId === `nps:park:${parkCode}`
        && row.topic === 'activities' && row.source.provider === 'nps')).toBe(true);
      expect(factRows.some(({ row }) => row?.entityId === `nps:park:${parkCode}`
        && row.topic === 'transit' && row.source.provider === 'direct_official_page')).toBe(true);
    }
    for (const name of [...requested.zion, ...requested.brca]) {
      expect(result.modelContext.facts.some(fact => fact.value?.name === name)).toBe(true);
    }
    expect(result.modelContext.parkWideAccess).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'private_vehicle_restriction', parkCode: 'zion' }),
    ]));
    expect(result.evidenceDelivery.factBytes).toBeLessThanOrEqual(28000);
    expect(result.evidenceDelivery.reserveDiscovery).toBe(false);
    expect(result.evidenceDelivery.deliveredReserveRecords).toBe(0);
    expect(result.evidenceDelivery.deduplicatedSelectionCandidates)
      .toBeLessThan(result.evidenceDelivery.selectionCandidates);

    // Selection changes only the model view. All active authoritative rows remain
    // available to the unchanged guard, including the search rows it did not show.
    expect(result.evidence).toHaveLength(result.evidenceDelivery.activeRecords);
    expect(result.evidence.filter(row => row.topic === 'transit')).toHaveLength(4);
  });

  test('parallel fan-out never exceeds the shared provider allowance and reports every skipped park', async () => {
    const anchors = Array.from({ length: 9 }, (_, index) => ({
      name: `Park ${index + 1}`, parkCode: `p${index + 1}`, source: 'nps', sourceId: `nps:park:p${index + 1}`,
    }));
    const broker = { dispatchEphemeral: jest.fn(async ({ requirement }) => ({
      status: 'fulfilled',
      normalizedCandidates: [activity(requirement.entity.entityId.split(':').at(-1),
        `${requirement.entity.displayName} activity`, 0)],
      providerAttemptCount: 0,
    })) };
    const tools = createSimpleTravelTools({ broker, now: () => NOW, maxProviderRequests: 4,
      destinationResolver: async () => ({
        entityId: 'place:query:many-parks', displayName: 'Many parks', destinationAnchors: anchors,
      }) });
    const result = await tools.execute('read_travel', {
      destination: 'Many parks', question: 'Find activities.', topics: ['activities'],
    }, { requestId: 'bounded-many-parks', userMessage: 'Find activities.', snapshot: { planningState: {} } });

    expect(broker.dispatchEphemeral).toHaveBeenCalledTimes(4);
    expect(result.providerAttemptCount).toBe(0);
    expect(result.unresolved.filter(item => item.topic === 'activities' && item.reasonCode === 'research_allowance_reached'
      && item.entityId?.startsWith('nps:park:'))).toHaveLength(5);
    for (const anchor of anchors.slice(4)) {
      expect(result.unresolved).toContainEqual(expect.objectContaining({
        topic: 'activities', entityId: anchor.sourceId, reasonCode: 'research_allowance_reached',
      }));
    }
  });

  test('a partial provider failure names the park whose official activity read is incomplete', async () => {
    const anchors = [
      { name: 'Working Park', parkCode: 'good', source: 'nps', sourceId: 'nps:park:good' },
      { name: 'Timed-out Park', parkCode: 'slow', source: 'nps', sourceId: 'nps:park:slow' },
    ];
    const broker = { dispatchEphemeral: jest.fn(async ({ requirement }) => {
      const provider = requirement.preferredProviders[0];
      const parkCode = requirement.entity?.entityId?.split(':').at(-1);
      if (provider === 'nps' && requirement.topic === 'activities' && parkCode === 'good') {
        return { status: 'fulfilled', normalizedCandidates: [activity('good', 'Working Park Walk', 0)], providerAttemptCount: 1 };
      }
      return { status: 'unavailable', reasonCode: parkCode === 'slow' ? 'provider_timeout' : 'not_found',
        normalizedCandidates: [], providerAttemptCount: 1 };
    }) };
    const tools = createSimpleTravelTools({ broker, now: () => NOW,
      destinationResolver: async () => ({
        entityId: 'place:query:partial-parks', displayName: 'Two parks', destinationAnchors: anchors,
      }) });
    const result = await tools.execute('read_travel', {
      destination: 'Two parks', question: 'Find activities.', topics: ['activities'],
    }, { requestId: 'partial-many-parks', userMessage: 'Find activities.', snapshot: { planningState: {} } });

    expect(result.modelContext.facts.some(fact => fact.value?.name === 'Working Park Walk')).toBe(true);
    expect(result.unresolved).toContainEqual(expect.objectContaining({
      topic: 'activities', entityId: 'nps:park:slow', destination: 'Timed-out Park',
      status: 'unresolved', reasonCode: 'official_activity_read_incomplete',
    }));
    expect(result.unresolved).not.toContainEqual(expect.objectContaining({
      topic: 'activities', entityId: 'nps:park:good',
    }));
  });
});
