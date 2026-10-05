'use strict';

/**
 * Phase 12D — degrade model-selected identity misses without weakening
 * traveler-named fail-closed truth.
 *
 * Ladder (model-proposed experiential stop only):
 *   bind → grounded catalog replacement → omit if the day/plan remains valid
 *   → fail closed if traveler-required obligations cannot survive.
 *
 * Never accepts arbitrary model text as a trusted place.
 */

const { classifyStop } = require('./itineraryCompleteness');
const { matchEvidencePlace } = require('./stopIdentityResolution');
const { evaluateNamedExperienceSatisfaction } = require('./namedExperienceRequirements');
const { normalizeItineraryActivityGroups } = require('./activityGroupValidation');
const { normalizeItineraryTravelEdges } = require('./travelEdgeValidation');
const {
  STOP_OWNERSHIP,
  classifyStopOwnership,
} = require('./stopObligationOwnership');

const TYPE_FAMILY = Object.freeze({
  trail: 'walk',
  hike: 'walk',
  walk: 'walk',
  viewpoint: 'view',
  overlook: 'view',
  scenic: 'view',
});

function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan || { days: [] }));
}

function typeFamily(value) {
  const type = String(value || '').toLowerCase().trim();
  return TYPE_FAMILY[type] || type || null;
}

function usedNames(plan) {
  const names = new Set();
  for (const day of plan?.days || []) {
    for (const stop of day?.stops || []) {
      if (stop?.name) names.add(String(stop.name).toLowerCase());
    }
  }
  return names;
}

function findStop(plan, violation) {
  const target = String(violation?.stopName || '').toLowerCase();
  const dayNumber = violation?.dayNumber != null ? Number(violation.dayNumber) : null;
  for (const day of plan?.days || []) {
    if (dayNumber != null && Number(day.dayNumber) !== dayNumber) continue;
    const index = (day.stops || []).findIndex((s) => String(s?.name || '').toLowerCase() === target);
    if (index >= 0) return { day, index, stop: day.stops[index] };
  }
  return null;
}

function catalogPlaces(evidenceBundle) {
  const out = [];
  for (const item of evidenceBundle?.evidence || []) {
    const name = item?.claim?.normalizedValue?.name;
    if (typeof name !== 'string' || !name.trim()) continue;
    const activityTypes = item.claim.normalizedValue.activityTypes || [];
    const type = activityTypes[0] || item.claim.normalizedValue.category || 'landmark';
    out.push({
      evidenceId: item.evidenceId,
      name: name.trim(),
      type,
      activityTypes,
      parkCode: item.claim.normalizedValue.parkCode || null,
    });
  }
  return out;
}

function pickGroundedReplacement({ plan, stop, evidenceBundle, excludedEvidenceIds = [], constraints = {} }) {
  const eligible = require('./evidenceBoundRepairCandidates').buildEvidenceBoundRepairCandidates({ bundle: evidenceBundle, constraints });
  const allowed = new Set(eligible.candidates.flatMap(c => c.evidenceIds || []));
  const used = usedNames(plan);
  const family = typeFamily(stop?.type);
  const parkCode = stop?.parkCode || null;
  for (const place of catalogPlaces(evidenceBundle)) {
    if (!allowed.has(place.evidenceId) || used.has(place.name.toLowerCase())) continue;
    if (parkCode && place.parkCode && place.parkCode !== parkCode) continue;
    if (family && typeFamily(place.type) !== family) continue;
    const match = matchEvidencePlace({
      name: place.name,
      evidenceBundle,
      excludedEvidenceIds,
    });
    if (!match || match.excluded) continue;
    return {
      name: match.name,
      type: place.type,
      evidenceRef: match.evidenceId,
      canonicalPlaceName: match.name,
    };
  }
  return null;
}

function dropSentencesWithName(text, name) {
  const raw = String(text || '');
  if (!raw || !name) return raw;
  const needle = String(name).toLowerCase();
  const kept = raw
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !sentence.toLowerCase().includes(needle));
  return kept.join(' ').replace(/\s+/g, ' ').trim();
}

function sanitizeRemovedNames(plan, removedNames) {
  const next = clonePlan(plan);
  for (const name of removedNames) {
    next.intro = dropSentencesWithName(next.intro, name);
    next.closing = dropSentencesWithName(next.closing, name);
    next.narrativeSections = (Array.isArray(next.narrativeSections) ? next.narrativeSections : []).map((section) => ({
      ...section,
      markdown: dropSentencesWithName(section?.markdown, name),
      heading: dropSentencesWithName(section?.heading, name) || null,
    })).filter((section) => String(section.markdown || '').trim());
    for (const day of next.days || []) {
      day.summary = dropSentencesWithName(day.summary, name);
      day.title = dropSentencesWithName(day.title, name);
      for (const stop of day.stops || []) {
        stop.note = dropSentencesWithName(stop.note, name);
        stop.why = dropSentencesWithName(stop.why, name);
        stop.description = dropSentencesWithName(stop.description, name);
      }
    }
  }
  return next;
}

function namedRequirementsSatisfied(plan, namedExperienceRequirements, evidenceBundle) {
  const required = (namedExperienceRequirements || []).filter((r) => r?.status === 'resolved' || r?.status === 'unavailable');
  if (required.length === 0) return true;
  const named = evaluateNamedExperienceSatisfaction({
    itineraryData: plan,
    requirements: namedExperienceRequirements,
    evidenceBundle,
  });
  return named.ok === true;
}

function dayStillViable(day) {
  const named = (day?.stops || []).filter((s) => String(s?.name || '').trim());
  if (named.length === 0) return false;
  return named.some((s) => classifyStop(s) === 'experiential');
}

function applyStructuralNormalize(plan) {
  const grouped = normalizeItineraryActivityGroups(plan);
  return normalizeItineraryTravelEdges(grouped);
}

function degradeUnresolvedModelStops({
  itineraryData,
  violations = [],
  namedExperienceRequirements = [],
  evidenceBundle = null,
  excludedEvidenceIds = [],
  userPrompt = '',
  constraints = {},
} = {}) {
  void userPrompt;
  if (!Array.isArray(violations) || violations.length === 0) {
    return { status: 'no_op', itineraryData, actions: [], reasonCodes: [] };
  }

  const classified = violations.map((violation) => {
    const found = findStop(itineraryData, violation);
    return {
      ...violation,
      ownership: classifyStopOwnership({
        stop: found?.stop || { name: violation.stopName, type: 'landmark' },
        namedExperienceRequirements,
        evidenceBundle,
      }),
    };
  });

  if (classified.some((item) => item.ownership === STOP_OWNERSHIP.TRAVELER_REQUIRED)) {
    return {
      status: 'fail_closed',
      itineraryData,
      actions: [],
      reasonCodes: [...new Set(classified.map((item) => item.reasonCode).filter(Boolean))],
    };
  }

  const modelUnresolved = classified.filter((item) => (
    item.ownership === STOP_OWNERSHIP.MODEL_SELECTED
    && item.reasonCode === 'stop_identity_unresolved'
  ));
  if (modelUnresolved.length === 0) {
    return {
      status: 'fail_closed',
      itineraryData,
      actions: [],
      reasonCodes: [...new Set(classified.map((item) => item.reasonCode).filter(Boolean))],
    };
  }

  let plan = clonePlan(itineraryData);
  const actions = [];
  const removedNames = [];

  for (const violation of modelUnresolved) {
    const found = findStop(plan, violation);
    if (!found) continue;
    const remainder = found.day.stops.filter((_, index) => index !== found.index);
    if (remainder.some(s => s.resolutionStatus === 'resolved' && classifyStop(s) === 'experiential')) {
      found.day.stops = remainder;
      actions.push({ kind: 'omitted', stopName: violation.stopName, dayNumber: found.day.dayNumber });
      removedNames.push(violation.stopName);
      continue;
    }
    const replacement = pickGroundedReplacement({
      plan,
      stop: found.stop,
      evidenceBundle,
      excludedEvidenceIds,
      constraints,
    });
    if (replacement) {
      found.day.stops[found.index] = {
        ...found.stop,
        name: replacement.name,
        displayName: replacement.name,
        latitude: null, longitude: null, coordinateSource: null,
        experienceSubject: null, subjectEvidenceRef: null,
        type: replacement.type || found.stop.type,
        evidenceRef: replacement.evidenceRef,
        canonicalPlaceName: replacement.canonicalPlaceName,
        note: dropSentencesWithName(found.stop.note, violation.stopName),
        why: dropSentencesWithName(found.stop.why, violation.stopName),
      };
      actions.push({
        kind: 'replaced',
        stopName: violation.stopName,
        replacementName: replacement.name,
        dayNumber: found.day.dayNumber,
      });
      removedNames.push(violation.stopName);
      continue;
    }

    found.day.stops.splice(found.index, 1);
    if (!dayStillViable(found.day) || !namedRequirementsSatisfied(plan, namedExperienceRequirements, evidenceBundle)) {
      return {
        status: 'fail_closed',
        itineraryData,
        actions,
        reasonCodes: ['stop_identity_unresolved', 'model_stop_omission_invalid'],
      };
    }
    actions.push({
      kind: 'omitted',
      stopName: violation.stopName,
      dayNumber: found.day.dayNumber,
    });
    removedNames.push(violation.stopName);
  }

  plan = sanitizeRemovedNames(plan, removedNames);
  plan = applyStructuralNormalize(plan);
  const changedDays = new Set(actions.map(action => action.dayNumber));
  plan.days = plan.days.map((day, index) => changedDays.has(day.dayNumber) ? day : itineraryData.days[index]);

  if (!namedRequirementsSatisfied(plan, namedExperienceRequirements, evidenceBundle)) {
    return {
      status: 'fail_closed',
      itineraryData,
      actions,
      reasonCodes: ['stop_identity_unresolved', 'named_experience_unsatisfied'],
    };
  }

  return {
    status: 'degraded',
    itineraryData: plan,
    actions,
    reasonCodes: actions.map((action) => `model_stop_${action.kind}`),
  };
}

module.exports = {
  degradeUnresolvedModelStops,
  pickGroundedReplacement,
};
