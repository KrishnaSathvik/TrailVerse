'use strict';

/**
 * Shared web-candidate persistence contract.
 *
 * `searchCandidate()` sets `quality.relationshipConfidence`, the TrailieEvidence
 * `quality` subdocument is `strict: 'throw'`, and the field was never declared.
 * Every Brave / Serper / Tavily candidate — and every direct_official_page follow
 * result, which sets the same field — failed Mongoose validation with an error
 * carrying no `code`, so the broker counted a generic `provider_response_invalid`
 * with an empty reason list. Structured NPS evidence was unaffected, which is why
 * NPS persisted 12 candidates in the same live turn that persisted 0 web ones.
 *
 * These tests validate the transformation boundary, not the wire format:
 *   provider.normalize() → materializeCandidate() → TrailieEvidence validation
 *
 * Offline: mocked clients, validateSync() only, no network, no DB write.
 */

const { materializeCandidate } = require('../evidenceBrokerService');
const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const TrailieEvidence = require('../../models/TrailieEvidence');
const { createBraveEvidenceProvider } = require('../providers/braveEvidenceProvider');
const { createSerperEvidenceProvider } = require('../providers/serperEvidenceProvider');
const { createTavilyEvidenceProvider } = require('../providers/tavilyEvidenceProvider');

const ENTITY = { entityId: 'nps:park:yose', parkCode: 'yose', displayName: 'Yosemite National Park' };
const NOW = new Date('2026-08-17T00:00:00.000Z');
const OFFICIAL_URL = 'https://www.nps.gov/yose/planyourvisit/publictransportation.htm';
const WRONG_PARK_URL = 'https://www.nps.gov/grca/planyourvisit/shuttle-buses.htm';

const requirementFor = (topic) => ({
  topic, entity: ENTITY, evidenceTypes: ['fact'], reasonCodes: [], requirementId: `r-${topic}`,
  criticality: 'required', minimumAuthorityClass: 'official_owner',
});

/** The exact document upsertEvidenceVersion builds, then schema validation. */
function validateAsPersisted(candidate) {
  const materialized = materializeCandidate(candidate, { now: NOW });
  const keys = buildEvidenceKeys(materialized);
  const doc = {
    ...materialized,
    evidenceId: keys.evidenceId,
    logicalKey: keys.logicalKey,
    canonicalKey: keys.canonicalKey,
    provenance: { ...(materialized.provenance || {}), contentHash: keys.contentHash },
    isCurrent: true,
  };
  return new TrailieEvidence(doc).validateSync() || null;
}

const searchResults = (url = OFFICIAL_URL) => [{
  url, title: 'Public Transportation - Yosemite National Park',
  description: 'Shuttle and bus service in Yosemite Valley.',
  content: 'Yosemite Valley shuttle operates daily; parking fills early in Yosemite Village.',
}];

async function candidateFrom(provider, topic, url) {
  const request = provider.buildRequest(requirementFor(topic));
  const fetched = await provider.fetch(request, {});
  const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
  return { candidates, request, url };
}

const braveProvider = (url) => createBraveEvidenceProvider({
  braveClient: { async search() { return { results: searchResults(url) }; } },
  stageRaw: async () => ({ rawPayloadHash: 'staged' }), now: () => NOW,
});
const serperProvider = (url) => createSerperEvidenceProvider({
  serperClient: { async searchPlaces() { return { organic: searchResults(url) }; } },
  stageRaw: async () => ({ rawPayloadHash: 'staged' }), now: () => NOW,
});
const EXTRACTED_PAGE_TEXT =
  'Yosemite Valley shuttle buses run daily year-round between Yosemite Village, '
  + 'Curry Village and the trailheads. Day-use parking in Yosemite Village fills by '
  + 'mid-morning in summer; accessible parking is available near the Visitor Center.';

/**
 * Short snippets force the extract() call, which is the path that turns a search
 * hit into real page text. The whole point of the mobility/Tavily check.
 */
const tavilyProvider = (url = OFFICIAL_URL, { extractText = EXTRACTED_PAGE_TEXT } = {}) => createTavilyEvidenceProvider({
  tavilyClient: {
    async search() {
      return { results: [{ url, title: 'Public Transportation - Yosemite National Park', content: 'short' }] };
    },
    async extract(urls) {
      return { results: urls.map((u) => ({ url: u, rawContent: extractText })) };
    },
  },
  stageRaw: async () => ({ rawPayloadHash: 'staged' }), now: () => NOW,
});

describe('every shared-search provider produces a persistable candidate', () => {
  test('brave discovery candidate validates', async () => {
    const { candidates } = await candidateFrom(braveProvider(), 'transit');
    expect(candidates.length).toBeGreaterThan(0);
    expect(validateAsPersisted(candidates[0])).toBeNull();
  });

  test('serper discovery candidate validates', async () => {
    const { candidates } = await candidateFrom(serperProvider(), 'local_business');
    expect(candidates.length).toBeGreaterThan(0);
    expect(validateAsPersisted(candidates[0])).toBeNull();
  });

  test('tavily discovery candidate validates', async () => {
    const { candidates } = await candidateFrom(tavilyProvider(), 'accessibility');
    expect(candidates.length).toBeGreaterThan(0);
    expect(validateAsPersisted(candidates[0])).toBeNull();
  });

  test('the relationship confidence the producer emits is retained', async () => {
    const { candidates } = await candidateFrom(braveProvider(), 'transit');
    const confidence = candidates[0].quality.relationshipConfidence;
    expect(typeof confidence).toBe('number');
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
    expect(validateAsPersisted(candidates[0])).toBeNull();
  });

  test('an out-of-range confidence is still rejected', () => {
    const bad = {
      entityId: ENTITY.entityId, topic: 'transit', evidenceType: 'fact',
      claim: { identity: 'x', text: null, normalizedValue: null, unit: null, status: 'search_discovery', subjectId: ENTITY.entityId, objectId: OFFICIAL_URL, qualifiers: [], polarity: 'positive' },
      scope: { geographicEntityIds: [ENTITY.entityId], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
      source: { provider: 'brave', sourceClass: 'reputable_web', sourceId: 'x', url: OFFICIAL_URL, title: 't', publishedAt: null, sourceUpdatedAt: null },
      observedAt: NOW.toISOString(),
      quality: { authorityClass: 'reputable_web', scopeMatch: 'exact', relationshipConfidence: 4, conflictStatus: 'none' },
      provenance: { extractionMethod: 'search_result', extractorVersion: 'web-v1' },
    };
    expect(validateAsPersisted(bad)).toBeTruthy();
  });
});

describe('no authority escalation from the schema fix', () => {
  test.each([
    ['brave', () => braveProvider(), 'transit', 'search_discovery'],
    ['tavily', () => tavilyProvider(), 'accessibility', 'source_discovery'],
  ])('%s discovery stays reputable_web and discovery-status', async (_name, make, topic, expectedStatus) => {
    const { candidates } = await candidateFrom(make(), topic);
    const candidate = candidates[0];
    expect(candidate.quality.authorityClass).toBe('reputable_web');
    expect(candidate.quality.authorityClass).not.toBe('official_owner');
    expect(candidate.claim.status).toBe(expectedStatus);
    expect(candidate.claim.qualifiers).toEqual(expect.arrayContaining(['verify_source_page']));
    expect(validateAsPersisted(candidate)).toBeNull();
  });

  test('a discovery candidate may persist with null claim text', async () => {
    const { candidates } = await candidateFrom(braveProvider(), 'transit');
    expect(candidates[0].claim.text).toBeNull();
    expect(validateAsPersisted(candidates[0])).toBeNull();
  });
});

describe('tavily extraction reaches the model, not just a title and URL', () => {
  test('extracted page text becomes bounded claim text and persists', async () => {
    const { candidates } = await candidateFrom(tavilyProvider(), 'accessibility');
    const candidate = candidates[0];

    // The failure mode this guards: page extracted successfully, GPT gets a link.
    expect(candidate.claim.text).toBeTruthy();
    expect(candidate.claim.text).toContain('shuttle');
    expect(candidate.claim.text.length).toBeGreaterThan(60);
    expect(candidate.claim.text.length).toBeLessThanOrEqual(1600);
    expect(candidate.normalizedValue?.extractedForInspection ?? candidate.claim.normalizedValue?.extractedForInspection).toBe(true);
    expect(validateAsPersisted(candidate)).toBeNull();
  });

  test('extraction does not upgrade authority', async () => {
    const { candidates } = await candidateFrom(tavilyProvider(), 'accessibility');
    expect(candidates[0].quality.authorityClass).toBe('reputable_web');
    expect(candidates[0].claim.qualifiers).toEqual(expect.arrayContaining(['verify_source_page']));
  });

  test('extracted text from a wrong-destination page is not adopted as claim text', async () => {
    const { candidates } = await candidateFrom(tavilyProvider(WRONG_PARK_URL), 'accessibility');
    expect(candidates[0].quality.scopeMatch).not.toBe('exact');
    expect(candidates[0].claim.text).toBeNull();
  });
});

describe('destination integrity is unchanged by the schema fix', () => {
  test('correct destination resolves exact and persists', async () => {
    const { candidates } = await candidateFrom(braveProvider(OFFICIAL_URL), 'transit');
    expect(candidates[0].quality.scopeMatch).toBe('exact');
    expect(validateAsPersisted(candidates[0])).toBeNull();
  });

  test('wrong-park result is still not exact, even though it is now schema-valid', async () => {
    const { candidates } = await candidateFrom(braveProvider(WRONG_PARK_URL), 'transit');
    expect(candidates[0].quality.scopeMatch).not.toBe('exact');
    expect(candidates[0].quality.relationshipConfidence).toBeLessThan(1);
    // Schema validity must never be mistaken for ownership approval.
    expect(validateAsPersisted(candidates[0])).toBeNull();
  });
});
