/**
 * Pure capture helpers for trailie-demo-recapture.
 *
 * Hierarchy for the accepted answer:
 *   1. canonical itinerary / plan snapshot from the turn observer
 *   2. mounted itinerary card text
 *   3. final assistant prose belonging to the completed response
 *
 * Never accept the welcome bubble as the answer for an itinerary turn.
 */

export const WELCOME_PROSE_MARKERS = Object.freeze([
  "Hey Trailie, I'm Trailie",
  'I help you choose where to go outdoors',
  'Where are you thinking of going?',
  "we'll plan it together",
]);

export function isWelcomeProse(text) {
  const value = String(text || '');
  if (!value.trim()) return false;
  return WELCOME_PROSE_MARKERS.some((marker) => value.includes(marker));
}

export function renderPlanAsAnswer(plan) {
  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) return '';
  const lines = [];
  if (plan.parkName) lines.push(String(plan.parkName));
  plan.days.forEach((day, index) => {
    const heading = day.title || day.label || `Day ${day.day ?? index + 1}`;
    lines.push(heading);
    for (const stop of day.stops || []) {
      if (!stop?.name) continue;
      const when = stop.timeWindow || stop.startTime || '';
      lines.push(when ? `- ${when}: ${stop.name}` : `- ${stop.name}`);
    }
  });
  return lines.join('\n').trim();
}

/**
 * Choose the capture source for one settled turn.
 *
 * @returns {{
 *   answer: string,
 *   captureSource: string,
 *   hasItinerary: boolean,
 *   canonicalItinerary: object|null,
 *   cardMounted: boolean,
 *   cardText: string|null,
 *   issues: string[],
 * }}
 */
export function selectRecaptureAnswer({
  expectedKind = 'conversation',
  observer = null,
  cardPresent = false,
  cardText = null,
  proseCandidates = [],
} = {}) {
  const issues = [];
  const canonicalItinerary = observer?.planSnapshot || null;
  const hasItinerary = Boolean(canonicalItinerary?.days?.length)
    || observer?.itineraryReadyObserved === true;
  const nonWelcomeProse = (proseCandidates || [])
    .map((text) => String(text || '').trim())
    .filter((text) => text && !isWelcomeProse(text));
  const finalProse = nonWelcomeProse.length ? nonWelcomeProse[nonWelcomeProse.length - 1] : '';

  let answer = '';
  let captureSource = 'none';

  if (hasItinerary && canonicalItinerary?.days?.length) {
    answer = renderPlanAsAnswer(canonicalItinerary);
    captureSource = 'canonical_plan';
  }

  if (cardPresent && String(cardText || '').trim()) {
    const cardNames = String(cardText)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const planNames = (canonicalItinerary?.days || [])
      .flatMap((day) => (day.stops || []).map((stop) => stop?.name).filter(Boolean));
    const cardMatchesPlan = planNames.length === 0
      || planNames.some((name) => {
        const needle = String(name).trim();
        if (!needle) return false;
        if (String(cardText).includes(needle)) return true;
        const tokens = needle.split(/\s+/).filter((t) => t.length >= 4);
        if (tokens.length === 0) return false;
        const hits = tokens.filter((token) => String(cardText).includes(token)).length;
        return hits >= Math.min(2, tokens.length);
      });
    if (cardMatchesPlan) {
      // Prefer the mounted card when it matches the accepted plan.
      answer = String(cardText).trim();
      captureSource = 'itinerary_card';
    } else if (!answer) {
      answer = String(cardText).trim();
      captureSource = 'itinerary_card_stale';
      issues.push('card_text_mismatch_vs_canonical_plan');
    } else {
      issues.push('card_text_mismatch_vs_canonical_plan');
      captureSource = 'canonical_plan';
    }
  } else if (!answer && finalProse) {
    answer = finalProse;
    captureSource = 'assistant_prose';
  } else if (!answer) {
    const rawLast = proseCandidates?.length
      ? String(proseCandidates[proseCandidates.length - 1] || '').trim()
      : '';
    if (rawLast && isWelcomeProse(rawLast)) {
      captureSource = 'welcome_prose';
      issues.push('welcome_prose_captured');
    }
  }

  if (hasItinerary && !canonicalItinerary?.days?.length) {
    issues.push('itinerary_ready_without_canonical_plan');
  }
  if (expectedKind === 'itinerary' && !cardPresent) {
    issues.push('itinerary_card_missing');
  }
  if (expectedKind === 'itinerary' && captureSource === 'welcome_prose') {
    issues.push('welcome_prose_for_itinerary_turn');
  }
  if (hasItinerary && captureSource === 'welcome_prose') {
    issues.push('welcome_prose_despite_itinerary');
  }

  return {
    answer,
    captureSource,
    hasItinerary,
    canonicalItinerary,
    cardMounted: cardPresent === true,
    cardText: cardText ? String(cardText) : null,
    issues,
  };
}

/** Turn is complete enough to harvest — terminal SSE, not merely welcome chrome. */
export function isRecaptureTurnSettled({
  turnComplete = false,
  cardMounted = false,
  hasNonWelcomeProse = false,
  itineraryReady = false,
  composerEnabled = false,
  thinking = false,
} = {}) {
  if (thinking) return false;
  if (!turnComplete) return false;
  if (itineraryReady) return cardMounted || hasNonWelcomeProse || composerEnabled;
  return hasNonWelcomeProse || composerEnabled;
}
