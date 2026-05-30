const http = require('http');
const data = JSON.stringify({
  messages: [{ role: 'user', content: 'What is the best time to visit Acadia?' }],
  provider: 'claude',
  metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
  anonymousId: 'debug-' + Date.now()
});
const req = http.request('http://localhost:5001/api/ai/chat-anonymous', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
}, (res) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    console.log('STATUS:', res.statusCode);
    console.log('FULL RESPONSE:', JSON.stringify(body, null, 2).substring(0, 1000));
    console.log('TOP-LEVEL KEYS:', Object.keys(body));
    if (body.data) {
      console.log('.data KEYS:', Object.keys(body.data));
      console.log('intent:', body.data.intent);
    } else {
      console.log('No .data wrapper — response is flat');
      console.log('intent:', body.intent);
      console.log('content preview:', (body.content || '').substring(0, 100));
    }
  });
});
req.setTimeout(120000, () => { req.destroy(); });
req.write(data);
req.end();
