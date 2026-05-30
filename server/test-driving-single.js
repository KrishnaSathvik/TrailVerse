// Single test for driving times verification
const fetch = require('node-fetch');

const BASE = 'http://localhost:5001/api/ai/chat-anonymous';

async function main() {
  // Wait for server to be ready
  for (let i = 0; i < 10; i++) {
    try {
      await fetch('http://localhost:5001/api/ai/providers-anonymous');
      break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\n--- Sending multi-park + city query ---');
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'I am driving from Denver to Yellowstone and Grand Teton. What should I know about the drive?' }]
    })
  });

  const json = await res.json();
  console.log('\n--- AI Response (first 800 chars) ---');
  console.log(json.data?.content?.substring(0, 800) || JSON.stringify(json).substring(0, 800));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
