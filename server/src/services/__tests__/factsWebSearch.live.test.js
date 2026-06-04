/**
 * Live integration tests — skipped when API keys missing or SKIP_WEB_LIVE_TESTS=1.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const hasKeys =
  !!process.env.BRAVE_SEARCH_API_KEY ||
  !!process.env.SERPER_API_KEY ||
  !!process.env.TAVILY_API_KEY;
const skipLive = process.env.SKIP_WEB_LIVE_TESTS === '1' || !hasKeys;

const { fetchWebSearchFacts, classifyQuery } = require('../factsService');

const LIVE_CASES = [
  {
    msg: 'The Narrows trail conditions muddy or closed this week',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectCategory: 'trail-conditions',
  },
  {
    msg: 'wildfire smoke air quality near Yosemite today',
    parkName: 'Yosemite National Park',
    parkCode: 'yose',
    expectCategory: 'wildfire-smoke',
  },
  {
    msg: 'plan a weekend at Custer state park South Dakota bison loop',
    parkName: null,
    parkCode: null,
    expectCategory: 'planning',
  },
  {
    msg: 'Zion vs Bryce for first timers in October',
    parkName: null,
    parkCode: null,
    expectCategory: 'planning',
  },
];

const describeLive = skipLive ? describe.skip : describe;

describeLive('factsWebSearch live API', () => {
  jest.setTimeout(45000);

  test.each(LIVE_CASES)('$expectCategory ← $msg', async ({ msg, parkName, parkCode, expectCategory }) => {
    const block = await fetchWebSearchFacts({ userMessage: msg, parkName, parkCode });
    expect(block).toBeTruthy();
    expect(block).toContain(`category: ${expectCategory}`);
    expect(classifyQuery(msg)).toBe(expectCategory);
  });
});
