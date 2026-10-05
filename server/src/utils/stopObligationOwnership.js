'use strict';

/**
 * Attempt-scoped stop ownership: who required this place.
 *
 * Internal generation/validation provenance only — not a public itinerary field.
 * Traveler-named experiences stay strict; model-selected enrichment may degrade.
 */

const { classifyStop } = require('./itineraryCompleteness');
const { canonicalExperienceKey } = require('./canonicalExperience');
const { matchEvidencePlace } = require('./stopIdentityResolution');

const STOP_OWNERSHIP = Object.freeze({
  TRAVELER_REQUIRED: 'traveler_required',
  MODEL_SELECTED: 'model_selected',
  SUPPORTING_OPTIONAL: 'supporting_optional',
});

function namesAlign(a, b) {
  const left = canonicalExperienceKey(a);
  const right = canonicalExperienceKey(b);
  return Boolean(left && right && left === right);
}

function stopSatisfiesRequirement(stop, requirement, evidenceBundle) {
  if (!requirement || !stop) return false;
  if (namesAlign(stop.name, requirement.requestedName)) return true;
  if (requirement.canonicalPlaceName && namesAlign(stop.name, requirement.canonicalPlaceName)) {
    return true;
  }
  const allowed = new Set(requirement.allowedEvidenceIds || requirement.evidenceIds || []);
  if (allowed.size === 0) return false;
  const match = matchEvidencePlace({ name: stop.name, evidenceBundle });
  if (!match || match.excluded) return false;
  return match.evidenceIds.some((id) => allowed.has(id));
}

function classifyStopOwnership({
  stop,
  namedExperienceRequirements = [],
  evidenceBundle = null,
} = {}) {
  const kind = classifyStop(stop);
  if (kind === 'rest_meal' || kind === 'logistics_meta') {
    return STOP_OWNERSHIP.SUPPORTING_OPTIONAL;
  }
  for (const requirement of namedExperienceRequirements || []) {
    if (stopSatisfiesRequirement(stop, requirement, evidenceBundle)) {
      return STOP_OWNERSHIP.TRAVELER_REQUIRED;
    }
  }
  return STOP_OWNERSHIP.MODEL_SELECTED;
}

module.exports = {
  STOP_OWNERSHIP,
  classifyStopOwnership,
  stopSatisfiesRequirement,
};
