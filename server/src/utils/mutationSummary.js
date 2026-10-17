'use strict';

/**
 * DETERMINISTIC MUTATION SUMMARY.
 *
 * The response model has twice narrated a change it did not make: "no trail
 * objective" on a stop that never had one, and "rather than a more demanding
 * outing" about an easy scenic drive that its own patch replaced with a morning
 * containing MORE walking. Both times it was handed the conversation and asked
 * to describe the delta it had just produced. Two instruction revisions did not
 * move it.
 *
 * So the delta stops being something the model infers. It is computed from the
 * two artifacts and handed over.
 *
 * This is GENERATION CONTEXT, not a validator. Nothing here rejects prose; a
 * lexical entailment gate would grow forty rules and still be wrong.
 */

const { dayNumber: dayNumberOf } = require('./itineraryPlanPatch');

/** Reported when they move. Order is the order a person would say them in. */
const REPORTED_FIELDS = Object.freeze([
  'name', 'type', 'timeWindow', 'startTime', 'duration', 'order',
  'difficulty', 'physicalDifficulty', 'exposureLevel', 'walkingDistanceMiles', 'note', 'why',
]);

/** Called out as deliberately preserved, because they describe the place. */
const FACTUAL_FIELDS = Object.freeze([
  'difficulty', 'physicalDifficulty', 'exposureLevel', 'walkingDistanceMiles',
]);

const identify = (stop, dayNum) => String(stop?.id || stop?.stopId || `${dayNum}::${stop?.name}`);

function indexPlan(plan) {
  const map = new Map();
  for (const [i, day] of (plan?.days || []).entries()) {
    const num = dayNumberOf(day, i);
    for (const stop of day.stops || []) map.set(identify(stop, num), { dayNumber: num, stop });
  }
  return map;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * @returns {{ changedStops, addedStops, removedStops, preservedFactualFields,
 *   unchangedDayNumbers, empty }}
 */
function buildMutationSummary({ priorPlan = null, nextPlan = null } = {}) {
  const before = indexPlan(priorPlan);
  const after = indexPlan(nextPlan);

  const changedStops = [];
  const preserved = new Set();
  for (const [key, prior] of before) {
    const next = after.get(key);
    if (!next) continue;
    const fieldChanges = [];
    for (const field of REPORTED_FIELDS) {
      const a = prior.stop?.[field] ?? null;
      const b = next.stop?.[field] ?? null;
      if (!same(a, b)) fieldChanges.push({ field, before: a, after: b });
      else if (FACTUAL_FIELDS.includes(field) && a !== null) preserved.add(field);
    }
    if (fieldChanges.length > 0) {
      changedStops.push({
        dayNumber: prior.dayNumber,
        stopId: prior.stop?.id ?? null,
        name: prior.stop?.name ?? null,
        fieldChanges,
      });
    }
  }

  const describe = ({ dayNumber, stop }) => ({
    dayNumber,
    stopId: stop?.id ?? null,
    name: stop?.name ?? null,
    type: stop?.type ?? null,
  });
  const removedStops = [...before.entries()].filter(([k]) => !after.has(k)).map(([, v]) => describe(v));
  const addedStops = [...after.entries()].filter(([k]) => !before.has(k)).map(([, v]) => describe(v));

  const touched = new Set([
    ...changedStops.map((s) => s.dayNumber),
    ...removedStops.map((s) => s.dayNumber),
    ...addedStops.map((s) => s.dayNumber),
  ]);
  const unchangedDayNumbers = (priorPlan?.days || [])
    .map((day, i) => dayNumberOf(day, i))
    .filter((num) => !touched.has(num))
    .sort((a, b) => a - b);

  return {
    changedStops,
    addedStops,
    removedStops,
    preservedFactualFields: [...preserved].sort(),
    unchangedDayNumbers,
    empty: changedStops.length === 0 && addedStops.length === 0 && removedStops.length === 0,
  };
}

const showValue = (value) => (value === null || value === '' ? 'none' : String(value));

/** Bounded plain text. Stop names and field values only — no reasoning, no prompt. */
function renderMutationSummaryForPrompt(summary) {
  if (!summary || summary.empty) {
    return 'MUTATION SUMMARY\nThis patch made no changes to the itinerary. Do not describe any change.';
  }
  const lines = ['MUTATION SUMMARY — the exact difference between the previous plan and this one.'];

  lines.push('', 'Changed:');
  if (summary.changedStops.length === 0) lines.push('  none');
  for (const stop of summary.changedStops.slice(0, 12)) {
    lines.push(`  Day ${stop.dayNumber} · ${stop.name}`);
    for (const change of stop.fieldChanges.slice(0, 10)) {
      lines.push(`    ${change.field} ${showValue(change.before)} → ${showValue(change.after)}`);
    }
  }

  lines.push('', `Removed stops: ${summary.removedStops.length === 0 ? 'none'
    : summary.removedStops.map((s) => `Day ${s.dayNumber} · ${s.name}`).join('; ')}`);
  lines.push(`Added stops: ${summary.addedStops.length === 0 ? 'none'
    : summary.addedStops.map((s) => `Day ${s.dayNumber} · ${s.name}`).join('; ')}`);

  lines.push('', 'Unchanged:');
  if (summary.preservedFactualFields.length > 0) {
    lines.push(`  factual properties of the same places: ${summary.preservedFactualFields.join(', ')}`);
  }
  lines.push(`  days left exactly as they were: ${summary.unchangedDayNumbers.length
    ? summary.unchangedDayNumbers.join(', ') : 'none'}`);

  lines.push('', 'Describe only these changes. Do not claim to have removed, added, shortened or '
    + 'made easier anything that is not listed above, and do not describe the previous plan as '
    + 'having contained something it did not.');
  return lines.join('\n');
}

module.exports = {
  REPORTED_FIELDS,
  FACTUAL_FIELDS,
  buildMutationSummary,
  renderMutationSummaryForPrompt,
};
