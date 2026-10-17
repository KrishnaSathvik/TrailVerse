#!/usr/bin/env node
'use strict';

const mongoose = require('mongoose');
const { assessMongoTarget } = require('../src/config/mongoTargetGuard');
const { indexInventory, inspectApplicationIndexes, ensureApplicationIndexes } = require('../src/config/applicationIndexes');

async function main() {
  const mode = process.argv[2] || '--inventory';
  if (!['--inventory', '--check', '--apply'].includes(mode) || process.argv.length > 3) {
    throw new Error('Usage: provision-application-indexes.js --inventory|--check|--apply');
  }
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  if (mode === '--inventory') {
    console.log(JSON.stringify(indexInventory(), null, 2));
    return;
  }
  require('dotenv').config();
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const target = assessMongoTarget({ uri: process.env.MONGODB_URI, nodeEnv: process.env.NODE_ENV,
    allowRemoteHosts: process.env.MONGODB_DANGEROUSLY_ALLOW_REMOTE_HOSTS });
  if (!target.allowed) throw new Error(target.reason);
  try {
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
    if (mode === '--check') {
      const missing = await inspectApplicationIndexes();
      console.log(JSON.stringify({ ready: missing.length === 0, missing }, null, 2));
      if (missing.length) process.exitCode = 1;
    } else {
      console.log(JSON.stringify(await ensureApplicationIndexes({ apply: true })));
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`Application index provisioning failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { main };
