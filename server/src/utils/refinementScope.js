'use strict';

/**
 * MACHINE-OWNED REFINEMENT SCOPE.
 *
 * `resolveRefinementIntent` answers what KIND of thing the traveler pointed at
 * ('daypart', 'day', 'stop'). It never answers WHICH one. So the execution
 * layer knew the traveler meant a daypart and then asked the model to name the
 * stop — and two live runs failed on exactly that hand-off: terra emitted
 * `stopName: "Mauna Loa Road"` for a stop the plan calls
 * `Mauna Loa Road scenic drive` (`id: mauna-loa-road`), and after the repair it
 * escaped targeting entirely with `update_day`, replacing an afternoon nobody
 * had mentioned.
 *
 * Two prompt revisions failed to change that. It is not a wording problem: the
 * deterministic system already holds the answer and should not be asking.
 *
 * This module owns:
 *   - WHICH object the traveler referred to (day, daypart, stop ids)
 *   - HOW MUCH of the plan an operation may move
 *   - whether the delivered mutation stayed inside that
 *
 * The model still owns WHAT the change should be. That division is the point.
 */

const { dayNumber: dayNumberOf } = require('./itineraryPlanPatch');
const { itineraryImpacts } = require('./itineraryImpact');
const { buildImpactStopScope, evaluateFrozenSiblings, activePlanConstraintRefinement } = require('./stopMutationScope');
const { resolveActionTarget } = require('./actionTargetResolution');

const SCOPE_LEVELS = Object.freeze({
  WHOLE_PLAN: 'whole_plan',
  DAY: 'day',
  DAYPART: 'daypart',
  STOP: 'stop',
  ROUTE_LEG: 'route_leg',
  AFFECTED_DAYS: 'affected_days',
  UNKNOWN: 'unknown',
});

const ORDINALS = Object.freeze({
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
});

/**
 * Canonical dayparts. `midday` deliberately folds into morning: the live plan
 * writes "Morning through midday", and a traveler saying "the second morning"
 * means that stop.
 */
const DAYPARTS = Object.freeze({
  morning: /\b(?:morning|midday|lunchtime|sunrise)\b/i,
  afternoon: /\b(?:afternoon|golden hour)\b/i,
  evening: /\b(?:evening|sunset|night)\b/i,
});

const DAYPART_WORD = /\b(morning|midday|afternoon|evening|night|sunset|sunrise)\b/i;
const ORDINAL_WORD = '(?:first|second|third|fourth|fifth|sixth|seventh|1st|2nd|3rd|4th|5th|6th|7th|one|two|three|four|five|six|seven|[1-7])';

const normalizeDaypart = (word) => {
  const w = String(word || '').toLowerCase();
  if (/(morning|midday|lunchtime|sunrise)/.test(w)) return 'morning';
  if (/(afternoon|golden hour)/.test(w)) return 'afternoon';
  if (/(evening|sunset|night)/.test(w)) return 'evening';
  return null;
};

const ordinalValue = (word) => {
  // Strip the suffix ONLY from a numeric ordinal: "2nd" -> "2". Doing it
  // unconditionally turns "second" into "seco" and "third" into "thi".
  const key = String(word || '').toLowerCase().replace(/^(\d+)(?:st|nd|rd|th)$/, '$1');
  return ORDINALS[key] ?? null;
};

/** Which daypart does a stop's time window belong to? */
function stopDaypart(stop) {
  const window = String(stop?.timeWindow || stop?.startTime || '');
  if (!window.trim()) return null;
  // Order matters: "Sunrise or late afternoon golden hour" mentions both, and a
  // stop that spans dayparts belongs to neither exclusively.
  const hits = Object.keys(DAYPARTS).filter((name) => DAYPARTS[name].test(window));
  return hits.length === 1 ? hits[0] : null;
}

function stopsForDay(plan, dayNum) {
  const days = plan?.days || [];
  const day = days.find((d, i) => dayNumberOf(d, i) === dayNum);
  return Array.isArray(day?.stops) ? day.stops : [];
}

const stopIdOf = (stop) => String(stop?.id || stop?.stopId || '').trim() || null;

/** The bounded target handle the generator is offered: id plus display name. */
function describeStop(stop) {
  const id = stopIdOf(stop);
  if (!id) return null;
  return { id, name: String(stop?.name || '').trim() || null, timeWindow: stop?.timeWindow ?? null };
}

const WEEKDAYS = Object.freeze({
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
});

const TEMPORAL_REFERENCE = /\b(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|first full day|morning after we arrive)\b/i;

function isoDay(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function addUtcDays(iso, offset) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function planDayDates(plan, bindings = []) {
  return (plan?.days || []).map((day, index) => {
    const dayNumber = dayNumberOf(day, index);
    const binding = bindings.find(b => b.confirmed === true && b.dayNumber === dayNumber);
    const own = day?.calendarBindingConfirmed === false ? null : isoDay(day?.date || day?.startDate);
    return { dayNumber, iso: isoDay(binding?.date) || own };
  });
}

/**
 * A clock word points at one saved day, or at nothing.
 * `null` means the sentence did not use one of these references.
 * `{ unresolved: true }` means it did, and guessing a day would edit the wrong one.
 */
function resolveTemporalPlanDay({ text = '', priorPlan = null, planDayCalendarBindings = [], now = new Date() } = {}) {
  const msg = String(text || '');
  if (!TEMPORAL_REFERENCE.test(msg)) return null;
  const days = priorPlan?.days || [];
  if (days.length === 0) return { unresolved: true };
  const dated = planDayDates(priorPlan, planDayCalendarBindings);
  const clock = now instanceof Date ? now : new Date(now);
  const todayIso = Number.isNaN(clock.getTime()) ? null
    : `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, '0')}-${String(clock.getDate()).padStart(2, '0')}`;

  const weekday = msg.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (weekday) {
    const wanted = WEEKDAYS[weekday[1].toLowerCase()];
    const hits = dated.filter((day) => day.iso && new Date(`${day.iso}T00:00:00Z`).getUTCDay() === wanted);
    return hits.length === 1 ? { dayNumber: hits[0].dayNumber } : { unresolved: true };
  }

  if (/\b(?:first full day|morning after we arrive)\b/i.test(msg)) {
    return { dayNumber: 1, daypart: /\bmorning after we arrive\b/i.test(msg) ? 'morning' : null };
  }

  const offset = /\btomorrow\b/i.test(msg) ? 1 : (/\b(?:today|tonight)\b/i.test(msg) ? 0 : null);
  if (offset == null) return { unresolved: true };
  // Clock words require confirmed day/date bindings, not merely a trip window. Never guess
  // undated "tomorrow" as day 2 — that invents a convention the traveler never set.
  if (!todayIso || !dated.some((day) => day.iso)) {
    return { unresolved: true };
  }
  const target = addUtcDays(todayIso, offset);
  const hits = dated.filter((day) => day.iso === target);
  return hits.length === 1 ? { dayNumber: hits[0].dayNumber } : { unresolved: true };
}

function scopeForDays(plan, dayNumbers, reasonCodes) {
  const wanted = new Set(dayNumbers);
  const stops = [];
  for (const [index, day] of (plan?.days || []).entries()) {
    if (!wanted.has(dayNumberOf(day, index))) continue;
    stops.push(...(day.stops || []));
  }
  const described = stops.map(describeStop).filter(Boolean);
  const single = dayNumbers.length === 1 ? dayNumbers[0] : null;
  return {
    level: single ? SCOPE_LEVELS.DAY : SCOPE_LEVELS.AFFECTED_DAYS,
    dayNumber: single,
    dayNumbers,
    daypart: null,
    allowedStopIds: described.map((stop) => stop.id),
    allowedStops: described,
    singularTargetId: null,
    resolved: true,
    reasonCodes,
  };
}

function unresolved(level, extra = {}) {
  return {
    level,
    dayNumber: null,
    daypart: null,
    allowedStopIds: [],
    allowedStops: [],
    singularTargetId: null,
    resolved: false,
    reasonCodes: ['refinement_target_unresolved'],
    ...extra,
  };
}

/**
 * @returns {{
 *   level: string, dayNumber: number|null, daypart: string|null,
 *   allowedStopIds: string[], singularTargetId: string|null,
 *   resolved: boolean, reasonCodes: string[]
 * }}
 */
function resolveRefinementScope({ text = '', priorPlan = null, tripStart = null, planDayCalendarBindings = [], now = new Date(), tripState = null } = {}) {
  const msg = String(text || '');
  const days = priorPlan?.days || [];
  if (days.length === 0) return unresolved(SCOPE_LEVELS.UNKNOWN);

  // Booking/reservation anaphora must resolve before any day-edit fallback.
  const action = resolveActionTarget({ text: msg, priorPlan, tripState });
  if (action.objectType === 'booking' && !action.resolved) {
    return unresolved(SCOPE_LEVELS.UNKNOWN, {
      reasonCodes: ['refinement_target_unresolved', 'action_booking_unresolved'],
      unresolvedReferences: action.unresolvedReferences,
    });
  }

  const committed = require('./committedPlanPreference').committedPlanPreference(msg);
  const subset = /\b(first|last|final)\s+(one|two|three|four|five|six|seven|\d+)\s+days?\b/i.exec(msg);
  if (committed && subset) {
    const count = ordinalValue(subset[2]);
    if (!count || count > days.length) return unresolved(SCOPE_LEVELS.AFFECTED_DAYS);
    const selected = subset[1].toLowerCase() === 'first' ? days.slice(0, count) : days.slice(-count);
    return {
      level: SCOPE_LEVELS.AFFECTED_DAYS, dayNumber: null,
      dayNumbers: selected.map(day => dayNumberOf(day, days.indexOf(day))), daypart: null,
      allowedStopIds: selected.flatMap(day => (day.stops || []).map(stopIdOf).filter(Boolean)),
      allowedStops: selected.flatMap(day => (day.stops || []).map(describeStop).filter(Boolean)),
      singularTargetId: null, resolved: true, reasonCodes: ['scope_committed_party_subset'],
    };
  }

  // WHOLE PLAN — an explicit reference to the trip as a whole.
  if (/\b(?:whole|entire|all of the|the full)\s+(?:trip|itinerary|plan)\b/i.test(msg)
    || /\bentire itinerary\b/i.test(msg) || committed) {
    return {
      level: SCOPE_LEVELS.WHOLE_PLAN,
      dayNumber: null,
      daypart: null,
      allowedStopIds: days.flatMap((d) => (d.stops || []).map(stopIdOf).filter(Boolean)),
      allowedStops: days.flatMap((d) => (d.stops || []).map(describeStop).filter(Boolean)),
      singularTargetId: null,
      resolved: true,
      reasonCodes: ['scope_whole_plan'],
    };
  }

  // STOP — a stop named in the plan wins over any coarser reference.
  const lower = msg.toLowerCase();
  for (const [index, day] of days.entries()) {
    for (const stop of day.stops || []) {
      const name = String(stop?.name || '').trim();
      if (name.length >= 4 && lower.includes(name.toLowerCase())) {
        const id = stopIdOf(stop);
        if (!id) continue;
        return {
          level: SCOPE_LEVELS.STOP,
          dayNumber: dayNumberOf(day, index),
          daypart: stopDaypart(stop),
          allowedStopIds: [id],
          allowedStops: [describeStop(stop)],
          singularTargetId: id,
          resolved: true,
          reasonCodes: ['scope_named_stop'],
        };
      }
    }
  }

  // DAYPART — "the second morning". The ordinal selects the DAY; a traveler
  // counting mornings is counting days, not counting stops that happen to
  // start before noon.
  const daypartMatch = new RegExp(
    `\\b(?:the\\s+|that\\s+|this\\s+)?(${ORDINAL_WORD})\\s+(${DAYPART_WORD.source.replace(/\\b/g, '')})\\b`,
    'i',
  ).exec(msg);
  if (daypartMatch) {
    const dayNum = ordinalValue(daypartMatch[1]);
    const part = normalizeDaypart(daypartMatch[2]);
    if (!dayNum || !part) return unresolved(SCOPE_LEVELS.DAYPART);
    const stops = stopsForDay(priorPlan, dayNum);
    const inPart = stops.filter((stop) => stopDaypart(stop) === part && stopIdOf(stop));
    const allowed = inPart.map(stopIdOf);
    if (allowed.length === 0) {
      return unresolved(SCOPE_LEVELS.DAYPART, {
        dayNumber: dayNum,
        daypart: part,
        reasonCodes: ['refinement_target_unresolved', 'daypart_contains_no_stops'],
      });
    }
    return {
      level: SCOPE_LEVELS.DAYPART,
      dayNumber: dayNum,
      daypart: part,
      allowedStopIds: allowed,
      allowedStops: inPart.map(describeStop),
      singularTargetId: allowed.length === 1 ? allowed[0] : null,
      resolved: true,
      reasonCodes: ['scope_daypart'],
    };
  }

  // DAY — "day two", "the second day".
  const dayMatch = new RegExp(`\\bday\\s+(${ORDINAL_WORD})\\b|\\b(?:the\\s+)?(${ORDINAL_WORD})\\s+day\\b`, 'i')
    .exec(msg);
  if (dayMatch) {
    const dayNum = ordinalValue(dayMatch[1] || dayMatch[2]);
    const stops = stopsForDay(priorPlan, dayNum);
    if (!dayNum || stops.length === 0) return unresolved(SCOPE_LEVELS.DAY, { dayNumber: dayNum || null });
    return {
      level: SCOPE_LEVELS.DAY,
      dayNumber: dayNum,
      daypart: null,
      allowedStopIds: stops.map(stopIdOf).filter(Boolean),
      allowedStops: stops.map(describeStop).filter(Boolean),
      singularTargetId: null,
      resolved: true,
      reasonCodes: ['scope_day'],
    };
  }

  const temporal = resolveTemporalPlanDay({ text: msg, priorPlan, planDayCalendarBindings, now });
  if (temporal?.unresolved) {
    return unresolved(SCOPE_LEVELS.UNKNOWN, {
      reasonCodes: ['refinement_target_unresolved', 'temporal_target_unresolved'],
    });
  }
  if (temporal?.dayNumber) {
    const dayNum = temporal.dayNumber;
    if (temporal.daypart) {
      const inPart = stopsForDay(priorPlan, dayNum)
        .filter((stop) => stopDaypart(stop) === temporal.daypart && stopIdOf(stop));
      if (inPart.length > 0) {
        const allowed = inPart.map(stopIdOf);
        return {
          level: SCOPE_LEVELS.DAYPART,
          dayNumber: dayNum,
          daypart: temporal.daypart,
          allowedStopIds: allowed,
          allowedStops: inPart.map(describeStop),
          singularTargetId: allowed.length === 1 ? allowed[0] : null,
          resolved: true,
          reasonCodes: ['scope_temporal_day'],
        };
      }
    }
    const stops = stopsForDay(priorPlan, dayNum);
    if (stops.length === 0) return unresolved(SCOPE_LEVELS.DAY, { dayNumber: dayNum });
    return {
      level: SCOPE_LEVELS.DAY,
      dayNumber: dayNum,
      daypart: null,
      allowedStopIds: stops.map(stopIdOf).filter(Boolean),
      allowedStops: stops.map(describeStop).filter(Boolean),
      singularTargetId: null,
      resolved: true,
      reasonCodes: ['scope_temporal_day'],
    };
  }

  const impacts = itineraryImpacts({ text: msg, plan: priorPlan });
  if (impacts.length > 0) {
    const dayNumbers = [...new Set(impacts.map((impact) => impact.dayNumber))];
    const stopScope = buildImpactStopScope(priorPlan, impacts);
    return {
      ...scopeForDays(priorPlan, dayNumbers, ['scope_itinerary_impact']),
      mutationGranularity: 'stop',
      ...stopScope,
      allowedStopIds: stopScope.affectedStops.map((stop) => stop.id),
      allowedStops: stopScope.affectedStops,
      dayLevelScopeReasons: stopScope.dayRewriteReasons,
    };
  }

  // Anything else — including bare anaphora like "that part" — is not resolved.
  // An unresolvable reference must never authorize an arbitrary mutation.
  return unresolved(SCOPE_LEVELS.UNKNOWN);
}

/**
 * Bind model operations to the resolved scope. Where the machine already knows
 * the singular target, it is INJECTED rather than requested — the model cannot
 * miss a target it was never asked to name.
 */
function bindOperationsToScope({ operations = [], scope = null } = {}) {
  const reasonCodes = new Set();
  if (!scope?.resolved) {
    return { ok: false, operations: [], reasonCodes: ['refinement_target_unresolved'] };
  }
  const allowed = new Set(scope.allowedStopIds || []);
  const bound = [];
  for (const operation of operations) {
    const op = operation?.op;
    if (op !== 'update_stop' && op !== 'remove_stop') {
      bound.push(operation);
      continue;
    }
    let stopId = String(operation?.stopId || '').trim() || null;
    if (!stopId && scope.singularTargetId) {
      stopId = scope.singularTargetId;
      reasonCodes.add('patch_target_bound_by_scope');
    }
    if (!stopId) {
      // Multiple legal targets: a name is acceptable only if it names one of them.
      const name = String(operation?.stopName || '').trim().toLowerCase();
      const match = (scope.allowedStops || [])
        .find((candidate) => String(candidate?.name || '').trim().toLowerCase() === name);
      if (match) {
        stopId = match.id;
        reasonCodes.add('patch_target_bound_by_scope');
      }
    }
    if (!stopId) {
      return { ok: false, operations: [], reasonCodes: [...reasonCodes, 'patch_target_missing_in_scope'] };
    }
    if (!allowed.has(stopId)) {
      return { ok: false, operations: [], reasonCodes: [...reasonCodes, 'patch_target_outside_scope'] };
    }
    bound.push({ ...operation, stopId, stopName: null });
  }
  return { ok: true, operations: bound, reasonCodes: [...reasonCodes] };
}

/**
 * May this operation move as much of the plan as it wants to?
 *
 * `update_day` is not banned — "redo day two" makes it exactly right. It is
 * refused only when the traveler asked for something narrower than the day.
 */
function scopeAllowsOperation({ scope = null, operation = null } = {}) {
  if (!scope?.resolved) return { ok: false, reasonCode: 'refinement_target_unresolved' };
  const op = operation?.op;
  const targetDay = Number(operation?.dayNumber);
  const exceeds = { ok: false, reasonCode: 'patch_operation_exceeds_requested_scope' };

  if (scope.level === SCOPE_LEVELS.WHOLE_PLAN) return { ok: true };

  if (scope.level === SCOPE_LEVELS.DAY) {
    if (targetDay !== scope.dayNumber) return exceeds;
    if (scope.mutationGranularity === 'stop' && op === 'update_day' && !scope.dayRewriteReasons?.[targetDay]) return exceeds;
    return { ok: true };
  }
  if (scope.level === SCOPE_LEVELS.AFFECTED_DAYS) {
    const allowedDays = new Set(scope.dayNumbers || []);
    if (!allowedDays.has(targetDay)) return exceeds;
    if (scope.mutationGranularity === 'stop' && op === 'update_day' && !scope.dayRewriteReasons?.[targetDay]) return exceeds;
    return { ok: true };
  }
  if (scope.level === SCOPE_LEVELS.DAYPART || scope.level === SCOPE_LEVELS.STOP) {
    if (op === 'update_day') return exceeds;
    if (Number.isFinite(targetDay) && targetDay !== scope.dayNumber) return exceeds;
    return { ok: true };
  }
  if (scope.level === SCOPE_LEVELS.ROUTE_LEG) {
    return op === 'update_stop' ? { ok: true } : exceeds;
  }
  return exceeds;
}

/** Fields whose change means the stop itself changed, not merely when it happens. */
const SUBSTANTIVE_STOP_FIELDS = Object.freeze([
  'name', 'type', 'duration', 'difficulty', 'physicalDifficulty', 'exposureLevel',
  'walkingDistanceMiles', 'note', 'why',
]);
/** A bounded schedule ripple: the same stop, retained, moved in the day. */
const SCHEDULE_ONLY_FIELDS = Object.freeze(['timeWindow', 'startTime', 'order']);

/**
 * Hierarchical ownership. Day-scoped ownership proved Days 1 and 3 were intact
 * and called a full Day 2 rewrite acceptable, because Day 2 was "the requested
 * day". A daypart request is narrower than its day, and the check has to be too.
 *
 * Outside the requested scope a stop may shift in the schedule — a longer
 * morning legitimately pushes the afternoon later — but it may not be added,
 * removed, or changed into something else.
 */
function evaluateScopedOwnership({
  priorPlan = null, nextPlan = null, scope = null, operations = null,
} = {}) {
  if (!scope?.resolved) {
    return { ok: false, reasonCodes: ['refinement_target_unresolved'], outsideScope: { removed: [], added: [], changed: [] } };
  }
  if (scope.mutationGranularity === 'stop') {
    const frozen = evaluateFrozenSiblings({ priorPlan, nextPlan, scope, operations });
    if (frozen) return frozen;
  }
  const index = (plan) => {
    const map = new Map();
    for (const [i, day] of (plan?.days || []).entries()) {
      for (const stop of day.stops || []) {
        const id = stopIdOf(stop) || `${dayNumberOf(day, i)}::${stop?.name}`;
        map.set(id, { dayNumber: dayNumberOf(day, i), stop });
      }
    }
    return map;
  };
  const before = index(priorPlan);
  const after = index(nextPlan);
  const inScope = new Set(scope.allowedStopIds || []);
  const ownedDays = new Set(
    scope.level === SCOPE_LEVELS.AFFECTED_DAYS
      ? (scope.dayNumbers || [])
      : (scope.level === SCOPE_LEVELS.DAY && scope.dayNumber ? [scope.dayNumber] : [])
  );
  const dayOwned = (dayNumber) => scope.level === SCOPE_LEVELS.WHOLE_PLAN || ownedDays.has(dayNumber);

  const outsideScope = { removed: [], added: [], changed: [] };
  const rippled = [];

  for (const [id, prior] of before) {
    if (inScope.has(id)) continue;
    // A day- or whole-plan-scoped request owns everything inside its day(s).
    if (dayOwned(prior.dayNumber)) continue;
    const next = after.get(id);
    if (!next) { outsideScope.removed.push(id); continue; }
    const substantive = SUBSTANTIVE_STOP_FIELDS.filter(
      (field) => JSON.stringify(prior.stop?.[field] ?? null) !== JSON.stringify(next.stop?.[field] ?? null)
    );
    if (substantive.length > 0) { outsideScope.changed.push(id); continue; }
    const scheduleMoved = SCHEDULE_ONLY_FIELDS.some(
      (field) => JSON.stringify(prior.stop?.[field] ?? null) !== JSON.stringify(next.stop?.[field] ?? null)
    );
    if (scheduleMoved) rippled.push(id);
  }
  for (const [id, next] of after) {
    if (before.has(id)) continue;
    if (inScope.has(id)) continue;
    if (dayOwned(next.dayNumber)) continue;
    outsideScope.added.push(id);
  }

  const violated = outsideScope.removed.length > 0
    || outsideScope.added.length > 0
    || outsideScope.changed.length > 0;
  return {
    ok: !violated,
    reasonCodes: violated ? ['refinement_mutation_outside_requested_scope'] : [],
    outsideScope,
    scheduleRipples: rippled,
  };
}

/**
 * THE ONE PIECE OF SPECIFIC PROGRESS COPY THAT IS TRUE BEFORE THE MODEL ANSWERS.
 *
 * A refinement turn resolves its target deterministically, against the persisted
 * plan, before any dispatch. That makes "Adjusting the second morning…" a
 * statement about the REQUEST, not a prediction about the answer — nothing the
 * model later proposes, and no repair, can falsify it.
 *
 * Strictly bounded on purpose. It describes WHAT IS BEING WORKED ON and never
 * WHAT WILL CHANGE: claiming an outcome before a patch is accepted would be the
 * same fabrication this whole pass exists to remove.
 *
 * Every field originates in the traveler's own persisted plan (a stop name they
 * are looking at right now), never in model output.
 *
 * @returns {{level:string, dayNumber:number|null, daypart:string|null,
 *            stopName:string|null}|null} null when the scope is unresolved —
 *   an unresolved reference must fall back to generic copy, never to a guess.
 */
function describeRefinementTarget(scope) {
  if (!scope || scope.resolved !== true) return null;
  const level = String(scope.level || '');
  if (!Object.values(SCOPE_LEVELS).includes(level) || level === SCOPE_LEVELS.UNKNOWN) return null;
  // MIRROR THE TRAVELER'S OWN REFERENCE.
  //
  // A stop is named back only when the traveler named a stop. A daypart scope
  // often resolves to exactly one stop, and answering "the second morning" with
  // "Adjusting Wind Canyon Trail…" would be true but presumptuous — it asserts a
  // referent the traveler never used, and reads wrong when the machine resolved
  // to a stop they were not picturing. "Adjusting the second morning…" is what
  // they actually asked about.
  const singular = level === SCOPE_LEVELS.STOP
    ? (scope.allowedStops || []).find((stop) => stop
      && (scope.singularTargetId == null || stop.id === scope.singularTargetId))
    : null;
  const stopName = String(singular?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
  const dayNumber = Number.isInteger(scope.dayNumber) && scope.dayNumber > 0 ? scope.dayNumber : null;
  const daypart = ['morning', 'afternoon', 'evening'].includes(scope.daypart) ? scope.daypart : null;
  return { level, dayNumber, daypart, stopName };
}

module.exports = {
  SCOPE_LEVELS,
  stopDaypart,
  resolveRefinementScope,
  bindOperationsToScope,
  scopeAllowsOperation,
  evaluateScopedOwnership,
  describeRefinementTarget,
  activePlanConstraintRefinement,
};
