'use strict';

/**
 * Resolve ACTION / OBJECT / TARGET for state-changing requests.
 *
 * Informational answers may proceed with partial context. Mutations may not.
 * Canonical IDs are preferred; unresolved referents must clarify, never guess.
 */

const BOOKING_REF = /\b(?:that|the|my|our)\s+(?:reservation|booking|hotel|lodging|lodge|motel|inn|campground|campsite)\b/i;
const MOVE_BOOKING = /\b(?:move|shift|change|reschedule|postpone|push)\b[\s\S]{0,40}\b(?:reservation|booking|hotel|lodging)\b|\b(?:reservation|booking|hotel|lodging)\b[\s\S]{0,40}\b(?:to|until|for)\b/i;
const ANAPHORA_STOP = /\b(?:that|this|the)\s+(?:hike|trail|stop|place|activity|overlook|museum|walk)\b/i;
const SKIP_THAT = /\b(?:skip|remove|drop|cancel|take out)\s+(?:that|this|it)\b/i;

function bookingsFrom(tripState = {}) {
  const state = tripState.planningState || tripState;
  const lodging = state.lodging || {};
  const list = [];
  const confirmed = lodging.confirmed || lodging.base || lodging.bookings || lodging.options || [];
  const items = Array.isArray(confirmed) ? confirmed : (confirmed ? [confirmed] : []);
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id = item.id || item.bookingId || item.placeId || null;
    const name = item.name || item.displayName || item.canonicalName || item.hotelName || null;
    if (!id && !name) continue;
    list.push({
      id: id || null,
      name: name || null,
      type: item.type || 'lodging',
      confirmed: item.confirmed !== false && lodging.confirmed != null,
    });
  }
  return list;
}

function stopsFrom(plan) {
  return (plan?.days || []).flatMap((day, index) => (day.stops || []).map((stop) => ({
    id: stop.id || stop.stopId || null,
    name: stop.name || stop.canonicalPlaceName || null,
    dayNumber: Number(day.dayNumber) || index + 1,
    type: stop.type || null,
  }))).filter((stop) => stop.id || stop.name);
}

/**
 * @returns {{
 *   resolved: boolean,
 *   action: string|null,
 *   objectType: string|null,
 *   target: object|null,
 *   candidates: object[],
 *   clarificationNeeded: boolean,
 *   reasonCodes: string[],
 *   unresolvedReferences: Array<{type: string, reference: string}>,
 * }}
 */
function resolveActionTarget({
  text = '',
  priorPlan = null,
  tripState = null,
  temporalDay = null,
} = {}) {
  const msg = String(text || '');
  const unresolvedReferences = [];

  if (BOOKING_REF.test(msg) || MOVE_BOOKING.test(msg)) {
    const bookings = bookingsFrom(tripState);
    if (bookings.length === 1) {
      return {
        resolved: true,
        action: MOVE_BOOKING.test(msg) ? 'move_booking' : 'reference_booking',
        objectType: 'booking',
        target: bookings[0],
        candidates: bookings,
        clarificationNeeded: false,
        reasonCodes: ['action_booking_resolved'],
        unresolvedReferences,
      };
    }
    unresolvedReferences.push({ type: 'action_target', reference: 'that reservation' });
    return {
      resolved: false,
      action: MOVE_BOOKING.test(msg) ? 'move_booking' : 'reference_booking',
      objectType: 'booking',
      target: null,
      candidates: bookings,
      clarificationNeeded: true,
      reasonCodes: ['action_booking_unresolved'],
      unresolvedReferences,
    };
  }

  if (temporalDay?.unresolved === true) {
    unresolvedReferences.push({ type: 'temporal', reference: 'undated temporal reference' });
    return {
      resolved: false,
      action: 'temporal_edit',
      objectType: 'day',
      target: null,
      candidates: [],
      clarificationNeeded: true,
      reasonCodes: ['temporal_target_unresolved'],
      unresolvedReferences,
    };
  }

  if ((ANAPHORA_STOP.test(msg) || SKIP_THAT.test(msg)) && priorPlan?.days?.length) {
    const stops = stopsFrom(priorPlan);
    if (stops.length === 1) {
      return {
        resolved: true,
        action: SKIP_THAT.test(msg) ? 'remove_stop' : 'reference_stop',
        objectType: 'stop',
        target: stops[0],
        candidates: stops,
        clarificationNeeded: false,
        reasonCodes: ['action_stop_resolved_singular'],
        unresolvedReferences,
      };
    }
    // Named stop matching is handled by refinementScope; here only bare anaphora.
    if (!/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/.test(msg.replace(ANAPHORA_STOP, '').replace(SKIP_THAT, ''))) {
      unresolvedReferences.push({ type: 'action_target', reference: 'that stop' });
      return {
        resolved: false,
        action: SKIP_THAT.test(msg) ? 'remove_stop' : 'reference_stop',
        objectType: 'stop',
        target: null,
        candidates: stops,
        clarificationNeeded: true,
        reasonCodes: ['action_stop_unresolved'],
        unresolvedReferences,
      };
    }
  }

  return {
    resolved: true,
    action: null,
    objectType: null,
    target: null,
    candidates: [],
    clarificationNeeded: false,
    reasonCodes: ['action_not_required'],
    unresolvedReferences,
  };
}

module.exports = {
  resolveActionTarget,
  bookingsFrom,
};
