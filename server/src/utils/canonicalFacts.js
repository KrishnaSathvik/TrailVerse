'use strict';

/**
 * Canonical facts — structured evidence captured before live data is flattened
 * into prompt strings. The reviewer cites these by id; patch policy reads their
 * authority/status to decide what a fact is allowed to prove.
 */

const crypto = require('crypto');

/** How much weight a fact carries as evidence. */
const AUTHORITY = {
  AUTHORITATIVE: 'authoritative',
  SECONDARY: 'secondary',
  LISTING_ONLY: 'listing_only',
};

/**
 * What the fact actually establishes. Critically, a Recreation.gov listing
 * proves only that a listing exists — never that a permit is currently required,
 * and an empty result never proves that none is required.
 */
const STATUS = {
  CONFIRMED_REQUIRED: 'confirmed_required',
  CONFIRMED_NOT_REQUIRED: 'confirmed_not_required',
  ACTIVE_CLOSURE: 'active_closure',
  ACTIVE_CAUTION: 'active_caution',
  LISTING_ONLY: 'listing_only',
  STATUS_UNKNOWN: 'status_unknown',
  LISTING_NOT_FOUND: 'listing_not_found',
};

const CACHE_STATUS = {
  LIVE: 'live',
  CACHED: 'cached',
  UNKNOWN: 'unknown',
};

const TERM_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'with', 'from', 'this', 'that',
  'not', 'all', 'any', 'has', 'have', 'been', 'will', 'may', 'can', 'due',
  'per', 'via', 'you', 'your', 'out', 'off', 'until', 'during', 'between',
  'park', 'national', 'please', 'more', 'information', 'available', 'see',
]);

/** Deterministic short hash — used for fact ids when the source has no native id. */
function contentHash(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

/** Ids are embedded in a colon-delimited key, so colons and whitespace must go. */
function sanitizeIdPart(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[\s:]+/g, '-')
    .slice(0, 64);
}

/**
 * Stable, collision-free across parks within one request.
 * Shape: `source:parkCode:category:sourceId|hash`
 */
function makeFactId({ source, parkCode, category, sourceId, text }) {
  const scope = sanitizeIdPart(parkCode) || 'global';
  const native = sanitizeIdPart(sourceId);
  const suffix = native || contentHash(category, text || '');
  return `${sanitizeIdPart(source)}:${scope}:${sanitizeIdPart(category)}:${suffix}`;
}

/** Lowercase content words used to route facts to the sections that mention them. */
function deriveTerms(text) {
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !TERM_STOPWORDS.has(t));

  return [...new Set(tokens)].slice(0, 12);
}

/**
 * @param {Object} input
 * @returns {Object} canonical fact
 */
function makeFact({
  source,
  category,
  text,
  parkCode = null,
  parkName = null,
  sourceId = null,
  url = null,
  authority = AUTHORITY.AUTHORITATIVE,
  status = STATUS.STATUS_UNKNOWN,
  retrievedAt,
  sourceUpdatedAt = null,
  cacheStatus = CACHE_STATUS.UNKNOWN,
  weatherMode = null,
}) {
  const cleanText = String(text || '').trim();
  return {
    weatherMode,
    id: makeFactId({ source, parkCode, category, sourceId, text: cleanText }),
    sourceId: sourceId == null ? null : String(sourceId),
    source,
    category,
    text: cleanText,
    parkCode: parkCode || null,
    parkName: parkName || null,
    url: url || null,
    authority,
    status,
    retrievedAt,
    sourceUpdatedAt,
    cacheStatus,
    terms: deriveTerms(cleanText),
  };
}

/** Weather-specific authority — never AUTHORITATIVE, so it cannot back closures or permits. */
const WEATHER_AUTHORITY = {
  LIVE_PROVIDER: 'live_provider',
  CLIMATE_ESTIMATE: 'climate_estimate',
};

const WEATHER_MODE = {
  // `CURRENT` requires an actual current-conditions endpoint. Nothing in the
  // pipeline produces it today — /data/2.5/forecast is a forecast feed, and its
  // first bucket is still a forecast even when it covers today.
  CURRENT: 'current',
  FORECAST: 'forecast',
  CLIMATE_ESTIMATE: 'climate_estimate',
};

/** How the fact was obtained. Freshness of retrieval, NOT the nature of the claim. */
const RETRIEVAL_MODE = {
  LIVE: 'live',
  GENERATED: 'generated',
};

const WEATHER_STATUS = {
  OBSERVED: 'observed',
  FORECAST: 'forecast',
  ESTIMATED: 'estimated',
};

/**
 * A weather fact carries its own validity window so a forecast for one day can
 * never authorize wording about another.
 */
function makeWeatherFact({
  source,
  weatherMode,
  status,
  text,
  locationName = null,
  parkCode = null,
  latitude = null,
  longitude = null,
  validAt = null,
  validFrom = null,
  validTo = null,
  dayLabel = null,
  localDate = null,
  timezoneOffsetSeconds = null,
  timezoneSource = 'unknown',
  retrievalMode = RETRIEVAL_MODE.LIVE,
  retrievedAt,
  sourceUpdatedAt = null,
  cacheStatus = CACHE_STATUS.UNKNOWN,
  sourceId = null,
}) {
  const cleanText = String(text || '').trim();
  const authority =
    weatherMode === WEATHER_MODE.CLIMATE_ESTIMATE
      ? WEATHER_AUTHORITY.CLIMATE_ESTIMATE
      : WEATHER_AUTHORITY.LIVE_PROVIDER;

  return {
    id: makeFactId({
      source,
      parkCode,
      category: 'weather',
      sourceId: sourceId || localDate || validFrom || dayLabel,
      text: cleanText,
    }),
    sourceId: sourceId == null ? null : String(sourceId),
    source,
    category: 'weather',
    weatherMode,
    status,
    authority,
    text: cleanText,
    locationName,
    parkCode: parkCode || null,
    parkName: null,
    latitude,
    longitude,
    url: null,
    validAt,
    validFrom,
    validTo,
    dayLabel,
    localDate,
    timezoneOffsetSeconds,
    timezoneSource,
    retrievalMode,
    retrievedAt,
    sourceUpdatedAt,
    cacheStatus,
    terms: deriveTerms(cleanText),
  };
}

/** True when this fact may back a statement that something IS required/closed. */
function factSupportsRequirementClaim(fact) {
  if (!fact) return false;
  if (fact.authority === AUTHORITY.LISTING_ONLY) return false;
  return (
    fact.status === STATUS.CONFIRMED_REQUIRED ||
    fact.status === STATUS.ACTIVE_CLOSURE ||
    fact.status === STATUS.ACTIVE_CAUTION
  );
}

/** True when this fact may back a statement that something is NOT required/open. */
function factSupportsAbsenceClaim(fact) {
  if (!fact) return false;
  return fact.status === STATUS.CONFIRMED_NOT_REQUIRED;
}

/**
 * Build canonical facts for one park from the objects fetchNPSFacts already holds,
 * before they are flattened into the prompt string.
 */
function buildParkCanonicalFacts({
  parkCode,
  parkName = null,
  park = null,
  parkAlerts = [],
  parkPermits = [],
  parkCampgrounds = [],
  parkVisitorCenters = [],
  retrievedAt = new Date().toISOString(),
  cacheStatus = CACHE_STATUS.UNKNOWN,
  isClosureCategory,
  isCautionCategory,
  isInformationCategory,
}) {
  const facts = [];
  const base = { parkCode, parkName, retrievedAt, cacheStatus };

  const closures = parkAlerts.filter((a) => isClosureCategory(a.category)).slice(0, 5);
  const cautions = parkAlerts.filter((a) => isCautionCategory(a.category)).slice(0, 3);
  const infos = parkAlerts.filter((a) => isInformationCategory(a.category)).slice(0, 3);

  for (const alert of closures) {
    facts.push(makeFact({
      ...base,
      source: 'nps',
      category: 'closure',
      sourceId: alert.id,
      text: alert.title,
      authority: AUTHORITY.AUTHORITATIVE,
      status: STATUS.ACTIVE_CLOSURE,
    }));
  }

  for (const alert of cautions) {
    facts.push(makeFact({
      ...base,
      source: 'nps',
      category: 'caution',
      sourceId: alert.id,
      text: alert.title,
      authority: AUTHORITY.AUTHORITATIVE,
      status: STATUS.ACTIVE_CAUTION,
    }));
  }

  for (const alert of infos) {
    facts.push(makeFact({
      ...base,
      source: 'nps',
      category: 'info',
      sourceId: alert.id,
      text: alert.title,
      authority: AUTHORITY.AUTHORITATIVE,
      status: STATUS.STATUS_UNKNOWN,
    }));
  }

  // An empty alert feed is not proof that nothing is closed.
  if (closures.length === 0 && cautions.length === 0 && infos.length === 0) {
    facts.push(makeFact({
      ...base,
      source: 'nps',
      category: 'closure',
      text: `No active NPS alerts were returned for ${parkName || parkCode}. This does NOT confirm that nothing is closed.`,
      authority: AUTHORITY.AUTHORITATIVE,
      status: STATUS.LISTING_NOT_FOUND,
    }));
  }

  // RIDB lists facilities that may not be active in a given year — a listing is
  // never confirmation that a permit is currently required.
  for (const permit of parkPermits.slice(0, 8)) {
    facts.push(makeFact({
      ...base,
      source: 'recreation_gov',
      category: 'permit',
      sourceId: permit.id,
      text: `${permit.name}${permit.type ? ` [${permit.type}]` : ''} — Recreation.gov listing only; does not confirm the requirement is currently active.`,
      url: permit.reservationUrl || null,
      authority: AUTHORITY.LISTING_ONLY,
      status: STATUS.LISTING_ONLY,
    }));
  }

  if (parkPermits.length === 0) {
    facts.push(makeFact({
      ...base,
      source: 'recreation_gov',
      category: 'permit',
      text: `No Recreation.gov permit listing was returned for ${parkName || parkCode}. This does NOT confirm that no permit is required.`,
      authority: AUTHORITY.LISTING_ONLY,
      status: STATUS.LISTING_NOT_FOUND,
    }));
  }

  for (const campground of parkCampgrounds.slice(0, 5)) {
    const fee = campground.fees?.[0]?.cost ? `$${campground.fees[0].cost}/night` : null;
    facts.push(makeFact({
      ...base,
      source: 'nps',
      category: 'campground',
      sourceId: campground.id,
      text: `${campground.name}${fee ? ` (${fee})` : ''}: ${campground.reservationInfo || 'See recreation.gov'}`,
      url: campground.reservationUrl || null,
      authority: AUTHORITY.AUTHORITATIVE,
      status: STATUS.STATUS_UNKNOWN,
    }));
  }

  for (const fee of (park?.entranceFees || []).slice(0, 3)) {
    facts.push(makeFact({
      ...base,
      source: 'nps',
      category: 'fee',
      text: `${fee.title}: $${fee.cost}`,
      authority: AUTHORITY.AUTHORITATIVE,
      status: STATUS.STATUS_UNKNOWN,
    }));
  }

  for (const center of parkVisitorCenters.slice(0, 1)) {
    facts.push(makeFact({
      ...base,
      source: 'nps',
      category: 'visitor_center',
      sourceId: center.id,
      text: `${center.name}${center.description ? ` — ${center.description}` : ''}`,
      authority: AUTHORITY.AUTHORITATIVE,
      status: STATUS.STATUS_UNKNOWN,
    }));
  }

  return facts;
}

/**
 * Merge per-park fact lists into one request-scoped bundle.
 * `byId` is a plain object so the bundle survives JSON boundaries.
 */
function buildFactBundle(factLists = [], { retrievedAt = new Date().toISOString() } = {}) {
  const facts = [];
  const byId = Object.create(null);

  for (const fact of factLists.flat()) {
    if (!fact || !fact.id) continue;
    if (byId[fact.id]) continue;
    byId[fact.id] = fact;
    facts.push(fact);
  }

  const parkCodes = [...new Set(facts.map((f) => f.parkCode).filter(Boolean))];

  return { facts, byId, parkCodes, retrievedAt };
}

/**
 * Why a section (or the whole review) has no usable evidence. These must never
 * collapse into a single "evidence_missing" — the reviewer's downstream policy
 * treats "no permit listing was returned" very differently from "the bundle
 * never reached me".
 */
const FACT_EVIDENCE_REASON = {
  FACTS_NOT_REQUESTED: 'facts_not_requested',
  FACTS_UNAVAILABLE: 'facts_unavailable',
  NO_RELEVANT_FACT: 'no_relevant_fact',
  UNKNOWN_EVIDENCE_ID: 'unknown_evidence_id',
  FACT_BUNDLE_MISSING: 'fact_bundle_missing',
  FACT_MERGE_ERROR: 'fact_merge_error',
  FACT_ID_COLLISION: 'fact_id_collision',
};

/** Whether canonical evidence was threaded into a response path at all. */
const CANONICAL_FACT_STATUS = {
  AVAILABLE: 'available',
  NOT_REQUESTED: 'not_requested',
  FETCH_FAILED: 'fetch_failed',
  PARTIAL: 'partial',
};

/**
 * Classify how canonical evidence turned out for a response path, from the
 * per-source fetch outcomes. Keeps "we never asked" distinct from "we asked and
 * it failed" so the reviewer's empty-evidence handling never conflates them.
 *
 * @param {{requested: boolean, ok: boolean}[]} slots
 * @returns {string} one of CANONICAL_FACT_STATUS
 */
function resolveCanonicalFactStatus(slots = []) {
  const requested = slots.filter((s) => s && s.requested);
  if (requested.length === 0) return CANONICAL_FACT_STATUS.NOT_REQUESTED;

  const succeeded = requested.filter((s) => s.ok);
  if (succeeded.length === 0) return CANONICAL_FACT_STATUS.FETCH_FAILED;
  if (succeeded.length === requested.length) return CANONICAL_FACT_STATUS.AVAILABLE;
  return CANONICAL_FACT_STATUS.PARTIAL;
}

/**
 * The id-defining semantic content of a fact. Two facts with the same id but
 * different signatures are a genuine collision; differences confined to volatile
 * retrieval metadata (retrievedAt, cacheStatus, derived terms) are not.
 */
function factSignature(fact) {
  return JSON.stringify({
    text: fact.text || '',
    status: fact.status || null,
    authority: fact.authority || null,
    source: fact.source || null,
    category: fact.category || null,
    parkCode: fact.parkCode || null,
    parkName: fact.parkName || null,
    sourceId: fact.sourceId == null ? null : String(fact.sourceId),
    url: fact.url || null,
    weatherMode: fact.weatherMode || null,
    validFrom: fact.validFrom || null,
    validTo: fact.validTo || null,
    localDate: fact.localDate || null,
  });
}

/**
 * Deterministically merge several canonical fact bundles into one request-scoped
 * bundle. Accepts either raw fact bundles (`{ facts }`) or already-merged bundles
 * (`{ all }`).
 *
 * Duplicate-id policy:
 *  - Identical facts (same signature) deduplicate silently.
 *  - Same id, different signature → the first-seen fact is kept and a
 *    `fact_id_collision` merge error is recorded. A fact is NEVER silently
 *    overwritten by a conflicting one.
 *
 * @returns {{all: Object[], byId: Object, global: Object[], parkCodes: string[],
 *   retrievedAt: string, mergeErrors: Object[]}}
 */
function mergeCanonicalFactBundles(bundles = [], { retrievedAt = new Date().toISOString() } = {}) {
  const all = [];
  const byId = Object.create(null);
  const signatureById = Object.create(null);
  const mergeErrors = [];

  for (const bundle of bundles) {
    if (!bundle) continue;
    const facts = bundle.facts || bundle.all || [];
    for (const fact of facts) {
      if (!fact || !fact.id) continue;

      const signature = factSignature(fact);
      const existingSignature = signatureById[fact.id];

      if (existingSignature === undefined) {
        byId[fact.id] = fact;
        signatureById[fact.id] = signature;
        all.push(fact);
        continue;
      }

      if (existingSignature === signature) continue; // identical → dedupe

      mergeErrors.push({
        code: FACT_EVIDENCE_REASON.FACT_ID_COLLISION,
        id: fact.id,
        parkCode: fact.parkCode || null,
        keptText: byId[fact.id].text,
        rejectedText: fact.text,
      });
    }
  }

  const global = all.filter((f) => !f.parkCode);
  const parkCodes = [...new Set(all.map((f) => f.parkCode).filter(Boolean))];

  // `facts` mirrors `all` so a merged bundle is a drop-in for the raw-bundle
  // (`{ facts }`) shape the reviewer and patch policy already consume.
  return { all, facts: all, byId, global, parkCodes, retrievedAt, mergeErrors };
}

module.exports = {
  AUTHORITY,
  STATUS,
  CACHE_STATUS,
  WEATHER_AUTHORITY,
  WEATHER_MODE,
  WEATHER_STATUS,
  RETRIEVAL_MODE,
  makeWeatherFact,
  contentHash,
  makeFactId,
  deriveTerms,
  makeFact,
  factSupportsRequirementClaim,
  factSupportsAbsenceClaim,
  buildParkCanonicalFacts,
  buildFactBundle,
  mergeCanonicalFactBundles,
  resolveCanonicalFactStatus,
  factSignature,
  FACT_EVIDENCE_REASON,
  CANONICAL_FACT_STATUS,
};
