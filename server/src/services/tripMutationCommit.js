'use strict';

/**
 * Commit a high-confidence trip change before live evidence can fail the turn.
 *
 * A question, a hypothetical, or a maybe does not become trip state.
 * A booking, a preference, a constraint, or an explicit "give me N days"
 * does, and that commit survives a later answer failure.
 */

const { extractLodgingFact, applyTravelerFactTransition, isExploratoryTripTalk } = require('../utils/travelerFactTransition');
const isConfirmedLodgingBooking = (message, state) => Boolean(extractLodgingFact(message, state));
const EXPLICIT_DAY_REQUEST = /\b(?:give me|build me|plan)\b/i;
const WORD_DAYS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
});

function requestedDayCount(message) {
  const text = String(message || '');
  if (!EXPLICIT_DAY_REQUEST.test(text)) return null;
  if (text.includes('?') && !/\bgive me\b/i.test(text)) return null;
  const digit = text.match(/\b(\d{1,2})\s*(?:full\s+)?[- ]?days?\b/i);
  if (digit) {
    const n = Number(digit[1]);
    return n > 0 && n <= 21 ? n : null;
  }
  const word = text.match(new RegExp(`\\b(${Object.keys(WORD_DAYS).join('|')})\\s*(?:full\\s+)?[- ]?days?\\b`, 'i'));
  if (!word) return null;
  return WORD_DAYS[word[1].toLowerCase()] || null;
}

function buildDraftPlan(dayCount, destinationName) {
  const name = destinationName ? String(destinationName) : 'this trip';
  const days = [];
  for (let dayNumber = 1; dayNumber <= dayCount; dayNumber += 1) {
    days.push({
      id: `draft-day-${dayNumber}`,
      dayNumber,
      label: `Day ${dayNumber}`,
      stops: [],
      status: 'draft',
    });
  }
  return {
    destination: name,
    days,
  };
}

/**
 * @returns {{ committed: boolean, planningState: object|null, reasons: string[] }}
 */
function commitUnderstoodTripChange({
  message = '',
  planningState = null,
  hasExistingPlan = false,
  lodgingResolution = null,
} = {}) {
  const text = String(message || '');
  const reasons = [];
  if (!planningState || typeof planningState !== 'object') {
    return { committed: false, planningState: planningState || null, reasons };
  }
  if (isExploratoryTripTalk(text)) {
    return { committed: false, planningState, reasons: ['exploratory'] };
  }

  const transition = applyTravelerFactTransition({ message: text, planningState, lodgingResolution });
  const next = { ...transition.planningState };
  reasons.push(...transition.reasons);
  let committed = reasons.length > 0;

  const dayCount = requestedDayCount(text);
  if (dayCount && !hasExistingPlan && !(next.draftPlan?.days?.length)) {
    const destinationName = next.destination?.parkName || next.tripScope?.destinations?.[0]?.displayName || null;
    next.draftPlan = buildDraftPlan(dayCount, destinationName);
    if (next.dates && !next.dates.durationDays) next.dates = { ...next.dates, durationDays: dayCount };
    committed = true;
    reasons.push('draft_days');
  }

  if (!committed) {
    return { committed: false, planningState, reasons };
  }
  next.updatedAt = new Date().toISOString();
  return { committed: true, planningState: next, reasons };
}

async function persistCommittedTripMutation({
  message,
  preparedContext,
  session = null,
} = {}) {
  if (!preparedContext) return { committed: false, planningState: null, reasons: [] };
  const hasExistingPlan = Boolean(
    preparedContext.resolvedMetadata?.existingCanonicalPlan?.days?.length
  );
  const result = commitUnderstoodTripChange({
    message,
    planningState: preparedContext.planningState || preparedContext.constraints?.planningState || null,
    hasExistingPlan,
    lodgingResolution: preparedContext.resolvedMetadata?.lodgingFactResolution,
  });
  if (!result.committed) return result;
  preparedContext.planningState = result.planningState;
  if (preparedContext.constraints) {
    preparedContext.constraints.planningState = result.planningState;
  }
  if (preparedContext.resolvedMetadata) {
    preparedContext.resolvedMetadata.planningState = result.planningState;
  }
  if (session) {
    session.planningState = result.planningState;
    session.markModified('planningState');
    await session.save();
  }
  return result;
}

module.exports = {
  isConfirmedLodgingBooking,
  isExploratoryTripTalk,
  commitUnderstoodTripChange,
  persistCommittedTripMutation,
  buildDraftPlan,
};
