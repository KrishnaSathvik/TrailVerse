'use strict';

/**
 * Narrow claimed experience ↔ map-anchor truth
 * (docs/trailie-architecture.md Step 5).
 *
 * A non-spatial experience may exist without canonical place evidence.
 * A mapped spatial representation must either be the canonical identity being
 * described or be connected to that experience by trusted relationship evidence.
 *
 * No prose/regex inspection. No attraction heuristics or stop quotas.
 */

const RELATIONSHIPS = new Set([
  'trailhead_for',
  'access_point_for',
  'loop_for',
  'overlook_for',
  'entrance_for',
  'same_as',
  'part_of',
]);

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * @returns {null | 'unsupported_experience_map_anchor'}
 */
function validateClaimedExperienceMapAnchor({ stop = {}, evidenceValue = null } = {}) {
  const experience = stop.experience;
  const mapAnchor = stop.mapAnchor;
  const placeName = stop.canonicalPlaceName || stop.name;
  const placeId = stop.canonicalPlaceId;

  // Ordinary grounded place / no structured relationship claim.
  if (!experience && !mapAnchor) {
    if (placeName && stop.name && norm(stop.name) !== norm(placeName)) {
      return 'unsupported_experience_map_anchor';
    }
    return null;
  }

  // Half a claim is never enough.
  if (!experience?.id || !experience?.name || !mapAnchor?.canonicalPlaceId || !mapAnchor?.relationship) {
    return 'unsupported_experience_map_anchor';
  }
  if (!RELATIONSHIPS.has(mapAnchor.relationship)) return 'unsupported_experience_map_anchor';
  if (!placeId || norm(mapAnchor.canonicalPlaceId) !== norm(placeId)) {
    return 'unsupported_experience_map_anchor';
  }

  const sameIdentity = norm(experience.name) === norm(placeName)
    && norm(mapAnchor.name || placeName) === norm(placeName)
    && (norm(experience.id) === norm(placeId) || mapAnchor.relationship === 'same_as');
  if (sameIdentity) return null;

  // Distinct experience represented by a different map anchor.
  if (norm(stop.name) !== norm(experience.name)) return 'unsupported_experience_map_anchor';

  // Trusted evidence must be the source of the relationship — not model assertion,
  // similar names, proximity, or same-park coincidence.
  if (!evidenceValue?.experience?.id || !evidenceValue?.mapAnchor?.canonicalPlaceId) {
    return 'unsupported_experience_map_anchor';
  }
  if (norm(evidenceValue.experience.id) !== norm(experience.id)
    || norm(evidenceValue.experience.name) !== norm(experience.name)
    || norm(evidenceValue.mapAnchor.canonicalPlaceId) !== norm(mapAnchor.canonicalPlaceId)
    || evidenceValue.mapAnchor.relationship !== mapAnchor.relationship
    || !RELATIONSHIPS.has(evidenceValue.mapAnchor.relationship)) {
    return 'unsupported_experience_map_anchor';
  }

  return null;
}

module.exports = {
  RELATIONSHIPS,
  validateClaimedExperienceMapAnchor,
};
