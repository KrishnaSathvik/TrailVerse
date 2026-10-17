const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const { needsNpsRoadConditionsBlock } = require('../npsParkConditionsService');
const { fetchNPSFacts } = require('../factsService');

const HAS_NPS_KEY = !!process.env.NPS_API_KEY;
// Non-network suite (deny_live) must not hit live NPS HTTP.
const ALLOW_LIVE_NPS = HAS_NPS_KEY && process.env.TRAILIE_TEST_PROVIDER_MODE !== 'deny_live';

describe('npsParkConditions', () => {
  test('needsNpsRoadConditionsBlock for GTSR question', () => {
    expect(
      needsNpsRoadConditionsBlock('is Going-to-the-Sun Road open right now in Glacier National Park?')
    ).toBe(true);
  });

  (ALLOW_LIVE_NPS ? test : test.skip)('fetchNPSFacts includes road block and Park Closure alerts for glac', async () => {
    const msg = 'is Going-to-the-Sun Road open right now in Glacier National Park?';
    const facts = await fetchNPSFacts({ parkCode: 'glac', parkName: 'Glacier National Park', userMessage: msg });
    expect(facts).toContain('ACTIVE CLOSURES');
    expect(facts).toContain('Going-to-the-Sun');
    expect(facts).toContain('NPS ROAD & CONDITIONS');
    expect(facts).toContain('Avalanche Creek');
  }, 20000);
});
