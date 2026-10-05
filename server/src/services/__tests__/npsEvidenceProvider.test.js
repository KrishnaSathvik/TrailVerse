'use strict';

const fs = require('fs');
const path = require('path');
const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const requirement = (topic) => ({
  requirementId: `req:${topic}`,
  entity: { entityId: 'nps:park:yose', displayName: 'Yosemite National Park' },
  topic,
  preferredProviders: ['nps'],
});

describe('WP5A NPS evidence provider contract', () => {
  test('supports only the frozen NPS topic set', () => {
    const provider = createNpsEvidenceProvider({ npsClient: {} });
    for (const topic of ['destination_identity', 'overview', 'activities', 'fees', 'hours', 'alerts_closures', 'campgrounds', 'visitor_services']) {
      expect(provider.supports(requirement(topic))).toBe(true);
    }
    for (const topic of ['weather_forecast', 'permits_reservations', 'driving_time', 'astronomy']) {
      expect(provider.supports(requirement(topic))).toBe(false);
    }
  });

  test('groups profile topics while keeping physical operations distinct', () => {
    const provider = createNpsEvidenceProvider({ npsClient: {} });
    const profile = ['destination_identity', 'overview', 'fees', 'hours']
      .map((topic) => provider.buildRequest(requirement(topic)));
    expect(new Set(profile.map((item) => item.dedupeKey))).toEqual(new Set(['nps|parks|yose']));
    expect(provider.buildRequest(requirement('activities')).dedupeKey).toBe('nps|named-activities|yose');
    expect(provider.buildRequest(requirement('alerts_closures')).dedupeKey).toBe('nps|alerts|yose');
    expect(provider.buildRequest(requirement('campgrounds')).dedupeKey).toBe('nps|campgrounds|yose');
    expect(provider.buildRequest(requirement('visitor_services')).dedupeKey).toBe('nps|visitor-centers|yose');
  });

  test('aliases historical sequ entity codes to official NPS seki on fetch only', async () => {
    const npsClient = {
      getParkByCode: jest.fn().mockResolvedValue({
        id: 'park-seki', parkCode: 'seki', fullName: 'Sequoia & Kings Canyon National Parks',
        description: 'Giant sequoias.',
      }),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest({
      ...requirement('destination_identity'),
      entity: { entityId: 'nps:park:sequ', displayName: 'Sequoia National Park' },
    });
    expect(request.parameters.parkCode).toBe('sequ');
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    expect(npsClient.getParkByCode).toHaveBeenCalledWith('seki');
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidates.every((item) => item.entityId === 'nps:park:sequ')).toBe(true);
  });

  test('fetches once and normalizes one profile response into topic candidates', async () => {
    const npsClient = {
      getParkByCode: jest.fn().mockResolvedValue({
        id: 'park-yose', parkCode: 'yose', fullName: 'Yosemite National Park',
        description: 'Granite cliffs and waterfalls.',
        entranceFees: [{ title: 'Private Vehicle', cost: '35.00' }],
        operatingHours: [{ name: 'Yosemite National Park', standardHours: { monday: 'All Day' } }],
        activities: [{ id: 'act-hike', name: 'Hiking' }],
      }),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest(requirement('overview'));
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);

    expect(npsClient.getParkByCode).toHaveBeenCalledTimes(1);
    expect(new Set(candidates.map((item) => item.topic))).toEqual(new Set([
      'destination_identity', 'overview', 'fees', 'hours', 'activities',
    ]));
    expect(candidates.every((item) => item.entityId === 'nps:park:yose')).toBe(true);
    expect(candidates.every((item) => item.source.sourceClass === 'official_owner')).toBe(true);
    expect(fetched.providerAttempts).toBe(1);
  });

  test('activities fetch named thingstodo and places candidates', async () => {
    const npsClient = {
      getParkActivities: jest.fn().mockResolvedValue([
        {
          id: 'tt-1',
          title: "Pa'rus Trail",
          shortDescription: 'Easy paved walk with scenic views.',
          url: 'https://www.nps.gov/zion/planyourvisit/parus-trail.htm',
          latitude: 37.2,
          longitude: -112.9,
        },
      ]),
      getParkPlaces: jest.fn().mockResolvedValue([
        { id: 'pl-1', title: 'Canyon Junction', description: 'Scenic junction overlook area.' },
      ]),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest(requirement('activities'));
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);

    expect(npsClient.getParkActivities).toHaveBeenCalledWith('yose');
    expect(npsClient.getParkPlaces).toHaveBeenCalledWith('yose');
    expect(candidates.map((c) => c.claim.normalizedValue.name)).toEqual(
      expect.arrayContaining(["Pa'rus Trail", 'Canyon Junction'])
    );
    expect(candidates[0].claim.normalizedValue.currentStatus).toBe('unknown');
    expect(candidates[0].claim.normalizedValue.difficulty).toBe('easy');
    expect(candidates[0].claim.normalizedValue.exposureLevel).toBe('low');
    expect(candidates[0].provenance.extractorVersion).toBe('nps-activities-v8');
    expect(candidates[0].claim.qualifiers).toEqual(
      expect.arrayContaining(['named_activity_candidate', 'static_suitability_only'])
    );
  });

  test('reads places listingDescription and bodyText as official text for suitability inference', async () => {
    // NPS /places items carry their official text under listingDescription and
    // bodyText (shortDescription/longDescription do not exist on places).
    // Dropping them is the same field miss that once hid vehicle requirements.
    const npsClient = {
      getParkActivities: jest.fn().mockResolvedValue([]),
      getParkPlaces: jest.fn().mockResolvedValue([
        {
          id: 'hh',
          title: 'Hurricane Hill Trailhead',
          listingDescription: 'One of the most popular day hikes is the Hurricane Hill trail, about 3 miles (4.8 km) round trip.',
          bodyText: '<p>The trail is on a steeply-cut bank through this section with exposure to a considerable drop on the outside edge.</p>',
          url: 'https://www.nps.gov/places/000/hurricane-hill-trailhead.htm',
        },
        {
          id: 'lf',
          title: 'Living Forest Trailhead',
          listingDescription: '',
          bodyText: '<p>This short loop trail winds through forest.</p><p>Length: 2,565 feet, .49 miles Surface Type: Compacted gravel</p>',
        },
      ]),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest(requirement('activities'));
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const byName = Object.fromEntries(
      provider.normalize(fetched.raw, request, fetched.metadata)
        .map((c) => [c.claim.normalizedValue.name, c])
    );

    const hurricane = byName['Hurricane Hill Trailhead'];
    // Explicit official hazard text must reach the exposure fact.
    expect(hurricane.claim.normalizedValue.exposureLevel).toBe('moderate');
    expect(hurricane.claim.normalizedValue.walkingDistanceMiles).toBe(3);
    // Display text stays the short form; bodyText is inference input only.
    expect(hurricane.claim.text).toBe(
      'Hurricane Hill Trailhead: One of the most popular day hikes is the Hurricane Hill trail, about 3 miles (4.8 km) round trip.'
    );

    const livingForest = byName['Living Forest Trailhead'];
    // Survey mileage flows to mobility metadata; no exposure statement stays unknown.
    expect(livingForest.claim.normalizedValue.walkingDistanceMiles).toBe(0.49);
    expect(livingForest.claim.normalizedValue.exposureLevel).toBeNull();
    // Activity types must come from the SAME official text: "Trailhead" names
    // don't match \btrail\b, so without bodyText these places classified
    // EXPERIENCE_CLASS.UNKNOWN and the repair catalogue refused all of them.
    expect(livingForest.claim.normalizedValue.activityTypes).toEqual(
      expect.arrayContaining(['hike']),
    );
    expect(hurricane.claim.normalizedValue.activityTypes).toEqual(
      expect.arrayContaining(['hike']),
    );
  });

  test('does not treat geographic river mileage on a wayside as walking distance', async () => {
    const npsClient = {
      getParkActivities: jest.fn().mockResolvedValue([
        {
          id: 'loop',
          title: 'River Loop',
          shortDescription: 'A paved 0.8-mile loop.',
          duration: '30-60 Minutes',
        },
      ]),
      getParkPlaces: jest.fn().mockResolvedValue([
        {
          id: 'wayside',
          title: 'Canyon River Wayside',
          listingDescription: 'An interpretive exhibit beside the river.',
          bodyText: '<p>There are 14 miles of recreational river area in the park.</p>',
        },
      ]),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest(requirement('activities'));
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const byName = Object.fromEntries(
      provider.normalize(fetched.raw, request, fetched.metadata)
        .map((c) => [c.claim.normalizedValue.name, c])
    );
    const wayside = byName['Canyon River Wayside'];
    expect(wayside.claim.normalizedValue.walkingDistanceMiles).toBeNull();
    expect(wayside.claim.normalizedValue.duration).toBeNull();
    const loop = byName['River Loop'];
    expect(loop.claim.normalizedValue.walkingDistanceMiles).toBe(0.8);
    expect(loop.claim.normalizedValue.duration).toBe('30-60 Minutes');
  });

  test('derives exposure/difficulty from official text without treating unknown as low', async () => {
    const npsClient = {
      getParkActivities: jest.fn().mockResolvedValue([
        {
          id: 'parus',
          title: "Pa'rus Trail",
          shortDescription: 'Paved accessible trail with scenic views of the Watchman.',
        },
        {
          id: 'riverside',
          title: 'Riverside Walk',
          shortDescription: 'Flat paved trail where sheer sandstone walls narrow around you.',
        },
        {
          id: 'overlook',
          title: 'Canyon Overlook',
          shortDescription: 'Long drop-offs, mostly fenced. Rocky uneven trail to a viewpoint.',
        },
        {
          id: 'watchman',
          title: 'Watchman Trail',
          shortDescription: 'Unpaved climb to a viewpoint with drop-offs along the route.',
        },
        {
          id: 'cliff-warning',
          title: 'Paved Pool Trail',
          shortDescription: 'A rough paved trail. Avoid cliff edges.',
        },
        {
          id: 'mystery',
          title: 'Forest Path',
          shortDescription: 'A pine forest corridor with no surface details provided.',
        },
      ]),
      getParkPlaces: jest.fn().mockResolvedValue([]),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest({
      ...requirement('activities'),
      entity: { entityId: 'nps:park:zion', displayName: 'Zion National Park' },
    });
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const byName = Object.fromEntries(
      provider.normalize(fetched.raw, request, fetched.metadata)
        .map((c) => [c.claim.normalizedValue.name, c.claim.normalizedValue])
    );

    expect(byName["Pa'rus Trail"]).toMatchObject({ difficulty: 'easy', exposureLevel: 'low' });
    expect(byName['Riverside Walk']).toMatchObject({ difficulty: 'easy', exposureLevel: 'low' });
    expect(byName['Canyon Overlook'].exposureLevel).toBe('high');
    expect(byName['Watchman Trail'].exposureLevel).toBe('moderate');
    expect(byName['Forest Path'].exposureLevel).toBeNull();
    expect(byName['Paved Pool Trail'].exposureLevel).toBe('moderate');
  });

  test('does not treat approach-flat or approach-paved copy as low exposure for climbs/slot hikes', async () => {
    const npsClient = {
      getParkActivities: jest.fn().mockResolvedValue([
        {
          id: 'watchman',
          title: 'Watchman Trail',
          shortDescription: 'From the relatively flat beginning section by the river, this unpaved trail climbs to a magnificent viewpoint of the Watchman.',
        },
        {
          id: 'narrows',
          title: 'The Narrows',
          shortDescription: 'The Narrows is a strenuous hike through a narrow slot canyon. After 1 mile on the easy, paved Riverside Walk, continue into the river.',
        },
      ]),
      getParkPlaces: jest.fn().mockResolvedValue([]),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest({
      ...requirement('activities'),
      entity: { entityId: 'nps:park:zion', displayName: 'Zion National Park' },
    });
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const byName = Object.fromEntries(
      provider.normalize(fetched.raw, request, fetched.metadata)
        .map((c) => [c.claim.normalizedValue.name, c.claim.normalizedValue])
    );
    expect(byName['Watchman Trail'].exposureLevel).toBeNull();
    expect(byName['The Narrows'].exposureLevel).toBeNull();
  });

  test('plain empty alerts never prove absence, but explicit complete metadata may', async () => {
    const incomplete = createNpsEvidenceProvider({
      npsClient: { getParkAlerts: jest.fn().mockResolvedValue([]) }, now: () => NOW,
    });
    const request = incomplete.buildRequest(requirement('alerts_closures'));
    const plain = await incomplete.fetch(request, { signal: new AbortController().signal });
    expect(plain.completeness).toMatchObject({ isComplete: false, emptyMeans: 'unknown' });

    const complete = createNpsEvidenceProvider({
      npsClient: { getParkAlertsEvidence: jest.fn().mockResolvedValue({ data: [], isComplete: true }) }, now: () => NOW,
    });
    const explicit = await complete.fetch(request, { signal: new AbortController().signal });
    // The alerts call answers four topics (2026-08-26 contract repair): NPS
    // publishes road, trail and fire closures as alerts, so completeness must
    // name all of them or absence can never be proven for the derived ones.
    expect(explicit.completeness).toMatchObject({
      isComplete: true,
      topics: ['alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke'],
      emptyMeans: 'proves_absent',
    });
  });

  test('preserves provider observation metadata instead of relabeling cached evidence as current', async () => {
    const observedAt = '2026-08-09T11:45:00.000Z';
    const npsClient = {
      getParkAlertsEvidence: jest.fn().mockResolvedValue({
        data: [{ id: 'alert-1', title: 'Road closure' }], isComplete: true, observedAt,
      }),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest(requirement('alerts_closures'));
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    expect(fetched.metadata.observedAt).toBe(observedAt);
    expect(provider.normalize(fetched.raw, request, fetched.metadata)[0].observedAt).toBe(observedAt);
  });

  test('classifies errors without returning provider bodies or credentials', () => {
    const provider = createNpsEvidenceProvider({ npsClient: {} });
    expect(provider.classifyError({ response: { status: 429, data: 'SECRET BODY' }, message: 'key=SECRET' }))
      .toEqual({ code: 'provider_rate_limited', retryable: false });
    expect(provider.classifyError({ code: 'ETIMEDOUT', message: 'SECRET' }))
      .toEqual({ code: 'provider_timeout', retryable: true });
  });

  test('classifies visitor centers, lodges, and roadside viewpoints as low-exposure facilities', async () => {
    const npsClient = {
      getParkActivities: jest.fn().mockResolvedValue([
        {
          id: 'museum',
          title: 'Zion Human History Museum',
          shortDescription: 'Indoor exhibits about the park.',
        },
      ]),
      getParkPlaces: jest.fn().mockResolvedValue([
        { id: 'lodge', title: 'Zion Lodge', description: 'Historic lodge area with lawns and services.' },
        { id: 'patriarchs', title: 'Court of the Patriarchs viewpoint', description: 'Roadside parking-area viewpoint of the Patriarchs.' },
      ]),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest({
      ...requirement('activities'),
      entity: { entityId: 'nps:park:zion', displayName: 'Zion National Park' },
    });
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const byName = Object.fromEntries(
      provider.normalize(fetched.raw, request, fetched.metadata)
        .map((c) => [c.claim.normalizedValue.name, c.claim.normalizedValue])
    );
    expect(byName['Zion Human History Museum'].exposureLevel).toBe('low');
    expect(byName['Zion Lodge'].exposureLevel).toBe('low');
    expect(byName['Court of the Patriarchs viewpoint'].exposureLevel).toBe('low');
  });

  test('adapter source imports no Mongo, store, broker policy, or legacy prompt formatter', () => {
    const source = fs.readFileSync(path.join(__dirname, '../providers/npsEvidenceProvider.js'), 'utf8');
    expect(source).not.toMatch(/mongoose|models\/|evidenceStore|evidenceCoverage|factsService|prompt/i);
  });
});
