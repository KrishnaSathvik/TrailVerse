'use strict';

/**
 * WP-TU Phase 4 Task 9 — deterministic, PURE, OFFLINE `targetTripId` resolver.
 *
 * Decides WHICH saved TripPlan (if any) the CURRENT turn's mutation intent
 * ("change Day 2", "for my Redwood trip...") targets. This is a read-only
 * decision function: it takes already-fetched candidate plans and already-
 * computed classification as parameters and returns a bounded verdict. It
 * NEVER queries a database, calls a model, or mutates anything — wiring it
 * into `prepareChatContext` (which fetches `candidatePlans` for real) is
 * explicitly Task 10's job, not this one's.
 *
 * Reuses Task 3-8B's single authoritative classification — never re-derives
 * job/relationship/destination itself:
 *   - `intent.travelerJob` + `intent.understanding.requestedArtifact` decide
 *     whether a plan target is even needed at all (the SAME gate Task 6
 *     already used for resolvedEntities' refinement carve-out:
 *     `REFINEMENT_JOBS` plus `requestedArtifact === 'itinerary_patch'`).
 *   - `intent.tripContext.relationship` ('continuation' | 'historical_reference'
 *     | 'new') decides HOW to resolve. For a refinement-shaped job,
 *     `resolveTripContext` (trailieTravelerJobResolver.js) only ever produces
 *     'continuation' or 'historical_reference' — never 'new' — so those are
 *     the only two branches this resolver needs downstream of the gate.
 *   - `intent.understanding.primaryDestination` is the ONLY destination
 *     signal consulted for historical disambiguation.
 *
 * `TrailieConversationPlan` (conversationPlanContinuity.js) was considered
 * and deliberately NOT reused: it is a single-slot, one-record-per-user store
 * for an authenticated traveler's most recent UNSAVED accepted plan, matched
 * by prose-inclusion against the echoed transcript. It cannot distinguish
 * "the Redwood trip" from "the Badlands trip" as two separate historical
 * targets and is not a multi-plan association mechanism — using it here
 * would silently collapse exactly the disambiguation this task exists to do.
 */

const { REFINEMENT_JOBS } = require('./trailieTravelerJobResolver');

const STATUS = Object.freeze({
  NOT_REQUIRED: 'not_required',
  RESOLVED: 'resolved',
  AMBIGUOUS: 'ambiguous',
  NOT_FOUND: 'not_found',
});

function result(status, { targetTripId = null, reasonCode = null, candidateTripIds = null } = {}) {
  return { status, targetTripId, reasonCode, candidateTripIds };
}

/**
 * A plan target is needed only for jobs that operate on an EXISTING plan —
 * the exact set Task 6 already used for resolvedEntities' equivalent
 * carve-out. A fresh itinerary BUILD (`day_by_day_itinerary`, 'set') and
 * ordinary Q&A/comparison never reach here.
 */
function needsPlanTarget(intent) {
  const job = intent?.travelerJob;
  const requestedArtifact = intent?.understanding?.requestedArtifact;
  return REFINEMENT_JOBS.has(job) || requestedArtifact === 'itinerary_patch';
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

/** `candidatePlans[].id` uniqueness lookup, never invented. */
function findById(candidatePlans, tripId) {
  if (!tripId) return null;
  return candidatePlans.find((plan) => String(plan?.id) === String(tripId)) || null;
}

/**
 * Bounded, deterministic title matching — the SAME class of catalog
 * substring matching this codebase already uses for destination names
 * (`resolveDestinationsFromMessage`), applied to a KNOWN, bounded set
 * (`candidatePlans[].title`) instead of free text. The default placeholder
 * title ('New Trip Plan') is excluded — matching it would "resolve" against
 * every untitled trip a traveler has, which is not a real reference.
 */
function findByTitleMention(candidatePlans, userMessage) {
  const text = normalizeText(userMessage);
  if (!text) return [];
  return candidatePlans.filter((plan) => {
    const title = normalizeText(plan?.title);
    if (!title || title === 'new trip plan') return false;
    return text.includes(title);
  });
}

function planDestinationCode(plan) {
  const code = plan?.planningState?.destination?.parkCode || plan?.parkCode || null;
  return code ? String(code).toLowerCase() : null;
}

function planDestinationName(plan) {
  return plan?.planningState?.destination?.parkName || plan?.parkName || null;
}

/** Destination match by parkCode first, name only as a fallback — same
 * precedence `isSameTripContextDestination` (trailieTravelerJobResolver.js)
 * already uses for the equivalent comparison. */
function matchesDestination(plan, destination) {
  if (!destination) return false;
  const planCode = planDestinationCode(plan);
  const destCode = destination.parkCode ? String(destination.parkCode).toLowerCase() : null;
  if (planCode && destCode) return planCode === destCode;
  const planName = normalizeText(planDestinationName(plan));
  const destName = normalizeText(destination.name);
  return Boolean(planName) && planName === destName;
}

function matchesContextualDates(plan, contextualDates) {
  if (!contextualDates?.startDate) return false;
  const planStart = plan?.formData?.startDate || null;
  if (!planStart) return false;
  if (String(planStart) !== String(contextualDates.startDate)) return false;
  if (contextualDates.endDate) {
    return String(plan?.formData?.endDate || '') === String(contextualDates.endDate);
  }
  return true;
}

/**
 * Narrow 2+ destination-matched candidates using real contextual
 * disambiguators only — never a guess. Returns the single survivor, or null
 * if more than one (or none) remain.
 */
function disambiguate(matches, { userMessage, priorTargetTripId, contextualDates }) {
  const byTitle = findByTitleMention(matches, userMessage);
  if (byTitle.length === 1) return byTitle[0];

  if (priorTargetTripId) {
    const byPriorTarget = matches.filter((plan) => String(plan.id) === String(priorTargetTripId));
    if (byPriorTarget.length === 1) return byPriorTarget[0];
  }

  const byDates = matches.filter((plan) => matchesContextualDates(plan, contextualDates));
  if (byDates.length === 1) return byDates[0];

  return null;
}

/**
 * @param {object} params
 * @param {object} params.intent - the single authoritative classification
 *   (Task 3's `intent`), already computed by the caller.
 * @param {Array<object>} params.candidatePlans - already-fetched TripPlan-shaped
 *   objects: `{ id, title, parkCode, parkName, formData, planningState, status }`.
 *   This resolver never queries a database — the caller (Task 10) owns fetching.
 * @param {string|null} [params.activeTripId] - the trip currently active for
 *   this session (mirrors `metadata.tripId || body.tripId || body.conversationId`
 *   in ai.js) — used only as the fallback target for an ordinary continuation
 *   with no more specific signal. Never mutated here.
 * @param {string|null} [params.priorTargetTripId] - prior-target continuity:
 *   the targetTripId THIS SAME resolver already produced for an earlier turn
 *   in this conversation, if the caller tracks it (Task 10/11's concern to
 *   populate/persist — accepted here purely as an input).
 * @param {string} [params.userMessage] - used ONLY for bounded title-mention
 *   matching (never to re-derive destination/relationship/job).
 * @param {string|null} [params.explicitTripId] - an already-resolved explicit
 *   reference the caller supplies (e.g. UI context naming a specific trip).
 * @param {{startDate?: string, endDate?: string}|null} [params.contextualDates]
 *   - an optional disambiguator when 2+ same-destination candidates exist.
 * @returns {{status: 'not_required'|'resolved'|'ambiguous'|'not_found',
 *   targetTripId: string|null, reasonCode: string|null,
 *   candidateTripIds: string[]|null}}
 */
function resolveTargetTripId({
  intent,
  candidatePlans = [],
  activeTripId = null,
  priorTargetTripId = null,
  userMessage = '',
  explicitTripId = null,
  contextualDates = null,
} = {}) {
  if (!needsPlanTarget(intent)) {
    return result(STATUS.NOT_REQUIRED, { reasonCode: 'job_does_not_target_existing_plan' });
  }

  // Rule 1 — explicit exact reference, when uniquely valid against
  // candidatePlans. An externally-supplied id wins outright; a title
  // mention must be unique across ALL candidates (not just destination
  // matches) to count as "exact".
  if (explicitTripId) {
    const byId = findById(candidatePlans, explicitTripId);
    if (byId) return result(STATUS.RESOLVED, { targetTripId: byId.id, reasonCode: 'explicit_trip_id' });
  }
  const titleMatches = findByTitleMention(candidatePlans, userMessage);
  if (titleMatches.length === 1) {
    return result(STATUS.RESOLVED, { targetTripId: titleMatches[0].id, reasonCode: 'explicit_title_reference' });
  }

  const relationship = intent?.tripContext?.relationship;

  // Rule 2 — continuation: prior-target continuity outranks the merely-
  // active trip (Badlands active -> Redwood established as target -> a
  // further bare follow-up stays on Redwood, not Badlands). With no prior
  // target, an ordinary active-trip refinement targets the active trip
  // itself — the simple case, not a third rule.
  if (relationship === 'continuation') {
    const target = priorTargetTripId || activeTripId || null;
    if (!target) {
      // No active trip, no prior target — but WHICH kind of "nothing" matters.
      //
      //   candidatePlans is EMPTY: there is no persisted multi-trip identity
      //   universe at all for this user — not "which one", but "none exist to
      //   choose among". This is exactly the authenticated-UNSAVED-plan shape
      //   (`conversationPlanContinuity.js`'s `TrailieConversationPlan`):
      //   refinement legitimately continues against an already-available
      //   in-memory/conversation canonical plan that was never persisted as a
      //   TripPlan, so there is nothing for THIS resolver to resolve against.
      //   Returning NOT_FOUND here would fail closed on a turn that was never
      //   this resolver's business in the first place — a real regression
      //   (see trailieExecutionContractIntegrity.test.js's "prose must not
      //   masquerade as an applied mutation").
      //
      //   candidatePlans is NON-EMPTY: candidates genuinely exist, there is
      //   just no association telling us which one is current. That is a
      //   real "I don't know which trip you mean" — still NOT_FOUND, exactly
      //   as before. This case must NOT be weakened.
      if (!Array.isArray(candidatePlans) || candidatePlans.length === 0) {
        return result(STATUS.NOT_REQUIRED, { reasonCode: 'no_persisted_multi_trip_context' });
      }
      return result(STATUS.NOT_FOUND, { reasonCode: 'no_active_or_prior_target' });
    }
    return result(STATUS.RESOLVED, {
      targetTripId: target,
      reasonCode: priorTargetTripId ? 'prior_target_continuity' : 'active_trip_continuation',
    });
  }

  // Rule 3/4/5 — historical_reference: destination + real disambiguators.
  if (relationship === 'historical_reference') {
    const destination = intent?.understanding?.primaryDestination || null;
    if (!destination) {
      return result(STATUS.NOT_FOUND, { reasonCode: 'historical_reference_without_destination' });
    }
    const matches = candidatePlans.filter((plan) => matchesDestination(plan, destination));
    if (matches.length === 0) {
      return result(STATUS.NOT_FOUND, { reasonCode: 'no_matching_destination' });
    }
    if (matches.length === 1) {
      return result(STATUS.RESOLVED, { targetTripId: matches[0].id, reasonCode: 'unique_destination_match' });
    }
    const disambiguated = disambiguate(matches, { userMessage, priorTargetTripId, contextualDates });
    if (disambiguated) {
      return result(STATUS.RESOLVED, { targetTripId: disambiguated.id, reasonCode: 'disambiguated_destination_match' });
    }
    return result(STATUS.AMBIGUOUS, {
      reasonCode: 'multiple_matches_no_disambiguator',
      candidateTripIds: matches.map((plan) => plan.id),
    });
  }

  // Defensive only — resolveTripContext never produces 'new' for a
  // refinement-shaped job; a fresh BUILD never reaches this function at all
  // (the needsPlanTarget gate above already returned NOT_REQUIRED for it).
  return result(STATUS.NOT_REQUIRED, { reasonCode: 'relationship_does_not_target_existing_plan' });
}

module.exports = {
  STATUS,
  needsPlanTarget,
  resolveTargetTripId,
  // Exposed for direct unit testing of the pure helpers.
  __testables: {
    findById,
    findByTitleMention,
    matchesDestination,
    matchesContextualDates,
    disambiguate,
  },
};
