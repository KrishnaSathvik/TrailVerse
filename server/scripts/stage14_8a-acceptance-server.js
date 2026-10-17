'use strict';

/**
 * Stage 14.8A live retest — acceptance backend entrypoint.
 *
 * Deliberately NOT `server.js`. The production entrypoint starts schedulers, a
 * shadow-review worker and an NPS parks warm-up at boot. Those are legitimate
 * production behavior, but in an acceptance run they would fire external
 * requests that have nothing to do with the guest prompt, and the network
 * ledger could no longer answer "did the prompt trigger a live call?".
 *
 * This entrypoint mounts the request path only:
 *   connect to the isolated acceptance Mongo → listen on 5101
 *
 * Nothing else runs, so every recorded outbound attempt is attributable to the
 * request under test.
 *
 * Must be started with `-r ./scripts/stage14_8a-acceptance-bootstrap.js` so the
 * outbound guard and provider ledger are installed before any app module loads.
 */

const mongoose = require('mongoose');

const PORT = Number(process.env.PORT) || 5101;
const MONGODB_URI = process.env.MONGODB_URI;

// Stage 14.8E.2 §7 — the acceptance database may live on any qualified
// LOOPBACK instance (27018 historical, 27019 fresh). The safety property is
// unchanged: a non-loopback target — Atlas above all — still refuses to start.
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(MONGODB_URI || '')) {
  console.error('[stage14_8A] refusing to start: MONGODB_URI is not an isolated loopback acceptance database');
  process.exit(1);
}

for (const forbidden of ['OPENAI_API_KEY', 'NPS_API_KEY', 'OPENWEATHER_API_KEY',
  'BRAVE_SEARCH_API_KEY', 'SERPER_API_KEY', 'TAVILY_API_KEY']) {
  if (process.env[forbidden]) {
    console.error(`[stage14_8A] refusing to start: ${forbidden} is present; this run authorizes Claude only`);
    process.exit(1);
  }
}

const { app, server } = require('../src/app');

// App modules are loaded; anything outbound from here is runtime behavior.
if (typeof global.__stage14_8aEnterRuntimePhase === 'function') {
  global.__stage14_8aEnterRuntimePhase();
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const { host, port, name } = mongoose.connection;
  console.log(`[stage14_8A] mongo connected ${host}:${port}/${name}`);

  const listener = server || app;
  listener.listen(PORT, '127.0.0.1', () => {
    console.log(`[stage14_8A] acceptance backend listening on http://127.0.0.1:${PORT}`);
    console.log('[stage14_8A] READY');
  });
}

main().catch((error) => {
  console.error('[stage14_8A] startup failed:', error.message);
  process.exit(1);
});
