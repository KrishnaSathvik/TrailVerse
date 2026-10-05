'use strict';

const fs = require('fs');
const path = require('path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

describe('WP4 planner isolation boundary', () => {
  test('planner modules are pure and cannot reach stores, models, providers, prompts, or HTTP', () => {
    const source = [
      read('../evidencePlannerService.js'),
      read('../../utils/evidenceRequirement.js'),
    ].join('\n');
    expect(source).not.toMatch(/models\/|evidenceStore|mongoose|axios|fetch\s*\(|https?\.|prompts\//i);
    expect(source).not.toMatch(/npsService|factsService|ridbService|webSearch|openai|anthropic/i);
  });

  test('the live route neither imports nor reads or writes the WP3 evidence store', () => {
    const source = read('../../routes/ai.js');
    expect(source).not.toMatch(/evidenceStoreService|TrailieEvidence(?:Raw|Conflict|RefreshLease)?/);
    expect(source).not.toMatch(/findEvidence|upsertEvidence|acquireEvidenceRefreshLease/);
  });
});
