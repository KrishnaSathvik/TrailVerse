'use strict';

/**
 * Stage 14.8G — secret-safe launcher for the auth acceptance backend.
 *
 * The backend needs exactly two values out of `.env` (JWT_SECRET, so the real
 * signing contract is exercised, and ANTHROPIC_API_KEY, so startup construction
 * matches production) and must NOT inherit any other credential. Building that
 * environment here rather than on a shell command line means no secret is ever
 * written into a command string, a shell history entry, a process argument list
 * or this stage's transcript.
 *
 *   node scripts/stage14_8g-launch.js
 *
 * Every other key from `.env` — provider, NPS, weather, search, email, Maps —
 * is dropped, and the entrypoint independently refuses to start if one is
 * present.
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
  CLIENT_URL: 'http://127.0.0.1:3000',
  JWT_EXPIRE: '7d',
  STAGE14_8G_OUT_DIR: process.env.STAGE14_8G_OUT_DIR || '',
};

for (const key of PASSTHROUGH_KEYS) {
  if (parsed[key]) childEnv[key] = parsed[key];
}

// Report presence only — never a value, never a prefix, never a length.
console.log('[stage14_8G] launch env prepared:', JSON.stringify({
  jwtSecretPresent: Boolean(childEnv.JWT_SECRET),
  anthropicKeyPresent: Boolean(childEnv.ANTHROPIC_API_KEY),
  // Every `.env` key that is NOT passed through — the isolation claim itself.
  // `MONGODB_URI`, `NODE_ENV`, `PORT` and `CLIENT_URL` also appear in `.env`,
  // but the child receives this run's values, never the file's.
  envKeysDropped: Object.keys(parsed).filter((k) => !PASSTHROUGH_KEYS.includes(k)).length,
  credentialKeysReachingChild: Object.keys(childEnv).filter(
    (k) => /KEY|SECRET|TOKEN|PASS/i.test(k)
  ).sort(),
  overriddenNotInherited: ['MONGODB_URI', 'NODE_ENV', 'PORT', 'CLIENT_URL'],
  mongodbUri: childEnv.MONGODB_URI,
  port: childEnv.PORT,
}));

const child = spawn(
  process.execPath,
  ['-r', './scripts/stage14_8g-auth-bootstrap.js', './scripts/stage14_8g-acceptance-server.js'],
  { cwd: SERVER_ROOT, env: childEnv, stdio: 'inherit' }
);

const forward = (signal) => () => { child.kill(signal); };
process.on('SIGTERM', forward('SIGTERM'));
process.on('SIGINT', forward('SIGINT'));

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
