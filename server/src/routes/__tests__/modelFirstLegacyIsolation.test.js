'use strict';

/**
 * Step 4 permanent gate: model-first must not load or invoke legacy travel judgment.
 * See docs/trailie-architecture.md and artifacts/.../STEP-4-LEGACY-ISOLATION.md.
 */
const path = require('path');
const { spawnSync } = require('child_process');

test('model-first stack does not require-load banned legacy judgment modules', () => {
  const script = path.join(__dirname, '../../../scripts/trace-model-first-legacy-reachability.js');
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.hitCount).toBe(0);
  expect(report.hits).toEqual([]);
});
