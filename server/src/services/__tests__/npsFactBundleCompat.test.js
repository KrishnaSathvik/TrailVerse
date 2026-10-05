jest.mock('../ridbService', () => ({ getPermitsForPark: jest.fn() }));

const { setNpsAdapterForTests, resetNpsServiceForTests } = require('../npsService');
const ridbService = require('../ridbService');
const { fetchNPSFacts, fetchNPSFactBundle } = require('../factsService');

// A deterministic stand-in installed through the service's own seam. It is
// partial on purpose — only the four methods factsService calls are defined, so
// an unexpected call fails loudly instead of reaching the live NPS API. The
// afterEach reset guarantees it cannot leak into another suite.
const npsService = {
  getParkByCode: jest.fn(),
  getParkAlerts: jest.fn(),
  getParkCampgrounds: jest.fn(),
  getParkVisitorCenters: jest.fn(),
};

afterEach(() => {
  resetNpsServiceForTests();
});

beforeEach(() => {
  jest.clearAllMocks();
  setNpsAdapterForTests(npsService);
  npsService.getParkByCode.mockResolvedValue({
    fullName: 'Glacier National Park',
    entranceFees: [{ title: '7-day vehicle pass', cost: '35.00' }],
    activities: [{ name: 'Hiking' }],
  });
  npsService.getParkAlerts.mockResolvedValue([
    { id: 'a1', title: 'Going-to-the-Sun Road closed above Logan Creek', category: 'Park Closure' },
  ]);
  npsService.getParkCampgrounds.mockResolvedValue([]);
  npsService.getParkVisitorCenters.mockResolvedValue([]);
  ridbService.getPermitsForPark.mockResolvedValue([]);
});

describe('fetchNPSFacts string contract', () => {
  test('still resolves to a plain string', async () => {
    const facts = await fetchNPSFacts({ parkCode: 'glac', parkName: 'Glacier National Park' });

    expect(typeof facts).toBe('string');
    expect(facts).toContain('ACTIVE CLOSURES');
    expect(facts).toContain('Going-to-the-Sun Road closed above Logan Creek');
  });

  test('interpolating into a prompt never yields [object Object]', async () => {
    const facts = await fetchNPSFacts({ parkCode: 'glac', parkName: 'Glacier National Park' });
    const prompt = `LIVE TRAILVERSE DATA:\n${facts}\n--- END ---`;

    expect(prompt).not.toContain('[object Object]');
  });

  test('multi-park concatenation stays flat', async () => {
    const a = await fetchNPSFacts({ parkCode: 'glac', parkName: 'Glacier National Park' });
    const b = await fetchNPSFacts({ parkCode: 'olym', parkName: 'Olympic National Park' });
    const joined = [a, b].filter(Boolean).join('\n\n');

    expect(joined).not.toContain('[object Object]');
    expect(typeof joined).toBe('string');
  });

  test('returns null when parkCode is missing', async () => {
    expect(await fetchNPSFacts({ parkCode: null })).toBeNull();
  });
});

describe('fetchNPSFactBundle', () => {
  test('returns the same text plus canonical facts and meta', async () => {
    const bundle = await fetchNPSFactBundle({ parkCode: 'glac', parkName: 'Glacier National Park' });
    const text = await fetchNPSFacts({ parkCode: 'glac', parkName: 'Glacier National Park' });

    expect(bundle.text).toBe(text);
    expect(Array.isArray(bundle.canonicalFacts)).toBe(true);
    expect(bundle.meta.parkCode).toBe('glac');
    expect(typeof bundle.meta.retrievedAt).toBe('string');
  });

  test('canonical facts carry the park scope and closure evidence', async () => {
    const { canonicalFacts } = await fetchNPSFactBundle({
      parkCode: 'glac',
      parkName: 'Glacier National Park',
    });

    const closure = canonicalFacts.find((f) => f.category === 'closure');
    expect(closure.parkCode).toBe('glac');
    expect(closure.id).toBe('nps:glac:closure:a1');
    expect(closure.status).toBe('active_closure');

    // No RIDB listing came back — that must not read as "no permit required".
    const permit = canonicalFacts.find((f) => f.category === 'permit');
    expect(permit.status).toBe('listing_not_found');
  });
});
