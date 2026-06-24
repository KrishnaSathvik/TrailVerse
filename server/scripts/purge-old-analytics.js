#!/usr/bin/env node
/**
 * Purge Analytics events older than the retention window and ensure the TTL index exists.
 *
 * Safe by default — dry-run unless --apply is passed.
 *
 * Usage:
 *   node scripts/purge-old-analytics.js
 *   node scripts/purge-old-analytics.js --apply
 *   node scripts/purge-old-analytics.js --days=60 --apply
 *   node scripts/purge-old-analytics.js --event-type=api_call --days=7 --apply
 *   node scripts/purge-old-analytics.js --ensure-ttl --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Analytics = require('../src/models/Analytics');
const {
  ANALYTICS_RETENTION_DAYS,
  ANALYTICS_RETENTION_SECONDS,
  API_CALL_RETENTION_DAYS,
  API_CALL_RETENTION_SECONDS,
  NON_API_CALL_EVENT_TYPES,
} = require('../src/config/analyticsRetention');

const APPLY = process.argv.includes('--apply');
const ENSURE_TTL = process.argv.includes('--ensure-ttl');
const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
const eventTypeArg = process.argv.find((arg) => arg.startsWith('--event-type='));
const eventTypeFilter = eventTypeArg ? eventTypeArg.split('=')[1] : null;
const retentionDays = daysArg
  ? Math.max(1, parseInt(daysArg.split('=')[1], 10) || ANALYTICS_RETENTION_DAYS)
  : ANALYTICS_RETENTION_DAYS;
const retentionSeconds = retentionDays * 24 * 60 * 60;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}

async function connect() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name} on ${mongoose.connection.host}`);
}

async function getCollectionStats() {
  const stats = await Analytics.collection.stats().catch(() => null);
  return {
    count: await Analytics.countDocuments(),
    size: stats?.size || 0,
    storageSize: stats?.storageSize || 0,
    indexSize: stats?.totalIndexSize || 0,
  };
}

async function ensureTtlIndex() {
  const collection = Analytics.collection;
  const indexes = await collection.indexes();
  const legacyNames = [
    'analytics_timestamp_ttl',
    'analytics_api_call_ttl',
    'analytics_general_ttl',
  ];
  const desired = [
    {
      name: 'analytics_api_call_ttl',
      expireAfterSeconds: API_CALL_RETENTION_SECONDS,
      partialFilterExpression: { eventType: 'api_call' },
      label: `${API_CALL_RETENTION_DAYS} days (api_call only)`,
    },
    {
      name: 'analytics_general_ttl',
      expireAfterSeconds: ANALYTICS_RETENTION_SECONDS,
      partialFilterExpression: { eventType: { $in: NON_API_CALL_EVENT_TYPES } },
      label: `${ANALYTICS_RETENTION_DAYS} days (non-api_call)`,
    },
  ];

  const legacyTimestampIndexes = indexes.filter(
    (idx) => idx.key?.timestamp === 1 && !legacyNames.includes(idx.name)
  );

  const allCurrent = desired.every((spec) => {
    const existing = indexes.find((idx) => idx.name === spec.name);
    return (
      existing &&
      existing.expireAfterSeconds === spec.expireAfterSeconds &&
      JSON.stringify(existing.partialFilterExpression) === JSON.stringify(spec.partialFilterExpression)
    );
  });

  if (allCurrent && legacyTimestampIndexes.length === 0) {
    console.log('TTL indexes already up to date.');
    for (const spec of desired) {
      console.log(`  - ${spec.name}: ${spec.label}`);
    }
    return;
  }

  if (!APPLY) {
    console.log('Would ensure partial TTL indexes:');
    for (const spec of desired) {
      console.log(`  - ${spec.name}: ${spec.label}`);
    }
    for (const legacy of legacyTimestampIndexes) {
      console.log(`Would drop legacy index "${legacy.name}".`);
    }
    if (indexes.find((idx) => idx.name === 'analytics_timestamp_ttl')) {
      console.log('Would drop legacy index "analytics_timestamp_ttl".');
    }
    return;
  }

  for (const legacy of legacyTimestampIndexes) {
    await collection.dropIndex(legacy.name);
    console.log(`Dropped legacy index "${legacy.name}".`);
  }

  if (indexes.find((idx) => idx.name === 'analytics_timestamp_ttl')) {
    await collection.dropIndex('analytics_timestamp_ttl');
    console.log('Dropped legacy index "analytics_timestamp_ttl".');
  }

  for (const spec of desired) {
    const existing = indexes.find((idx) => idx.name === spec.name);
    if (existing) {
      await collection.dropIndex(spec.name);
      console.log(`Dropped outdated TTL index "${spec.name}".`);
    }
    await collection.createIndex(
      { timestamp: 1 },
      {
        expireAfterSeconds: spec.expireAfterSeconds,
        name: spec.name,
        partialFilterExpression: spec.partialFilterExpression,
      }
    );
    console.log(`Created TTL index "${spec.name}" (${spec.label}).`);
  }
}

async function purgeOldEvents() {
  const cutoff = new Date(Date.now() - retentionSeconds * 1000);
  const filter = { timestamp: { $lt: cutoff } };
  if (eventTypeFilter) {
    filter.eventType = eventTypeFilter;
  }
  const toDelete = await Analytics.countDocuments(filter);

  const [oldestMatch, oldestOverall, newest] = await Promise.all([
    Analytics.findOne(filter).sort({ timestamp: 1 }).select('timestamp eventType').lean(),
    Analytics.findOne().sort({ timestamp: 1 }).select('timestamp eventType').lean(),
    Analytics.findOne().sort({ timestamp: -1 }).select('timestamp').lean(),
  ]);

  const typeBreakdown = await Analytics.aggregate([
    { $match: filter },
    { $group: { _id: '$eventType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);

  console.log('\nAnalytics summary');
  console.log(`  Retention window: ${retentionDays} days`);
  if (eventTypeFilter) {
    console.log(`  Event type filter: ${eventTypeFilter}`);
  }
  console.log(`  Cutoff: ${cutoff.toISOString()}`);
  console.log(`  Documents to delete: ${toDelete.toLocaleString()}`);
  if (oldestOverall) {
    console.log(
      `  Oldest event in DB: ${oldestOverall.timestamp.toISOString()} (${oldestOverall.eventType})`
    );
  }
  if (oldestMatch) {
    console.log(
      `  Oldest matching event: ${oldestMatch.timestamp.toISOString()} (${oldestMatch.eventType})`
    );
  }
  if (newest) {
    console.log(`  Newest event in DB: ${newest.timestamp.toISOString()}`);
  }
  if (typeBreakdown.length > 0) {
    console.log('  Matching breakdown:');
    for (const row of typeBreakdown) {
      console.log(`    ${row._id}: ${row.count.toLocaleString()}`);
    }
  }

  if (toDelete === 0) {
    console.log('\nNothing to purge.');
    return { deletedCount: 0 };
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to delete.');
    return { deletedCount: 0 };
  }

  const result = await Analytics.deleteMany(filter);
  console.log(`\nDeleted ${result.deletedCount.toLocaleString()} analytics events.`);
  return result;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  if (retentionDays !== ANALYTICS_RETENTION_DAYS) {
    console.log(`Using custom retention: ${retentionDays} days (default is ${ANALYTICS_RETENTION_DAYS}).`);
  }
  if (eventTypeFilter) {
    console.log(`Filtering to eventType="${eventTypeFilter}" only.`);
  }

  await connect();

  const before = await getCollectionStats();
  console.log('\nBefore:');
  console.log(`  Documents: ${before.count.toLocaleString()}`);
  console.log(`  Data size: ${formatBytes(before.size)}`);
  console.log(`  Storage size: ${formatBytes(before.storageSize)}`);
  console.log(`  Index size: ${formatBytes(before.indexSize)}`);

  if (ENSURE_TTL) {
    await ensureTtlIndex();
  }

  await purgeOldEvents();

  if (APPLY) {
    const after = await getCollectionStats();
    console.log('\nAfter:');
    console.log(`  Documents: ${after.count.toLocaleString()}`);
    console.log(`  Data size: ${formatBytes(after.size)}`);
    console.log(`  Storage size: ${formatBytes(after.storageSize)}`);
    console.log(`  Index size: ${formatBytes(after.indexSize)}`);
    console.log(
      '\nNote: Atlas may take a few minutes to reflect reclaimed space in cluster metrics.'
    );
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('purge-old-analytics failed:', error.message);
  process.exit(1);
});
