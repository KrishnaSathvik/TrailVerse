#!/usr/bin/env node
'use strict';

/**
 * Backward-compatible Subscriber status backfill.
 *
 * Usage:
 *   node scripts/migrate-subscriber-status.js
 *   node scripts/migrate-subscriber-status.js --apply
 *
 * Does not demote confirmed:true rows.
 * Does not invent confirmedAt.
 * Does not create Subscriber rows from Users.
 */
const path = require('path');
const mongoose = require('mongoose');
const { migrateSubscriberStatus } = require('../src/services/subscriberMigration');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.db.collection('subscribers');

  if (!apply) {
    const total = await collection.countDocuments();
    const missingStatus = await collection.countDocuments({
      $or: [{ status: { $exists: false } }, { status: null }],
    });
    const confirmedTrue = await collection.countDocuments({ confirmed: true });
    const pendingFlag = await collection.countDocuments({
      $or: [{ confirmed: false }, { confirmed: { $exists: false } }],
    });
    console.log(JSON.stringify({
      dryRun: true,
      total,
      missingStatus,
      wouldSetSubscribedFromConfirmedTrue: confirmedTrue,
      wouldSetPendingFromNotConfirmed: pendingFlag,
      hint: 'Re-run with --apply to write status fields',
    }, null, 2));
    return;
  }

  const result = await migrateSubscriberStatus({ collection });
  console.log(JSON.stringify({ apply: true, ...result }, null, 2));
}

main()
  .catch((err) => {
    console.error(err.message || String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
