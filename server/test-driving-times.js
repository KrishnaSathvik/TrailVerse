// Quick test for driving times feature
const fetch = require('node-fetch');

const BASE = 'http://localhost:5001/api/ai/chat-anonymous';

async function testQuery(label, message) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`Query: "${message}"`);
  console.log('='.repeat(60));

  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }]
      })
    });

    const json = await res.json();
    if (json.data && json.data.content) {
      console.log(`Provider: ${json.data.provider}`);
      console.log(`Response (first 600 chars):\n${json.data.content.substring(0, 600)}`);
    } else {
      console.log('Response:', JSON.stringify(json).substring(0, 500));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function main() {
  // Test 1: Multi-park + city (should trigger driving times)
  await testQuery(
    'Multi-park + starting city',
    'I am driving from Denver to Yellowstone and Grand Teton. What should I know about the drive?'
  );

  // Test 2: Two parks, no city (should trigger driving times between parks)
  await testQuery(
    'Two parks, no city',
    'Compare Arches and Canyonlands for a day trip'
  );

  // Test 3: Single park, no city (should NOT trigger driving times)
  await testQuery(
    'Single park only (no driving context expected)',
    'Tell me about Zion National Park'
  );
}

main().catch(console.error);
