'use strict';

/**
 * Stage 14.8H — authenticated live itinerary acceptance backend entrypoint.
 *
 * Not `server.js`: the production entrypoint starts schedulers, a shadow-review
 * worker and an NPS warm-up at boot, and those would fire external requests
 * unrelated to the turn under test — the network ledger could then no longer
 * attribute an attempt to the Trailie request. This mounts the request path only.
 *
 * Must be started with `-r ./scripts/stage14_8h-bootstrap.js`.
 */

const mongoose = require('mongoose');

const PORT = Number(process.env.PORT) || 5101;
const MONGODB_URI = process.env.MONGODB_URI;

if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(MONGODB_URI || '')) {
  console.error('[stage14_8H] refusing to start: MONGODB_URI is not an isolated loopback acceptance database');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('[stage14_8H] refusing to start: JWT_SECRET absent, the real auth contract cannot be exercised');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[stage14_8H] refusing to start: ANTHROPIC_API_KEY absent, this stage is authorized to call Claude');
  process.exit(1);
}

// §3 — Claude only. OpenAI, reviewer and recovery providers stay unauthorized,
// and every non-provider dependency stays out: the prompt forbids live
// conditions, so a key for one would make an accidental call possible.
for (const forbidden of ['OPENAI_API_KEY', 'NPS_API_KEY', 'OPENWEATHER_API_KEY',
  'BRAVE_SEARCH_API_KEY', 'SERPER_API_KEY', 'TAVILY_API_KEY', 'RESEND_API_KEY',
  'GOOGLE_MAPS_API_KEY', 'GMAPS_SERVER_KEY']) {
  if (process.env[forbidden]) {
    console.error(`[stage14_8H] refusing to start: ${forbidden} is present; this run authorizes Claude only`);
    process.exit(1);
  }
}

// §8 — the acceptance-only lifecycle configuration, asserted rather than assumed.
const flagChecks = [
  ['TRAILIE_EARLY_ITINERARY_EVENTS', 'true'],
  ['TRAILIE_ITINERARY_GENERATION_MODE', 'tool_first'],
  ['TRAILIE_PROSE_RECOVERY', 'false'],
];
for (const [name, expected] of flagChecks) {
  const actual = String(process.env[name] ?? '').toLowerCase();
  if (actual !== expected) {
    console.error(`[stage14_8H] refusing to start: ${name} must be ${expected} for this stage (saw "${actual}")`);
    process.exit(1);
  }
}

const { app, server } = require('../src/app');

if (typeof global.__stage14_8hEnterRuntimePhase === 'function') {
  global.__stage14_8hEnterRuntimePhase();
}

const listener = server || app;

if (typeof global.__stage14_8hInstallRequestObserver === 'function') {
  console.log(`[stage14_8H] request observer installed: ${global.__stage14_8hInstallRequestObserver(app)}`);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const { host, port, name } = mongoose.connection;
  console.log(`[stage14_8H] mongo connected ${host}:${port}/${name}`);

  const { getItineraryGenerationConfig } = require('../src/config/itineraryGenerationConfig');
  const gen = getItineraryGenerationConfig();
  console.log('[stage14_8H] resolved generation config:', JSON.stringify({
    mode: gen.mode,
    isToolFirst: gen.isToolFirst,
    earlyItineraryEvents: gen.earlyItineraryEvents,
    structuredMaxAttempts: gen.structuredMaxAttempts,
  }));

  listener.listen(PORT, '127.0.0.1', () => {
    console.log(`[stage14_8H] acceptance backend listening on http://127.0.0.1:${PORT}`);
    console.log('[stage14_8H] READY');
  });
}

main().catch((error) => {
  console.error('[stage14_8H] startup failed:', error.message);
  process.exit(1);
});
