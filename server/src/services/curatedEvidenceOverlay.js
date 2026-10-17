'use strict';

/**
 * PHASE 9C.1D.5C-C — merge authoritative curated official-source evidence into
 * the frozen EvidenceBundle, AFTER the normal layered resolution.
 *
 * Supplements, never replaces: curated evidence ids are appended to the
 * matching `activities` resolutions; no resolution status, reason code,
 * coverage decision or requirement changes. With no curated records the
 * resolver's bundle is returned untouched (same object) — an inert no-op.
 */

const { buildEvidenceBundle } = require('../utils/evidenceBundle');

function createCuratedEvidenceOverlay({ resolver, provider } = {}) {
  if (!resolver?.resolveEvidence) throw new TypeError('Curated evidence overlay requires a resolver');
  return {
    async resolveEvidence(args = {}) {
      const bundle = await resolver.resolveEvidence(args);
      if (!provider?.hasRecords?.()) return bundle;

      const additions = new Map();
      for (const requirement of args.requirements || []) {
        if (requirement?.topic !== 'activities') continue;
        const items = provider.evidenceFor(requirement?.entity?.entityId);
        if (items.length > 0) additions.set(requirement.requirementId, items);
      }
      if (additions.size === 0) return bundle;

      const present = new Set((bundle.evidence || []).map((item) => item.evidenceId));
      const added = new Map();
      for (const items of additions.values()) {
        for (const item of items) if (!present.has(item.evidenceId)) added.set(item.evidenceId, item);
      }
      const resolutions = (bundle.resolutions || []).map((resolution) => {
        const items = additions.get(resolution.requirementId);
        if (!items) return resolution;
        return { ...resolution, evidenceIds: [...(resolution.evidenceIds || []), ...items.map((item) => item.evidenceId)] };
      });
      return buildEvidenceBundle({
        requestId: bundle.requestId,
        createdAt: bundle.createdAt,
        resolutions,
        candidates: [...(bundle.evidence || []), ...added.values()],
      });
    },
  };
}

module.exports = { createCuratedEvidenceOverlay };
