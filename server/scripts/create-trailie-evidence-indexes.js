#!/usr/bin/env node
'use strict';

const mongoose = require('mongoose');

const defaultModels = () => ({
  Entity: require('../src/models/TrailieEntity'),
  Evidence: require('../src/models/TrailieEvidence'),
  Raw: require('../src/models/TrailieEvidenceRaw'),
  Conflict: require('../src/models/TrailieEvidenceConflict'),
  Lease: require('../src/models/TrailieEvidenceRefreshLease'),
  RefreshEvent: require('../src/models/TrailieEvidenceRefreshEvent'),
});

async function createEvidenceIndexes({ models = defaultModels(), apply = false } = {}) {
  const collections = Object.values(models).map((Model) => Model.collection.collectionName);
  if (!apply) return { applied: false, collections };
  for (const Model of Object.values(models)) await Model.createIndexes();
  return { applied: true, collections };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const models = defaultModels();
  if (!apply) {
    process.stdout.write(`${JSON.stringify(await createEvidenceIndexes({ models, apply }))}\n`);
    return;
  }
  require('dotenv').config();
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required with --apply');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const result = await createEvidenceIndexes({ models, apply: true });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Trailie evidence index creation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  createEvidenceIndexes,
};
