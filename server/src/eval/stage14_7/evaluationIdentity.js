'use strict';

const crypto = require('crypto');
const { validateProductionEmail } = require('../../validation/emailValidation');

const EVALUATION_IDENTITY_INVALID = 'evaluation_identity_invalid';
const SHARED_FALLBACK_EMAIL = 'stage147eval@example.com';
const SAFE_DOMAIN = 'example.com';
const LOCAL_PREFIX = 'stage147eval';
const MAX_NORMALIZED_RUN_ID_LENGTH = 24;
const HASH_LENGTH = 12;
const OBJECT_ID_HEX = /^[0-9a-f]{24}$/;

function invalidIdentity(reason) {
  const error = new Error(EVALUATION_IDENTITY_INVALID);
  error.code = EVALUATION_IDENTITY_INVALID;
  error.reason = reason;
  return error;
}

/** Explicit ASCII allowlist; punctuation is skipped, never copied through. */
function normalizeEvaluationRunId(evaluationRunId) {
  if (typeof evaluationRunId !== 'string' || evaluationRunId.length === 0) {
    throw invalidIdentity('evaluation_run_id_missing');
  }
  let normalized = '';
  for (const char of evaluationRunId.toLowerCase()) {
    const code = char.charCodeAt(0);
    const allowed = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (allowed && normalized.length < MAX_NORMALIZED_RUN_ID_LENGTH) normalized += char;
  }
  if (!normalized) throw invalidIdentity('evaluation_run_id_has_no_safe_characters');
  return normalized;
}

function expectedEmailForRun(evaluationRunId) {
  const normalized = normalizeEvaluationRunId(evaluationRunId);
  const digest = crypto.createHash('sha256').update(evaluationRunId, 'utf8').digest('hex').slice(0, HASH_LENGTH);
  return `${LOCAL_PREFIX}${normalized}${digest}@${SAFE_DOMAIN}`;
}

function validateRunScopedEvaluationIdentity(identity) {
  const reasons = [];
  if (!identity || typeof identity !== 'object') {
    return { ok: false, code: EVALUATION_IDENTITY_INVALID, reasons: ['identity_missing'] };
  }
  if (typeof identity.evaluationRunId !== 'string' || identity.evaluationRunId.length === 0) {
    reasons.push('evaluation_run_id_missing');
  }
  if (!OBJECT_ID_HEX.test(String(identity.evaluationUserId || ''))) {
    reasons.push('evaluation_user_id_invalid');
  }

  let expectedEmail = null;
  try {
    expectedEmail = expectedEmailForRun(identity.evaluationRunId);
  } catch (error) {
    reasons.push(error.reason || 'evaluation_run_id_invalid');
  }
  if (typeof identity.evaluationUserEmail !== 'string') {
    reasons.push('evaluation_user_email_missing');
  } else {
    if (!validateProductionEmail(identity.evaluationUserEmail).ok) reasons.push('production_email_invalid');
    if (identity.evaluationUserEmail !== expectedEmail) reasons.push('evaluation_user_email_not_canonical');
    if (identity.evaluationUserEmail === SHARED_FALLBACK_EMAIL) reasons.push('shared_fallback_identity_prohibited');
  }

  return {
    ok: reasons.length === 0,
    code: reasons.length === 0 ? null : EVALUATION_IDENTITY_INVALID,
    reasons,
  };
}

function assertRunScopedEvaluationIdentity(identity) {
  const result = validateRunScopedEvaluationIdentity(identity);
  if (!result.ok) throw invalidIdentity(result.reasons[0]);
  return result;
}

function buildRunScopedEvaluationIdentity({ evaluationRunId, evaluationUserId } = {}) {
  const identity = {
    evaluationRunId,
    evaluationUserId,
    evaluationUserEmail: expectedEmailForRun(evaluationRunId),
  };
  assertRunScopedEvaluationIdentity(identity);
  return identity;
}

function buildEvaluationAuthenticationFixture({ identity, scenarioIds } = {}) {
  assertRunScopedEvaluationIdentity(identity);
  return {
    user: {
      name: 'Stage 147 Eval',
      email: identity.evaluationUserEmail,
      password: 'Evaluation-Only-Password-1',
    },
    scenarioIds: Array.isArray(scenarioIds) ? [...scenarioIds] : scenarioIds,
  };
}

module.exports = {
  EVALUATION_IDENTITY_INVALID,
  SHARED_FALLBACK_EMAIL,
  normalizeEvaluationRunId,
  validateRunScopedEvaluationIdentity,
  assertRunScopedEvaluationIdentity,
  buildRunScopedEvaluationIdentity,
  buildEvaluationAuthenticationFixture,
};
