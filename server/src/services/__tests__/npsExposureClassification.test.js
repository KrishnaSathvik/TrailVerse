'use strict';

/**
 * Exposure classification from official NPS text (2026-10-12 refinement).
 * Goal is ACCURATE exposure types, not getting any destination accepted:
 * path-edge drops vs cliff exposure, sense-filtered cues, park boilerplate,
 * and ambiguity kept unknown (never silently low). Fixtures quote real NPS copy.
 */

const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');

const NOW = new Date('2026-10-12T12:00:00.000Z');
const BOILERPLATE = 'While in Glacier National Park, please maintain extra awareness around water, steep dropoffs, and wildlife. You are responsible for your own safety.';

async function classify(thingstodo = [], places = [], parkCode = 'zion') {
  const provider = createNpsEvidenceProvider({ npsClient: {
    getParkActivities: jest.fn().mockResolvedValue(thingstodo),
    getParkPlaces: jest.fn().mockResolvedValue(places),
  }, now: () => NOW });
  const request = provider.buildRequest({ requirementId: 'r', topic: 'activities', preferredProviders: ['nps'],
    entity: { entityId: `nps:park:${parkCode}`, displayName: 'Park' } });
  const fetched = await provider.fetch(request, { signal: new AbortController().signal });
  return Object.fromEntries(provider.normalize(fetched.raw, request, fetched.metadata)
    .map((c) => [c.claim.normalizedValue.name, c.claim.normalizedValue.exposureLevel]));
}
const todo = (title, longDescription) => ({ id: title, title, shortDescription: '', longDescription });

describe('path-edge drops are not cliff exposure', () => {
  test('Riverside Walk: paved trail with minor path-edge drop-offs is low', async () => {
    const byName = await classify([todo('Riverside Walk', 'The Riverside Walk is a relatively flat and paved trail in the northern end of Zion Canyon. This easy trail follows the Virgin River as the sheer sandstone walls narrow in around you. The Riverside Walk is mostly flat through the first half-mile, although paving is irregular in some sections and minor drop-offs are present.')]);
    expect(byName['Riverside Walk']).toBe('low');
  });

  test('minor drop-offs without positive surface evidence stay unknown, not low', async () => {
    const byName = await classify([todo('Sandy Bench Path', 'A sandy path along the bench. Watch for minor drop-offs.')]);
    expect(byName['Sandy Bench Path']).toBeNull();
  });

  test('a minor qualifier cannot hide a severe drop in the same sentence', async () => {
    const byName = await classify([todo('Rim Path', 'A paved path with minor drop-offs and sheer drop-offs of 500 feet beyond the rail.')]);
    expect(byName['Rim Path']).toBe('high');
  });
});

describe('genuinely exposed routes stay incompatible', () => {
  test.each([
    ['Angels Landing', 'You must navigate a trail only a few feet wide in some areas, with exposed edges and sheer drop-offs of as much as 1,000 feet on each side.', 'high'],
    ['Canyon Overlook', 'Long drop-offs, mostly fenced. Rocky uneven trail to a viewpoint.', 'high'],
    ['Beehive Loop', 'If choosing this hike, expect steep granite staircases, iron rungs, and exposed cliff faces.', 'high'],
    ['Highline Trail', 'Much of the Highline Trail is exposed, which means there is a higher risk of falling.', 'moderate'],
    ['Watchman Trail', 'The terrain is sandy, rocky, and uneven, with several moderate drop-offs.', 'moderate'],
    ['Lower Emerald Pool Trail', 'A rough paved trail. Avoid cliff edges.', 'moderate'],
    ['Bearfence Rock Scramble', 'If you have a fear of heights, it’s not for you.', 'moderate'],
  ])('%s', async (title, text, expected) => {
    expect((await classify([todo(title, text)]))[title]).toBe(expected);
  });
});

describe('words that are not walking exposure', () => {
  test.each([
    ['Carroll Homestead', 'When the Island Explorer is running, the bus will drop off and pick up people by the driveway.'],
    ['Agua Canyon', 'The upper steps of the Grand Staircase exposed within it present most of the view.'],
    ['Ponderosa Canyon', 'These trees can be several feet in diameter and exceed heights of 150 ft.'],
    ['Ken Patrick Trail', 'Many parts are recovering from wildfire, making it quite exposed to sun, wind, and cold.'],
    ['Lipan Point', 'On a clear day, you can see the Vermillion Cliffs 45 miles to the northeast.'],
  ])('%s is not classified as exposed', async (title, text) => {
    expect(['moderate', 'high']).not.toContain((await classify([todo(title, text)]))[title]);
  });

  test('ambiguous "exposed hike" stays unknown even on a paved route', async () => {
    const byName = await classify([todo('Ridge Path', 'A paved but mostly exposed hike with excellent views.')]);
    expect(byName['Ridge Path']).toBeNull();
  });

  test('missing description is unknown', async () => {
    expect((await classify([todo('Unnamed Spur', '')]))['Unnamed Spur']).toBeNull();
  });
});

describe('park-wide boilerplate describes the park, not each place', () => {
  const glacierPlace = (title, body) => ({ id: title, title, listingDescription: '', bodyText: `<p>${body}</p><br /> <em>${BOILERPLATE}</em>` });

  test('repeated safety copy (joined by <br />) does not make a boardwalk exposed', async () => {
    const places = [
      glacierPlace('Trail of the Cedars', 'An accessible boardwalk loop through old-growth cedars.<br />Trailhead: Avalanche Picnic Area'),
      ...Array.from({ length: 6 }, (_, i) => glacierPlace(`Trailhead ${i}`, `Trailhead number ${i}.`)),
      glacierPlace('Ledge Route', 'The route follows narrow ledges above the valley.'),
    ];
    const byName = await classify([], places, 'glac');
    expect(byName['Trail of the Cedars']).toBe('low');
    expect(byName['Trailhead 0']).toBeNull();
    expect(byName['Ledge Route']).toBe('high');
  });

  test('a sentence on only a couple of records is still evidence', async () => {
    const places = [
      glacierPlace('A', 'Watch for steep drop-offs along the cliff edge.'),
      glacierPlace('B', 'Watch for steep drop-offs along the cliff edge.'),
    ];
    const byName = await classify([], places, 'glac');
    expect(byName.A).toBe('high');
  });
});


describe('facility names cannot manufacture low exposure upstream', () => {
  test.each(['Remote Picnic Area', 'Cliff Museum', 'Rim Visitor Center', 'Indoor Exhibits Museum'])('%s without activity evidence stays unknown', async title => {
    expect((await classify([todo(title, '')]))[title]).toBeNull();
  });
  test('official indoor-exhibit activity evidence supports low exposure', async () => {
    expect((await classify([todo('History Building', 'Indoor exhibits explore the history of the region.')]))['History Building']).toBe('low');
  });
  test('an indoor exhibit reference cannot override exposed outdoor access', async () => {
    expect((await classify([todo('History Building', 'Indoor exhibits explore history. The approach follows narrow ledges with sheer drop-offs of 500 feet.')]))['History Building']).toBe('high');
  });
});
