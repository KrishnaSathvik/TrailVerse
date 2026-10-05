'use strict';

/**
 * Stage 14.7D2 §2 — bounded evaluation-fixture preflight.
 *
 * PURE by construction: this module imports nothing from the application, no
 * models, no mongoose, no config. It must be safe to require and run before a
 * MongoDB connection exists, before models are imported, before the Express
 * application is imported, and before any user is created.
 *
 * Output discipline: on failure it returns the single bounded code
 * `evaluation_fixture_invalid` plus per-field bounded codes. It never returns
 * or logs full email addresses, passwords, tokens, complete fixture objects, or
 * database URIs.
 */

const FIXTURE_INVALID = 'evaluation_fixture_invalid';
const {
  PRODUCTION_EMAIL_REGEX,
  validateProductionEmail,
} = require('../../validation/emailValidation');

/** Reserved/documentation domains that cannot resolve to a real mailbox. */
const EVAL_SAFE_DOMAINS = new Set(['example.com', 'example.org', 'example.net']);

/**
 * Domains that indicate a real person or the live product. An evaluation run
 * that creates one of these has escaped its fixture boundary.
 */
const PRODUCTION_LOOKING_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'proton.me', 'protonmail.com',
  'nationalparksexplorerusa.com', 'trailverse.app'
]);

const SCENARIO_ID_REGEX = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/** Extracts the domain without retaining the local part anywhere. */
function domainOf(email) {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

function checkUser(user, fields) {
  if (!user || typeof user !== 'object') {
    fields.push({ field: 'user', code: 'missing_required_field' });
    return;
  }

  if (!isNonEmptyString(user.name)) {
    fields.push({ field: 'user.name', code: 'missing_required_field' });
  } else if (user.name.length > MAX_NAME_LENGTH) {
    fields.push({ field: 'user.name', code: 'value_too_long' });
  }

  if (!isNonEmptyString(user.email)) {
    fields.push({ field: 'user.email', code: 'missing_required_field' });
  } else if (!validateProductionEmail(user.email).ok) {
    fields.push({ field: 'user.email', code: 'invalid_email_format' });
  } else {
    const domain = domainOf(user.email);
    if (PRODUCTION_LOOKING_DOMAINS.has(domain)) {
      fields.push({ field: 'user.email', code: 'production_looking_identity' });
    } else if (!EVAL_SAFE_DOMAINS.has(domain)) {
      // Anything outside the reserved documentation domains could be a real
      // mailbox, so it is refused rather than guessed at.
      fields.push({ field: 'user.email', code: 'non_evaluation_domain' });
    }
  }

  if (!isNonEmptyString(user.password)) {
    fields.push({ field: 'user.password', code: 'missing_required_field' });
  } else if (user.password.length < MIN_PASSWORD_LENGTH) {
    fields.push({ field: 'user.password', code: 'value_too_short' });
  }
}

function checkScenarioIds(scenarioIds, fields) {
  if (!Array.isArray(scenarioIds) || scenarioIds.length === 0) {
    fields.push({ field: 'scenarioIds', code: 'missing_required_field' });
    return;
  }
  scenarioIds.forEach((id, index) => {
    if (typeof id !== 'string' || !SCENARIO_ID_REGEX.test(id)) {
      // The index locates the offender without echoing its value.
      fields.push({ field: `scenarioIds[${index}]`, code: 'malformed_scenario_id' });
    }
  });
}

/**
 * Validates runner-owned fixture data.
 *
 * @returns {{ok: true, checked: string[]}}
 *        | {ok: false, code: 'evaluation_fixture_invalid', fields: {field: string, code: string}[]}
 */
function validateEvaluationFixtures(fixtures) {
  const fields = [];

  if (!fixtures || typeof fixtures !== 'object') {
    return { ok: false, code: FIXTURE_INVALID, fields: [{ field: 'fixtures', code: 'missing_required_field' }] };
  }

  checkUser(fixtures.user, fields);
  checkScenarioIds(fixtures.scenarioIds, fields);

  if (fields.length > 0) {
    return { ok: false, code: FIXTURE_INVALID, fields };
  }
  return { ok: true, checked: ['user.name', 'user.email', 'user.password', 'scenarioIds'] };
}

/** Throws a bounded error carrying only field codes. */
function assertEvaluationFixtures(fixtures) {
  const result = validateEvaluationFixtures(fixtures);
  if (!result.ok) {
    const error = new Error(FIXTURE_INVALID);
    error.code = FIXTURE_INVALID;
    error.fields = result.fields;
    throw error;
  }
  return result;
}

module.exports = {
  validateEvaluationFixtures,
  assertEvaluationFixtures,
  FIXTURE_INVALID,
  PRODUCTION_EMAIL_REGEX,
  EVAL_SAFE_DOMAINS,
  SCENARIO_ID_REGEX
};
