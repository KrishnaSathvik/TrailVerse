'use strict';

const fs = require('fs');
const path = require('path');

const runnerPath = path.resolve(
  __dirname,
  '../../../../../artifacts/trailie-generic-live-gate-rerun-2026-08-13/run-generic-live-gate.js'
);

describe('generic paid gate runner guard', () => {
  test('hard preflight completes before the first selected-thread/model loop', () => {
    const source = fs.readFileSync(runnerPath, 'utf8');
    const mainStart = source.indexOf('async function main()');
    const preflight = source.indexOf('await runZeroCostHardPreflight(auth.token)', mainStart);
    const paidLoop = source.indexOf('for (const thread of selected)', mainStart);
    expect(preflight).toBeGreaterThan(mainStart);
    expect(paidLoop).toBeGreaterThan(preflight);
    expect(source).toMatch(/ZERO_COST_PREFLIGHT_FAILED/);
    expect(source).toMatch(/routeId === 'trailie-v2-wp11a-only'/);
  });
});
