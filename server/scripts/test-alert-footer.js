#!/usr/bin/env node
/**
 * Smoke-test chat-anonymous responses for the NPS alert footer block.
 * Usage:
 *   node scripts/test-alert-footer.js [baseUrl]
 *   node scripts/test-alert-footer.js --only parking_shuttle,camping_only
 *   node scripts/test-alert-footer.js parking_shuttle camping_only
 */
require('dotenv').config();

function parseCli() {
  const args = process.argv.slice(2);
  let baseUrl = 'http://127.0.0.1:5001/api';
  let onlyNames = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--only' && args[i + 1]) {
      onlyNames = args[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (arg.startsWith('http')) {
      baseUrl = arg.replace(/\/$/, '');
      if (!baseUrl.endsWith('/api')) baseUrl = `${baseUrl}/api`;
    } else if (!arg.startsWith('--')) {
      onlyNames = onlyNames || [];
      onlyNames.push(arg);
    }
  }

  return { baseUrl, onlyNames };
}

const { baseUrl: BASE, onlyNames: ONLY_NAMES } = parseCli();

const FOOTER_MARKERS = [
  { id: 'not_addressed', pattern: /not addressed above/i },
  { id: 'important_block', pattern: /Important\s*[—-]\s*the following/i },
  { id: 'safety_cautions_label', pattern: /\*\*Safety cautions:\*\*/i },
];

const OTHER_SUFFIXES = [
  { id: 'web_search_upsell', pattern: /Want live prices and ratings/i },
  { id: 'itinerary_prompt', pattern: /specify a destination you're planning/i },
];

const CASES = [
  {
    name: 'compare_zion_bryce',
    message: 'Compare Zion and Bryce Canyon for beginners — which should I visit first?',
    expectFooter: false,
  },
  {
    name: 'compare_yell_yose',
    message: 'Yellowstone vs Yosemite for a family with kids in July — which is better?',
    expectFooter: false,
  },
  {
    name: 'single_park_trails',
    message: 'What are the best easy hikes in Acadia National Park for a first visit?',
    expectFooter: false,
  },
  {
    name: 'lodging_dining',
    message: 'Where should we eat and stay near Zion National Park for a long weekend?',
    expectFooter: false,
  },
  {
    name: 'trip_plan',
    message: 'Plan a 4-day trip to Grand Canyon National Park in October for two moderate hikers.',
    expectFooter: false,
  },
  {
    name: 'weather_alerts',
    message: 'What is the current weather and any alerts at Yellowstone National Park?',
    expectFooter: false,
  },
  {
    name: 'specific_trail',
    message: 'Is the Narrows hike open at Zion National Park right now?',
    expectFooter: false,
  },
  {
    name: 'road_trip_multi',
    message: 'Road trip: Zion, Bryce, and Capitol Reef in 5 days — what order and how many nights each?',
    expectFooter: false,
  },
  {
    name: 'general_best_parks',
    message: 'What are the best national parks for stargazing in the Southwest?',
    expectFooter: false,
  },
  // Additional question shapes (beyond the original 9)
  {
    name: 'parking_shuttle',
    message: 'Where should I park for the Zion Canyon shuttle in summer?',
    expectFooter: false,
  },
  {
    name: 'camping_only',
    message: 'What are the best front-country campgrounds in Yosemite for a family?',
    expectFooter: false,
  },
  {
    name: 'seasonal_when',
    message: 'What is the best month to visit Glacier National Park for hiking?',
    expectFooter: false,
  },
  {
    name: 'directions_drive',
    message: 'How long is the drive from Las Vegas to Zion National Park?',
    expectFooter: false,
  },
  {
    name: 'photography',
    message: 'Best sunrise photography spots in Arches National Park?',
    expectFooter: false,
  },
  {
    name: 'fees_pass',
    message: 'Do I need a timed entry or park pass for Rocky Mountain National Park in July?',
    expectFooter: false,
  },
  {
    name: 'multi_park_list',
    message: 'Give me a quick overview of Zion, Bryce Canyon, and Capitol Reef for a first-time visitor.',
    expectFooter: false,
  },
  {
    name: 'wildlife_safety',
    message: 'How close can I get to bison in Yellowstone and what safety rules should I follow?',
    expectFooter: false,
  },
  {
    name: 'permit_explicit',
    message: 'Do I need a permit or lottery for Angels Landing at Zion?',
    expectFooter: false,
  },
  {
    name: 'accessibility',
    message: 'Wheelchair-accessible trails and viewpoints at Grand Canyon South Rim?',
    expectFooter: false,
  },
  {
    name: 'fire_smoke',
    message: 'Any wildfire, smoke, or air quality issues affecting Yosemite National Park right now?',
    expectFooter: false,
  },
  {
    name: 'events_programs',
    message: 'What ranger-led programs or events are happening at Yellowstone in August?',
    expectFooter: false,
  },
];

function checkContent(content) {
  const hits = {};
  for (const m of FOOTER_MARKERS) {
    hits[m.id] = m.pattern.test(content);
  }
  for (const m of OTHER_SUFFIXES) {
    hits[m.id] = m.pattern.test(content);
  }
  const hasAlertFooter =
    hits.not_addressed || hits.important_block || hits.safety_cautions_label;
  return { hits, hasAlertFooter };
}

async function runCase(testCase) {
  const started = Date.now();
  const res = await fetch(`${BASE}/ai/chat-anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'auto',
      temperature: 0.4,
      maxTokens: 8000,
      anonymousId: `test-footer-${testCase.name}-${Date.now()}`,
      messages: [{ role: 'user', content: testCase.message }],
      metadata: {},
    }),
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return {
      ...testCase,
      ok: false,
      error: `Non-JSON HTTP ${res.status} (${elapsed}s)`,
      snippet: raw.slice(0, 200),
    };
  }

  const content = json?.data?.content || '';
  const isRateLimited =
    json?.data?.isConversionMessage ||
    /sign in|create an account|message limit/i.test(content);
  const { hits, hasAlertFooter } = checkContent(content);
  const footerOk = isRateLimited
    ? true
    : testCase.expectFooter
      ? hasAlertFooter
      : !hasAlertFooter;

  return {
    name: testCase.name,
    http: res.status,
    elapsed,
    chars: content.length,
    hasLiveData: json?.data?.hasLiveData,
    parkName: json?.data?.parkName,
    hits,
    hasAlertFooter,
    isRateLimited,
    expectFooter: testCase.expectFooter,
    footerOk,
    tail: content.slice(-280).replace(/\n/g, ' '),
  };
}

async function main() {
  const casesToRun = ONLY_NAMES?.length
    ? CASES.filter((c) => ONLY_NAMES.includes(c.name))
    : CASES;

  if (ONLY_NAMES?.length && casesToRun.length === 0) {
    console.error(`No matching cases for: ${ONLY_NAMES.join(', ')}`);
    console.error(`Known: ${CASES.map((c) => c.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`Testing ${casesToRun.length} prompt(s) against ${BASE}/ai/chat-anonymous\n`);

  const results = [];
  for (const c of casesToRun) {
    process.stdout.write(`… ${c.name} `);
    try {
      const r = await runCase(c);
      results.push(r);
      console.log(r.footerOk ? '✓' : '✗', `(${r.elapsed}s, ${r.chars} chars, footer=${r.hasAlertFooter})`);
    } catch (err) {
      results.push({ name: c.name, ok: false, error: err.message, footerOk: false });
      console.log('✗', err.message);
    }
  }

  console.log('\n--- Summary ---\n');
  const failed = results.filter((r) => !r.footerOk);
  for (const r of results) {
    const status = r.footerOk ? 'PASS' : 'FAIL';
    console.log(`${status}  ${r.name}  HTTP ${r.http || '?'}  ${r.elapsed || '?'}s  footer=${r.hasAlertFooter}`);
    if (r.hasAlertFooter && r.tail) {
      console.log(`       tail: …${r.tail}`);
    }
    if (r.hits) {
      const extras = Object.entries(r.hits)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (extras.length) console.log(`       markers: ${extras.join(', ')}`);
    }
    if (r.error) console.log(`       error: ${r.error}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} passed (no unwanted alert footer)`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
