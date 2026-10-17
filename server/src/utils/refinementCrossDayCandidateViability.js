'use strict';

/**
 * Project whether a refinement candidate (or stop set) remains valid against
 * frozen days of the canonical plan. Reuses refinementCrossDayDuplicateConflicts
 * / classifyExperienceRelationship — no second duplicate system.
 */

const { classifyExperienceRelationship, canonicalExperienceKey } = require('./canonicalExperience');

function dayNumberOf(day, index) {
  return Number(day?.dayNumber || day?.day || index + 1);
}

function stopName(stop) {
  return stop?.canonicalPlaceName || stop?.name || null;
}

/**
 * Classify one candidate stop against every experiential stop on non-target days.
 * @returns {{
 *   selfSufficient: boolean,
 *   structuralSelectable: boolean,
 *   crossDayRepetitionStatus: 'clear'|'redundant_duplicate'|'distinct_revisit'|'uncertain',
 *   revisitClassification: 'REDUNDANT_DUPLICATE'|'DISTINCT_REVISIT'|null,
 *   conflictingDayNumbers: number[],
 *   conflictingExperienceIdentity: string|null,
 *   crossDayConflict: boolean,
 * }}
 */
function projectCandidateCrossDayViability({
  plan = null,
  targetDayNumbers = [],
  candidateStop = null,
  compareIdentity = null,
} = {}) {
  const targets = new Set(
    (Array.isArray(targetDayNumbers) ? targetDayNumbers : [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  const empty = {
    selfSufficient: true,
    structuralSelectable: true,
    crossDayRepetitionStatus: 'clear',
    revisitClassification: null,
    conflictingDayNumbers: [],
    conflictingExperienceIdentity: null,
    crossDayConflict: false,
  };
  if (!plan?.days?.length || !candidateStop || targets.size === 0) return empty;

  const conflictingDayNumbers = [];
  let revisitClassification = null;
  let conflictingExperienceIdentity = null;
  let sawDistinct = false;
  let sawUncertain = false;

  for (const [index, day] of plan.days.entries()) {
    const number = dayNumberOf(day, index);
    if (targets.has(number)) continue;
    for (const stop of day.stops || []) {
      if (!stopName(stop)) continue;
      const relationship = classifyExperienceRelationship(candidateStop, stop, {
        identityRelation: compareIdentity ? compareIdentity(candidateStop, stop) : null,
      });
      if (relationship === 'distinct') continue;
      if (relationship === 'same_place_distinct_visit') {
        sawDistinct = true;
        continue;
      }
      // same_experience or unknown → redundant for refinement selection
      if (!conflictingDayNumbers.includes(number)) conflictingDayNumbers.push(number);
      revisitClassification = 'REDUNDANT_DUPLICATE';
      conflictingExperienceIdentity = canonicalExperienceKey(stopName(candidateStop) || stopName(stop));
      if (relationship === 'unknown') sawUncertain = true;
    }
  }

  if (conflictingDayNumbers.length) {
    return {
      selfSufficient: false,
      structuralSelectable: false,
      crossDayRepetitionStatus: sawUncertain ? 'uncertain' : 'redundant_duplicate',
      revisitClassification,
      conflictingDayNumbers: conflictingDayNumbers.sort((a, b) => a - b),
      conflictingExperienceIdentity,
      crossDayConflict: true,
    };
  }

  if (sawDistinct) {
    return {
      selfSufficient: true,
      structuralSelectable: true,
      crossDayRepetitionStatus: 'distinct_revisit',
      revisitClassification: 'DISTINCT_REVISIT',
      conflictingDayNumbers: [],
      conflictingExperienceIdentity: null,
      crossDayConflict: false,
    };
  }

  return empty;
}

/**
 * Full-day projection: insert/replace the target day's stops and detect
 * cross-day duplicate_base_experience conflicts via the completeness helper.
 */
function projectDayStopsAgainstFrozenPlan({
  plan = null,
  targetDayNumber = null,
  proposedStops = [],
  compareIdentity = null,
} = {}) {
  const { refinementCrossDayDuplicateConflicts } = require('./itineraryCompleteness');
  if (!plan?.days?.length || !targetDayNumber) {
    return { ok: true, conflicts: [], reasonCodes: [] };
  }
  const nextDays = plan.days.map((day, index) => {
    const number = dayNumberOf(day, index);
    if (number !== Number(targetDayNumber)) return day;
    return { ...day, stops: proposedStops };
  });
  const conflicts = refinementCrossDayDuplicateConflicts(
    nextDays,
    [Number(targetDayNumber)],
    compareIdentity
  );
  // Also flag within-day redundant pairs among proposed stops.
  const withinDay = [];
  for (let i = 0; i < proposedStops.length; i += 1) {
    for (let j = i + 1; j < proposedStops.length; j += 1) {
      const relationship = classifyExperienceRelationship(proposedStops[i], proposedStops[j], {
        interveningStops: proposedStops.slice(i + 1, j),
        identityRelation: compareIdentity
          ? compareIdentity(proposedStops[i], proposedStops[j])
          : null,
      });
      if (relationship === 'distinct' || relationship === 'same_place_distinct_visit') continue;
      withinDay.push({
        dayNumbers: [Number(targetDayNumber)],
        touchedDayNumbers: [Number(targetDayNumber)],
        conflictType: 'within_touched_day',
        experienceIdentity: canonicalExperienceKey(
          stopName(proposedStops[i]) || stopName(proposedStops[j])
        ),
      });
    }
  }
  const all = [...conflicts, ...withinDay];
  return {
    ok: all.length === 0,
    conflicts: all,
    reasonCodes: all.length ? ['duplicate_base_experience'] : [],
  };
}

/**
 * Candidate stop shape for projection from a packed catalogue item.
 */
function candidateAsStop(item) {
  const name = item?.action?.canonicalEntity
    || item?.candidate?.canonicalName
    || item?.canonicalName
    || null;
  return {
    name,
    canonicalPlaceName: name,
    type: item?.candidate?.canonicalType || item?.canonicalType || item?.action?.sourceSemanticCategory || 'hike',
    duration: item?.action?.sourceDuration || item?.candidate?.maxDurationMinutes || 75,
    evidenceRef: item?.candidate?.evidenceIds?.[0] || item?.evidenceIds?.[0] || null,
  };
}

module.exports = {
  projectCandidateCrossDayViability,
  projectDayStopsAgainstFrozenPlan,
  candidateAsStop,
};
