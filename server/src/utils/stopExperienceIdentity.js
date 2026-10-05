'use strict';

/**
 * PHASE 9C.1D.5C-E3.1 — AUTHORITATIVE IDENTITY FOR "SAME BASE EXPERIENCE?".
 *
 * `classifyExperienceRelationship` answers that question from display names,
 * and a name heuristic cannot tell "Vernal Fall Footbridge" from "Vernal Fall":
 * one contains the other, so the pair read as padding and an otherwise-correct
 * plan failed `duplicate_base_experience`. The frozen bundle already knows they
 * are two different official entities. When BOTH stops resolve to one, that
 * authority outranks the name:
 *
 *   entity sets intersect                        → 'same'
 *   disjoint, direct authoritative same_as        → 'same'
 *   disjoint, no direct authoritative same_as     → 'distinct'
 *   either stop without authoritative identity    → null (legacy name logic)
 *
 * IDENTITY SOURCE. A stop's identity is re-derived from its own name through
 * `matchEvidencePlace` — the exact decision `resolveStopIdentities` makes — and
 * mapped to stable entity keys by `stableEvidenceEntity`. A stored
 * `evidenceRef` / `canonicalPlaceName` is never read, so model-written metadata
 * cannot split one place into two identities. The whole same-key record group
 * is used (not just the winning record), so the same place carried by several
 * records can never look like two entities.
 *
 * RELATIONSHIPS. Only DIRECT `same_as` surviving the relationship index —
 * re-validated from this bundle against the CURRENT trusted reviewers and clock
 * — joins two entities. `access_point_for`, `part_of`, shared context and
 * transitive chains never do. No trust supplied means no same_as.
 *
 * Nothing here decides whether a same-identity repeat is a legitimate revisit:
 * 'same' only replaces the name test, and the structured purpose/schedule rules
 * still run on top of it.
 */

const { entityIdForEvidence, sameAsNeighbours } = require('./stableEvidenceEntity');
const { buildRelationshipIndexFromEvidence } = require('./experienceRelationships');

/**
 * @returns {null | ((stopA:object, stopB:object) => 'same'|'distinct'|null)}
 *   null when the bundle offers no named place catalogue (nothing can resolve).
 */
function createStopIdentityComparator({ evidenceBundle = null, trustedReviewerIds = [], now = new Date() } = {}) {
  // Lazy: stopIdentityResolution → itineraryCompleteness → this module.
  const { matchEvidencePlace, hasPlaceCatalogue, resolveStopIdentities } = require('./stopIdentityResolution');
  if (!hasPlaceCatalogue(evidenceBundle)) return null;

  const evidence = Array.isArray(evidenceBundle?.evidence) ? evidenceBundle.evidence : [];
  const evidenceById = new Map(evidence.map((item) => [item?.evidenceId, item]));
  const entitiesByName = new Map();
  let relationships = null; // built lazily: only a disjoint resolved pair needs it

  function entityKeysOf(stop) {
    const name = String(stop?.name || '').trim();
    if (!name) return null;
    if (!entitiesByName.has(name)) {
      const match = matchEvidencePlace({ name, evidenceBundle });
      const keys = new Set((match?.evidenceIds || [])
        .map((evidenceId) => entityIdForEvidence(evidenceById.get(evidenceId)))
        .filter(Boolean));
      entitiesByName.set(name, keys.size > 0 ? keys : null);
    }
    return entitiesByName.get(name);
  }

  function groundedSubject(stop) {
    if (!stop?.experienceSubject) return null;
    const resolved = resolveStopIdentities({ itineraryData: { days: [{ stops: [stop] }] }, evidenceBundle });
    if (resolved.violations.length) return null;
    const bound = resolved.itineraryData.days[0].stops[0];
    return bound.subjectEvidenceRef ? require('./canonicalExperience').canonicalExperienceKey(bound.experienceSubject) : null;
  }
  return function compareStopIdentity(stopA, stopB) {
    const subjectA = groundedSubject(stopA); const subjectB = groundedSubject(stopB);
    if ((subjectA || subjectB) && subjectA !== subjectB) return 'distinct';
    const left = entityKeysOf(stopA);
    const right = entityKeysOf(stopB);
    if (!left || !right) {
      // Separately catalogued facilities and viewing areas are not aliases
      // merely because a patio includes its parent museum's name. Require
      // exact frozen names and distinct explicit categories, never model types.
      const categoryOf = stop => evidence.filter(e => String(e?.claim?.normalizedValue?.name || '').toLowerCase() === String(stop?.name || '').toLowerCase())
        .map(e => e.claim.normalizedValue.category);
      const a = categoryOf(stopA); const b = categoryOf(stopB);
      const facility = c => ['museum', 'visitor_center'].includes(c);
      if (String(stopA?.name || '').toLowerCase() !== String(stopB?.name || '').toLowerCase()
        && ((a.some(facility) && !a.includes('viewpoint') && b.includes('viewpoint') && !b.some(facility))
          || (b.some(facility) && !b.includes('viewpoint') && a.includes('viewpoint') && !a.some(facility)))) return 'distinct';
      return null;
    }
    for (const key of left) if (right.has(key)) return 'same';
    if (!relationships) {
      relationships = buildRelationshipIndexFromEvidence({ evidence, trustedReviewerIds, now }).index;
    }
    for (const key of left) {
      if (sameAsNeighbours(relationships, key).some((neighbour) => right.has(neighbour))) return 'same';
    }
    return 'distinct';
  };
}

module.exports = { createStopIdentityComparator };
