/**
 * Universal park record for TrailVerse catalog (all sources).
 * Phase 1.5: schema + search haystack. Traits from traitBuilder (deterministic).
 *
 * @typedef {Object} CanonicalParkLocation
 * @property {number|null} lat
 * @property {number|null} lng
 *
 * @typedef {Object.<string, number>} CanonicalParkTraits
 *
 * @typedef {Object} CanonicalPark
 * @property {string} id - Stable catalog id (source-specific; NPS uses parkCode)
 * @property {string} name
 * @property {string} source - e.g. "nps", "state_ca"
 * @property {string} category - Normalized slug (national_park, state_park, beach, …)
 * @property {string} states - Comma-separated state codes
 * @property {string} description
 * @property {string[]} activities
 * @property {string[]} amenities
 * @property {CanonicalParkLocation} location
 * @property {CanonicalParkTraits} traits
 * @property {string} [sourceId] - Id in the upstream system
 * @property {object} [sourceRecord] - Original payload for API backward compatibility
 */

/**
 * Slugify a human category/designation label.
 * @param {string} label
 * @returns {string}
 */
function normalizeCategory(label = '') {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return slug || 'park';
}

/**
 * @param {Partial<CanonicalPark>} fields
 * @returns {CanonicalPark}
 */
function createCanonicalPark(fields) {
  const location = fields.location || {};
  return {
    id: fields.id || '',
    name: fields.name || '',
    source: fields.source || 'unknown',
    category: fields.category || 'park',
    states: fields.states || '',
    description: fields.description || '',
    activities: Array.isArray(fields.activities) ? fields.activities : [],
    amenities: Array.isArray(fields.amenities) ? fields.amenities : [],
    location: {
      lat: location.lat ?? null,
      lng: location.lng ?? null,
    },
    traits: fields.traits && typeof fields.traits === 'object' ? fields.traits : {},
    sourceId: fields.sourceId,
    sourceRecord: fields.sourceRecord,
  };
}

/**
 * Text bundle used for keyword search (source-agnostic).
 * @param {CanonicalPark} park
 * @returns {string}
 */
function buildSearchHaystack(park) {
  return [
    park.name,
    park.description,
    park.states,
    park.category,
    park.source,
    ...(park.activities || []),
    ...(park.amenities || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * @param {CanonicalPark} park
 * @param {string} stateCode - Two-letter code
 * @returns {boolean}
 */
function canonicalParkInState(park, stateCode) {
  if (!stateCode || !park.states) return false;
  const st = stateCode.toUpperCase();
  return park.states
    .toUpperCase()
    .split(',')
    .some((s) => s.trim() === st);
}

/**
 * @param {CanonicalPark} park
 * @param {string} activityQuery
 * @returns {boolean}
 */
function canonicalParkMatchesActivity(park, activityQuery) {
  const q = activityQuery.toLowerCase();
  return (park.activities || []).some((name) =>
    String(name).toLowerCase().includes(q)
  );
}

module.exports = {
  createCanonicalPark,
  normalizeCategory,
  buildSearchHaystack,
  canonicalParkInState,
  canonicalParkMatchesActivity,
};
