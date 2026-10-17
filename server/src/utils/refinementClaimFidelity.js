'use strict';

/**
 * A claimed refinement dimension must be supported by the accepted canonical
 * delta, or the traveler-facing summary must say so. Requested change codes
 * (from the user prompt) are not themselves proof that the plan changed.
 */

const KNOWN_DELTA_CODES = new Set(['less_shuttle_reliance', 'sunset_added', 'slower_pace']);
const SHUTTLE_TEXT_RE = /\bshuttle\b/i;
const SUNSET_TEXT_RE = /\bsunset\b|\bgolden hour\b/i;
const SHUTTLE_CLAIM_CLAUSE_RE = /(?:,?\s*(?:and\s+)?)?(?:keeping [^.]*?)?(?:(?:so it|so this) )?(?:away from (?:the )?shuttle[- ](?:heavy|focused)[^.]*|reducing shuttle[^.]*|less shuttle[- ](?:heavy|reliant|focused)[^.]*|(?:avoided|avoiding|avoids) (?:the )?shuttle[^.]*)/gi;

const SHUTTLE_UNSATISFIED_EXPLANATION =
  "I kept the existing stops I didn't change. I couldn't confirm a shuttle-access change in the accepted plan, so shuttle-heavy parts may still be in it.";

function daysOf(plan) {
  return Array.isArray(plan?.days) ? plan.days : [];
}

function stopsOf(day) {
  return Array.isArray(day?.stops) ? day.stops : [];
}

function dayNumber(day, index) {
  const value = Number(day?.dayNumber ?? day?.day ?? day?.dayIndex);
  return Number.isInteger(value) && value > 0 ? value : index + 1;
}

function stopKey(dayNum, stop) {
  return `${dayNum}:${stop?.id || stop?.name || ''}`;
}

function requirementHasShuttle(requirement) {
  if (!requirement || typeof requirement !== 'object') return false;
  if (requirement.kind === 'water_or_shuttle_access') return true;
  return SHUTTLE_TEXT_RE.test(`${requirement.title || ''} ${requirement.requirement || ''}`);
}

function stopHasShuttleSignal(stop) {
  if (!stop || typeof stop !== 'object') return false;
  const type = String(stop.type || '').toLowerCase();
  if (type === 'shuttle') return true;
  const requirements = Array.isArray(stop.requirements) ? stop.requirements : [];
  if (requirements.some(requirementHasShuttle)) return true;
  return SHUTTLE_TEXT_RE.test(`${stop.name || ''} ${stop.note || ''} ${stop.why || ''} ${type}`);
}

function shuttleKeys(plan) {
  const keys = [];
  daysOf(plan).forEach((day, index) => {
    const num = dayNumber(day, index);
    for (const stop of stopsOf(day)) {
      if (stopHasShuttleSignal(stop)) keys.push(stopKey(num, stop));
    }
  });
  return keys;
}

function stopDuration(stop) {
  const n = Number(stop?.duration ?? stop?.durationMin ?? stop?.durationMinutes);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function totalDuration(plan) {
  return daysOf(plan).reduce((sum, day) => (
    sum + stopsOf(day).reduce((inner, stop) => inner + stopDuration(stop), 0)
  ), 0);
}

function stopCount(plan) {
  return daysOf(plan).reduce((sum, day) => sum + stopsOf(day).length, 0);
}

function stopBlob(stop) {
  return `${stop?.timeWindow || ''} ${stop?.name || ''} ${stop?.note || ''} ${stop?.why || ''}`;
}

function hasSunset(plan) {
  return daysOf(plan).some((day) => stopsOf(day).some((stop) => SUNSET_TEXT_RE.test(stopBlob(stop))));
}

function dayFingerprint(day) {
  return JSON.stringify((stopsOf(day) || []).map((stop) => ({
    id: stop?.id || null,
    name: stop?.name || null,
    duration: stopDuration(stop),
    timeWindow: stop?.timeWindow || null,
    type: stop?.type || null,
  })));
}

function changedDayNumbers(priorPlan, nextPlan) {
  const prior = new Map(daysOf(priorPlan).map((day, index) => [dayNumber(day, index), dayFingerprint(day)]));
  const changed = [];
  daysOf(nextPlan).forEach((day, index) => {
    const num = dayNumber(day, index);
    if (prior.get(num) !== dayFingerprint(day)) changed.push(num);
  });
  return changed;
}

function shuttleReduced(priorPlan, nextPlan) {
  const prior = shuttleKeys(priorPlan);
  const next = shuttleKeys(nextPlan);
  if (next.length < prior.length) return true;
  return prior.some((key) => !next.includes(key));
}

function reconcileRefinementClaims({
  requestedChanges = [],
  priorPlan = null,
  nextPlan = null,
} = {}) {
  const requested = [...new Set((requestedChanges || []).filter((code) => typeof code === 'string' && code.trim()))];
  const acceptedChanges = [];
  const unsatisfied = [];

  for (const code of requested) {
    if (!KNOWN_DELTA_CODES.has(code)) {
      acceptedChanges.push(code);
      continue;
    }
    if (code === 'less_shuttle_reliance') {
      if (shuttleReduced(priorPlan, nextPlan)) acceptedChanges.push(code);
      else unsatisfied.push(code);
      continue;
    }
    if (code === 'sunset_added') {
      if (hasSunset(nextPlan)) acceptedChanges.push(code);
      else unsatisfied.push(code);
      continue;
    }
    if (code === 'slower_pace') {
      if (stopCount(nextPlan) <= stopCount(priorPlan) || totalDuration(nextPlan) < totalDuration(priorPlan)) {
        acceptedChanges.push(code);
      } else unsatisfied.push(code);
    }
  }

  return {
    acceptedChanges: [...new Set(acceptedChanges)],
    unsatisfied: [...new Set(unsatisfied)],
    changedDayNumbers: changedDayNumbers(priorPlan, nextPlan),
  };
}

function tidySentence(text) {
  return String(text || '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s+\./g, '.')
    .replace(/\s+so it\s*[.]/gi, '.')
    .replace(/ {2,}/g, ' ')
    .replace(/\s+and\s+\./gi, '.')
    .replace(/\.\s*\./g, '.')
    .trim();
}

function alignRefinementProse({ text = '', reconciliation = null } = {}) {
  let working = typeof text === 'string' ? text.trim() : '';
  const unsatisfied = new Set(reconciliation?.unsatisfied || []);
  if (unsatisfied.has('less_shuttle_reliance')) {
    working = tidySentence(working.replace(SHUTTLE_CLAIM_CLAUSE_RE, ''));
    if (!/couldn't confirm a shuttle-access change/i.test(working)) {
      working = `${working}${working && !/[.!?]$/.test(working) ? '.' : ''} ${SHUTTLE_UNSATISFIED_EXPLANATION}`.trim();
    }
  }
  return collapseFinal(working);
}

function collapseFinal(text) {
  return String(text || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

module.exports = {
  alignRefinementProse,
  reconcileRefinementClaims,
  stopHasShuttleSignal,
};
