'use strict';

/**
 * Which saved stops a new trip fact puts in question.
 *
 * This does not decide the replacement. It only names the days a later patch
 * is allowed to touch. A stop is in scope when the plan already says it is
 * exposed, or when a trail never recorded an exposure and the traveler
 * just ruled exposure out. A closure is in scope only for stops whose own
 * name or note mentions the thing that closed.
 */

const { isExploratoryTripTalk } = require('../services/tripMutationCommit');
const { dayNumber: dayNumberOf } = require('./itineraryPlanPatch');
const { isExposureRelevantStop } = require('./hardConstraintEligibility');

const HIGH_EXPOSURE = new Set(['moderate', 'high', 'extreme', 'exposed', 'very_high']);
const AVOID_EXPOSURE = /\b(?:don'?t like|do not like|doesn'?t like|does not like|hate|avoid|no)\b[^.?!]{0,48}\b(?:scary\s+)?expos/i;
const STATED_CLOSURE = /\b(?:is|are|was|were|gets?|got)\s+closed\b|\bclosure\b|\bclosed\b/i;
const STATUS_QUESTION = /^\s*(?:is|are|was|were|do|does|did|what|why|how|when|which)\b/i;
const CLOSURE_STOPWORDS = new Set([
  'closed', 'closure', 'road', 'roads', 'route', 'into', 'from', 'with', 'that',
  'this', 'what', 'should', 'instead', 'where', 'about', 'there', 'their',
  'would', 'could', 'please', 'after', 'before', 'still', 'really', 'going',
]);

function stopIdOf(stop) {
  return String(stop?.id || stop?.stopId || '').trim() || null;
}

function exposureImpact(stop, dayNumber, stopIndex = null) {
  const level = String(stop?.exposureLevel || '').trim().toLowerCase();
  const stopId = stopIdOf(stop);
  if (HIGH_EXPOSURE.has(level)) {
    return { dayNumber, stopId, stopIndex, reason: 'exposure_conflict' };
  }
  if (level === 'low' || level === 'none') return null;
  // Use the same relevance rule as operational validation. Otherwise a
  // constraint update cannot touch all the days that validation rejects.
  if (isExposureRelevantStop(stop)) {
    return { dayNumber, stopId, stopIndex, reason: 'exposure_unresolved' };
  }
  return null;
}

function featureTokens(text) {
  const words = String(text || '').toLowerCase().match(/[a-z]{5,}/g) || [];
  return [...new Set(words)].filter((word) => !CLOSURE_STOPWORDS.has(word));
}

function closureImpacts(text, plan) {
  const tokens = featureTokens(String(text).split(/\b(?:is|are|was|were)\s+closed\b/i)[0]).filter((word) => word !== 'closed');
  if (tokens.length === 0) return [];
  const impacts = [];
  for (const [index, day] of (plan?.days || []).entries()) {
    const dayNumber = dayNumberOf(day, index);
    for (const [stopIndex, stop] of (day.stops || []).entries()) {
      const description = `${stop?.note || ''} ${stop?.why || ''}`
        .replace(/[^.!?]*\b(?:away from|outside|does not (?:use|require)|without using)\b[^.!?]*/gi, '');
      const blob = `${stop?.name || ''} ${(stop?.accessDependencies || []).join(' ')} ${description}`.toLowerCase();
      if (!tokens.some((token) => new RegExp(`\\b${token}\\b`).test(blob))) continue;
      impacts.push({
        dayNumber,
        stopId: stopIdOf(stop),
        stopIndex,
        reason: 'access_conflict',
      });
    }
  }
  return impacts;
}

function isStatusQuestion(text) {
  return STATUS_QUESTION.test(String(text || '').trim());
}

/**
 * @returns {{ dayNumber: number, stopId: string|null, reason: string }[]}
 */
function itineraryImpacts({ text = '', plan = null } = {}) {
  const message = String(text || '');
  const days = plan?.days;
  if (!Array.isArray(days) || days.length === 0) return [];
  if (isExploratoryTripTalk(message) || isStatusQuestion(message)) return [];

  const impacts = [];
  if (AVOID_EXPOSURE.test(message)) {
    for (const [index, day] of days.entries()) {
      const dayNumber = dayNumberOf(day, index);
      for (const [stopIndex, stop] of (day.stops || []).entries()) {
        const impact = exposureImpact(stop, dayNumber, stopIndex);
        if (impact) impacts.push(impact);
      }
    }
  }
  if (STATED_CLOSURE.test(message)) {
    impacts.push(...closureImpacts(message, plan));
  }
  return impacts;
}

module.exports = {
  itineraryImpacts,
  featureTokens,
};
