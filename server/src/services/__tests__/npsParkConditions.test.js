const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const { needsNpsRoadConditionsBlock } = require('../npsParkConditionsService');
const { fetchNPSFacts } = require('../factsService');

const HAS_NPS_KEY = !!process.env.NPS_API_KEY;

describe('npsParkConditions', () => {
  test('needsNpsRoadConditionsBlock for GTSR question', () => {
    expect(
      needsNpsRoadConditionsBlock('is Going-to-the-Sun Road open right now in Glacier National Park?')
    ).toBe(true);
  });

  (HAS_NPS_KEY ? test : test.skip)('fetchNPSFacts includes road block and Park Closure alerts for glac', async () => {
    const msg = 'is Going-to-the-Sun Road open right now in Glacier National Park?';
    const facts = await fetchNPSFacts({ parkCode: 'glac', parkName: 'Glacier National Park', userMessage: msg });
    expect(facts).toContain('ACTIVE CLOSURES');
    expect(facts).toContain('Going-to-the-Sun');
    expect(facts).toContain('NPS ROAD & CONDITIONS');
    expect(facts).toContain('Avalanche Creek');
  }, 20000);
});
