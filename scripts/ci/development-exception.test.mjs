import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assess, collect } from './collect-security-audits.mjs';
import { evaluateException, scopeHash, findingsHash } from './development-exception.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const policyPath = '.github/security/development-exception.json';
const proposal = JSON.parse(readFileSync(join(repository, policyPath)));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/development-audit-2026-10-16.json', import.meta.url)));
const NOW = Date.parse('2026-10-16T20:00:00Z');

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'trailverse-exception-test-'));
  for (const file of Object.keys(proposal.files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), readFileSync(join(repository, file)));
  }
  mkdirSync(dirname(join(root, policyPath)), { recursive: true });
  const policy = structuredClone(proposal);
  // Synthetic test approval exists only in this temporary fixture, never source.
  policy.status = 'approved';
  policy.approval = { approvedBy: 'KrishnaSathvik', approvedAt: '2026-10-16T19:00:00Z',
    scopeSha256: policy.scopeSha256, decisionReference: 'TEST ONLY — not real approval' };
  const reports = new Map();
  const records = [];
  for (const scope of ['.', 'next-frontend', 'server']) {
    for (const production of [false, true]) {
      const report = structuredClone(fixture.scopes[scope][production ? 'production' : 'full']);
      reports.set(`${scope}:${production}`, report);
      const exitCode = report.metadata.vulnerabilities.total ? 1 : 0;
      records.push({ scope, production, exitCode, signal: null, executionError: null,
        rawFailure: assess({ status: exitCode, stdout: JSON.stringify(report) }, production) });
    }
  }
  const save = () => writeFileSync(join(root, policyPath), JSON.stringify(policy));
  save();
  return { root, policy, reports, records, save, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

function caseTest(name, fn) {
  test(name, () => { const context = setup(); try { fn(context); } finally { context.dispose(); } });
}
const evaluate = c => evaluateException({ ...c, now: NOW });
function denied(c) { assert.notEqual(evaluate(c).status, 'accepted'); }

test('checked-in policy has a recognized lifecycle state and matches scope digest', () => {
  assert.ok(['proposed', 'approved', 'revoked'].includes(proposal.status));
  if (proposal.status === 'proposed') assert.equal(proposal.approval, null);
  assert.equal(scopeHash(proposal), proposal.scopeSha256);
});
caseTest('recorded 45 findings and cyclic Jest propagation pass only with synthetic approval', c => {
  const outcome = evaluate(c);
  assert.equal(outcome.status, 'accepted', outcome.reason);
  assert.deepEqual(outcome.waived, ['next-frontend', 'server']);
});
for (const state of ['proposed', 'revoked', 'unknown']) {
  caseTest(`${state} approval cannot waive findings`, c => { c.policy.status = state; c.save(); denied(c); });
}
for (const field of ['approvedBy', 'approvedAt', 'decisionReference', 'scopeSha256']) {
  caseTest(`missing approval ${field} blocks`, c => { delete c.policy.approval[field]; c.save(); denied(c); });
}
caseTest('future or invalid approval timestamp blocks', c => {
  for (const date of ['2026-10-17T00:00:00Z', '2026-02-30T00:00:00Z', 'not a date']) {
    c.policy.approval.approvedAt = date; c.save(); denied(c);
  }
});
caseTest('expiry blocks exactly at midnight and after, but not one millisecond before', c => {
  const expiry = Date.parse(c.policy.expiresAt);
  assert.equal(evaluateException({ ...c, now: expiry - 1 }).status, 'accepted');
  assert.equal(evaluateException({ ...c, now: expiry }).status, 'rejected');
  assert.equal(evaluateException({ ...c, now: expiry + 1 }).status, 'rejected');
});
caseTest('changing expiry cannot renew approval', c => {
  c.policy.expiresAt = '2026-11-30T00:00:00Z';
  c.policy.scopeSha256 = scopeHash(c.policy); c.policy.approval.scopeSha256 = c.policy.scopeSha256;
  c.save(); denied(c);
});
for (const file of Object.keys(proposal.files)) {
  caseTest(`dependency or graph drift blocks: ${file}`, c => {
    writeFileSync(join(c.root, file), readFileSync(join(c.root, file), 'utf8') + '\n'); denied(c);
  });
}
caseTest('mixed approved and unapproved advisory on same package blocks', c => {
  const finding = c.reports.get('next-frontend:false').vulnerabilities.braces;
  finding.via.push({ ...finding.via[0], url: 'https://github.com/advisories/GHSA-new0-new0-new0' });
  denied(c);
});
caseTest('changed severity, source, range, path, or propagation blocks', c => {
  const key = 'next-frontend:false';
  const original = structuredClone(c.reports.get(key));
  for (const mutate of [
    r => { r.vulnerabilities.braces.severity = 'critical'; },
    r => { r.vulnerabilities.braces.via[0].range = '<99'; },
    r => { r.vulnerabilities.braces.via[0].source++; },
    r => { r.vulnerabilities.braces.nodes.push('node_modules/new/node_modules/braces'); },
    r => { r.vulnerabilities.micromatch.via.push('unknown-package'); },
  ]) {
    const report = structuredClone(original); mutate(report); c.reports.set(key, report); denied(c);
  }
});
caseTest('new low vulnerability blocks even without moderate exit', c => {
  const report = c.reports.get('.:false');
  report.vulnerabilities.new = { severity: 'low' };
  report.metadata.vulnerabilities.low = report.metadata.vulnerabilities.total = 1;
  denied(c);
});
caseTest('any production finding blocks, including an otherwise approved advisory', c => {
  c.reports.set('server:true', structuredClone(c.reports.get('server:false')));
  denied(c);
});
caseTest('missing or duplicate scope blocks', c => {
  c.records.pop(); denied(c);
  c.records.push(c.records[0]); denied(c);
});
caseTest('failed scan, timeout, malformed report and unexpected exits cannot be waived', c => {
  const record = c.records.find(r => r.scope === 'server' && !r.production);
  const saved = { ...record };
  for (const change of [ { exitCode: 0 }, { exitCode: 2 }, { exitCode: null },
    { executionError: 'network unavailable' }, { signal: 'SIGKILL' }, { rawFailure: 'invalid audit JSON' },
    { rawFailure: 'unsupported or inconsistent audit report' } ]) {
    Object.assign(record, saved, change); denied(c);
  }
});
caseTest('malformed, missing and scope-rebound policy cannot activate', c => {
  writeFileSync(join(c.root, policyPath), '{'); denied(c);
  rmSync(join(c.root, policyPath)); denied(c);
  c.policy.scopeSha256 = '0'.repeat(64); c.save(); denied(c);
});
caseTest('advisory-free cycle is rejected even with a rebound test fingerprint', c => {
  const report = c.reports.get('server:false');
  report.vulnerabilities.braces.via = ['micromatch'];
  c.policy.scopes.server.findingsSha256 = findingsHash(report);
  c.policy.scopeSha256 = scopeHash(c.policy); c.policy.approval.scopeSha256 = c.policy.scopeSha256;
  c.save(); denied(c);
});
caseTest('upgrade recommendation changes do not change the vulnerability scope', c => {
  c.reports.get('server:false').vulnerabilities.braces.fixAvailable = false;
  assert.equal(evaluate(c).status, 'accepted');
});
caseTest('collector retains raw failure/output while approved policy changes only final disposition', c => {
  const output = join(c.root, 'output');
  let calls = 0;
  const run = (_cmd, args, options) => {
    calls++;
    const scope = options.cwd === c.root ? '.' : options.cwd.slice(c.root.length + 1);
    const report = c.reports.get(`${scope}:${args.includes('--omit=dev')}`);
    return { status: report.metadata.vulnerabilities.total ? 1 : 0, stdout: JSON.stringify(report), stderr: '' };
  };
  assert.equal(collect({ root: c.root, output, run, now: NOW }), true);
  assert.equal(calls, 6);
  const summary = JSON.parse(readFileSync(join(output, 'summary.json')));
  const server = summary.records.find(r => r.scope === 'server' && !r.production);
  assert.equal(server.exitCode, 1);
  assert.equal(server.rawFailure, 'moderate-or-higher findings');
  assert.equal(server.failure, null);
  assert.equal(summary.exception.status, 'accepted');
  assert.equal(JSON.parse(readFileSync(join(output, 'server-full.json'))).metadata.vulnerabilities.total, 31);
  c.policy.status = 'proposed'; c.policy.approval = null; c.save(); calls = 0;
  assert.equal(collect({ root: c.root, output, run, now: NOW }), false);
  assert.equal(calls, 6);
});
caseTest('collector rejects malformed scan after approval and still retains every scope', c => {
  const output = join(c.root, 'output');
  let calls = 0;
  const run = (_cmd, args, options) => {
    calls++;
    if (calls === 3) return { status: 1, stdout: '{broken', stderr: 'registry failed' };
    const scope = options.cwd === c.root ? '.' : options.cwd.slice(c.root.length + 1);
    const report = c.reports.get(`${scope}:${args.includes('--omit=dev')}`);
    return { status: report.metadata.vulnerabilities.total ? 1 : 0, stdout: JSON.stringify(report), stderr: '' };
  };
  assert.equal(collect({ root: c.root, output, run, now: NOW }), false);
  assert.equal(calls, 6);
  const summary = JSON.parse(readFileSync(join(output, 'summary.json')));
  assert.equal(summary.exception.status, 'rejected');
  assert.equal(readFileSync(join(output, 'next-frontend-full.json'), 'utf8'), '{broken');
  assert.equal(summary.records.find(r => r.scope === 'server' && !r.production).failure,
    'moderate-or-higher findings');
});

caseTest('actual approved record validates against retained reports at its approval time', c => {
  if (proposal.status !== 'approved') return;
  const result = evaluateException({ root: repository, records: c.records, reports: c.reports,
    now: Date.parse(proposal.approval.approvedAt) + 1 });
  assert.equal(result.status, 'accepted', result.reason);
});
