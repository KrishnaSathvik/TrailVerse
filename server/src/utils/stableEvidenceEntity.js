'use strict';

/**
 * Phase 9C.1D.5C-D — the stable canonical entity an evidence record represents,
 * and the key two entity ids are compared by.
 *
 * Relationship evidence speaks in stable entity ids; the identity matcher and
 * the frozen bundle speak in version-specific evidence ids. This is the ONE
 * place that crosses between them, and it recognises only shapes whose entity
 * semantics are already authoritative:
 *
 *   NPS named place/activity fact   → claim.normalizedValue.entityId
 *   curated experience fact (5C-C)  → claim.subjectId
 *
 * Anything else — web snippets, taxonomy rows, relationship claims themselves,
 * unknown providers — has no entity identity. Never derived from a display
 * name, an evidence id, or a provider version key.
 *
 * COMPARISON KEY. NPS `place` and `thingstodo` ids are two views of ONE upstream
 * record, so they compare by Phase 4T's namespace-free `canonicalEntityKey`
 * (evidenceEntityIdentity.js). Every other namespace — including curated
 * `experience` ids — keeps its full id, so a curated experience can never
 * collide with an NPS record that happens to share a local id.
 */

const { canonicalEntityKey, parseEvidenceEntityId } = require('./evidenceEntityIdentity');
const { isStableEntityId } = require('./experienceRelationships');
const { CURATED_EXPERIENCE_PROVIDER } = require('./curatedExperienceRecords');

const NPS_RECORD_NAMESPACES = new Set(['place', 'thingstodo']);

/** Comparison key for an entity id, or null when it is not a stable identity. */
function stableEntityKey(entityId) {
  const id = String(entityId == null ? '' : entityId).trim().toLowerCase();
  if (!id || !isStableEntityId(id)) return null;
  const parsed = parseEvidenceEntityId(id);
  if (parsed && parsed.provider === 'nps' && NPS_RECORD_NAMESPACES.has(parsed.namespace)) {
    return canonicalEntityKey(id);
  }
  return id;
}

function entityIdForEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || evidence.evidenceType !== 'fact') return null;
  const provider = evidence.source?.provider;
  if (provider === CURATED_EXPERIENCE_PROVIDER) return stableEntityKey(evidence.claim?.subjectId);
  if (provider === 'nps') return stableEntityKey(evidence.claim?.normalizedValue?.entityId);
  return null;
}

/**
 * DIRECT authoritative `same_as` neighbours of an entity, compared by stable
 * entity key, in either recorded direction. Reads only the index's surviving
 * (validated, de-duplicated, conflict-free) facts; never walks a second hop.
 */
function sameAsNeighbours(index, entityKey) {
  const out = new Set();
  for (const rel of index.relationships()) {
    if (rel.relationship !== 'same_as') continue;
    const subject = stableEntityKey(rel.subjectEntityId);
    const object = stableEntityKey(rel.objectEntityId);
    if (!subject || !object || subject === object) continue;
    if (subject === entityKey) out.add(object);
    else if (object === entityKey) out.add(subject);
  }
  return [...out].sort();
}

module.exports = { entityIdForEvidence, stableEntityKey, sameAsNeighbours };
