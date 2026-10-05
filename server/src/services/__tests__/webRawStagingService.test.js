'use strict';

const {
  WEB_RAW_LICENSE_POLICIES,
  stageWebRawEvidence,
} = require('../webRawStagingService');

const NOW = new Date('2026-08-09T12:00:00.000Z');

function RawModel() {
  return { findOneAndUpdate: jest.fn().mockImplementation(async (_filter, update) => update.$setOnInsert) };
}

describe('WP6 bounded licensed web raw staging', () => {
  test('provider policy fixes retention and excerpt bounds before persistence', async () => {
    const model = RawModel();
    const staged = await stageWebRawEvidence({
      RawModel: model, provider: 'brave', operation: 'search', sourceUrl: 'https://www.nps.gov/yose/planyourvisit/conditions.htm',
      payload: { title: 'Conditions', snippet: 'x'.repeat(3000) }, now: NOW,
    });
    expect(staged).toMatchObject({
      privacyScope: 'public', provider: 'brave', sourceUrl: 'https://www.nps.gov/yose/planyourvisit/conditions.htm',
      metadata: { operation: 'search', licenseClass: 'search_snippet_transient' },
    });
    expect(staged.excerpt).toHaveLength(1000);
    expect(staged.deleteAfter.toISOString()).toBe('2026-08-10T12:00:00.000Z');
    expect(staged.rawPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('Serper metadata-only licensing stores no snippet text', async () => {
    const model = RawModel();
    const staged = await stageWebRawEvidence({
      RawModel: model, provider: 'serper', operation: 'places_search', sourceUrl: 'https://example.com/place',
      payload: { title: 'Restaurant', snippet: 'licensed provider text' }, now: NOW,
    });
    expect(staged.excerpt).toBeNull();
    expect(staged.metadata).toMatchObject({ licenseClass: 'search_metadata_only' });
    expect(staged.deleteAfter.toISOString()).toBe(NOW.toISOString());
  });

  test('Tavily extraction is shorter-lived than direct government pages', () => {
    expect(WEB_RAW_LICENSE_POLICIES.tavily_extract.retentionSeconds)
      .toBeLessThan(WEB_RAW_LICENSE_POLICIES.direct_official_page_fetch.retentionSeconds);
  });

  test('rejects private query/origin metadata before opening a write', async () => {
    const model = RawModel();
    await expect(stageWebRawEvidence({
      RawModel: model, provider: 'brave', operation: 'search', sourceUrl: 'https://example.com',
      payload: { title: 'Result', snippet: 'public' },
      metadata: { exactOrigin: '123 Private Street' }, now: NOW,
    })).rejects.toMatchObject({ code: 'shared_evidence_private_data' });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects unknown provider-operation licensing before persistence', async () => {
    const model = RawModel();
    await expect(stageWebRawEvidence({
      RawModel: model, provider: 'unknown_search', operation: 'search', sourceUrl: 'https://example.com',
      payload: {}, now: NOW,
    })).rejects.toMatchObject({ code: 'web_raw_license_policy_missing' });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
