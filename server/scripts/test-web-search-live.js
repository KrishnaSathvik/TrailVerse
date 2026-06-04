#!/usr/bin/env node
/**
 * Live smoke test for Brave / Serper / Tavily via fetchWebSearchFacts.
 * Usage:
 *   cd server && node scripts/test-web-search-live.js
 *   cd server && node scripts/test-web-search-live.js --full
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  fetchWebSearchFacts,
  fetchRelevantFacts,
  needsWebSearch,
  classifyQuery,
  resolveSearchCategory,
} = require('../src/services/factsService');

const SHOW_FULL = process.argv.includes('--full');

const KEYS = {
  brave: !!process.env.BRAVE_SEARCH_API_KEY,
  serper: !!process.env.SERPER_API_KEY,
  tavily: !!process.env.TAVILY_API_KEY,
  openai: !!process.env.OPENAI_API_KEY,
};

const CASES = [
  {
    id: 'planning',
    label: 'General planning → Tavily',
    userMessage: 'best national parks to visit in July with cool weather lakes or beaches',
    parkName: null,
    parkCode: null,
    expectWeb: true,
    expectCategory: 'planning',
  },
  {
    id: 'operational',
    label: 'Open/closed today → operational-status / Brave',
    userMessage: 'is Angels Landing open right now in Zion National Park',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectWeb: true,
    expectCategory: 'operational-status',
  },
  {
    id: 'local',
    label: 'Restaurants/hotels → Serper',
    userMessage: 'best restaurants and hotels near Zion National Park',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectWeb: true,
    expectCategory: 'local-business',
  },
  {
    id: 'road',
    label: 'Road closure → Brave',
    userMessage: 'Glacier National Park Going-to-the-Sun road closure status today',
    parkName: 'Glacier National Park',
    parkCode: 'glac',
    expectWeb: true,
    expectCategory: 'road-conditions',
  },
  {
    id: 'trail',
    label: 'Trail conditions → Brave',
    userMessage: 'The Narrows trail conditions muddy or closed this week',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectWeb: true,
    expectCategory: 'trail-conditions',
  },
  {
    id: 'smoke',
    label: 'Wildfire smoke → Brave',
    userMessage: 'wildfire smoke air quality near Yosemite National Park today',
    parkName: 'Yosemite National Park',
    parkCode: 'yose',
    expectWeb: true,
    expectCategory: 'wildfire-smoke',
  },
  {
    id: 'state-park',
    label: 'State park (non-NPS) → planning / Tavily',
    userMessage: 'plan a weekend at Custer state park South Dakota bison loop',
    parkName: null,
    parkCode: null,
    expectWeb: true,
    expectCategory: 'planning',
  },
  {
    id: 'compare',
    label: 'Compare parks → planning',
    userMessage: 'Zion vs Bryce for first timers in October',
    parkName: null,
    parkCode: null,
    expectWeb: true,
    expectCategory: 'planning',
  },
  {
    id: 'nps-skip',
    label: 'Permits only → no web',
    userMessage: 'Do I need a permit for The Narrows in Zion?',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectWeb: false,
  },
];

async function runCase(testCase) {
  const wantsWeb = needsWebSearch(testCase.userMessage);
  const regexCategory = classifyQuery(testCase.userMessage);
  const resolvedCategory = await resolveSearchCategory(testCase.userMessage);
  const start = Date.now();
  const block = await fetchWebSearchFacts({
    userMessage: testCase.userMessage,
    parkName: testCase.parkName,
    parkCode: testCase.parkCode,
  });
  const ms = Date.now() - start;
  const categoryMatch = block?.match(/category: ([a-z-]+)/)?.[1] || null;

  let pass =
    testCase.expectWeb
      ? wantsWeb && !!block
      : !wantsWeb && !block;

  if (testCase.expectCategory && categoryMatch !== testCase.expectCategory) {
    pass = false;
  }

  return {
    id: testCase.id,
    label: testCase.label,
    wantsWeb,
    regexCategory,
    resolvedCategory,
    category: categoryMatch,
    ms,
    block,
    pass,
  };
}

async function main() {
  console.log('\n=== TrailVerse web search live test ===\n');
  console.log('Keys configured:', KEYS);
  console.log('Full prompt output:', SHOW_FULL ? 'yes' : 'no (pass --full)\n');

  if (!KEYS.brave && !KEYS.serper && !KEYS.tavily) {
    console.error('\nNo search API keys in server/.env\n');
    process.exit(1);
  }

  const results = [];
  for (const testCase of CASES) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`${testCase.id}: ${testCase.label}`);
    console.log(`Q: ${testCase.userMessage}`);
    try {
      const r = await runCase(testCase);
      results.push(r);
      console.log(
        `needsWeb=${r.wantsWeb} | regex=${r.regexCategory} | resolved=${r.resolvedCategory} | block category=${r.category || 'none'} | ${r.ms}ms`
      );
      if (testCase.expectCategory) {
        console.log(`expected category: ${testCase.expectCategory}`);
      }
      if (SHOW_FULL && r.block) {
        console.log('\n--- FULL WEB BLOCK (injected into Trailie system prompt) ---\n');
        console.log(r.block);
        console.log('--- END WEB BLOCK ---');
      } else if (r.block) {
        console.log('\nPreview (first 600 chars):');
        console.log(r.block.slice(0, 600) + (r.block.length > 600 ? '\n…' : ''));
      }
      console.log(r.pass ? '\nPASS' : '\nFAIL');
    } catch (err) {
      results.push({ id: testCase.id, pass: false, error: err.message });
      console.error('ERROR:', err.message);
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(72)}`);
  console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL: ${f.id}${f.error ? ` — ${f.error}` : ''}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
