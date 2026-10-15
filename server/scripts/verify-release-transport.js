'use strict';
// Production Next proxy -> full Express stack -> disposable MongoDB.
// Only the model boundary is injected; this does not certify hosted AI latency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.TRAILIE_RUNTIME = 'model_first';
process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';
for (const key of Object.keys(process.env)) if (/API_KEY|MONGODB_URI|BEEHIIV|RESEND|SMTP|MCP_BYPASS_KEY/.test(key)) delete process.env[key];
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const frontend = path.resolve(__dirname, '../../next-frontend');
const manifestPath = path.join(frontend, '.next/routes-manifest.json');
let mongo, server, child, originalManifest, guard;
let cancelMode = false, observedAbort = false;
const answer = { completionStatus: 'completed', outputText: 'Release transport verification.', toolCalls: [], provider: 'openai', model: 'offline-fixture', costStatus: 'priced', costUsd: 0 };
async function main() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  guard = require('../src/eval/bootstrap/outboundNetworkGuard').installOutboundNetworkGuard();
  guard.setPhase('runtime');
  const routes = require('../src/routes/modelFirstTrailie');
  const originalFactory = routes.createModelFirstRouter;
  routes.createModelFirstRouter = () => originalFactory({
    dependencies: () => ({
      model: ({ signal }) => cancelMode ? new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { observedAbort = true; reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })); }, { once: true });
      }) : sleep(200).then(() => answer),
      verifyMemory: require('../tests/helpers/memoryAuthority').stubMemoryVerifier(),
      travelTools: { definitions: [], execute: async () => ({ status: 'fulfilled', evidence: [] }) },
    }),
    // A stalled ledger must not prevent final SSE delivery or EOF.
    recordTurn: () => new Promise(() => {}),
  });
  ({ server } = require('../src/app'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const backendOrigin = `http://127.0.0.1:${server.address().port}`;
  originalManifest = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(originalManifest);
  let changed = 0;
  for (const rules of Object.values(manifest.rewrites)) for (const rule of rules) {
    if (rule.source === '/api/:path*') { rule.destination = backendOrigin + '/api/:path*'; changed++; }
  }
  assert.equal(changed, 1, 'Expected exactly one API proxy rewrite');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const port = 3068;
  const log = fs.openSync('/tmp/trailverse-release-transport-next.log', 'w');
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: frontend, env: process.env, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const res = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) }); await res.arrayBuffer(); break; } catch (err) { if (i === 99) throw err; await sleep(100); }
  }
  const User = require('../src/models/User');
  const TripPlan = require('../src/models/TripPlan');
  const AnonymousSession = require('../src/models/AnonymousSession');
  const owner = await User.create({ name: 'Release fixture', email: 'release-transport@example.com', password: 'offline-fixture-only' });
  const token = require('jsonwebtoken').sign({ id: String(owner._id) }, process.env.JWT_SECRET);
  const mint = require('../src/utils/anonymousIdGenerator').mintGuestSessionId;
  const results = [];
  const publicRoutes = ['/terms', '/privacy', '/features', '/chatgpt', '/mcp', '/testimonials', '/newsletter', '/brand/chatgpt.png', '/dev/trailie-preview'];
  for (const route of publicRoutes) {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, route.startsWith('/dev/') ? 404 : 200, route);
    const body = await response.text();
    if (route === '/terms') assert.ok(!body.includes('Terms Summary'));
    if (route === '/privacy') for (const text of ['AI and public content', 'Your controls']) assert.ok(!body.includes(text));
    if (route === '/chatgpt') assert.ok(body.includes('plugin_asdk_app_69e9c67943c08191a37c464b803ebdbe'));
  }

  for (const version of ['legacy', 'v2']) for (const authenticated of [false, true]) {
    process.env.TRAILIE_TRANSPORT_V2 = version === 'v2' ? 'true' : 'false';
    const endpoint = authenticated ? '/chat-stream' : '/chat-anonymous-stream';
    const headers = { 'Content-Type': 'application/json', ...(version === 'v2' ? { 'x-trailie-transport': 'v2' } : {}), ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(origin + '/api/ai' + endpoint, { method: 'POST', headers, body: JSON.stringify({ message: 'Hello', anonymousId: mint() }), signal: AbortSignal.timeout(15000) });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const text = await res.text(); // Requires EOF, not merely a terminal HTTP status.
    const events = text.split('\n\n').filter(s => s.startsWith('data: ')).map(s => JSON.parse(s.slice(6)));
    const finals = events.filter(e => e.type === (version === 'v2' ? 'response_finalized' : 'done'));
    assert.equal(finals.length, 1, text);
    assert.equal(finals[0].persisted, true);
    assert.equal(finals[0].content, answer.outputText);
    assert.ok(finals[0].responseId && finals[0].contentHash);
    const saved = authenticated ? await TripPlan.findById(finals[0].tripId).lean() : await AnonymousSession.findOne({ anonymousId: finals[0].anonymousId }).lean();
    assert.equal((saved.conversation || saved.messages).at(-1).contentHash, finals[0].contentHash);
    results.push({ version, endpoint, finalCount: 1, eof: true, persisted: true });
    const beforeTrips = await TripPlan.countDocuments();
    const anonymousId = mint();
    cancelMode = true; observedAbort = false;
    const controller = new AbortController();
    const pending = await fetch(origin + '/api/ai' + endpoint, { method: 'POST', headers, body: JSON.stringify({ message: 'Cancellation fixture', anonymousId }), signal: controller.signal });
    await pending.body.getReader().read();
    await sleep(300); // Ensure the request reached the injected provider.
    controller.abort();
    for (let i = 0; i < 100 && !observedAbort; i++) await sleep(50);
    assert.equal(observedAbort, true, 'Next proxy must propagate cancellation to provider');
    await sleep(200);
    assert.equal(await TripPlan.countDocuments(), beforeTrips);
    const session = await AnonymousSession.findOne({ anonymousId }).lean();
    if (session) assert.equal(session.completedTurnCount || 0, 0);
    results.push({ version, endpoint, cancellationPropagated: true, noCanonicalCommit: true });
    cancelMode = false;
  }
  console.log('RELEASE_TRANSPORT_RESULT ' + JSON.stringify({ publicRouteChecks: publicRoutes.length, results, network: guard.summary() }));
}
main().then(() => cleanup(0), err => { console.error(err); cleanup(1); });
async function cleanup(code) {
  if (child) { child.kill('SIGTERM'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3000)]); }
  if (originalManifest !== undefined) fs.writeFileSync(manifestPath, originalManifest);
  guard?.uninstall();
  server?.closeAllConnections(); server?.close();
  await mongoose.disconnect(); await mongo?.stop();
  process.exit(code);
}
