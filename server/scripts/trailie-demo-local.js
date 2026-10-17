'use strict';

/**
 * Local launcher for manual Trailie demo review.
 *
 * The operator opens http://127.0.0.1:3000/plan-ai, signs in with their own
 * credentials, and clicks demo prompts one at a time to judge the real product.
 * That needs the ORDINARY application — live NPS data, weather, images, the
 * normal request path — not the Stage 14.8 evidence jail, whose deny-by-default
 * guard and hard provider cap exist to make a budgeted capture auditable.
 *
 * So this script changes exactly two things about a normal dev boot:
 *
 *   1. MONGODB_URI is pinned to the isolated loopback acceptance database.
 *      A non-loopback target — Atlas above all — refuses to start. Production
 *      data is unreachable by construction, not by convention.
 *   2. The Trailie lifecycle flags are set explicitly, so the reviewed behaviour
 *      is the intended one rather than whatever the ambient defaults are.
 *
 * Secrets are read from server/.env and passed through the child ENVIRONMENT,
 * never a command line, so no credential reaches shell history or a process
 * argument list. Nothing is printed but presence booleans.
 *
 * This script writes no artifacts. Stage 14.7/14.8 evidence is untouched, and
 * the Stage 14.8 databases are not opened.
 *
 *   node scripts/trailie-demo-local.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const SERVER_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27019/trailverse_trailie_demo_acceptance';

const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

// Loopback-only, as in every acceptance stage since 14.8A. This is the whole
// point of the launcher: a demo review must not be able to touch Atlas.
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(MONGODB_URI)) {
  console.error('[trailie-demo] refusing to start: MONGODB_URI is not an isolated loopback database');
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(path.join(SERVER_ROOT, '.env')));

/**
 * Everything the ordinary product path needs, minus the .env MONGODB_URI (which
 * points at Atlas) and minus the mail credentials (a review session has no
 * reason to send mail).
 */
const DROPPED_KEYS = new Set(['MONGODB_URI', 'NODE_ENV', 'PORT', 'CLIENT_URL', 'EMAIL_USER', 'EMAIL_PASS']);

const childEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  ...Object.fromEntries(Object.entries(parsed).filter(([key]) => !DROPPED_KEYS.has(key))),

  NODE_ENV: 'development',
  PORT: process.env.PORT || '5001',
  CLIENT_URL: process.env.CLIENT_URL || 'http://127.0.0.1:3000',
  MONGODB_URI,

  // WP12 COMPLETE — product chat is WP11A-only. Kill-switch must be on or Trailie
  // fails closed. Transport v2 is enabled so capture sees the modern dialect;
  // the browser still signals x-trailie-transport when the web flag is on.
  TRAILIE_V2_RUNTIME_ENABLED: 'true',
  TRAILIE_TRANSPORT_V2: process.env.TRAILIE_TRANSPORT_V2 || 'true',
  TRAILIE_EVIDENCE_REFRESH_HASH_SECRET:
    process.env.TRAILIE_EVIDENCE_REFRESH_HASH_SECRET
    || parsed.TRAILIE_EVIDENCE_REFRESH_HASH_SECRET
    || require('crypto').randomBytes(32).toString('hex'),

  // Lifecycle leftovers kept fail-closed / inert (legacy generation deleted).
  TRAILIE_EARLY_ITINERARY_EVENTS: 'true',
  TRAILIE_REVIEW_ENABLED: 'false',
  TRAILIE_SHADOW_REVIEW_ENABLED: 'false',
};

if (!childEnv.JWT_SECRET) {
  console.error('[trailie-demo] refusing to start: JWT_SECRET absent, sign-in cannot use the real auth contract');
  process.exit(1);
}

// Presence only — never a value, a prefix or a length.
console.log('[trailie-demo] launch env prepared:', JSON.stringify({
  mongodbUri: childEnv.MONGODB_URI,
  port: childEnv.PORT,
  clientUrl: childEnv.CLIENT_URL,
  jwtSecretPresent: Boolean(childEnv.JWT_SECRET),
  anthropicKeyPresent: Boolean(childEnv.ANTHROPIC_API_KEY),
  npsKeyPresent: Boolean(childEnv.NPS_API_KEY),
  weatherKeyPresent: Boolean(childEnv.OPENWEATHER_API_KEY),
  mailCredentialsDropped: true,
  flags: {
    TRAILIE_V2_RUNTIME_ENABLED: childEnv.TRAILIE_V2_RUNTIME_ENABLED,
    TRAILIE_TRANSPORT_V2: childEnv.TRAILIE_TRANSPORT_V2,
    TRAILIE_EARLY_ITINERARY_EVENTS: childEnv.TRAILIE_EARLY_ITINERARY_EVENTS,
    TRAILIE_REVIEW_ENABLED: childEnv.TRAILIE_REVIEW_ENABLED,
    TRAILIE_SHADOW_REVIEW_ENABLED: childEnv.TRAILIE_SHADOW_REVIEW_ENABLED,
    openaiKeyPresent: Boolean(childEnv.OPENAI_API_KEY),
  },
}, null, 2));

// Optional provider ledger for a re-capture review run. Preloaded so the
// transport tee is installed before any provider module is imported.
const preload = process.env.TRAILIE_DEMO_LEDGER_DIR
  ? ['-r', './scripts/trailie-demo-recapture-ledger.js']
  : [];
if (preload.length) childEnv.TRAILIE_DEMO_LEDGER_DIR = process.env.TRAILIE_DEMO_LEDGER_DIR;

const child = spawn(process.execPath, [...preload, 'server.js'], {
  cwd: SERVER_ROOT,
  env: childEnv,
  stdio: 'inherit',
});

const forward = (signal) => () => { child.kill(signal); };
process.on('SIGTERM', forward('SIGTERM'));
process.on('SIGINT', forward('SIGINT'));

child.on('exit', (code, signal) => { process.exit(signal ? 1 : (code ?? 0)); });
