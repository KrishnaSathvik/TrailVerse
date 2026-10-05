'use strict';

/**
 * Stage 10 (F-DATA-1) — convert already-fetched auxiliary evidence (fee-free
 * days, astronomy) into canonical facts so the multi-park bundle — and the
 * Stage 9 review snapshot built from it — contains every source generation used,
 * not just per-park NPS facts and primary weather.
 *
 * NO provider calls: these builders only reshape data already in hand. Facts are
 * SECONDARY authority so they can never back a closure/permit claim.
 */

const { makeFact, AUTHORITY, STATUS } = require('./canonicalFacts');

/**
 * Fee-free days → canonical facts. Each observed fee-free day becomes one fact;
 * a deterministic sourceId keeps ids stable and dedupable across re-merges.
 */
function buildFeeFreeCanonicalFacts(feeFreeFacts, { parkCode = null, parkName = null, retrievedAt } = {}) {
  if (!feeFreeFacts || !Array.isArray(feeFreeFacts.days) || feeFreeFacts.days.length === 0) {
    return [];
  }
  const when = retrievedAt || new Date().toISOString();
  return feeFreeFacts.days
    .filter((d) => d && d.date)
    .map((d) =>
      makeFact({
        source: 'fee_free',
        category: 'fee',
        sourceId: `fee-free-${d.date}`,
        text: `${d.label || 'Fee-free entrance day'} (${d.date}): entrance fees waived at NPS sites.`,
        parkCode,
        parkName,
        authority: AUTHORITY.SECONDARY,
        status: STATUS.STATUS_UNKNOWN,
        retrievedAt: when,
      })
    );
}

/**
 * Astronomy summary → a single canonical fact. The astro block is a computed
 * string; we capture it verbatim as one SECONDARY fact so the reviewer can see
 * (but never over-trust) it. Forecast-like, never an authoritative claim.
 */
function buildAstroCanonicalFacts(astroFacts, { parkCode = null, parkName = null, localDate = null, retrievedAt } = {}) {
  const text = typeof astroFacts === 'string' ? astroFacts.trim() : '';
  if (!text) return [];
  return [
    makeFact({
      source: 'astro',
      category: 'astronomy',
      sourceId: `astro-${parkCode || 'global'}-${localDate || 'na'}`,
      text: text.slice(0, 1200),
      parkCode,
      parkName,
      authority: AUTHORITY.SECONDARY,
      status: STATUS.STATUS_UNKNOWN,
      retrievedAt: retrievedAt || new Date().toISOString(),
    }),
  ];
}

/**
 * All auxiliary canonical facts for the current request, from data already
 * fetched. Returns a flat array ready to merge into the canonical bundle.
 */
function buildAuxiliaryCanonicalFacts({ astroFacts = null, feeFreeFacts = null, resolvedMetadata = {}, retrievedAt } = {}) {
  const parkCode = resolvedMetadata?.parkCode || null;
  const parkName = resolvedMetadata?.parkName || null;
  const localDate = resolvedMetadata?.localDate || null;
  return [
    ...buildFeeFreeCanonicalFacts(feeFreeFacts, { parkCode, parkName, retrievedAt }),
    ...buildAstroCanonicalFacts(astroFacts, { parkCode, parkName, localDate, retrievedAt }),
  ];
}

module.exports = {
  buildFeeFreeCanonicalFacts,
  buildAstroCanonicalFacts,
  buildAuxiliaryCanonicalFacts,
};
