'use strict';

const { itineraryImpacts } = require('./itineraryImpact');

/**
 * Refinement recognition — contextual, not phrase-driven.
 *
 * The 2026-08-24 gate #3 failure was the second instance of the same mistake:
 * a real canonical Redwood plan existed, the traveler said
 *
 *   "Actually we'll probably be tired the second morning, so make that part of
 *    the trip easier."
 *
 * and the turn resolved to `plain_answer`, because the day-reference pattern
 * only knew "second DAY" (not "second morning") and the refinement verb family
 * had no entry for "easier". Adding those two words would have left the next
 * phrasing to fail the same way.
 *
 * The rule this module implements instead:
 *
 *     an active canonical plan
 *   + a reference INTO that plan
 *   + modification intent
 *   = refinement
 *
 * An explicit edit verb is sufficient but never required. Context is what makes
 * it safe: the same sentence with no plan present is advice, not a mutation.
 *
 * Recognition (does the traveler want a change?) is deliberately separate from
 * targeting (what part?), so the patch format can evolve without reopening this.
 *
 * Offline, pure, no I/O.
 */

// ---------------------------------------------------------------------------
// Plan-local references — how a traveler points INTO a plan
// ---------------------------------------------------------------------------

const ORDINAL = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|next';
const DAYPART = 'morning|afternoon|evening|night|midday|lunchtime|sunset|sunrise';

/** "day 2", "day two", "the second day", "the last day". */
const DAY_REFERENCE = new RegExp(
  `\\b(?:day\\s*(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)|(?:the\\s+)?(?:${ORDINAL})\\s+day)\\b`,
  'i',
);
/** "the second morning", "that afternoon", "the last evening". */
const DAYPART_REFERENCE = new RegExp(
  // A determiner or ordinal is required: "that morning" / "the second morning"
  // points INTO the plan, whereas a bare "sunrise" is a topic, not a target.
  `\\b(?:(?:the|that|this)\\s+(?:${ORDINAL})?\\s*(?:${DAYPART})|(?:${ORDINAL})\\s+(?:${DAYPART}))\\b`,
  'i',
);
/** Anaphora that can only mean part of an existing plan. Deictic time
 * ("tomorrow morning", "tonight") indexes a day of the ACTIVE plan the same
 * way "the next morning" does — this whole module is gated on hasPriorPlan,
 * and without modification intent these words still resolve to nothing. */
const PLAN_ANAPHORA =
  /\b(?:that (?:part|day|stop|one|morning|afternoon|evening|leg|drive|bit)|this (?:part|day|stop|leg)|there|that\s+early|that\s+late|later that day|the next morning|after lunch|after breakfast|before sunset|the drive (?:afterward|after|back)|(?:tomorrow|today|tonight)(?:\s+(?:morning|afternoon|evening|night))?)\b/i;
/** The plan as a whole. */
const WHOLE_PLAN_REFERENCE =
  /\b(?:the (?:whole|entire|overall) (?:trip|plan|itinerary)|the trip|the plan|the itinerary|these days|the days)\b/i;

// ---------------------------------------------------------------------------
// Modification intent — dimensions, not a verb list
// ---------------------------------------------------------------------------

const MODIFICATION_DIMENSIONS = Object.freeze({
  // Explicit imperative edit verbs. Sufficient, never required — this is the
  // narrow case the old family covered, kept as one dimension among several.
  edit: /\b(?:change|edit|update|adjust|modify|swap|replace|rework|redo|revise|rearrange|move|shift|make (?:it|that|this|the|day)|keep (?:the|this|our|same))\b/i,
  difficulty: /\b(?:easier|harder|lighter|light|gentler|milder|tougher|more relaxed|less intense|less strenuous|less demanding|too much|too hard|too long|too far|exhausting|too intense|too packed|too rushed)\b/i,
  time: /\b(?:later|earlier|sooner|shorter|longer|start(?:ing)? later|finish(?:ing)? earlier|more time|less time|slow(?:er|ed)? down|cut it short|running late|arriv\w*\s+late|get(?:ting)? (?:there|in) late|won'?t (?:get|arrive)|pretty late|late (?:afternoon|morning|evening))\b/i,
  quantity: /\b(?:less|fewer|more|extra|add|drop|skip|remove|another|additional|spend longer|spend more)\b/i,
  preference: /\b(?:we'?d rather|i'?d rather|we'?d prefer|i'?d prefer|would rather|sounds like too|don'?t think we'?ll|probably won'?t|won'?t want|not up for|rather not|would be nice|sounds exhausting|do the lighter)\b/i,
  constraint: /\b(?:tired|exhausted|worn out|knee|back|sore|nap|kid|toddler|baby|arriv\w+|leaving early|weather|rain(?:ing)?|snow(?:ing)?|storm(?:ing)?|closed|sick|jet ?lag)\b/i,
});

function modificationDimensions(text) {
  return Object.entries(MODIFICATION_DIMENSIONS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

// ---------------------------------------------------------------------------
// Questions that discuss a plan rather than change it
// ---------------------------------------------------------------------------

/** what/why/which/who/when/how — asking ABOUT the plan. */
const INFORMATION_LEAD = /^\s*(?:what|why|which|who|when|how)\b/i;
/** "is/are/does ... ?" with no modification intent is operational curiosity. */
const STATE_QUESTION_LEAD = /^\s*(?:is|are|was|were|do|does|did|has|have)\b/i;
/** "Would day two be easier than day one?" compares parts, it does not change one. */
const COMPARISON_MARKER = /\bthan\b/i;

// ---------------------------------------------------------------------------

function stopNamesOf(plan) {
  const days = Array.isArray(plan?.days) ? plan.days : [];
  return days.flatMap((day) => (Array.isArray(day?.stops) ? day.stops : [])
    .map((stop) => String(stop?.name || stop?.title || '').trim())
    .filter(Boolean));
}

/**
 * A named stop of the ACTIVE plan mentioned in the turn. This is what makes
 * "I'd skip the museum" a plan reference: the plan is what defines the museum.
 */
function referencedStopName(text, plan) {
  const lower = String(text || '').toLowerCase();
  for (const name of stopNamesOf(plan)) {
    const lowerName = name.toLowerCase();
    if (lower.includes(lowerName)) return name;
    // Distinctive head noun ("Islesford Historical Museum" -> "museum").
    const words = lowerName.split(/\s+/).filter((w) => w.length >= 5);
    for (const word of words) {
      if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) return name;
    }
  }
  return null;
}

/**
 * @returns {{
 *   isRefinement: boolean,
 *   target: 'whole_plan'|'day'|'daypart'|'stop'|'anaphoric'|'unknown'|null,
 *   dimensions: string[],
 *   reasonCodes: string[]
 * }}
 */
function resolveRefinementIntent({ text = '', priorPlan = null, hasPriorPlan = false } = {}) {
  const msg = String(text || '');
  const none = { isRefinement: false, target: null, dimensions: [], reasonCodes: [] };
  // Without an active plan there is nothing to refine. The identical sentence
  // is advice, and claiming a patch here is exactly the dishonesty the
  // fulfillment contract exists to prevent.
  if (!hasPriorPlan) return { ...none, reasonCodes: ['no_active_canonical_plan'] };

  const committed = require('./committedPlanPreference').committedPlanPreference(msg);
  if (committed) return {
    isRefinement: true, target: committed.target, dimensions: ['preference', 'constraint'],
    reasonCodes: ['committed_preference_against_active_plan', 'target_whole_plan'],
  };

  const impacts = itineraryImpacts({ text: msg, plan: priorPlan });
  if (impacts.length > 0) {
    return {
      isRefinement: true,
      target: 'day',
      dimensions: ['constraint'],
      reasonCodes: ['itinerary_impact', 'plan_local_reference_with_modification_intent', 'target_day'],
    };
  }

  const dimensions = modificationDimensions(msg);
  const stopName = referencedStopName(msg, priorPlan);
  const hasDay = DAY_REFERENCE.test(msg);
  const hasDaypart = DAYPART_REFERENCE.test(msg);
  const hasAnaphora = PLAN_ANAPHORA.test(msg);
  const hasWholePlan = WHOLE_PLAN_REFERENCE.test(msg);
  const planReferenced = Boolean(stopName) || hasDay || hasDaypart || hasAnaphora || hasWholePlan;

  if (dimensions.length === 0) return { ...none, reasonCodes: ['no_modification_intent'] };

  // A traveler constraint change targets the whole active plan even with no
  // explicit plan reference: "my knee has been bothering me, so keep the
  // walking pretty light" is a refinement of the trip. It is admitted only
  // when the constraint is PAIRED with a directive dimension — a bare "my knee
  // has been bothering me" or "the weather looks bad" stays conversation,
  // because acting on it would be guessing at intent.
  const constraintDrivenWholePlan = !planReferenced
    && dimensions.includes('constraint')
    && dimensions.length >= 2;
  if (!planReferenced && !constraintDrivenWholePlan) {
    return { ...none, dimensions, reasonCodes: ['no_plan_local_reference'] };
  }

  // Discussion, not mutation.
  if (INFORMATION_LEAD.test(msg.trim())) {
    return { ...none, target: null, dimensions, reasonCodes: ['information_question_about_plan'] };
  }
  if (COMPARISON_MARKER.test(msg) && (hasDay || hasDaypart)) {
    return { ...none, dimensions, reasonCodes: ['comparison_between_plan_parts'] };
  }
  if (STATE_QUESTION_LEAD.test(msg.trim()) && dimensions.every((d) => d === 'constraint')) {
    return { ...none, dimensions, reasonCodes: ['state_question_about_plan'] };
  }

  // Target resolution is reported, never required: an unresolvable anaphor
  // must not silently mutate an arbitrary stop.
  // Most specific reference wins. "make that part of the trip easier" after
  // "tired the second morning" targets the morning, not the whole trip.
  let target = 'unknown';
  if (constraintDrivenWholePlan) target = 'whole_plan';
  else if (stopName) target = 'stop';
  else if (hasDaypart) target = 'daypart';
  else if (hasDay) target = 'day';
  else if (hasAnaphora) target = 'anaphoric';
  else if (hasWholePlan) target = 'whole_plan';

  return {
    isRefinement: true,
    target,
    dimensions,
    reasonCodes: [
      constraintDrivenWholePlan
        ? 'traveler_constraint_change_against_active_plan'
        : 'plan_local_reference_with_modification_intent',
      `target_${target}`,
    ],
  };
}

module.exports = {
  resolveRefinementIntent,
  MODIFICATION_DIMENSIONS,
  DAY_REFERENCE,
  DAYPART_REFERENCE,
  PLAN_ANAPHORA,
  WHOLE_PLAN_REFERENCE,
};
