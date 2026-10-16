import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assess, collect } from './collect-security-audits.mjs';

function result(severity = null, status = severity ? 1 : 0) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  if (severity) { counts[severity] = 1; counts.total = 1; }
  return { status, stdout: JSON.stringify({ auditReportVersion: 2,
    vulnerabilities: severity ? { sample: { severity } } : {}, metadata: { vulnerabilities: counts } }), stderr: '' };
}

test('clean full and production reports pass', () => {
  assert.equal(assess(result(), false), null);
  assert.equal(assess(result(), true), null);
});
test('full moderate threshold preserved; production low still blocks', () => {
  assert.equal(assess(result('low', 0), false), null);
  assert.ok(assess(result('low', 0), true));
  for (const level of ['moderate', 'high', 'critical']) {
    assert.ok(assess(result(level), false));
    assert.ok(assess(result(level, 0), false));
  }
});
test('execution, parsing, schema and count errors fail closed', () => {
  for (const bad of [
    { ...result(), error: new Error('offline') }, { ...result(), signal: 'SIGKILL' },
    { ...result(), status: null }, { ...result(), status: 2 }, { ...result(), status: 1 },
    { status: 0, stdout: 'not JSON' }, { status: 0, stdout: '{}' },
    { ...result(), stdout: result().stdout.replace('"total":0', '"total":1') },
    { ...result(), stdout: result().stdout.replace('"auditReportVersion":2', '"auditReportVersion":3') },
    { ...result('low', 0), stdout: result('low', 0).stdout.replace('"severity":"low"', '"severity":"high"') },
  ]) assert.ok(assess(bad, false));
});
test('failure does not skip later scopes; raw outputs, exits and hashes survive', () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-audit-test-'));
  try {
    for (const scope of ['.', 'server', 'next-frontend']) {
      mkdirSync(join(root, scope), { recursive: true });
      writeFileSync(join(root, scope, 'package-lock.json'), '{}');
    }
    const output = join(root, 'reports');
    let calls = 0;
    const passed = collect({ root, output, run: (_cmd, args, options) => {
      calls++;
      assert.ok(args.includes('--package-lock-only'));
      assert.ok(args.includes('--ignore-scripts'));
      assert.equal(options.timeout, 120000);
      if (calls === 2) throw new Error('simulated launch failure');
      return calls === 1 ? { ...result('high'), stderr: 'fixture error' } : result();
    } });
    assert.equal(passed, false);
    assert.equal(calls, 6);
    const summary = JSON.parse(readFileSync(join(output, 'summary.json')));
    assert.equal(summary.records.length, 6);
    assert.equal(summary.records[0].exitCode, 1);
    assert.match(summary.records[0].lockHash, /^[a-f0-9]{64}$/);
    assert.equal(summary.records[1].executionError, 'simulated launch failure');
    assert.equal(readFileSync(join(output, 'root-full.stderr.txt'), 'utf8'), 'fixture error');
    assert.equal(readFileSync(join(output, 'server-production.json'), 'utf8'), result().stdout);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
