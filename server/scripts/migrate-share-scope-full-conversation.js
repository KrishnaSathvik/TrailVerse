#!/usr/bin/env node
'use strict';

/**
 * Switch existing share links to show the whole conversation.
 *
 * Stage 8 made `plan_only` the default share scope, and the share UI never
 * offered a choice — so every link shared since then shows only the plan, with
 * the chat hidden. New shares now default to `full_conversation`; this
 * one-off migration moves EXISTING shared trips still on `plan_only` (or with
 * no scope) to `full_conversation`, so links already sent out show the chat too.
 *
 * Trips an owner explicitly set to `plan_plus_explanation` are left alone.
 * Unshared trips (no shareId) are not touched.
 *
 *   node scripts/migrate-share-scope-full-conversation.js           # dry run (count only)
 *   node scripts/migrate-share-scope-full-conversation.js --apply   # write
 */

const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const FILTER = Object.freeze({
  shareId: { $exists: true, $nin: [null, ''] },
  $or: [{ shareScope: 'plan_only' }, { shareScope: { $exists: false } }, { shareScope: null }],
});

async function migrate({ TripPlan, apply = false, log = console.log } = {}) {
  const count = await TripPlan.countDocuments(FILTER);
  log(`${count} shared trip(s) currently hide the conversation.`);
  if (!apply) {
    log('Dry run — re-run with --apply to switch them to full_conversation.');
    return { matched: count, modified: 0 };
  }
  const result = await TripPlan.updateMany(FILTER, { $set: { shareScope: 'full_conversation' } });
  log(`Updated ${result.modifiedCount} shared trip(s) to full_conversation.`);
  return { matched: result.matchedCount, modified: result.modifiedCount };
}

async function main() {
  require('dotenv').config();
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI first.');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await migrate({ TripPlan: require('../src/models/TripPlan'), apply: APPLY });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { FILTER, migrate };
