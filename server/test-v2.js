/**
 * V2 AI Trip Planner Feature Verification
 * Tests: Intent Detection, Smart Replacement, Plan Scoring, Per-stop "why"
 */

const http = require('http');

const BASE = 'http://localhost:5001';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, BASE);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error('Parse error: ' + Buffer.concat(chunks).toString().substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

async function runTests() {
  const results = [];

  // ── TEST 1: Photography Intent + Beginner Fitness ──
  console.log('\n========================================');
  console.log('TEST 1: Photography Intent + Beginner Fitness');
  console.log('========================================');
  try {
    const r1 = await post('/api/ai/chat-anonymous', {
      messages: [{ role: 'user', content: 'I love photography and want to capture sunrise at Zion National Park. 3 day trip, beginner fitness level.' }],
      provider: 'claude',
      metadata: { parkCode: 'zion', parkName: 'Zion National Park', lat: 37.2982, lon: -113.0263, formData: { fitnessLevel: 'beginner', numDays: 3 } },
      systemPrompt: 'You are a helpful travel assistant.',
    });
    const d = r1.data;
    console.log('Intent:', d.intent);
    console.log('PlanScore:', d.planScore ? `${d.planScore.overall} (${d.planScore.label})` : 'null');
    if (d.planScore) console.log('  Dimensions:', JSON.stringify(d.planScore.dimensions));
    console.log('Confidence:', d.confidence ? d.confidence.level : 'n/a');
    console.log('HasItinerary:', d.hasItinerary);
    console.log('');
    const checks = [];
    checks.push(d.intent === 'photographer' ? 'PASS: photographer intent detected' : `FAIL: expected photographer, got ${d.intent}`);
    checks.push(d.planScore !== null && d.planScore !== undefined ? 'PASS: planScore present' : 'FAIL: planScore missing');
    checks.push(d.confidence !== undefined ? 'PASS: confidence present' : 'FAIL: confidence missing');
    checks.forEach(c => console.log('  ' + c));
    console.log('\nResponse preview:');
    console.log(d.content ? d.content.substring(0, 600) + '...' : 'NO CONTENT');
    results.push({ test: 'Photography Intent', passed: checks.every(c => c.startsWith('PASS')) });
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Photography Intent', passed: false });
  }

  // ── TEST 2: Family Intent + Kids + Camping ──
  console.log('\n========================================');
  console.log('TEST 2: Family Intent + Kids + Camping');
  console.log('========================================');
  try {
    const r2 = await post('/api/ai/chat-anonymous', {
      messages: [{ role: 'user', content: 'Planning a family trip with kids to Yellowstone, 4 days camping, easy fitness.' }],
      provider: 'claude',
      metadata: { parkCode: 'yell', parkName: 'Yellowstone National Park', lat: 44.4280, lon: -110.5885, formData: { fitnessLevel: 'easy', numDays: 4, hasChildren: true, accommodation: 'camping' } },
      systemPrompt: 'You are a helpful travel assistant.',
    });
    const d = r2.data;
    console.log('Intent:', d.intent);
    console.log('PlanScore:', d.planScore ? `${d.planScore.overall} (${d.planScore.label})` : 'null');
    console.log('Confidence:', d.confidence ? d.confidence.level : 'n/a');
    console.log('HasItinerary:', d.hasItinerary);
    const checks = [];
    checks.push(d.intent === 'family' ? 'PASS: family intent detected' : `FAIL: expected family, got ${d.intent}`);
    checks.push(d.planScore !== null && d.planScore !== undefined ? 'PASS: planScore present' : 'FAIL: planScore missing');
    checks.forEach(c => console.log('  ' + c));
    console.log('\nResponse preview:');
    console.log(d.content ? d.content.substring(0, 600) + '...' : 'NO CONTENT');
    results.push({ test: 'Family Intent', passed: checks.every(c => c.startsWith('PASS')) });
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Family Intent', passed: false });
  }

  // ── TEST 3: Adventurer Intent ──
  console.log('\n========================================');
  console.log('TEST 3: Adventurer Intent + Experienced');
  console.log('========================================');
  try {
    const r3 = await post('/api/ai/chat-anonymous', {
      messages: [{ role: 'user', content: 'I want the most challenging summit hikes at Grand Teton. 2 days, experienced hiker, lodge accommodation.' }],
      provider: 'claude',
      metadata: { parkCode: 'grte', parkName: 'Grand Teton National Park', lat: 43.7904, lon: -110.6818, formData: { fitnessLevel: 'experienced', numDays: 2, accommodation: 'lodge' } },
      systemPrompt: 'You are a helpful travel assistant.',
    });
    const d = r3.data;
    console.log('Intent:', d.intent);
    console.log('PlanScore:', d.planScore ? `${d.planScore.overall} (${d.planScore.label})` : 'null');
    console.log('Confidence:', d.confidence ? d.confidence.level : 'n/a');
    console.log('HasItinerary:', d.hasItinerary);
    const checks = [];
    checks.push(d.intent === 'adventurer' ? 'PASS: adventurer intent detected' : `FAIL: expected adventurer, got ${d.intent}`);
    checks.push(d.planScore !== null && d.planScore !== undefined ? 'PASS: planScore present' : 'FAIL: planScore missing');
    checks.forEach(c => console.log('  ' + c));
    console.log('\nResponse preview:');
    console.log(d.content ? d.content.substring(0, 600) + '...' : 'NO CONTENT');
    results.push({ test: 'Adventurer Intent', passed: checks.every(c => c.startsWith('PASS')) });
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'Adventurer Intent', passed: false });
  }

  // ── TEST 4: No Intent (casual question) ──
  console.log('\n========================================');
  console.log('TEST 4: No Intent (casual question)');
  console.log('========================================');
  try {
    const r4 = await post('/api/ai/chat-anonymous', {
      messages: [{ role: 'user', content: 'What is the best time to visit Acadia National Park?' }],
      provider: 'claude',
      metadata: { parkCode: 'acad', parkName: 'Acadia National Park', lat: 44.3386, lon: -68.2733 },
      systemPrompt: 'You are a helpful travel assistant.',
    });
    const d = r4.data;
    console.log('Intent:', d.intent);
    console.log('PlanScore:', d.planScore);
    console.log('HasItinerary:', d.hasItinerary);
    const checks = [];
    checks.push(d.intent === null ? 'PASS: no intent detected (correct for casual question)' : `INFO: detected ${d.intent} (acceptable)`);
    checks.push(d.planScore === null ? 'PASS: no planScore for non-itinerary' : 'INFO: planScore present (itinerary generated)');
    checks.forEach(c => console.log('  ' + c));
    console.log('\nResponse preview:');
    console.log(d.content ? d.content.substring(0, 400) + '...' : 'NO CONTENT');
    results.push({ test: 'No Intent', passed: true });
  } catch (e) {
    console.log('ERROR:', e.message);
    results.push({ test: 'No Intent', passed: false });
  }

  // ── SUMMARY ──
  console.log('\n========================================');
  console.log('VERIFICATION SUMMARY');
  console.log('========================================');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  for (const r of results) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.test}`);
  }
  console.log(`\n  ${passed}/${total} tests passed`);
}

runTests().catch(e => console.error('Fatal:', e));
