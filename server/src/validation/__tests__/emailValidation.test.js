'use strict';

const path = require('path');

function loadContract() {
  try {
    return require('../emailValidation');
  } catch {
    return {};
  }
}

describe('Stage 14.7M — canonical production email contract', () => {
  test('exports the one production validator and regex', () => {
    const contract = loadContract();
    expect(contract.PRODUCTION_EMAIL_REGEX).toBeInstanceOf(RegExp);
    expect(typeof contract.validateProductionEmail).toBe('function');
  });

  test.each([
    ['stage147evalabc123@example.com', true],
    ['stage147eval+abc123@example.com', false],
    ['@example.com', false],
    ['stage147eval@example.info', false],
    [`${'a'.repeat(243)}@example.com`, false],
  ])('validates %s consistently with the production contract', (email, expected) => {
    const { validateProductionEmail } = loadContract();
    expect(validateProductionEmail(email).ok).toBe(expected);
  });

  test('the User model delegates email validation to the canonical helper', () => {
    const fs = require('fs');
    const source = fs.readFileSync(path.resolve(__dirname, '../../models/User.js'), 'utf8');
    expect(source).toContain("require('../validation/emailValidation')");
    expect(source).toContain('validateProductionEmail');
  });

  test.each([
    ['stage147evalabc123@example.com', true],
    ['stage147eval+abc123@example.com', false],
    ['stage147eval@example.info', false],
    [`${'a'.repeat(243)}@example.com`, false],
  ])('canonical helper and actual User schema agree for %s', (email, expected) => {
    const { validateProductionEmail } = loadContract();
    const User = require('../../models/User');
    const error = new User({ name: 'Stage 147 Eval', email, password: 'Evaluation-Only-Password-1' }).validateSync();
    expect(validateProductionEmail(email).ok).toBe(expected);
    expect(!error?.errors?.email).toBe(expected);
  });
});
