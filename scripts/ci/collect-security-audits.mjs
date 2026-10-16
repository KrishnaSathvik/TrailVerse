// Collect every scope before failing. No advisory allowlist or exception logic.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function assess(result, production) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) return 'audit execution failed';
  let report;
  try { report = JSON.parse(result.stdout); } catch { return 'invalid audit JSON'; }
  const counts = report?.metadata?.vulnerabilities;
  const levels = ['info', 'low', 'moderate', 'high', 'critical'];
  if (report.error || report.auditReportVersion !== 2 || !counts ||
      !report.vulnerabilities || typeof report.vulnerabilities !== 'object' ||
      Array.isArray(report.vulnerabilities) ||
      !levels.every(k => Number.isSafeInteger(counts[k]) && counts[k] >= 0) ||
      counts.total !== levels.reduce((sum, k) => sum + counts[k], 0) ||
      Object.keys(report.vulnerabilities).length !== counts.total) return 'unsupported or inconsistent audit report';
  const observed = Object.fromEntries(levels.map(level => [level, 0]));
  for (const finding of Object.values(report.vulnerabilities)) {
    if (!finding || !levels.includes(finding.severity)) return 'invalid finding severity';
    observed[finding.severity]++;
  }
  if (levels.some(level => observed[level] !== counts[level])) return 'inconsistent finding severities';
  const blocked = production ? counts.total : counts.moderate + counts.high + counts.critical;
  if (blocked > 0) return production ? 'production findings' : 'moderate-or-higher findings';
  if (result.status !== 0) return 'unexpected nonzero audit exit';
  return null;
}

export function collect({ root, output, run = spawnSync }) {
  mkdirSync(output, { recursive: true });
  const records = [];
  for (const scope of ['.', 'next-frontend', 'server']) {
    for (const production of [false, true]) {
      const name = `${scope === '.' ? 'root' : scope}-${production ? 'production' : 'full'}`;
      const args = ['audit', '--json', '--package-lock-only', '--ignore-scripts',
        '--audit-level', production ? 'low' : 'moderate',
        ...(production ? ['--omit=dev'] : ['--include=dev']), '--include=optional', '--include=peer'];
      let lockHash = null;
      let result;
      try {
        lockHash = createHash('sha256').update(readFileSync(resolve(root, scope, 'package-lock.json'))).digest('hex');
        result = run('npm', args, { cwd: resolve(root, scope), encoding: 'utf8',
          timeout: 120_000, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024 });
      } catch (error) {
        result = { status: null, error, stdout: '', stderr: '' };
      }
      writeFileSync(resolve(output, `${name}.json`), result.stdout || '');
      writeFileSync(resolve(output, `${name}.stderr.txt`), result.stderr || '');
      records.push({ scope, production, command: ['npm', ...args], lockHash,
        exitCode: result.status ?? null, signal: result.signal ?? null,
        executionError: result.error ? String(result.error.message) : null,
        failure: assess(result, production) });
    }
  }
  const summary = { revision: process.env.GITHUB_SHA || null, collectedAt: new Date().toISOString(),
    policy: 'Full trees: moderate threshold; production trees: zero findings; no exceptions.', records };
  writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return records.every(record => record.failure === null);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  process.exitCode = collect({ root, output: resolve(root, 'artifacts/ci-security') }) ? 0 : 1;
}
