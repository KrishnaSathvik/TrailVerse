/**
 * V2 Playbook Tests — validates smart replacement, conflicts, scenario mode,
 * intent detection, plan scoring, and edge cases against live server.
 */
const http = require('http');
const BASE = 'http://localhost:5001';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, BASE);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) V2-Playbook-Test'
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error('Parse error: ' + Buffer.concat(chunks).toString().substring(0, 300)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('Timeout 180s')); });
    req.write(data);
    req.end();
  });
}

const TESTS = [
  {
    name: 'TEST 1: Smart Replacement (beginner + Angels Landing)',
    body: {
      messages: [{ role: 'user', content: 'Plan a 2-day Zion trip for a beginner who wants to hike Angels Landing' }],
      provider: 'claude',
      metadata: {
        parkCode: 'zion', parkName: 'Zion National Park',
        lat: 37.2982, lon: -113.0263,
        formData: { fitnessLevel: 'beginner', numDays: 2 }
      }
    },
    check(d) {
      const checks = [];
      checks.push({ name: 'Intent detected', pass: d.intent !== null, detail: `intent=${d.intent}` });
      checks.push({ name: 'Has content', pass: !!d.content, detail: d.content ? `${d.content.length} chars` : 'empty' });
      // If itinerary was generated, verify replacement logic
      if (d.hasItinerary) {
        checks.push({ name: 'Has itinerary', pass: true, detail: 'itinerary generated' });
        checks.push({ name: 'planScore present', pass: d.planScore !== null, detail: JSON.stringify(d.planScore) });
        checks.push({ name: 'confidence present', pass: d.confidence !== undefined, detail: `confidence=${d.confidence?.level}` });
      } else {
        checks.push({ name: 'Has itinerary', pass: false, detail: 'AI chose text-only response (no [ITINERARY_JSON] block)' });
      }
      return checks;
    }
  },
  {
    name: 'TEST 3: Conflict Resolution (beginner + challenging)',
    body: {
      messages: [{ role: 'user', content: "I'm a beginner but I want the most challenging hikes in Glacier National Park" }],
      provider: 'claude',
      metadata: {
        parkCode: 'glac', parkName: 'Glacier National Park',
        lat: 48.7596, lon: -113.787,
        formData: { fitnessLevel: 'beginner', numDays: 2 }
      }
    },
    check(d) {
      const checks = [];
      const content = (d.content || '').toLowerCase();
      checks.push({ name: 'Has content', pass: !!d.content, detail: `${(d.content || '').length} chars` });
      // Should detect conflict and present options or address fitness mismatch
      const hasOptions = content.includes('option') || content.includes('alternative') || content.includes('instead') || content.includes('beginner');
      checks.push({ name: 'Addresses beginner constraint', pass: hasOptions, detail: hasOptions ? 'mentions beginner/alternatives' : 'no constraint acknowledgment' });
      checks.push({ name: 'Intent detected', pass: d.intent !== null, detail: `intent=${d.intent}` });
      return checks;
    }
  },
  {
    name: 'TEST 4: Scenario Mode (canyon trails closed)',
    body: {
      messages: [{ role: 'user', content: 'Plan a 2-day Zion trip assuming all canyon trails are closed' }],
      provider: 'claude',
      metadata: {
        parkCode: 'zion', parkName: 'Zion National Park',
        lat: 37.2982, lon: -113.0263,
        formData: { numDays: 2 }
      }
    },
    check(d) {
      const checks = [];
      const content = (d.content || '').toLowerCase();
      checks.push({ name: 'Has content', pass: !!d.content, detail: `${(d.content || '').length} chars` });
      const noNarrows = !content.includes('narrows') || content.includes('closed');
      checks.push({ name: 'No Narrows (or mentioned as closed)', pass: noNarrows, detail: noNarrows ? 'correct' : 'Narrows suggested despite closure' });
      const hasViewpoints = content.includes('viewpoint') || content.includes('overlook') || content.includes('scenic') || content.includes('canyon overlook');
      checks.push({ name: 'Suggests viewpoints/scenic alternatives', pass: hasViewpoints, detail: hasViewpoints ? 'has alternatives' : 'no alternative suggestions' });
      return checks;
    }
  },
  {
    name: 'TEST 5: Intent-Aware (photography)',
    body: {
      messages: [{ role: 'user', content: 'Plan a Yosemite trip focused on photography, I want to capture the best sunrise and sunset spots' }],
      provider: 'claude',
      metadata: {
        parkCode: 'yose', parkName: 'Yosemite National Park',
        lat: 37.8651, lon: -119.5383,
        formData: { numDays: 2, interests: ['photography'] }
      }
    },
    check(d) {
      const checks = [];
      const content = (d.content || '').toLowerCase();
      checks.push({ name: 'Photographer intent', pass: d.intent === 'photographer', detail: `intent=${d.intent}` });
      const hasPhotoContent = content.includes('sunrise') || content.includes('sunset') || content.includes('golden hour') || content.includes('tunnel view') || content.includes('glacier point');
      checks.push({ name: 'Photography-specific content', pass: hasPhotoContent, detail: hasPhotoContent ? 'has photo spots/timing' : 'generic itinerary' });
      checks.push({ name: 'Has content', pass: !!d.content, detail: `${(d.content || '').length} chars` });
      return checks;
    }
  },
  {
    name: 'TEST 7: Edge Case (all national parks in 2 days)',
    body: {
      messages: [{ role: 'user', content: 'Plan a 2-day trip to all national parks in the US' }],
      provider: 'claude',
      metadata: {
        formData: { numDays: 2 }
      }
    },
    check(d) {
      const checks = [];
      const content = (d.content || '').toLowerCase();
      checks.push({ name: 'Has content', pass: !!d.content, detail: `${(d.content || '').length} chars` });
      const rejectsOrCorrects = content.includes('realistic') || content.includes('impossible') || content.includes('not feasible') || content.includes('too many') || content.includes('focus') || content.includes('narrow') || content.includes('choose') || content.includes('select') || content.includes('one park') || content.includes('few parks');
      checks.push({ name: 'Rejects or corrects scope', pass: rejectsOrCorrects, detail: rejectsOrCorrects ? 'suggests realistic scope' : 'may have attempted nonsense plan' });
      return checks;
    }
  }
];

async function runAll() {
  const summary = [];

  for (const test of TESTS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(test.name);
    console.log('='.repeat(60));

    try {
      const startMs = Date.now();
      const r = await post('/api/ai/chat-anonymous', {
        ...test.body,
        anonymousId: `test-playbook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      });
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      if (r.error) {
        console.log(`  SERVER ERROR: ${r.error} — ${r.details || ''}`);
        summary.push({ test: test.name, passed: false, elapsed });
        continue;
      }
      const d = r.data;

      console.log(`  Response in ${elapsed}s`);
      console.log(`  intent=${d.intent} | hasItinerary=${d.hasItinerary} | planScore=${d.planScore ? d.planScore.overall + ' (' + d.planScore.label + ')' : 'null'}`);
      console.log(`  confidence=${d.confidence?.level || 'n/a'}`);

      const checks = test.check(d);
      let allPass = true;
      for (const c of checks) {
        console.log(`  ${c.pass ? 'PASS' : 'FAIL'} | ${c.name}: ${c.detail}`);
        if (!c.pass) allPass = false;
      }

      // Show content preview
      console.log(`\n  --- Content Preview (first 500 chars) ---`);
      console.log(`  ${(d.content || 'NO CONTENT').substring(0, 500).replace(/\n/g, '\n  ')}`);

      summary.push({ test: test.name, passed: allPass, elapsed });
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      summary.push({ test: test.name, passed: false, elapsed: 'err' });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('PLAYBOOK SUMMARY');
  console.log('='.repeat(60));
  const passed = summary.filter(s => s.passed).length;
  for (const s of summary) {
    console.log(`  ${s.passed ? 'PASS' : 'FAIL'} | ${s.test} (${s.elapsed}s)`);
  }
  console.log(`\n  ${passed}/${summary.length} tests passed`);
}

runAll().catch(e => console.error('Fatal:', e));
