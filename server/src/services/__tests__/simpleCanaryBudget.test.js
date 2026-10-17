'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanaryBudget } = require('../simpleCanaryBudget');
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-canary-test-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const body = { model: 'gpt-6-sol', input: [{ role: 'user', content: 'Hello' }], max_output_tokens: 10000 };
test('six turns across restarts; seventh and concurrent requests denied', () => {
  for (let i = 1; i <= 6; i += 1) {
    const budget = createCanaryBudget(dir); expect(budget.begin('owner')).toBe(i);
    expect(() => createCanaryBudget(dir).begin('owner')).toThrow(); budget.end(false);
  }
  expect(() => createCanaryBudget(dir).begin('owner')).toThrow('canary_closed');
});
test('spend is reserved before dispatch; output is capped; actual settlement releases only unused reserve', () => {
  const budget = createCanaryBudget(dir); budget.begin('owner');
  const reservation = budget.reserve(body);
  expect(reservation.body.max_output_tokens).toBe(4000);
  expect(budget.status().chargedMicros).toBeGreaterThan(40000);
  budget.settle(reservation.id, { usage: { input_tokens: 100, output_tokens: 100 } });
  expect(budget.status().chargedMicros).toBe(1200);
  budget.end(false);
});
test('unknown cost retains full reservation and permanently stops the canary', () => {
  const budget = createCanaryBudget(dir); budget.begin('owner'); const r = budget.reserve(body);
  const reserved = budget.status().chargedMicros;
  expect(() => budget.settle(r.id, {})).toThrow('canary_cost_unknown');
  expect(budget.status().chargedMicros).toBe(reserved); budget.end(true);
  expect(() => budget.begin('owner')).toThrow();
});
test('oversized next request cannot cross $0.15; Astra cannot dispatch', () => {
  const budget = createCanaryBudget(dir); budget.begin('owner');
  expect(() => budget.reserve({ ...body, input: 'x'.repeat(100000) })).toThrow('canary_budget_exhausted');
  expect(budget.status().calls).toHaveLength(0);
  expect(() => budget.reserve({ ...body, model: 'gpt-6-astra' })).toThrow('canary_dispatch_denied');
  budget.end(true);
});
test('a crashed active turn cannot resume with a new ledger instance', () => {
  const budget = createCanaryBudget(dir); budget.begin('owner'); budget.reserve(body);
  fs.unlinkSync(path.join(dir, 'turn.lock'));
  expect(() => createCanaryBudget(dir).begin('owner')).toThrow('canary_closed');
});
