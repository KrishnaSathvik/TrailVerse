/**
 * Test script: verifies the AI data pipeline produces correct output.
 * Tests park extraction, NPS data, weather, constraint engine, and prompt assembly.
 * Run: node test-pipeline.js
 */
require('dotenv').config();

const { extractAllParksFromMessage } = require('./src/utils/parkExtractor');
const { parseConstraints, preflightCheck, buildConstraintBlock } = require('./src/utils/constraintEngine');

// ─── Test 1: Park extraction ───
console.log('\n═══ TEST 1: Park Extraction ═══');
const tests = [
  'Plan a trip to Yosemite',
  'Compare Zion and Grand Canyon',
  'Tell me about Rocky Mountain National Park',
  'What about Angels Landing at Zion?',
  'Trip to Dry Tortugas from Miami',
  'Wrangell St Elias in summer',
];
for (const msg of tests) {
  const parks = extractAllParksFromMessage(msg);
  const codes = parks.map(p => `${p.parkName}(${p.parkCode})`).join(', ');
  console.log(`  "${msg}" → ${codes || 'NO MATCH'}`);
}

// ─── Test 2: Constraint engine — verify no stale PERMIT_PARKS warnings ───
console.log('\n═══ TEST 2: Constraint Engine (no stale permits) ═══');
const parkCodes = ['yose', 'zion', 'arch', 'glac', 'romo', 'shen', 'mora'];
for (const code of parkCodes) {
  const constraints = parseConstraints({}, `Plan a 3-day trip to ${code}`);
  const result = preflightCheck(constraints, code);
  const permitWarnings = result.warnings.filter(w => /permit|timed|reservation required/i.test(w));
  if (permitWarnings.length > 0) {
    console.log(`  ❌ ${code}: STALE PERMIT WARNING → ${permitWarnings.join('; ')}`);
  } else {
    console.log(`  ✅ ${code}: No hardcoded permit warnings`);
  }
}

// ─── Test 3: Live NPS data fetch ───
console.log('\n═══ TEST 3: Live NPS Data ═══');
const { fetchNPSFacts } = require('./src/services/factsService');

async function testNPS() {
  for (const code of ['yose', 'zion', 'grca']) {
    try {
      const facts = await fetchNPSFacts({ parkCode: code });
      if (!facts) {
        console.log(`  ⚠️  ${code}: NPS returned null (API key issue?)`);
        continue;
      }
      // Check for key sections
      const hasAlerts = facts.includes('Closures') || facts.includes('Cautions') || facts.includes('Alert') || facts.includes('None reported');
      const hasFees = facts.includes('Entrance Fees');
      const hasPermits = facts.includes('Permits');
      const hasCampgrounds = facts.includes('Campground');

      console.log(`  ${code}:`);
      console.log(`    Alerts: ${hasAlerts ? '✅' : '❌'} | Fees: ${hasFees ? '✅' : '❌'} | Permits: ${hasPermits ? '✅' : '❌'} | Campgrounds: ${hasCampgrounds ? '✅' : '❌'}`);

      // Check if Yosemite has timed-entry in live data (it shouldn't)
      if (code === 'yose') {
        const hasTimedEntry = /timed.?entry/i.test(facts);
        console.log(`    Timed-entry mentioned: ${hasTimedEntry ? '⚠️  YES (check if legit)' : '✅ No (correct)'}`);
      }

      // Show permits section
      const permitMatch = facts.match(/Permits.*?(?=\n\n|$)/s);
      if (permitMatch) {
        console.log(`    Permits data: ${permitMatch[0].substring(0, 200)}`);
      }
    } catch (err) {
      console.log(`  ❌ ${code}: ${err.message}`);
    }
  }
}

// ─── Test 4: Weather fetch ───
console.log('\n═══ TEST 4: Weather Data ═══');
const { fetchWeatherFacts } = require('./src/services/factsService');

async function testWeather() {
  const locations = [
    { name: 'Yosemite', lat: 37.865, lon: -119.538 },
    { name: 'Zion', lat: 37.298, lon: -113.026 },
  ];
  for (const loc of locations) {
    try {
      const weather = await fetchWeatherFacts({ lat: loc.lat, lon: loc.lon });
      if (weather) {
        console.log(`  ✅ ${loc.name}: ${weather.substring(0, 150)}...`);
      } else {
        console.log(`  ⚠️  ${loc.name}: Weather returned null (API key: ${process.env.OPENWEATHER_API_KEY ? 'SET' : 'MISSING'})`);
      }
    } catch (err) {
      console.log(`  ❌ ${loc.name}: ${err.message}`);
    }
  }
}

// ─── Test 5: System prompt assembly check ───
console.log('\n═══ TEST 5: System Prompt Content Check ═══');
const claudeService = require('./src/services/claudeService');
const openaiService = require('./src/services/openaiService');

function checkPrompt(name, prompt) {
  const issues = [];

  // Check for stale permit data
  if (/Timed-entry|Vehicle res|Shuttle \+|Jenny Lake|Sunrise res/i.test(prompt.match(/CROWD SCORES[\s\S]*?HOW TO USE/)?.[0] || '')) {
    issues.push('Crowd table still has permit column data');
  }

  // Check for hardcoded road closure dates
  if (/closed November through late June/.test(prompt)) {
    issues.push('Hardcoded GTTS closure dates');
  }
  if (/Tioga Pass closed Nov/.test(prompt)) {
    issues.push('Hardcoded Tioga closure dates');
  }

  // Check for wrong year references
  if (/2025 NPS Data/.test(prompt)) {
    issues.push('Still says "2025 NPS Data"');
  }

  // Check Angels Landing permit
  const alMatch = prompt.match(/"permitRequired":\s*(true|false)/);
  if (alMatch && alMatch[1] === 'false') {
    issues.push('Angels Landing permitRequired still false');
  }

  // Check for old-style cost examples
  if (/"\$35 per vehicle"/.test(prompt)) {
    issues.push('Hardcoded $35 entrance fee example');
  }

  // Check live data override instruction exists
  const hasOverride = /OVERRIDES your training data/.test(prompt);
  const hasLiveDataRef = /ONLY use the live NPS data/.test(prompt);

  if (issues.length === 0) {
    console.log(`  ✅ ${name}: Clean — no stale hardcoded data found`);
  } else {
    for (const issue of issues) {
      console.log(`  ❌ ${name}: ${issue}`);
    }
  }
  console.log(`    Live-data-override instruction: ${hasOverride ? '✅' : '❌'}`);
  console.log(`    Permit-from-live-data instruction: ${hasLiveDataRef ? '✅' : '❌'}`);
}

checkPrompt('Claude prompt', claudeService.defaultSystemPrompt);
checkPrompt('OpenAI prompt', openaiService.systemPrompt);

// ─── Test 6: Enhanced Park Service (park codes + holidays) ───
console.log('\n═══ TEST 6: Enhanced Park Service ═══');
try {
  const EnhancedParkService = require('./src/services/enhancedParkService');
  const svc = new EnhancedParkService();

  // Test park codes
  const codeTests = [
    ['romo', 'Rocky Mountain'],
    ['drto', 'Dry Tortugas'],
    ['wrst', 'Wrangell-St. Elias'],
    ['sequ', 'Sequoia'],
  ];
  for (const [code, name] of codeTests) {
    const months = svc.getBestTimeToVisit?.(code) || 'method not found';
    console.log(`  ${code} (${name}): ${Array.isArray(months) ? months.join(', ') : months}`);
  }

  // Test holidays
  const holidayTests = [
    [new Date(2026, 0, 19), 'MLK Day 2026 (3rd Mon Jan)', true],
    [new Date(2026, 0, 17), 'Jan 17 2026 (NOT MLK)', false],
    [new Date(2026, 4, 25), 'Memorial Day 2026 (last Mon May)', true],
    [new Date(2026, 8, 7), 'Labor Day 2026 (1st Mon Sep)', true],
    [new Date(2026, 10, 26), 'Thanksgiving 2026 (4th Thu Nov)', true],
    [new Date(2026, 10, 22), 'Nov 22 2026 (NOT Thanksgiving)', false],
  ];
  console.log('\n  Holiday detection:');
  for (const [date, label, expected] of holidayTests) {
    const result = svc.isHoliday(date);
    const ok = result === expected;
    console.log(`    ${ok ? '✅' : '❌'} ${label}: ${result} (expected ${expected})`);
  }
} catch (err) {
  console.log(`  ⚠️  Could not load EnhancedParkService: ${err.message}`);
}

// ─── Run async tests ───
async function runAll() {
  await testNPS();
  await testWeather();
  console.log('\n═══ ALL TESTS COMPLETE ═══\n');
}

runAll().catch(err => console.error('Fatal:', err));
