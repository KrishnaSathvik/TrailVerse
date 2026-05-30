/**
 * Debug: Check if AI response is being truncated (hitting maxTokens)
 * and if the JSON instruction is visible to the AI.
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
        'User-Agent': 'Debug-Test'
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

async function run() {
  console.log('Sending planning request...');
  const r = await post('/api/ai/chat-anonymous', {
    messages: [{ role: 'user', content: 'Plan a 2-day Yosemite trip for photography' }],
    provider: 'claude',
    metadata: {
      parkCode: 'yose', parkName: 'Yosemite National Park',
      lat: 37.8651, lon: -119.5383,
      formData: { numDays: 2, interests: ['photography'] }
    },
    anonymousId: 'debug-json-' + Date.now()
  });

  if (r.error) {
    console.log('ERROR:', r.error, r.details);
    return;
  }

  const d = r.data;
  const content = d.content || '';

  console.log('\n--- RESPONSE ANALYSIS ---');
  console.log('Content length (chars):', content.length);
  console.log('Approx tokens:', Math.round(content.length / 3.5));
  console.log('hasItinerary:', d.hasItinerary);
  console.log('planScore:', d.planScore);
  console.log('intent:', d.intent);
  console.log('');
  console.log('Contains [ITINERARY_JSON]:', content.includes('[ITINERARY_JSON]'));
  console.log('Contains [/ITINERARY_JSON]:', content.includes('[/ITINERARY_JSON]'));
  console.log('');
  console.log('Last 500 chars of response:');
  console.log(content.slice(-500));
  console.log('\n--- END ---');
}

run().catch(e => console.error('Fatal:', e));
