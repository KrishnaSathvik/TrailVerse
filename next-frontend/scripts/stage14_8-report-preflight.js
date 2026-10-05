/**
 * Stage 14.8E.1 §11 — acceptance-driver report preflight.
 *
 * Three stages in a row lost evidence to the same harness failure shape: a
 * multi-hunk edit added a REFERENCE to a report field while the hunk that
 * defined it never landed, so the driver threw at the very end — after the
 * paid turn had already completed and been persisted.
 *
 * `assertReportSymbolsDeclared` runs BEFORE any send. It parses the driver
 * source, collects the identifiers the report builder references, and fails if
 * any of them is never declared. A missing symbol therefore costs nothing
 * instead of costing a guest turn's worth of evidence.
 */

const fs = require('node:fs');

/** Language keywords are never bindings the driver must declare. */
const KEYWORDS = new Set([
  'new', 'await', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of',
  'function', 'return', 'this', 'null', 'true', 'false', 'undefined',
  'if', 'else', 'for', 'while', 'try', 'catch', 'finally', 'throw',
  'const', 'let', 'var', 'class', 'extends', 'super', 'yield', 'async',
]);

/** Identifiers that are always available and never need a local declaration. */
const AMBIENT = new Set([
  'JSON', 'Date', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'process', 'console', 'window', 'document', 'undefined', 'null', 'true',
  'false', 'path', 'fs', 'require', 'module', 'exports', 'globalThis',
]);

/**
 * Extracts the object literal passed to `write('send-report.json', { ... })`
 * and returns the identifiers it references as shorthand or values.
 */
function referencedReportSymbols(source) {
  const marker = source.indexOf("write('send-report.json'");
  if (marker === -1) return [];

  const open = source.indexOf('{', marker);
  if (open === -1) return [];

  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }

  const body = source
    .slice(open + 1, end)
    // Strings and template literals cannot reference a binding we must check.
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const symbols = new Set();
  // Every identifier in the body is a reference EXCEPT a property key
  // (`name:`), a member access (`.name`) and a language keyword.
  for (const m of body.matchAll(/([.]?)\b([A-Za-z_$][\w$]*)\b\s*(:?)/g)) {
    const [, dot, name, colon] = m;
    if (dot === '.' || colon === ':') continue;
    if (KEYWORDS.has(name) || AMBIENT.has(name)) continue;
    symbols.add(name);
  }
  return [...symbols];
}

function declaredSymbols(source) {
  const declared = new Set();
  const patterns = [
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\bimport\s+\{([^}]*)\}/g,
    /\bimport\s+([A-Za-z_$][\w$]*)\s+from/g,
    // Destructuring: `const { a, b } = ...`
    /\b(?:const|let|var)\s*\{([^}]*)\}/g,
    // Arrow parameters are locally bound: `(e) => …`, `([k, v]) => …`
    /\(([^()]*)\)\s*=>/g,
    /\b([A-Za-z_$][\w$]*)\s*=>/g,
    // Function parameters: `function name(a, b)`
    /\bfunction\s*[A-Za-z_$\w]*\s*\(([^()]*)\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      for (const part of m[1].split(',')) {
        const name = part
          .split(':').pop()
          .replace(/[[\]{}]/g, '')
          .replace(/=.*$/, '')
          .replace(/\s|\.\.\./g, '');
        if (name) declared.add(name);
      }
    }
  }
  return declared;
}

/**
 * @throws when the report references an identifier the driver never declares.
 */
function assertReportSymbolsDeclared(driverPath) {
  const source = fs.readFileSync(driverPath, 'utf8');
  const referenced = referencedReportSymbols(source);
  const declared = declaredSymbols(source);
  const missing = referenced.filter((name) => !declared.has(name));

  if (missing.length > 0) {
    throw new Error(
      `report preflight failed — referenced but never declared: ${missing.join(', ')}`
    );
  }
  return { referenced: referenced.length, missing: [] };
}

module.exports = {
  AMBIENT,
  KEYWORDS,
  assertReportSymbolsDeclared,
  declaredSymbols,
  referencedReportSymbols,
};
