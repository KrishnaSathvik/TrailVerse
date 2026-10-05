#!/usr/bin/env node
'use strict';

/**
 * Sync confirmed Where Next? Subscriber rows to Beehiiv.
 *
 * Usage:
 *   node scripts/sync-newsletter-subscribers-to-beehiiv.js
 *   node scripts/sync-newsletter-subscribers-to-beehiiv.js --apply
 *
 * Selects only:
 *   status = subscribed AND beehiivSyncStatus != synced
 *
 * Never selects Users, pending, unsubscribed, or suppressed rows.
 * Does not send campaigns. Does not auto-run on deploy.
 */
const path = require('path');
const mongoose = require('mongoose');
const { findUnsyncedSubscribed, syncSubscriber } = require('../src/services/beehiivSync');
const Subscriber = require('../src/models/Subscriber');
const { isConfigured } = require('../src/config/beehiiv');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const eligible = await findUnsyncedSubscribed();

  const report = {
    dryRun: !apply,
    configured: isConfigured(),
    eligible: eligible.length,
    emailsOmitted: true,
    statuses: eligible.map((row) => row.status),
  };

  if (!apply) {
    console.log(JSON.stringify({
      ...report,
      hint: 'Re-run with --apply to sync eligible subscribed rows. Pending and Users are excluded.',
    }, null, 2));
    return;
  }

  if (!isConfigured()) {
    console.log(JSON.stringify({ ...report, applied: 0, error: 'Beehiiv is not configured' }, null, 2));
    return;
  }

  let synced = 0;
  let failed = 0;
  for (const row of eligible) {
    const doc = await Subscriber.findById(row._id);
    const result = await syncSubscriber(doc);
    if (result.synced) synced += 1;
    else failed += 1;
  }

  console.log(JSON.stringify({ dryRun: false, eligible: eligible.length, synced, failed }, null, 2));
}

main()
  .catch((err) => {
    console.error(err.message || String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
