'use strict';

/**
 * Stage 14.7D2 §2 — bounded evaluation-fixture validation.
 */

const {
  validateEvaluationFixtures,
  assertEvaluationFixtures,
  FIXTURE_INVALID,
  PRODUCTION_EMAIL_REGEX
} = require('../fixtureValidator');

const VALID = {
  user: { name: 'Stage 147 Eval', email: 'stage147eval@example.com', password: 'eval-fixture-password' },
  scenarioIds: ['stage147-early-visibility', 'stage147-interrupted-cleanup']
};

const codesFor = (result, field) => result.fields.filter((f) => f.field === field).map((f) => f.code);

describe('§2 — fixture validation outcomes', () => {
  test('accepts the evaluation user', () => {
    const result = validateEvaluationFixtures(VALID);
    expect(result.ok).toBe(true);
  });

  test('rejects an invalid email format', () => {
    const result = validateEvaluationFixtures({ ...VALID, user: { ...VALID.user, email: 'not-an-email' } });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FIXTURE_INVALID);
    expect(codesFor(result, 'user.email')).toEqual(['invalid_email_format']);
  });

  test('rejects plus-addressing because the actual production schema rejects it', () => {
    const result = validateEvaluationFixtures({
      ...VALID, user: { ...VALID.user, email: 'stage147eval+run@example.com' },
    });
    expect(result.ok).toBe(false);
    expect(codesFor(result, 'user.email')).toEqual(['invalid_email_format']);
  });

  test('rejects missing required fields', () => {
    const result = validateEvaluationFixtures({ user: { email: 'stage147eval@example.com' }, scenarioIds: ['ok-id'] });
    expect(result.ok).toBe(false);
    expect(codesFor(result, 'user.name')).toEqual(['missing_required_field']);
    expect(codesFor(result, 'user.password')).toEqual(['missing_required_field']);
  });

  test('rejects a malformed scenario ID and locates it by index', () => {
    const result = validateEvaluationFixtures({ ...VALID, scenarioIds: ['fine-id', 'Bad Id With Spaces'] });
    expect(result.ok).toBe(false);
    expect(codesFor(result, 'scenarioIds[1]')).toEqual(['malformed_scenario_id']);
    expect(codesFor(result, 'scenarioIds[0]')).toEqual([]);
  });

  test('rejects an accidental production-looking identity', () => {
    const result = validateEvaluationFixtures({ ...VALID, user: { ...VALID.user, email: 'realperson@gmail.com' } });
    expect(result.ok).toBe(false);
    expect(codesFor(result, 'user.email')).toEqual(['production_looking_identity']);
  });

  test('rejects a real-looking domain that is merely unrecognized', () => {
    const result = validateEvaluationFixtures({ ...VALID, user: { ...VALID.user, email: 'eval@somecompany.com' } });
    expect(result.ok).toBe(false);
    expect(codesFor(result, 'user.email')).toEqual(['non_evaluation_domain']);
  });

  test('missing fixtures object fails without throwing', () => {
    expect(validateEvaluationFixtures(null).ok).toBe(false);
    expect(validateEvaluationFixtures(undefined).code).toBe(FIXTURE_INVALID);
  });
});

describe('§2 — output is bounded', () => {
  test('no email, password, token, fixture object or URI appears in the result', () => {
    const secretish = {
      user: { name: 'X', email: 'leaky.address@gmail.com', password: 'sup3r-secret-pw' },
      scenarioIds: ['Bad Id'],
      mongoUri: 'mongodb+srv://user:pass@cluster.example.net/db'
    };
    const serialized = JSON.stringify(validateEvaluationFixtures(secretish));

    expect(serialized).not.toContain('leaky.address@gmail.com');
    expect(serialized).not.toContain('leaky.address');
    expect(serialized).not.toContain('sup3r-secret-pw');
    expect(serialized).not.toContain('mongodb+srv');
    expect(serialized).not.toContain('cluster.example.net');
    expect(serialized).not.toContain('Bad Id');
  });

  test('the thrown error carries only the bounded code and field codes', () => {
    try {
      assertEvaluationFixtures({ user: { name: 'X', email: 'nope@gmail.com', password: 'short' }, scenarioIds: [] });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.message).toBe(FIXTURE_INVALID);
      expect(error.code).toBe(FIXTURE_INVALID);
      expect(JSON.stringify(error.fields)).not.toContain('nope@gmail.com');
      expect(error.fields.every((f) => typeof f.code === 'string')).toBe(true);
    }
  });
});

describe('§2 — purity: safe before any connection or import', () => {
  test('the module pulls in no application, model, mongoose or config code', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../fixtureValidator.js'), 'utf8');
    const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    expect(requires).toEqual(['../../validation/emailValidation']);
  });

  test('validation runs without mongoose ever connecting', () => {
    const mongoose = require('mongoose');
    const before = mongoose.connection.readyState;
    validateEvaluationFixtures(VALID);
    validateEvaluationFixtures({ user: {}, scenarioIds: [] });
    // The suite's global setup may already hold a connection; what matters is
    // that validating fixtures neither opens nor changes one.
    expect(mongoose.connection.readyState).toBe(before);
  });
});

describe('§2 — production email regex parity and its recorded limitation', () => {
  test('shares the canonical helper with models/User.js instead of copying a regex', () => {
    const fs = require('fs');
    const path = require('path');
    const userSrc = fs.readFileSync(path.join(__dirname, '../../../models/User.js'), 'utf8');
    expect(userSrc).toContain("require('../validation/emailValidation')");
    expect(userSrc).toContain('validateProductionEmail');
  });

  test('the evaluation address satisfies the production rule', () => {
    expect(PRODUCTION_EMAIL_REGEX.test('stage147eval@example.com')).toBe(true);
  });

  test('LIMITATION (recorded, not fixed): TLDs longer than 3 characters are rejected', () => {
    // `(\.\w{2,3})+` caps each TLD label at three characters. This is existing
    // production signup behavior; it is documented here rather than changed.
    expect(PRODUCTION_EMAIL_REGEX.test('eval@example.info')).toBe(false);
    expect(PRODUCTION_EMAIL_REGEX.test('eval@example.travel')).toBe(false);
    expect(PRODUCTION_EMAIL_REGEX.test('eval@example.com')).toBe(true);
  });
});
