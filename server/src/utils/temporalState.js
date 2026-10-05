'use strict';

const { parseTripDatesFromMessage, calendarWindowDays } = require('./tripDateParser');
function assertTemporalConsistency(state, projection = null) {
  const pending = state?.pendingTemporalResolution;
  if (!pending?.confirmationRequired) return;
  const dates = projection || state?.dates || {};
  if ((dates.startDate || dates.start) === pending.candidateStartDate
    || (dates.endDate || dates.end) === pending.candidateEndDate) {
    throw Object.assign(new Error('Pending temporal candidate leaked into confirmed dates'), { code: 'temporal_state_confirmation_conflict' });
  }
}

// Only traveler input enters this transition. Model output is never a source.
function resolveTemporalState({ text = '', previous = null, confirmedDates = {}, now = new Date(), sourceTurnId = null } = {}) {
  const prior = previous?.pendingTemporalResolution || null;
  const priorDates = previous?.dates || confirmedDates;
  let pending = prior;
  let dates = { startDate: priorDates?.startDate || null, endDate: priorDates?.endDate || null };
  let provenance = previous?.temporalProvenance || null;
  let parsed = parseTripDatesFromMessage(text, now);
  let action = 'unchanged';
  const answer = String(text).trim();
  // Tight answer grammar: an unrelated use of a year or "yes" does not confirm.
  const yearReply = answer.match(/^(?:(?:yes|yeah|correct|right|no|actually)[,!]?\s*)?(?:(?:I meant|make it|in)\s+)?(\d{4})[.!]?$/i);
  const confirm = /^(?:yes|yeah|correct|right|that's right|that is right|those dates work)[.!]?$/i.test(answer);
  const reject = /^(?:no|no[,!]?(?:\s+those dates (?:aren't|are not) right)?|those dates (?:aren't|are not) right)[.!]?$/i.test(answer);
  if (prior && !parsed && (yearReply || confirm)) {
    const year = yearReply?.[1] || prior.candidateStartDate.slice(0,4);
    const span = Number(prior.candidateEndDate.slice(0,4)) - Number(prior.candidateStartDate.slice(0,4));
    const startDate = `${year}${prior.candidateStartDate.slice(4)}`;
    const endDate = `${Number(year)+span}${prior.candidateEndDate.slice(4)}`;
    if (calendarWindowDays(startDate, endDate)) {
      parsed = { startDate, endDate, confirmedInFollowup: true };
    }
  }
  if (parsed?.pendingTemporalResolution) {
    pending = { ...parsed.pendingTemporalResolution, sourceTurnId };
    action = 'clarify_year';
  } else if (parsed?.startDate && parsed?.endDate) {
    dates = { startDate: parsed.startDate, endDate: parsed.endDate };
    provenance = { source: parsed.confirmedInFollowup ? 'confirmed_in_followup' : /\b\d{4}\b/.test(text) ? 'explicit' : 'unambiguous_inferred',
      sourceText: text.slice(0,800), sourceTurnId, originalSourceText: parsed.confirmedInFollowup ? prior?.sourceText : undefined };
    pending = null;
    action = 'confirm_dates';
  } else if (prior && reject) {
    pending = null; action = 'reject_candidate';
  }
  const result = { status: pending ? 'pending_confirmation' : dates.startDate ? 'confirmed' : 'unknown',
    action, dates, pendingTemporalResolution: pending, temporalProvenance: provenance,
    tripWindowDays: calendarWindowDays(dates.startDate, dates.endDate),
    // Fact/clarification-only turns need no destination evidence. Mixed requests
    // (planning, weather, access questions) retain their normal retrieval path.
    conversationalOnly: action !== 'unchanged'
      && !/\b(plan|itinerary|redo|simplify|weather|forecast|closures?|permits?|drive|hike|things to do|what can|where|how)\b/i.test(text) };
  assertTemporalConsistency(result);
  return result;
}

function applyTemporalState(state, resolution) {
  if (!resolution) return state;
  const datesChanged = state.dates?.startDate !== resolution.dates.startDate || state.dates?.endDate !== resolution.dates.endDate;
  const next = { ...state, dates: { ...state.dates, ...resolution.dates, tripWindowDays: resolution.tripWindowDays },
    pendingTemporalResolution: resolution.pendingTemporalResolution,
    temporalResolutionStatus: resolution.status, temporalProvenance: resolution.temporalProvenance };
  // Date changes invalidate any old binding; they never establish a new one.
  if (datesChanged) next.planDayCalendarBindings = [];
  assertTemporalConsistency(next);
  return next;
}
module.exports = { resolveTemporalState, applyTemporalState, assertTemporalConsistency };
