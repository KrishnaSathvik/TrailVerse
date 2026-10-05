'use strict';

/**
 * Stage 14.7A §2 — the fail-closed persistence guard.
 *
 * This runs BEFORE any application module is imported and before any connection
 * is opened. The failure it exists to prevent is not subtle: an evaluation run
 * writing generated itineraries, revision checkpoints and prose into the live
 * TrailVerse database. Stage 14.7's preflight caught exactly that, and this is
 * the hardened version.
 *
 * Every check is a conjunction — a single miss aborts. Nothing here ever logs
 * credentials; only scheme, host, port and database name are reported.
 */

const APPROVED_EVAL_DATABASE = 'trailverse_eval_14_7';
const APPROVED_EVAL_PREFIXES = ['trailverse_eval_'];
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Host fragments that mean "this is a managed/hosted cluster". */
const HOSTED_FRAGMENTS = [
  'mongodb.net',
  'mongodb-atlas',
  '.aws.',
  '.azure.',
  '.gcp.',
  'documentdb',
  'cosmos.azure.com',
];

/** Parse without ever retaining credentials. */
function parseMongoUri(uri) {
  const m = String(uri || '').match(
    /^(mongodb(?:\+srv)?):\/\/(?:[^@]*@)?([^/?]+)\/?([^?]*)(?:\?(.*))?$/
  );
  if (!m) return null;
  const authority = m[2];
  const [host, port] = authority.includes(':')
    ? [authority.slice(0, authority.lastIndexOf(':')), authority.slice(authority.lastIndexOf(':') + 1)]
    : [authority, null];
  return {
    scheme: m[1],
    host,
    port: port ? Number(port) : null,
    database: m[3] || '',
  };
}

/** Sanitized description safe to print and to embed in a report. */
function describe(parsed) {
  if (!parsed) return { scheme: null, host: null, port: null, database: null };
  return { scheme: parsed.scheme, host: parsed.host, port: parsed.port, database: parsed.database };
}

const isApprovedDatabase = (db) =>
  db === APPROVED_EVAL_DATABASE || APPROVED_EVAL_PREFIXES.some((p) => db.startsWith(p) && db.length > p.length);

/**
 * Static evaluation. No I/O — safe to call before anything is imported.
 *
 * @returns {{ok: boolean, failures: string[], target: Object}}
 */
function assessEvalPersistenceTarget({ evalUri, productionUri } = {}) {
  const failures = [];
  const parsed = parseMongoUri(evalUri);

  if (!evalUri) {
    return {
      ok: false,
      failures: ['TRAILIE_EVAL_TEST_MONGODB_URI is not set'],
      target: describe(null),
    };
  }
  if (!parsed) {
    return { ok: false, failures: ['evaluation URI could not be parsed'], target: describe(null) };
  }

  if (productionUri && String(evalUri).trim() === String(productionUri).trim()) {
    failures.push('evaluation URI is identical to MONGODB_URI');
  }
  if (parsed.scheme !== 'mongodb') {
    failures.push(`scheme must be local mongodb://, got ${parsed.scheme}://`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.host)) {
    failures.push(`host must be loopback, got ${parsed.host}`);
  }
  if (!isApprovedDatabase(parsed.database)) {
    failures.push(
      `database must be ${APPROVED_EVAL_DATABASE} or start with ${APPROVED_EVAL_PREFIXES.join('/')}, got "${parsed.database || '(none)'}"`
    );
  }
  const hosted = HOSTED_FRAGMENTS.find((f) => String(evalUri).toLowerCase().includes(f));
  if (hosted) {
    failures.push(`evaluation URI contains a hosted-cluster fragment (${hosted})`);
  }

  return { ok: failures.length === 0, failures, target: describe(parsed) };
}

/**
 * Full guard: static checks, then a live `ping` against the isolated instance.
 * Aborts before the caller is allowed to import the application.
 */
async function requireIsolatedEvalDatabase({
  evalUri = process.env.TRAILIE_EVAL_TEST_MONGODB_URI,
  productionUri = process.env.MONGODB_URI,
  connect,
} = {}) {
  const assessment = assessEvalPersistenceTarget({ evalUri, productionUri });
  if (!assessment.ok) return { ...assessment, reachable: false };

  // Only now is a connection attempted, and only to the verified-local target.
  try {
    const ping = await connect(evalUri);
    if (!ping || ping.ok !== 1) {
      return { ...assessment, ok: false, reachable: false, failures: ['evaluation database did not respond to ping'] };
    }
  } catch (err) {
    return {
      ...assessment,
      ok: false,
      reachable: false,
      // Bounded: the driver message can carry the URI, so it is not propagated.
      failures: ['evaluation database is unreachable'],
    };
  }

  return { ...assessment, reachable: true };
}

/** Dropping a whole database is permitted ONLY for a verified eval namespace. */
function mayDropDatabase(evalUri) {
  const assessment = assessEvalPersistenceTarget({ evalUri, productionUri: null });
  return assessment.ok && assessment.target.database === APPROVED_EVAL_DATABASE;
}

module.exports = {
  APPROVED_EVAL_DATABASE,
  APPROVED_EVAL_PREFIXES,
  parseMongoUri,
  assessEvalPersistenceTarget,
  requireIsolatedEvalDatabase,
  mayDropDatabase,
};
