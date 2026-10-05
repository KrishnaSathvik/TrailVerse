#!/usr/bin/env node
'use strict';

// Read-only by default. Never import Mongoose models or run syncIndexes here.
const { MongoClient } = require('mongodb');
const { NON_API_CALL_EVENT_TYPES } = require('../src/config/analyticsRetention');
const DATABASE = 'trailverse';
const COLLECTION = 'analytics';
const SECONDS = 604800;
const NAMES = ['analytics_api_call_ttl', 'analytics_general_ttl'];

function validateIndexes(indexes) {
  const selected = NAMES.map(name => indexes.find(index => index.name === name));
  for (const index of selected) {
    if (!index || JSON.stringify(index.key) !== '{"timestamp":1}' ||
        !Number.isFinite(index.expireAfterSeconds)) {
      throw new Error('Missing or unexpected existing analytics TTL index; no changes allowed');
    }
  }
  if (JSON.stringify(selected[0].partialFilterExpression) !== '{"eventType":"api_call"}') {
    throw new Error('Unexpected API TTL filter; inspect manually');
  }
  const filter = selected[1].partialFilterExpression;
  const types = filter?.eventType?.$in;
  // The inspected production index predates crowd_calendar_view. Preserve its
  // exact filter; changing expiry must not silently broaden deletion scope.
  const knownFilters = [NON_API_CALL_EVENT_TYPES,
    NON_API_CALL_EVENT_TYPES.filter(type => type !== 'crowd_calendar_view')];
  if (!types || Object.keys(filter).length !== 1 || Object.keys(filter.eventType).length !== 1 ||
      !knownFilters.some(known => JSON.stringify([...types].sort()) === JSON.stringify([...known].sort()))) {
    throw new Error('Unexpected general TTL filter; inspect manually');
  }
  if (indexes.some(index => Number.isFinite(index.expireAfterSeconds) && !NAMES.includes(index.name))) {
    throw new Error('Additional TTL index present; inspect manually');
  }
  return selected;
}

async function buildPlan(db, at = new Date()) {
  if (db.databaseName !== DATABASE) throw new Error('Only trailverse.analytics is permitted');
  const collection = db.collection(COLLECTION);
  const indexes = validateIndexes(await collection.listIndexes().toArray());
  const cutoff = new Date(at.getTime() - SECONDS * 1000);
  const changes = [];
  for (const index of indexes) {
    if (index.expireAfterSeconds === SECONDS) continue;
    const affectedRecords = await collection.countDocuments({
      $and: [index.partialFilterExpression, { timestamp: { $type: 'date', $lt: cutoff } }],
    });
    changes.push({ name: index.name, key: index.key, partialFilterExpression: index.partialFilterExpression,
      previousSeconds: index.expireAfterSeconds, targetSeconds: SECONDS, affectedRecords,
      command: { collMod: COLLECTION, index: { name: index.name, expireAfterSeconds: SECONDS } } });
  }
  return { namespace: `${DATABASE}.${COLLECTION}`, inspectedAt: at.toISOString(), cutoff: cutoff.toISOString(),
    affectedRecords: changes.reduce((sum, change) => sum + change.affectedRecords, 0), changes,
    unchangedIndexes: indexes.filter(index => index.expireAfterSeconds === SECONDS).map(index => index.name),
    configuredEventTypesNotCovered: NON_API_CALL_EVENT_TYPES.filter(type =>
      !indexes[1].partialFilterExpression.eventType.$in.includes(type)),
    impact: 'Permanently deletes matching analytics older than seven days, including existing history. TTL continues on a rolling cutoff. No other collection is targeted.',
    approvalRequired: true };
}

// Application is deliberately separate from this preview. After user approval,
// re-inspect options/counts and execute only the displayed collMod commands.
async function main() {
  if (process.argv.length > 2) throw new Error('This script is read-only and accepts no mutation flags');
  const uri = process.env.ANALYTICS_MONGODB_URI;
  if (!uri) throw new Error('Set ANALYTICS_MONGODB_URI securely; no default or .env is loaded');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await buildPlan(client.db(DATABASE)), null, 2));
  } finally { await client.close(); }
}
if (require.main === module) main().catch(error => { console.error(error.name, 'Analytics retention preview failed; no changes made'); process.exitCode = 1; });
module.exports = { validateIndexes, buildPlan };
