/**
 * Stage 14.8H.1 §6/§7 — trip-level destination ownership.
 *
 * THE DEFECT THIS EXISTS TO FIX
 *
 * The Stage 14.8H run stored a trip whose frozen itinerary said
 * `Zion National Park / zion` while the containing TripPlan said
 * `General Planning / null`. The create call took its destination from component
 * state (`parkName`, `formData.parkCode`) — both empty for a free-text chat —
 * and never looked at the validated plan it was persisting in the same request.
 *
 * OWNERSHIP RULES
 *
 *   new trip shell            destination may be unresolved
 *   validated itinerary-ready the plan's destination becomes canonical
 *   later prose revision      cannot rewrite it
 *   later follow-up           only through explicit validated destination change
 *
 * The "cannot rewrite" rule is already enforced by the server: PUT /trips/:id
 * accepts only response-coupled fields (`plan`, `conversation`, `formData`,
 * `summary`, `provider`), so a revision-2 write structurally cannot rename a
 * trip. This module supplies the canonical values at CREATE, which is where the
 * mixed state was produced.
 */

/** A destination is canonical only when the plan actually carries one. */
export function extractPlanDestination(plan) {
  if (!plan || typeof plan !== 'object') return { parkName: null, parkCode: null };

  const rawParkName = typeof plan.parkName === 'string' && plan.parkName.trim()
    ? plan.parkName.trim()
    : null;
  const parkName = canonicalDestinationDisplay(rawParkName);
  const parkCode = typeof plan.parkCode === 'string' && plan.parkCode.trim()
    ? plan.parkCode.trim().toLowerCase()
    : null;

  return { parkName, parkCode };
}

export function canonicalDestinationDisplay(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (/valley of fire/i.test(raw)) return 'Valley of Fire State Park';
  if (/^glacier(?: national park)?$/i.test(raw)) return 'Glacier National Park';
  if (/^zion(?: national park)?$/i.test(raw)) return 'Zion National Park';
  if (/^sequoia(?: national park)?$/i.test(raw)) return 'Sequoia National Park';
  return raw.replace(/,\s*(Nevada|Utah|California|Montana)$/i, '').trim();
}

/**
 * Resolves the destination metadata a new trip should be created with.
 *
 * The validated plan wins over the browsing context that happened to be in
 * component state. `General Planning` survives only as the display fallback when
 * nothing has resolved a destination yet — never on top of a validated plan.
 */
export function resolveTripDestination({
  plan = null,
  contextParkName = null,
  contextParkCode = null,
  fallbackTitle = 'General Planning',
} = {}) {
  const fromPlan = extractPlanDestination(plan);

  const parkName = fromPlan.parkName || (contextParkName || null);
  const parkCode = fromPlan.parkCode || (contextParkCode || null);

  return {
    parkName: parkName || fallbackTitle,
    parkCode: parkCode || null,
    title: parkName ? `${parkName} Trip Plan` : `${fallbackTitle} Session`,
    source: fromPlan.parkName ? 'validated_frozen_plan' : (contextParkName ? 'browsing_context' : 'unresolved'),
    destinationResolved: Boolean(parkName),
  };
}

/**
 * Coherence check used by acceptance evidence and by the adjudicator: a stored
 * trip must not disagree with the plan it contains.
 */
export function assertTripDestinationCoherence({ trip = {}, plan = null } = {}) {
  const fromPlan = extractPlanDestination(plan || trip.plan);
  const tripParkName = typeof trip.parkName === 'string' ? trip.parkName : null;
  const tripParkCode = typeof trip.parkCode === 'string' ? trip.parkCode.toLowerCase() : null;

  // With no validated plan destination there is nothing to disagree with.
  if (!fromPlan.parkName && !fromPlan.parkCode) {
    return {
      planCarriesDestination: false,
      tripDestinationMatchesFrozenPlan: true,
      reason: 'plan carries no destination; an unresolved trip shell is permitted',
      tripParkName,
      tripParkCode,
    };
  }

  const nameMatches = Boolean(tripParkName)
    && tripParkName.trim().toLowerCase() === fromPlan.parkName?.trim().toLowerCase();
  const codeMatches = tripParkCode === fromPlan.parkCode;

  return {
    planCarriesDestination: true,
    frozenPlanDestinationName: fromPlan.parkName,
    frozenPlanDestinationParkCode: fromPlan.parkCode,
    tripParkName,
    tripParkCode,
    tripDestinationMatchesFrozenPlan: nameMatches && codeMatches,
    reason: nameMatches && codeMatches
      ? 'trip metadata matches the frozen plan'
      : 'trip metadata disagrees with the frozen plan destination',
  };
}
