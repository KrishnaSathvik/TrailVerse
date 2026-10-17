'use strict';

/**
 * DETERMINISTIC TRAVELER ACKNOWLEDGEMENT — the authoritative refinement response.
 *
 * The one-call architecture cannot ground its own explanation. The model writes
 * the sentence in the same tool call as the operations, before the server has
 * applied, rejected or scope-corrected them, so the accepted MutationSummary
 * does not exist yet. Live evidence: "keeping the Sulphur Banks walk brief and
 * optional in feel" — `note` was null in that patch and preserved unchanged, so
 * nothing made anything optional. Two prompt revisions did not move it, and a
 * third cannot, because the problem is ordering, not wording.
 *
 * So this renderer owns every claim about what changed. It costs no inference
 * and cannot say what the artifact difference does not contain.
 *
 * SALIENCE, NOT A CHANGELOG. Literal before/after minutes are rarely what a
 * traveler wants; direction and proportion are. 60 → 75 is "a little more
 * time"; 45 → 30 is "a shorter stop". Nothing here is a phrase matrix — each
 * clause is derived from one field delta.
 */

const ORDINAL_WORDS = Object.freeze([
  null, 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
]);

/** "Haʻakulamanu via Sulphur Banks Trail" -> "Haʻakulamanu". Never truncates mid-name. */
function shortName(name) {
  const text = String(name || '').trim();
  const viaSplit = text.split(/\s+via\s+/i);
  return (viaSplit[0] || text).trim();
}

const joinList = (items) => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
};

const fieldOf = (stop, field) => stop.fieldChanges.find((c) => c.field === field) || null;

/**
 * Proportional, not absolute: 15 minutes off a 45-minute stop is a real change,
 * 15 off a four-hour drive is not.
 */
function durationClause(stop) {
  const change = fieldOf(stop, 'duration');
  if (!change) return null;
  const before = Number(change.before);
  const after = Number(change.after);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) return null;
  const ratio = (after - before) / before;
  const name = shortName(stop.name);
  if (ratio >= 0.5) return `a lot more time at ${name}`;
  if (ratio >= 0.15) return `a little more time at ${name}`;
  if (ratio <= -0.5) return `a much shorter stop at ${name}`;
  if (ratio <= -0.15) return `a shorter stop at ${name}`;
  return null;
}

function timingClause(stop) {
  const change = fieldOf(stop, 'timeWindow');
  if (!change || !change.after) return null;
  return `${shortName(stop.name)} now sits in the ${String(change.after).toLowerCase()}`;
}

/** Was this net easing? Only then may the acknowledgement say so. */
function isNetEasing(summary) {
  const harder = summary.addedStops.length > 0;
  if (harder) return false;
  let eased = summary.removedStops.length > 0;
  for (const stop of summary.changedStops) {
    const duration = fieldOf(stop, 'duration');
    if (duration && Number(duration.after) < Number(duration.before)) eased = true;
    const difficulty = fieldOf(stop, 'difficulty');
    if (difficulty && difficulty.after && difficulty.before
      && String(difficulty.after) !== String(difficulty.before)) return false;
  }
  return eased;
}

function scopeLabel(scope) {
  if (!scope?.resolved) return null;
  if (scope.level === 'daypart' && scope.dayNumber && scope.daypart) {
    const ordinal = ORDINAL_WORDS[scope.dayNumber];
    return ordinal ? `the ${ordinal} ${scope.daypart}` : `the ${scope.daypart} of day ${scope.dayNumber}`;
  }
  if (scope.dayNumber) return `day ${scope.dayNumber}`;
  if (scope.level === 'whole_plan') return 'the trip';
  return null;
}

/**
 * What stayed put — the thing a traveler actually worries about after asking for
 * a change. Named only where it is meaningful: enumerating every untouched day
 * reads like a report, not an answer.
 */
function reassuranceClause({ summary, scope }) {
  if (scope?.level === 'daypart' && scope.daypart === 'morning') {
    const dayTouchedElsewhere = summary.changedStops.some((s) => s.dayNumber === scope.dayNumber
      && !/morning/i.test(String(fieldOf(s, 'timeWindow')?.after || 'morning')));
    if (!dayTouchedElsewhere) return 'The afternoon and the rest of the trip stay as planned.';
  }
  if (summary.unchangedDayNumbers.length > 0) return 'The rest of the trip stays as planned.';
  return null;
}

/**
 * @returns {string} a grounded traveler-facing acknowledgement.
 */
function renderMutationAcknowledgement({ summary = null, scope = null } = {}) {
  if (!summary || summary.empty) {
    return 'Nothing in the itinerary changed.';
  }

  const clauses = [];
  for (const stop of summary.changedStops) {
    const clause = durationClause(stop) || timingClause(stop);
    if (clause) clauses.push(clause);
  }

  const where = scopeLabel(scope);
  const easing = isNetEasing(summary);
  const sentences = [];

  if (clauses.length > 0) {
    const lead = easing
      ? `I made ${where || 'the itinerary'} easier`
      : `I reworked ${where || 'the itinerary'}`;
    sentences.push(`${lead}: you'll have ${joinList(clauses)}.`);
  } else if (where) {
    sentences.push(`I adjusted ${where}.`);
  }

  if (summary.removedStops.length > 0) {
    sentences.push(`I dropped ${joinList(summary.removedStops.map((s) => shortName(s.name)))}.`);
  }
  if (summary.addedStops.length > 0) {
    sentences.push(`I added ${joinList(summary.addedStops.map((s) => shortName(s.name)))}.`);
  }

  const reassurance = reassuranceClause({ summary, scope });
  if (reassurance) sentences.push(reassurance);

  return sentences.join(' ');
}

module.exports = { renderMutationAcknowledgement, shortName };
