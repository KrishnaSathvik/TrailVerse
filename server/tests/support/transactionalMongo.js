'use strict';

/**
 * PHASE 4O — EVIDENCE PERSISTENCE NEEDS A REPLICA SET, AND MUST SAY SO LOUDLY.
 *
 * `upsertEvidenceVersion` writes inside `session.withTransaction`. A standalone
 * mongod rejects that outright:
 *
 *     MongoServerError 20 — Transaction numbers are only allowed on a replica
 *                           set member or mongos
 *
 * The broker catches a persist failure per candidate, counts it, and reports the
 * requirement as `missing ["provider_response_invalid"]`. So on a standalone
 * store the whole stack looks like this:
 *
 *     provider fetch        succeeds       53 thingstodo + 213 places
 *     normalization         succeeds       266 candidates
 *     persistence           FAILS          every single one
 *     bundle                evidenceCount: 0
 *
 * Phase 4K read that empty bundle as a fact about the environment and recorded
 * it as a bound on what a live run could demonstrate. It was a fact about the
 * test database. Phase 4N reproduced it four times over four parks before the
 * resolution reason codes gave it away.
 *
 * That failure mode is far too quiet to leave to a comment, so any fixture that
 * exercises real evidence persistence calls `assertTransactionalMongo()` and
 * fails immediately, with the reason, rather than concluding there is no
 * evidence.
 */

const SCRATCH_COLLECTION = 'transactional_topology_probe';

/**
 * Does this connection's server actually accept a transaction?
 *
 * A functional probe, not a version sniff: it opens a session, runs a trivial
 * write inside a transaction, and reports what the server said. Capability
 * flags have moved between driver versions; the server's answer has not.
 *
 * @param {import('mongoose').Connection} connection
 * @returns {Promise<{ ok: boolean, reason: string|null, code: number|null }>}
 */
async function probeTransactionSupport(connection) {
  if (!connection || connection.readyState !== 1) {
    return { ok: false, reason: 'no open mongo connection', code: null };
  }
  let session;
  try {
    session = await connection.startSession();
    await session.withTransaction(async () => {
      await connection.db.collection(SCRATCH_COLLECTION)
        .insertOne({ probe: true, at: new Date() }, { session });
    });
    return { ok: true, reason: null, code: null };
  } catch (error) {
    return {
      ok: false,
      reason: String(error?.message || error).slice(0, 300),
      code: Number.isFinite(error?.code) ? error.code : null,
    };
  } finally {
    try { await session?.endSession(); } catch { /* probe teardown */ }
    try { await connection.db.collection(SCRATCH_COLLECTION).deleteMany({ probe: true }); } catch { /* probe teardown */ }
  }
}

/**
 * Fail the fixture NOW, with the reason, rather than letting persistence fail
 * silently and be read as "the provider returned nothing".
 */
async function assertTransactionalMongo(connection) {
  const verdict = await probeTransactionSupport(connection);
  if (verdict.ok) return verdict;
  throw new Error(
    'This fixture persists evidence, which requires a transaction-capable mongod.\n'
    + `The connected server refused a transaction: ${verdict.reason}\n`
    + 'Use MongoMemoryReplSet (see tests/support/transactionalMongo.js), not MongoMemoryServer.\n'
    + 'A standalone store makes every candidate fail to persist, which the broker reports as\n'
    + '`missing ["provider_response_invalid"]` and a caller reads as an empty bundle.'
  );
}

/**
 * An ephemeral REPLICA SET plus a dedicated connection, so a suite can persist
 * evidence for real without disturbing the shared standalone connection the
 * global setup installs.
 */
async function startTransactionalMongo({ dbName = 'transactional' } = {}) {
  const mongoose = require('mongoose');
  // Resolved by package name, not from `process.cwd()`: a cwd-relative require
  // breaks the moment jest is invoked from a different directory.
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const connection = mongoose.createConnection(server.getUri(), { dbName });
  await connection.asPromise();
  await assertTransactionalMongo(connection);
  return {
    server,
    connection,
    /** Compile a model bound to THIS connection from a globally registered one. */
    modelFrom: (model) => connection.model(model.modelName, model.schema),
    async stop() {
      try { await connection.dropDatabase(); } catch { /* teardown */ }
      try { await connection.close(); } catch { /* teardown */ }
      try { await server.stop(); } catch { /* teardown */ }
    },
  };
}

module.exports = {
  assertTransactionalMongo,
  probeTransactionSupport,
  startTransactionalMongo,
};
