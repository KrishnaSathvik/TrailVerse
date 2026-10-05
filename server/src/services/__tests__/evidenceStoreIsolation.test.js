'use strict';

const fs = require('fs');
const path = require('path');

describe('WP3 rollout isolation', () => {
  test('the index rollout is dry-run by default and creates without dropping indexes', async () => {
    const { createEvidenceIndexes } = require('../../../scripts/create-trailie-evidence-indexes');
    const calls = [];
    const models = {
      Entity: { collection: { collectionName: 'trailie_entities' }, createIndexes: async () => calls.push('entity') },
      Evidence: { collection: { collectionName: 'trailie_evidence' }, createIndexes: async () => calls.push('evidence') },
    };

    const dryRun = await createEvidenceIndexes({ models, apply: false });
    expect(dryRun).toEqual({ applied: false, collections: ['trailie_entities', 'trailie_evidence'] });
    expect(calls).toEqual([]);

    await createEvidenceIndexes({ models, apply: true });
    expect(calls).toEqual(['entity', 'evidence']);
  });

  test('live Trailie routes do not import or call the WP3 store', () => {
    const route = fs.readFileSync(path.join(__dirname, '../../routes/ai.js'), 'utf8');
    expect(route).not.toMatch(/evidenceStoreService|TrailieEvidence|resolveEvidence|upsertEvidenceVersion/);
  });
});
