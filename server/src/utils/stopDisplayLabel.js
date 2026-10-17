'use strict';

/**
 * Traveler-facing display labels must never rewrite canonical place identity.
 * A display name is only allowed when grounded in trusted identity evidence.
 */

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function groundedDisplayName({
  canonicalName = null,
  evidenceTitle = null,
  officialName = null,
  destinationLabel = null,
} = {}) {
  const canonical = String(canonicalName || '').trim() || null;
  const title = String(evidenceTitle || '').trim();
  const evidence = String((require('./entityEvidenceProvenance').operationalTitle(title) ? officialName : title || officialName) || '').trim() || null;
  if (!canonical && !evidence) return { canonicalName: null, displayName: null };

  // Destination centroid labels are never a substitute for an experience name.
  if (evidence && destinationLabel && normalize(evidence) === normalize(destinationLabel)) {
    return { canonicalName: canonical || evidence, displayName: null };
  }

  if (evidence && canonical && normalize(evidence) !== normalize(canonical)) {
    // Prefer a shorter grounded official title when it still refers to the same place.
    const samePlace = normalize(evidence).includes(normalize(canonical))
      || normalize(canonical).includes(normalize(evidence));
    if (samePlace) {
      return { canonicalName: canonical, displayName: evidence };
    }
  }

  return {
    canonicalName: canonical || evidence,
    displayName: evidence && evidence !== canonical ? evidence : (canonical || evidence),
  };
}

function applyStopDisplayLabel(stop, { destinationLabel = null } = {}) {
  if (!stop || typeof stop !== 'object') return stop;
  if (stop.resolutionStatus === 'resolved' && stop.experienceSubject
    && stop.subjectEvidenceRef === stop.evidenceRef && stop.canonicalPlaceName) return { ...stop };
  if (stop.entityNameSource && stop.canonicalPlaceName && !stop.experienceSubject) {
    return { ...stop, name: stop.canonicalPlaceName, displayName: stop.canonicalPlaceName };
  }
  const labels = groundedDisplayName({
    canonicalName: stop.canonicalPlaceName || stop.canonicalName || stop.name,
    evidenceTitle: stop.evidenceTitle || stop.officialName || null,
    officialName: stop.officialName || null,
    destinationLabel,
  });
  const next = { ...stop };
  if (labels.canonicalName) {
    next.canonicalPlaceName = stop.canonicalPlaceName || labels.canonicalName;
  }
  if (labels.displayName) {
    next.displayName = labels.displayName;
    // Keep `name` as the traveler-facing surface only when it already matched
    // identity; never invent a prettier label.
    if (!stop.name || normalize(stop.name) === normalize(labels.canonicalName)) {
      next.name = labels.displayName;
    }
  }
  return next;
}

module.exports = {
  groundedDisplayName,
  applyStopDisplayLabel,
};
