#!/usr/bin/env node
/**
 * Full accuracy suite: web block + logged-in Trailie reply per question type.
 *
 *   PLAN_AI_TEST_EMAIL=... PLAN_AI_TEST_PASSWORD=... node scripts/test-web-search-full-suite.js
 *   node scripts/test-web-search-full-suite.js --web-only   # skip chat (faster)
 *   node scripts/test-web-search-full-suite.js --id operational  # single case
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  fetchWebSearchFacts,
  needsWebSearch,
  classifyQuery,
  resolveSearchCategory,
} = require('../src/services/factsService');

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5001/api';
const EMAIL = process.env.PLAN_AI_TEST_EMAIL;
const PASSWORD = process.env.PLAN_AI_TEST_PASSWORD;
const WEB_ONLY = process.argv.includes('--web-only');
const FILTER_ID = process.argv.find((a) => a.startsWith('--id='))?.slice(5)
  || (process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null);

const CASES = [
  {
    id: 'operational',
    label: 'Open/closed today → operational-status',
    userMessage: 'is Angels Landing open right now in Zion National Park',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectWeb: true,
    expectCategory: 'operational-status',
  },
  {
    id: 'local',
    label: 'Restaurants/hotels → local-business',
    userMessage: 'best restaurants and hotels near Zion National Park',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectWeb: true,
    expectCategory: 'local-business',
  },
  {
    id: 'road',
    label: 'Road closure → road-conditions',
    userMessage: 'Glacier National Park Going-to-the-Sun road closure status today',
    parkName: 'Glacier National Park',
    parkCode: 'glac',
    expectWeb: true,
    expectCategory: 'road-conditions',
  },
  {
    id: 'trail',
    label: 'Trail conditions → trail-conditions',
    userMessage: 'The Narrows trail conditions muddy or closed this week in Zion',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectWeb: true,
    expectCategory: 'trail-conditions',
  },
  {
    id: 'smoke',
    label: 'Wildfire smoke → wildfire-smoke',
    userMessage: 'wildfire smoke air quality near Yosemite National Park today',
    parkName: 'Yosemite National Park',
    parkCode: 'yose',
    expectWeb: true,
    expectCategory: 'wildfire-smoke',
  },
  {
    id: 'planning',
    label: 'General planning → planning',
    userMessage: 'best national parks to visit in July with cool weather lakes or beaches',
    parkName: null,
    parkCode: null,
    expectWeb: true,
    expectCategory: 'planning',
  },
  {
    id: 'state-park',
    label: 'State park (non-NPS) → planning',
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
    label: 'NPS permits only → no web',
    userMessage: 'Do I need a permit for The Narrows in Zion?',
    parkName: 'Zion National Park',
    parkCode: 'zion',
    expectWeb: false,
  },
  {
    id: 'mixed',
    label: 'NPS + restaurants (mixed) → web',
    userMessage: 'Visiting Yellowstone next week — any road closures and good restaurants near the park?',
    parkName: 'Yellowstone National Park',
    parkCode: 'yell',
    expectWeb: true,
  },
];

function sep(title) {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(title);
  console.log('═'.repeat(78));
}

async function login() {
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok || !loginBody.token) {
    throw new Error(`Login failed: ${loginRes.status} ${JSON.stringify(loginBody)}`);
  }
  return loginBody.token;
}

async function runWebCase(testCase) {
  const wantsWeb = needsWebSearch(testCase.userMessage);
  const regexCategory = classifyQuery(testCase.userMessage);
  const resolvedCategory = await resolveSearchCategory(testCase.userMessage);
  const block = await fetchWebSearchFacts({
    userMessage: testCase.userMessage,
    parkName: testCase.parkName,
    parkCode: testCase.parkCode,
  });
  const category = block?.match(/category: ([a-z-]+)/)?.[1] || null;

  let pass = testCase.expectWeb ? wantsWeb && !!block : !wantsWeb && !block;
  if (testCase.expectCategory && category !== testCase.expectCategory) pass = false;

  console.log(`needsWeb=${wantsWeb} | regex=${regexCategory} | resolved=${resolvedCategory} | block=${category || 'none'}`);
  if (testCase.expectCategory) console.log(`expected category: ${testCase.expectCategory}`);
  if (block) {
    console.log('\n--- FULL WEB BLOCK ---\n');
    console.log(block);
    console.log('\n--- END WEB BLOCK ---');
  } else {
    console.log('\n(no web block — expected for pure NPS-only queries)\n');
  }
  return { pass, category, wantsWeb };
}

async function runChatCase(token, testCase) {
  const metadata = {};
  if (testCase.parkCode) metadata.parkCode = testCase.parkCode;
  if (testCase.parkName) metadata.parkName = testCase.parkName;

  const chatRes = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      provider: 'claude',
      messages: [{ role: 'user', content: testCase.userMessage }],
      metadata,
    }),
  });
  const body = await chatRes.json();
  if (!chatRes.ok) {
    throw new Error(`Chat ${chatRes.status}: ${JSON.stringify(body)}`);
  }
  const data = body.data || body;
  console.log('\n--- API metadata ---');
  console.log(JSON.stringify({
    hasLiveData: data.hasLiveData,
    hasWebSearch: data.hasWebSearch,
    parkName: data.parkName,
    parkNames: data.parkNames,
    provider: data.provider,
    model: data.model,
  }, null, 2));
  console.log('\n--- FULL ASSISTANT REPLY (UI) ---\n');
  console.log(data.content || '(empty)');
  console.log('\n--- END REPLY ---');

  const chatPass = testCase.expectWeb ? data.hasWebSearch === true : data.hasWebSearch !== true;
  return { chatPass, hasWebSearch: data.hasWebSearch };
}

async function main() {
  const cases = FILTER_ID ? CASES.filter((c) => c.id === FILTER_ID) : CASES;
  if (!cases.length) {
    console.error(`Unknown --id ${FILTER_ID}. Valid: ${CASES.map((c) => c.id).join(', ')}`);
    process.exit(1);
  }

  console.log('\n=== TrailVerse web search FULL suite ===');
  console.log(`Cases: ${cases.length} | web-only: ${WEB_ONLY}`);

  let token = null;
  if (!WEB_ONLY) {
    if (!EMAIL || !PASSWORD) {
      console.error('Set PLAN_AI_TEST_EMAIL and PLAN_AI_TEST_PASSWORD (or use --web-only)');
      process.exit(1);
    }
    token = await login();
    console.log('Login: OK');
  }

  const summary = [];

  for (const testCase of cases) {
    sep(`${testCase.id}: ${testCase.label}`);
    console.log(`Q: ${testCase.userMessage}\n`);

    let webResult = { pass: false };
    try {
      webResult = await runWebCase(testCase);
      console.log(webResult.pass ? '\n[web] PASS' : '\n[web] FAIL');
    } catch (err) {
      console.error('[web] ERROR:', err.message);
    }

    let chatResult = { chatPass: true, skipped: true };
    if (!WEB_ONLY && token) {
      try {
        chatResult = await runChatCase(token, testCase);
        chatResult.skipped = false;
        console.log(chatResult.chatPass ? '\n[chat] PASS' : '\n[chat] FAIL');
      } catch (err) {
        console.error('[chat] ERROR:', err.message);
        chatResult = { chatPass: false, skipped: false };
      }
    }

    const overall =
      webResult.pass && (chatResult.skipped || chatResult.chatPass);
    summary.push({
      id: testCase.id,
      web: webResult.pass,
      chat: chatResult.skipped ? 'skip' : chatResult.chatPass,
      overall,
    });
  }

  sep('SUMMARY');
  summary.forEach((s) => {
    console.log(
      `${s.overall ? '✓' : '✗'} ${s.id.padEnd(14)} web=${s.web ? 'ok' : 'FAIL'} chat=${s.chat}`
    );
  });
  const failed = summary.filter((s) => !s.overall);
  console.log(`\n${summary.length - failed.length}/${summary.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
