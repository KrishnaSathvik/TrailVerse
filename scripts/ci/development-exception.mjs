import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPIRY = '2026-10-30T00:00:00Z';
const SCOPES = ['.', 'next-frontend', 'server'];
const ADVISORIES = new Set([
  'GHSA-vfj7-8cjw-p6xm', 'GHSA-hp3w-g68c-fv3c',
  'GHSA-jmr9-qjv8-65gv', 'GHSA-7pqw-9j4j-h8q3',
]);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const scopeHash = policy => sha256(canonical({
  expiresAt: policy.expiresAt, scopes: policy.scopes, files: policy.files,
}));
export function findingsHash(report) {
  // Upgrade recommendations are not vulnerabilities; every other finding field
  // remains bound, including full advisory objects, via/effects and locations.
  return sha256(canonical(Object.fromEntries(Object.entries(report.vulnerabilities)
    .map(([name, finding]) => [name, Object.fromEntries(Object.entries(finding)
      .filter(([key]) => key !== 'fixAvailable'))]))));
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
function timestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) &&
    new Date(Date.parse(value)).toISOString().replace('.000Z', 'Z') === value ? Date.parse(value) : NaN;
}

// Called only after every raw audit is collected and independently validated.
// Approval is a repository-owner decision recorded in protected source, not an
// environment flag or a claim that this script can authenticate a human.
export function evaluateException({ root, records, reports, now = Date.now() }) {
  let policy;
  try {
    policy = JSON.parse(readFileSync(resolve(root, '.github/security/development-exception.json'), 'utf8'));
  } catch (error) {
    return error.code === 'ENOENT'
      ? { status: 'inactive', reason: 'No exception record', waived: [] }
      : { status: 'rejected', reason: 'Unreadable or malformed exception record', waived: [] };
  }
  try {
    requireCondition(policy.schemaVersion === 1 && policy.id === 'trailverse-dev-tools-2026-10-16', 'Unsupported exception');
    requireCondition(['proposed', 'approved', 'revoked'].includes(policy.status), 'Invalid approval state');
    if (policy.status !== 'approved') return { status: 'inactive', reason: `Exception ${policy.status}`, waived: [] };
    const approval = policy.approval;
    requireCondition(policy.expiresAt === EXPIRY && Number.isFinite(now) && now < Date.parse(EXPIRY), 'Exception expired or expiry changed');
    requireCondition(policy.owner === 'KrishnaSathvik' && approval?.approvedBy === policy.owner &&
      Number.isFinite(timestamp(approval.approvedAt)) && timestamp(approval.approvedAt) <= now &&
      typeof approval.decisionReference === 'string' && approval.decisionReference.trim().length > 0,
    'Explicit dated repository-owner approval is missing');
    requireCondition(policy.scopeSha256 === scopeHash(policy) && approval.scopeSha256 === policy.scopeSha256,
      'Approval scope binding differs');
    requireCondition(canonical(Object.keys(policy.scopes).sort()) === canonical(['next-frontend', 'server']), 'Unexpected exception workspace');
    const requiredFiles = ['package.json', 'package-lock.json', 'next-frontend/package.json',
      'next-frontend/package-lock.json', 'server/package.json', 'server/package-lock.json',
      'docs/releases/remaining-ci-dependency-paths-2026-10-16.json'];
    requireCondition(canonical(Object.keys(policy.files).sort()) === canonical(requiredFiles.sort()), 'Incomplete dependency binding');
    for (const file of requiredFiles) {
      requireCondition(sha256(readFileSync(resolve(root, file))) === policy.files[file], `Dependency or graph drift: ${file}`);
    }
    requireCondition(records.length === 6 && new Set(records.map(r => `${r.scope}:${r.production}`)).size === 6,
      'Missing or duplicate audit scopes');
    const waived = [];
    const seenAdvisories = new Set();
    for (const scope of SCOPES) {
      for (const production of [false, true]) {
        const record = records.find(r => r.scope === scope && r.production === production);
        const report = reports.get(`${scope}:${production}`);
        requireCondition(record && report && !record.executionError && !record.signal &&
          [0, 1].includes(record.exitCode), `Audit execution failed: ${scope}`);
        requireCondition(record.rawFailure === null || record.rawFailure === 'moderate-or-higher findings',
          `Invalid or blocking audit: ${scope}`);
        if (production || scope === '.') {
          requireCondition(report.metadata.vulnerabilities.total === 0 && record.exitCode === 0 && record.rawFailure === null,
            `Production or root-workspace finding: ${scope}`);
          continue;
        }
        const permitted = policy.scopes[scope];
        // Exact recorded graph matching also covers cyclic Jest propagation.
        // A partially changed graph needs review; never waive a whole package
        // merely because one of its via entries names an approved advisory.
        requireCondition(findingsHash(report) === permitted.findingsSha256, `New or changed findings: ${scope}`);
        requireCondition(record.exitCode === 1 && record.rawFailure === 'moderate-or-higher findings',
          `Unexpected audit exit for recorded findings: ${scope}`);
        const lock = JSON.parse(readFileSync(resolve(root, scope, 'package-lock.json'), 'utf8'));
        const observedPairs = [];
        const findings = report.vulnerabilities;
        for (const [name, finding] of Object.entries(findings)) {
          requireCondition(finding.name === name && Array.isArray(finding.nodes) && finding.nodes.length > 0 &&
            Array.isArray(finding.via) && finding.via.length > 0, `Invalid finding: ${scope}/${name}`);
          for (const node of finding.nodes) {
            requireCondition(lock.packages[node]?.dev === true, `Non-development path: ${scope}/${node}`);
          }
          for (const via of finding.via) {
            if (typeof via === 'string') {
              requireCondition(Object.hasOwn(findings, via), `Unresolved advisory chain: ${via}`);
              continue;
            }
            const match = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/.exec(via?.url);
            requireCondition(match && ADVISORIES.has(match[1]) && via.name === name && via.dependency === name,
              `Unapproved advisory: ${scope}/${name}`);
            seenAdvisories.add(match[1]);
            for (const node of finding.nodes) observedPairs.push({ advisory: match[1], package: name,
              version: lock.packages[node].version, location: node });
          }
        }
        // Fixed-point reachability handles cycles without treating a cycle as
        // evidence of approval. Every propagated entry must reach an actual leaf.
        const reachable = new Set(Object.keys(findings).filter(name => findings[name].via.some(v => typeof v === 'object')));
        for (let changed = true; changed;) {
          changed = false;
          for (const [name, finding] of Object.entries(findings)) {
            if (!reachable.has(name) && finding.via.some(v => typeof v === 'string' && reachable.has(v))) {
              reachable.add(name); changed = true;
            }
          }
        }
        requireCondition(reachable.size === Object.keys(findings).length, `Advisory-free cycle: ${scope}`);
        const ordered = pairs => pairs.map(canonical).sort();
        requireCondition(canonical(ordered(observedPairs)) === canonical(ordered(permitted.advisoryPaths)),
          `Advisory/path scope differs: ${scope}`);
        waived.push(scope);
      }
    }
    requireCondition(seenAdvisories.size === ADVISORIES.size, 'Incomplete four-advisory scope');
    return { status: 'accepted', id: policy.id, expiresAt: policy.expiresAt,
      scopeSha256: policy.scopeSha256, approval, waived };
  } catch (error) {
    return { status: 'rejected', reason: error.message, waived: [] };
  }
}
