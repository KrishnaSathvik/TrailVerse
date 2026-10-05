'use strict';

/**
 * Stage 13.8 §3 — the ONE pre-display sanitation seam for selected prose.
 *
 * Every consumer of the selected prose (SSE replay, canonical construction,
 * hashing, persistence, review snapshot, share/export) must see the SAME bytes,
 * so "what the user saw equals what was saved" holds. This composes the two
 * existing shared strippers plus the citation-token boundary:
 *
 *   1. proseAlignmentMarkers.stripAlignmentMarkers  (internal TRAILIE_* markers)
 *   2. itineraryArtifacts.stripItineraryArtifacts    (Stage 8 [ITINERARY_JSON] family)
 *   3. sanitizeTrailieCitations                      (OpenAI private-use cite wrappers)
 *
 * Both are idempotent, so running this on already-clean content (e.g. the
 * deterministic fallback) is a safe no-op. canonicalResponse already runs the
 * Stage 8 stripper at hash time, so sanitizing here makes replay == canonical.
 */

const { stripAlignmentMarkers } = require('./proseAlignmentMarkers');
const { stripItineraryArtifacts } = require('./itineraryArtifacts');
const { sanitizeTrailieCitations } = require('./sanitizeTrailieCitations');

/**
 * @param {Object} params
 * @param {string} params.content
 * @param {string} [params.generationMode] informational only (tool_first|legacy)
 * @returns {{ content: string, alignmentMarkersRemoved: boolean,
 *   itineraryArtifactsRemoved: boolean, artifactTypes: string[], changed: boolean }}
 */
function sanitizeSelectedProse({ content, generationMode = 'tool_first' } = {}) {
  const original = typeof content === 'string' ? content : '';
  const afterMarkers = stripAlignmentMarkers(original);
  const alignmentMarkersRemoved = afterMarkers !== original;

  const artifact = stripItineraryArtifacts(afterMarkers);
  const citations = sanitizeTrailieCitations(artifact.content);
  return {
    content: citations.content,
    generationMode,
    alignmentMarkersRemoved,
    itineraryArtifactsRemoved: artifact.changed,
    artifactTypes: artifact.artifactTypes,
    citationsSanitized: citations.changed,
    changed: alignmentMarkersRemoved || artifact.changed || citations.changed,
  };
}

module.exports = { sanitizeSelectedProse };
