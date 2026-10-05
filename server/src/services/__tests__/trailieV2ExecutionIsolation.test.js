'use strict';

/**
 * WP11A isolation guard — the integrated v2 execution engine MUST remain off-path.
 *
 * This scans the transitive `require` graph of each live entry point and fails if
 * `trailieV2ExecutionService` is reachable from any of them. WP11B is where the
 * runtime gets wired; until then, no route, no legacy generation path, and no
 * WP10 transport may import it.
 */

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');
const TARGET = path.resolve(__dirname, '..', 'trailieExecutionService.js');

// After WP12 Phase 4, legacy generation files are deleted. Transport must still
// not reach WP11A; product-chat routes intentionally DO (via the bridge).
const ENTRY_POINTS = [
  'src/utils/trailieTransportAdapter.js', // WP10 transport
];

const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveRequire(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // external / node builtin — cannot reach a local file
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachesTarget(entryAbs) {
  const seen = new Set();
  const stack = [entryAbs];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (file === TARGET) return true;
    let source;
    try { source = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const match of source.matchAll(REQUIRE_RE)) {
      // Ignore test files entirely — only production graph matters.
      if (/__tests__|\.test\.js$/.test(match[1])) continue;
      const resolved = resolveRequire(file, match[1]);
      if (resolved && !/__tests__/.test(resolved)) stack.push(resolved);
    }
  }
  return false;
}

describe('WP11A remains unimported by every live path', () => {
  test.each(ENTRY_POINTS)('%s does not reach trailieV2ExecutionService', (relPath) => {
    const abs = path.join(SERVER_ROOT, relPath);
    expect(fs.existsSync(abs)).toBe(true);
    expect(reachesTarget(abs)).toBe(false);
  });

  test('only the WP11B bridge requires the service directly (doc mentions allowed)', () => {
    // Whole-tree scan for an actual import — not a comment reference — of the module.
    // The bridge is the single sanctioned requirer; routes reach WP11A only through it.
    const ALLOWED_REQUIRERS = new Set([
      path.resolve(__dirname, '..', 'trailieRouteBridge.js'),
      path.resolve(__dirname, '..', 'trailieV2ExecutionService.js'),
    ]);
    const REQUIRE_TARGET = /require\(\s*['"][^'"]*trailieExecutionService['"]\s*\)/;
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
          walk(full);
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
          if (full === TARGET || ALLOWED_REQUIRERS.has(full)) continue;
          const source = fs.readFileSync(full, 'utf8');
          if (REQUIRE_TARGET.test(source)) offenders.push(path.relative(SERVER_ROOT, full));
        }
      }
    };
    walk(path.join(SERVER_ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
