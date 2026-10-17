'use strict';

/**
 * Trailie public evidence-refresh HMAC secret.
 *
 * This is a server-only operational prerequisite. The value must never appear
 * in logs, HTTP responses, frontend env, or source control. Readiness and
 * boot checks report presence only.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isTrailieV2RuntimeEnabled } = require('./trailieV2Runtime');

const EVIDENCE_REFRESH_HASH_SECRET_ENV = 'TRAILIE_EVIDENCE_REFRESH_HASH_SECRET';
const EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE = 'evidence_refresh_hash_secret_missing';

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isEvidenceRefreshHashSecretPresent(env = process.env) {
  return present(env[EVIDENCE_REFRESH_HASH_SECRET_ENV]);
}

function resolveEvidenceRefreshHashSecret(env = process.env) {
  const value = env[EVIDENCE_REFRESH_HASH_SECRET_ENV];
  return present(value) ? value : undefined;
}

/**
 * Product readiness for evidence-backed Trailie turns.
 *
 * When Trailie V2 is enabled, a missing secret makes every public refresh
 * fail closed. When V2 is disabled, the secret is not required.
 */
function assessTrailieEvidenceRefreshReadiness({
  env = process.env,
  runtimeEnabled = isTrailieV2RuntimeEnabled(env),
} = {}) {
  const secretPresent = isEvidenceRefreshHashSecretPresent(env);
  if (!runtimeEnabled) {
    return Object.freeze({
      required: false,
      ready: true,
      secretPresent,
      status: 'not_required',
      code: null,
    });
  }
  if (secretPresent) {
    return Object.freeze({
      required: true,
      ready: true,
      secretPresent: true,
      status: 'healthy',
      code: null,
    });
  }
  return Object.freeze({
    required: true,
    ready: false,
    secretPresent: false,
    status: 'unhealthy',
    code: EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE,
  });
}

function defaultEnvFilePath() {
  return path.resolve(__dirname, '../../.env');
}

/**
 * Local development only: persist a generated secret into the gitignored
 * server `.env` so `npm run dev` loads it on the real boot path.
 * Never writes in production. Never logs the value.
 */
function ensureLocalTrailieEvidenceRefreshSecret({
  env = process.env,
  nodeEnv = env.NODE_ENV,
  envFilePath = defaultEnvFilePath(),
  fsModule = fs,
  cryptoModule = crypto,
} = {}) {
  if (isEvidenceRefreshHashSecretPresent(env)) {
    return { action: 'present', generated: false };
  }
  if (String(nodeEnv || '').toLowerCase() === 'production') {
    return { action: 'missing', generated: false };
  }

  const secret = cryptoModule.randomBytes(48).toString('base64url');
  const line = `\n# Generated locally for Trailie evidence refresh. Do not commit.\n${EVIDENCE_REFRESH_HASH_SECRET_ENV}=${secret}\n`;
  fsModule.appendFileSync(envFilePath, line, { encoding: 'utf8', mode: 0o600 });
  env[EVIDENCE_REFRESH_HASH_SECRET_ENV] = secret;
  return { action: 'generated', generated: true };
}

function assertTrailieEvidenceRefreshConfigured({
  env = process.env,
  runtimeEnabled = isTrailieV2RuntimeEnabled(env),
} = {}) {
  const readiness = assessTrailieEvidenceRefreshReadiness({ env, runtimeEnabled });
  if (readiness.ready) return readiness;
  const error = new Error(EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE);
  error.code = EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE;
  throw error;
}

module.exports = {
  EVIDENCE_REFRESH_HASH_SECRET_ENV,
  EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE,
  isEvidenceRefreshHashSecretPresent,
  resolveEvidenceRefreshHashSecret,
  assessTrailieEvidenceRefreshReadiness,
  ensureLocalTrailieEvidenceRefreshSecret,
  assertTrailieEvidenceRefreshConfigured,
};
