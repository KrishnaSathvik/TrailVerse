/**
 * Shared park catalog search — used by GET /api/parks/search, Trailie chat, and voice.
 */
const { loadCanonicalParks } = require('../catalog/parkCatalog');
const { canonicalParkMatchesActivity } = require('../catalog/canonicalPark');
const { canonicalListToApiParks } = require('../adapters/npsParkAdapter');
const { filterParksBySearchQuery, applyPinnedParksToResults } = require('../utils/parkSearchQuery');
const { logParkSearch } = require('./parkSearchAnalytics');

/**
 * @param {{
 *   q?: string,
 *   state?: string,
 *   activity?: string,
 *   limit?: number|string,
 *   req?: import('express').Request,
 *   source?: string,
 * }} options
 * @returns {Promise<{ parks: object[], count: number, searchId: string|null }>}
 */
async function executeParkSearch({ q, state, activity, limit, pinned, req, source }) {
  const catalog = await loadCanonicalParks({
    state: state ? String(state).toUpperCase() : undefined,
  });
  let parks = catalog;

  const query = q ? String(q).trim() : '';
  const pinnedCodes = pinned
    ? String(pinned)
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (query) {
    parks = filterParksBySearchQuery(parks, query);
    if (pinnedCodes.length > 0) {
      parks = applyPinnedParksToResults(parks, catalog, pinnedCodes, query);
    }
  }

  if (activity) {
    parks = parks.filter((park) =>
      canonicalParkMatchesActivity(park, activity)
    );
  }

  const count = parks.length;

  if (limit) {
    const n = parseInt(limit, 10);
    if (!Number.isNaN(n) && n > 0) {
      parks = parks.slice(0, n);
    }
  }

  let searchId = null;
  if (req && (query || activity || state)) {
    searchId = logParkSearch(req, {
      query: query || null,
      state: state ? String(state).toUpperCase() : null,
      activity: activity || null,
      parks,
      source,
    });
  }

  return {
    parks: canonicalListToApiParks(parks),
    count,
    searchId,
  };
}

const DISCOVERY_ALIGNMENT_INSTRUCTION =
  'When TRAILVERSE RANKED PARK MATCHES are present, prioritize explaining the highest-weight detected intent first. Secondary intents should support the answer, not dominate it (e.g. quiet + beginners → lead with peaceful/low-stress parks, then note easy trails).';

/**
 * Prompt block for Trailie chat — ranked matches + intent weights from catalog search.
 * @param {object[]} parks API park objects with matchReason / matchedTraits
 * @param {{ label: string, weight: number }[]} [primaryIntents]
 * @returns {string}
 */
function formatRankedParksDiscoveryBlock(parks, primaryIntents = []) {
  if (!parks?.length) return '';

  let block = '\n--- TRAILVERSE RANKED PARK MATCHES ---\n';
  block +=
    'These parks were ranked by TrailVerse search for the user\'s question. ';
  block +=
    'Use them as your primary recommendations (same order). ';
  block +=
    'You may add season or logistics context, but do not replace these with unrelated parks from training data.\n\n';

  if (primaryIntents.length > 0) {
    block += 'Primary detected intents:\n';
    primaryIntents.forEach(({ label, weight }) => {
      block += `- ${label} (weight ${weight.toFixed(1)})\n`;
    });
    block += `\n${DISCOVERY_ALIGNMENT_INSTRUCTION}\n\n`;
  }

  block += 'Top ranked parks:\n';
  parks.slice(0, 5).forEach((park, index) => {
    const name = park.fullName || park.name || 'Unknown';
    const states = park.states ? ` (${park.states})` : '';
    const code = park.parkCode ? ` [${park.parkCode}]` : '';
    const reason = park.matchReason || 'Matches the user\'s search.';
    const traits =
      Array.isArray(park.matchedTraits) && park.matchedTraits.length > 0
        ? park.matchedTraits.join(', ')
        : '';

    block += `${index + 1}. ${name}${states}${code}\n`;
    block += `   Why: ${reason}\n`;
    if (traits) {
      block += `   Traits: ${traits}\n`;
    }
  });

  block += '--- END RANKED MATCHES ---\n';
  return block;
}

/**
 * Concise voice tool response from search API results.
 * @param {object[]} parks
 * @param {number} totalCount
 * @returns {string}
 */
function formatVoiceSearchResult(parks, totalCount) {
  if (!parks?.length) {
    return 'No parks matched that search. Try different keywords or a state.';
  }

  const lines = [`Found ${totalCount} parks. Top picks:`];
  parks.slice(0, 5).forEach((park, index) => {
    const name = park.fullName || park.name;
    const states = park.states || '';
    const reason = park.matchReason;
    let line = `${index + 1}. ${name} (${states})`;
    if (reason) {
      line += `. Why: ${reason}`;
    }
    lines.push(line);
  });
  return lines.join('\n');
}

module.exports = {
  executeParkSearch,
  formatRankedParksDiscoveryBlock,
  formatVoiceSearchResult,
  DISCOVERY_ALIGNMENT_INSTRUCTION,
};
