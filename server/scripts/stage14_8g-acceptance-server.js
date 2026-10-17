'use strict';

/**
 * Stage 14.8G — authenticated login/session acceptance backend entrypoint.
 *
 * Deliberately NOT `server.js`, for the same reason as Stage 14.8A: the
 * production entrypoint starts schedulers, a shadow-review worker and an NPS
 * warm-up at boot, and those would fire external requests unrelated to the
 * behaviour under test, so the network ledger could no longer attribute an
 * attempt to the request.
 *
 * This entrypoint mounts the request path only:
 *   connect to the isolated auth acceptance Mongo → listen on 5101
 *
 * Must be started with `-r ./scripts/stage14_8g-auth-bootstrap.js`.
 */

const mongoose = require('mongoose');

const PORT = Number(process.env.PORT) || 5101;
const MONGODB_URI = process.env.MONGODB_URI;

// Loopback-only, as in every stage since 14.8A: a non-loopback target — Atlas
// above all — refuses to start rather than being merely discouraged.
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(MONGODB_URI || '')) {
  console.error('[stage14_8G] refusing to start: MONGODB_URI is not an isolated loopback acceptance database');
  process.exit(1);
}

// §2/§3 — real authentication requires the real signing contract. Without it
// login would appear to work against a fixture rather than the production
// mechanism, so absence is a hard stop.
if (!process.env.JWT_SECRET) {
  console.error('[stage14_8G] refusing to start: JWT_SECRET absent, the real auth contract cannot be exercised');
  process.exit(1);
}

// §5 — nothing outside the auth path is authorized. RESEND_API_KEY is included:
// its absence makes the real signup path fail closed at the client accessor,
// with zero network attempts, instead of attempting an external send.
for (const forbidden of ['OPENAI_API_KEY', 'NPS_API_KEY', 'OPENWEATHER_API_KEY',
  'BRAVE_SEARCH_API_KEY', 'SERPER_API_KEY', 'TAVILY_API_KEY', 'RESEND_API_KEY',
  'GOOGLE_MAPS_API_KEY', 'GMAPS_SERVER_KEY']) {
  if (process.env[forbidden]) {
    console.error(`[stage14_8G] refusing to start: ${forbidden} is present; this run authorizes no external destination`);
    process.exit(1);
  }
}

const { app, server } = require('../src/app');

// App modules are loaded; anything outbound from here is runtime behavior.
if (typeof global.__stage14_8gEnterRuntimePhase === 'function') {
  global.__stage14_8gEnterRuntimePhase();
}

const listener = server || app;

if (typeof global.__stage14_8gInstallAuthObserver === 'function') {
  const installed = global.__stage14_8gInstallAuthObserver(app);
  console.log(`[stage14_8G] auth observer installed: ${installed}`);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const { host, port, name } = mongoose.connection;
  console.log(`[stage14_8G] mongo connected ${host}:${port}/${name}`);

  listener.listen(PORT, '127.0.0.1', () => {
    console.log(`[stage14_8G] acceptance backend listening on http://127.0.0.1:${PORT}`);
    console.log('[stage14_8G] READY');
  });
}

main().catch((error) => {
  console.error('[stage14_8G] startup failed:', error.message);
  process.exit(1);
});
