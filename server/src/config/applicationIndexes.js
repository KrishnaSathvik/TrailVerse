'use strict';

const fs = require('fs');
const path = require('path');
const { assessMongoTarget } = require('./mongoTargetGuard');

// Historical analytics collections stay in MongoDB for account erasure. Their
// indexes are not provisioned or checked at startup, so a retired TTL definition
// cannot block the server.
const RETIRED_INDEX_MODELS = new Set(['Analytics.js', 'AnalyticsSnapshot.js']);

// Load every active application model, including ones not imported by today's routes.
// Call only with automatic indexing/collection creation disabled on the connection.
function applicationModels() {
  const directory = path.join(__dirname, '../models');
  return fs.readdirSync(directory)
    .filter((file) => file.endsWith('.js') && !RETIRED_INDEX_MODELS.has(file))
    .sort()
    .map((file) => require(path.join(directory, file)));
}

function indexInventory(models = applicationModels()) {
  return models.map((Model) => ({
    model: Model.modelName,
    collection: Model.collection.collectionName,
    indexes: Model.schema.indexes().map(([key, options]) => ({ key, options })),
  }));
}

async function inspectApplicationIndexes(models = applicationModels()) {
  const missing = [];
  for (const Model of models) {
    // Mongoose's read-only comparison handles text index normalization, ordered
    // compound keys, unique/sparse/partial options and exact TTL durations.
    const { toCreate } = await Model.diffIndexes();
    const keys = new Set(toCreate.map((key) => JSON.stringify(key)));
    for (const [key, options] of Model.schema.indexes()) {
      if (keys.has(JSON.stringify(key))) {
        missing.push({ model: Model.modelName, collection: Model.collection.collectionName, key, options });
      }
    }
  }
  return missing;
}

async function ensureApplicationIndexes({ apply = false, models = applicationModels() } = {}) {
  const missing = await inspectApplicationIndexes(models);
  if (missing.length && !apply) {
    const error = new Error(`Required application indexes missing or incompatible: ${[...new Set(missing.map((entry) => entry.model))].join(', ')}. Run npm run indexes:check, review the inventory, then npm run indexes:apply before starting the server.`);
    error.code = 'APPLICATION_INDEXES_NOT_READY';
    error.indexes = missing;
    throw error;
  }
  for (const entry of missing) {
    const Model = models.find((candidate) => candidate.modelName === entry.model);
    try {
      // Additive only. Never syncIndexes(), dropIndex(), collMod(), or delete data.
      // Existing incompatible options or duplicate data require a separate migration.
      await Model.collection.createIndex(entry.key, entry.options);
    } catch (cause) {
      const error = new Error(`Cannot provision ${entry.model} index ${JSON.stringify(entry.key)} (MongoDB code ${cause.code || 'unknown'}). Resolve conflicting indexes/data with a reviewed migration; no indexes were dropped.`);
      error.code = 'APPLICATION_INDEX_PROVISION_FAILED';
      error.cause = cause;
      throw error;
    }
  }
  if (missing.length) await ensureApplicationIndexes({ models, apply: false });
  return { ready: true, requested: missing.length, models: models.length };
}

function provisionLocalIndexes(env = process.env) {
  // A development override allowing a remote host is NOT index-write permission.
  const local = assessMongoTarget({ uri: env.MONGODB_URI, nodeEnv: 'development' });
  return env.NODE_ENV !== 'production' && local.allowed && local.remoteHosts.length === 0;
}

module.exports = { applicationModels, indexInventory, inspectApplicationIndexes, ensureApplicationIndexes, provisionLocalIndexes };
