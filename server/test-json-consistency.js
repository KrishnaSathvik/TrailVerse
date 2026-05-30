/**
 * Test: JSON consistency — planning requests MUST include [ITINERARY_JSON]
 */
const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(new URL(path, 'http://localhost:5001'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'V2-Consistency-Test'
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

const TESTS = [
  {
    name: 'Planning: beginner Zion (conflict)',
    message: 'Plan a 2-day Zion trip for a beginner who wants to hike Angels Landing',
    metadata: { parkCode: 'zion', parkName: 'Zion National Park', lat: 37.2982, lon: -113.0263, formData: { fitnessLevel: 'beginner', numDays: 2 } },
    expectJSON: true
  },
  {
    name: 'Planning: photography Yosemite',
    message: 'Plan a Yosemite trip focused on photography, sunrise and sunset spots, 2 days',
    metadata: { parkCode: 'yose', parkName: 'Yosemite National Park', lat: 37.8651, lon: -119.5383, formData: { numDays: 2, interests: ['photography'] } },
    expectJSON: true
  },
  {
    name: 'Non-planning: simple question',
    message: 'What is the best time to visit Acadia National Park?',
    metadata: { parkCode: 'acad', parkName: 'Acadia National Park', lat: 44.3386, lon: -68.2733 },
    expectJSON: false
  }
];

async function run() {
  const results = [];

  for (const test of TESTS) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(test.name);
    console.log('='.repeat(50));

    try {
      const start = Date.now();
      const r = await post('/api/ai/chat-anonymous', {
        messages: [{ role: 'user', content: test.message }],
        provider: 'claude',
        metadata: test.metadata,
        anonymousId: `json-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (r.error) {
        console.log(`  ERROR: ${r.error} — ${r.details || ''}`);
        results.push({ name: test.name, pass: false });
        continue;
      }

      const d = r.data;
      console.log(`  Response in ${elapsed}s`);
      console.log(`  hasItinerary: ${d.hasItinerary}`);
      console.log(`  planScore: ${d.planScore ? d.planScore.overall + ' (' + d.planScore.label + ')' : 'null'}`);
      console.log(`  intent: ${d.intent}`);
      console.log(`  confidence: ${d.confidence?.level || 'n/a'}`);

      if (test.expectJSON) {
        const pass = d.hasItinerary === true;
        console.log(`  ${pass ? 'PASS' : 'FAIL'} | Expected JSON itinerary: ${pass ? 'present' : 'MISSING'}`);
        if (d.planScore) {
          console.log(`  PASS | planScore: ${JSON.stringify(d.planScore.dimensions)}`);
        }
        results.push({ name: test.name, pass });
      } else {
        const pass = d.hasItinerary === false;
        console.log(`  ${pass ? 'PASS' : 'INFO'} | Expected no JSON: hasItinerary=${d.hasItinerary}`);
        results.push({ name: test.name, pass });
      }

      console.log(`\n  Content preview: ${(d.content || '').substring(0, 300).replace(/\n/g, '\n  ')}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      results.push({ name: test.name, pass: false });
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('SUMMARY');
  console.log('='.repeat(50));
  const passed = results.filter(r => r.pass).length;
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'} | ${r.name}`);
  console.log(`\n  ${passed}/${results.length} passed`);
}

run().catch(e => console.error('Fatal:', e));
