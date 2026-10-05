'use strict';

/**
 * Isolated Stage 14.7 evaluation Mongo (loopback :27018).
 *
 * Product `npm test` must stay green when this DB is intentionally absent.
 * Spawn/integration coverage remains in-tree and is required by
 * `npm run test:eval-isolated`.
 */

const { spawnSync } = require('child_process');

const ISOLATED_EVAL_MONGO_HOST = '127.0.0.1';
const ISOLATED_EVAL_MONGO_PORT = 27018;
const REQUIRE_ENV = 'TRAILIE_REQUIRE_EVAL_MONGO';

function isolatedEvalMongoReady() {
  const probe = spawnSync(
    process.execPath,
    ['-e', `
      const net = require('net');
      const socket = net.connect(${ISOLATED_EVAL_MONGO_PORT}, '${ISOLATED_EVAL_MONGO_HOST}', () => {
        socket.end();
        process.exit(0);
      });
      socket.on('error', () => process.exit(1));
      socket.setTimeout(400, () => {
        socket.destroy();
        process.exit(1);
      });
    `],
    { timeout: 1500, stdio: 'ignore' },
  );
  return probe.status === 0;
}

function requireIsolatedEvalMongo() {
  return String(process.env[REQUIRE_ENV] || '') === '1';
}

function assertIsolatedEvalMongoIfRequired() {
  if (!requireIsolatedEvalMongo()) return isolatedEvalMongoReady();
  if (isolatedEvalMongoReady()) return true;
  throw new Error(
    `isolated eval Mongo ${ISOLATED_EVAL_MONGO_HOST}:${ISOLATED_EVAL_MONGO_PORT} is required for test:eval-isolated`,
  );
}

module.exports = {
  ISOLATED_EVAL_MONGO_HOST,
  ISOLATED_EVAL_MONGO_PORT,
  REQUIRE_ENV,
  isolatedEvalMongoReady,
  requireIsolatedEvalMongo,
  assertIsolatedEvalMongoIfRequired,
};
