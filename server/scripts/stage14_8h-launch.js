'use strict';

/**
 * Stage 14.8H — secret-safe launcher for the authenticated live acceptance backend.
 *
 * Builds the child environment here rather than on a shell command line, so no
 * credential reaches a command string, a shell history entry or a process
 * argument list. Exactly three secrets are passed through: the JWT signing
 * secret (the real auth contract) and the Anthropic key (this stage's one
 * authorized paid dependency).
 *
 * The §8 lifecycle flags are set explicitly here and re-asserted by the
 * entrypoint, so the run cannot silently proceed on production defaults.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const SERVER_ROOT = path.resolve(__dirname, '..');
const PASSTHROUGH_KEYS = ['JWT_SECRET', 'ANTHROPIC_API_KEY'];

const parsed = dotenv.parse(fs.readFileSync(path.join(SERVER_ROOT, '.env')));

const childEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: 'development',
  PORT: process.env.PORT || '5101',
  MONGODB_URI: process.env.MONGODB_URI,
  // Overridable: Stage 14.8I had to serve the acceptance frontend on another
  // port because an unrelated project was using 3000. CORS reads CLIENT_URL, so
  // the origin must travel with it.
  CLIENT_URL: process.env.CLIENT_URL || 'http://127.0.0.1:3000',
  JWT_EXPIRE: '7d',
  STAGE14_8H_OUT_DIR: process.env.STAGE14_8H_OUT_DIR || '',

  // §8 — acceptance-only lifecycle configuration.
  TRAILIE_EARLY_ITINERARY_EVENTS: 'true',
  TRAILIE_ITINERARY_GENERATION_MODE: 'tool_first',
  TRAILIE_PROSE_RECOVERY: 'false',

  // Reviewer/shadow enforcement stays off: this stage authorizes ONE turn's
  // generation, and a reviewer pass would be a second unbudgeted dispatch.
  TRAILIE_ROLLOUT_KILL_SWITCH: 'false',
  TRAILIE_ROLLOUT_ENFORCE_RATE: '0',
  TRAILIE_ROLLOUT_TOOL_FIRST_RATE: '1',
  TRAILIE_REVIEW_ENABLED: 'false',
  TRAILIE_SHADOW_REVIEW_ENABLED: 'false',
};

for (const key of PASSTHROUGH_KEYS) {
  if (parsed[key]) childEnv[key] = parsed[key];
}

console.log('[stage14_8H] launch env prepared:', JSON.stringify({
  jwtSecretPresent: Boolean(childEnv.JWT_SECRET),
  anthropicKeyPresent: Boolean(childEnv.ANTHROPIC_API_KEY),
  credentialKeysReachingChild: Object.keys(childEnv).filter((k) => /KEY|SECRET|TOKEN|PASS/i.test(k)).sort(),
  envKeysDropped: Object.keys(parsed).filter((k) => !PASSTHROUGH_KEYS.includes(k)).length,
  flags: {
    TRAILIE_EARLY_ITINERARY_EVENTS: childEnv.TRAILIE_EARLY_ITINERARY_EVENTS,
    TRAILIE_ITINERARY_GENERATION_MODE: childEnv.TRAILIE_ITINERARY_GENERATION_MODE,
    TRAILIE_PROSE_RECOVERY: childEnv.TRAILIE_PROSE_RECOVERY,
    TRAILIE_REVIEW_ENABLED: childEnv.TRAILIE_REVIEW_ENABLED,
    TRAILIE_SHADOW_REVIEW_ENABLED: childEnv.TRAILIE_SHADOW_REVIEW_ENABLED,
  },
  mongodbUri: childEnv.MONGODB_URI,
  port: childEnv.PORT,
}));

const child = spawn(
  process.execPath,
  ['-r', './scripts/stage14_8h-bootstrap.js', './scripts/stage14_8h-server.js'],
  { cwd: SERVER_ROOT, env: childEnv, stdio: 'inherit' }
);

const forward = (signal) => () => { child.kill(signal); };
process.on('SIGTERM', forward('SIGTERM'));
process.on('SIGINT', forward('SIGINT'));

child.on('exit', (code, signal) => { process.exit(signal ? 1 : (code ?? 0)); });
