'use strict';

const { createHash } = require('crypto');
const { assertPublicEvidenceWrite } = require('../utils/evidencePrivacy');

const WEB_RAW_LICENSE_POLICIES = Object.freeze({
  brave_search: Object.freeze({ retentionSeconds: 86400, maxExcerptCharacters: 1000, licenseClass: 'search_snippet_transient' }),
  serper_places_search: Object.freeze({ retentionSeconds: 0, maxExcerptCharacters: 0, licenseClass: 'search_metadata_only' }),
  serper_search: Object.freeze({ retentionSeconds: 0, maxExcerptCharacters: 0, licenseClass: 'search_metadata_only' }),
  tavily_search: Object.freeze({ retentionSeconds: 86400, maxExcerptCharacters: 1000, licenseClass: 'search_snippet_transient' }),
  tavily_extract: Object.freeze({ retentionSeconds: 21600, maxExcerptCharacters: 2000, licenseClass: 'extracted_page_transient' }),
  tavily_crawl: Object.freeze({ retentionSeconds: 21600, maxExcerptCharacters: 2000, licenseClass: 'extracted_page_transient' }),
  direct_official_page_fetch: Object.freeze({ retentionSeconds: 7 * 86400, maxExcerptCharacters: 4000, licenseClass: 'government_public' }),
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function licensePolicy(provider, operation) {
  const policy = WEB_RAW_LICENSE_POLICIES[`${provider}_${operation}`];
  if (!policy) {
    const error = new Error('Web raw staging requires an explicit provider-operation license policy');
    error.code = 'web_raw_license_policy_missing';
    throw error;
  }
  return policy;
}

function excerptFor(payload, policy) {
  if (policy.maxExcerptCharacters === 0) return null;
  const value = payload?.snippet ?? payload?.content ?? payload?.text ?? null;
  if (value == null) return null;
  return String(value).slice(0, policy.maxExcerptCharacters);
}

async function stageWebRawEvidence({
  RawModel = null,
  provider,
  operation,
  sourceUrl,
  payload,
  metadata = {},
  httpStatus = null,
  now = new Date(),
} = {}) {
  const policy = licensePolicy(provider, operation);
  const fetchedAt = now instanceof Date ? new Date(now) : new Date(now);
  if (Number.isNaN(fetchedAt.getTime())) throw new TypeError('Web raw staging requires a valid time');
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); } catch { throw Object.assign(new TypeError('Web raw staging requires a valid source URL'), { code: 'web_source_url_invalid' }); }
  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    throw Object.assign(new TypeError('Web raw staging requires an HTTP source URL'), { code: 'web_source_url_invalid' });
  }
  const privacyItem = { privacyScope: 'public', payload, metadata };
  assertPublicEvidenceWrite({
    item: privacyItem,
    sourceRequest: { privacyScope: 'public', provider, operation, sourceUrl: parsedUrl.toString() },
  });
  const rawPayloadHash = digest(payload);
  const rawId = `raw:web:${digest({ provider, operation, sourceUrl: parsedUrl.toString(), rawPayloadHash })}`;
  const record = {
    rawId,
    privacyScope: 'public',
    provider,
    sourceId: null,
    sourceUrl: parsedUrl.toString(),
    httpStatus,
    rawPayloadHash,
    excerpt: excerptFor(payload, policy),
    metadata: { operation, licenseClass: policy.licenseClass, ...metadata },
    fetchedAt,
    deleteAfter: new Date(fetchedAt.getTime() + policy.retentionSeconds * 1000),
  };
  assertPublicEvidenceWrite({
    item: record,
    sourceRequest: { privacyScope: 'public', provider, operation },
  });
  const Model = RawModel || require('../models/TrailieEvidenceRaw');
  return Model.findOneAndUpdate(
    { rawId },
    { $setOnInsert: record },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = { WEB_RAW_LICENSE_POLICIES, stageWebRawEvidence };
