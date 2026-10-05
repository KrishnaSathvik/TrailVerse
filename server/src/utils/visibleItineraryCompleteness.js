'use strict';

/**
 * Phase 12G — traveler-visible full-itinerary grammar.
 *
 * Canonical representation is existing `intro` + `days` + `narrativeSections`
 * with `placement: 'after_plan'`. No second closing field.
 */

const { normalizeItineraryIntro, normalizeNarrativeSections } = require('./itineraryToolSchema');

const CANNED_SENTENCE = new RegExp(
  String.raw`have a great trip|let me know if|if you need anything else`
  + String.raw`|always check (?:the )?(?:conditions|alerts) before`
  + String.raw`|before you go\b|happy (?:to help|travels)|enjoy your trip`
  + String.raw`|feel free to (?:ask|reach out)`,
  'i',
);

const NUMERIC_DRIVE_CLAIM = new RegExp(
  String.raw`\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b`
  + String.raw`.{0,48}\b(?:driv(?:e|ing)|drive[- ]time|behind the wheel)`
  + String.raw`|\b(?:driv(?:e|ing)|drive[- ]time).{0,48}\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b`
  + String.raw`|\b(?:under|within|keeps?|satisfies?|cap)\b.{0,32}\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?)\b.{0,24}\bdriv`,
  'i',
);

function daysOf(plan) {
  return Array.isArray(plan?.days) ? plan.days : [];
}

function stopsOf(day) {
  return Array.isArray(day?.stops) ? day.stops : [];
}

function allStops(plan) {
  return daysOf(plan).flatMap((day) => stopsOf(day));
}

function sentencesOf(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinSentences(parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function destinationLabel(plan) {
  if (String(plan?.parkName || '').trim()) return String(plan.parkName).trim();
  const fromStops = allStops(plan)
    .map((stop) => String(stop.parkName || '').trim())
    .filter(Boolean);
  const unique = [...new Set(fromStops)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return unique.slice(0, 2).join(' and ');
  const label = String(daysOf(plan)[0]?.label || '').trim();
  return label || 'this trip';
}

function mentionsAny(text, names) {
  const blob = String(text || '').toLowerCase();
  return (names || []).some((name) => name && blob.includes(String(name).toLowerCase()));
}

function dropSentencesMatching(text, predicate) {
  return joinSentences(sentencesOf(text).filter((sentence) => !predicate(sentence)));
}

function planningStateOf(constraints) {
  return constraints?.planningState || {};
}

function isCannedSentence(sentence) {
  return CANNED_SENTENCE.test(sentence) || /^\s*before you go\b/i.test(sentence);
}

function materialVerification(plan) {
  for (const day of daysOf(plan)) {
    const dayNum = Number(day.dayNumber) > 0 ? Number(day.dayNumber) : null;
    const dayRef = dayNum ? `Day ${dayNum}` : 'this day';
    for (const stop of stopsOf(day)) {
      const blob = `${stop.name || ''} ${stop.note || ''} ${stop.why || ''} ${stop.type || ''}`;
      const requirements = Array.isArray(stop.requirements) ? stop.requirements : [];
      const reqBlob = requirements.map((item) => `${item?.kind || ''} ${item?.title || ''} ${item?.requirement || ''}`).join(' ');
      const combined = `${blob} ${reqBlob}`;
      if (/\bshuttle\b/i.test(combined) || requirements.some((item) => item?.kind === 'water_or_shuttle_access')) {
        return `Closer to the trip, confirm shuttle operation because ${dayRef} depends on it.`;
      }
      if (/\b(?:timed[- ]entry|permit|reservation)\b/i.test(combined)
        || requirements.some((item) => /permit|reservation|timed/i.test(item?.kind || ''))) {
        return `Closer to the trip, confirm the reservation or permit because ${dayRef} depends on that access.`;
      }
      if (/\bferr(?:y|ies)\b/i.test(combined) || String(stop.type || '') === 'boat') {
        return `Closer to the trip, confirm boat or ferry operation because ${dayRef} depends on it.`;
      }
      if (/\b(?:seasonal (?:road|access)|park[- ]road|road (?:is )?closed|road opening)\b/i.test(combined)) {
        return `Closer to the trip, confirm the park-road opening because ${dayRef} depends on that access.`;
      }
    }
  }
  return null;
}

function synthesizeClosing(plan, { constraints } = {}) {
  const state = planningStateOf(constraints);
  const prefs = state.preferences || {};
  const activity = state.activityPreferences || {};
  const mobility = state.mobility || {};
  const dest = destinationLabel(plan);
  const dayCount = daysOf(plan).length;
  const dayPhrase = dayCount === 1 ? 'day' : `${dayCount} days`;
  const parts = [];

  if (prefs.pace === 'relaxed') {
    parts.push(`The ${dayPhrase} in ${dest} stay intentionally light so there is breathing room for slow traffic and unplanned stops instead of stacking every major attraction.`);
  } else if (prefs.avoidExposure === true) {
    parts.push(`This keeps ${dest} scenic without relying on exposed or scary trails, using viewpoints and easier walks for a real sense of the place.`);
  } else if (activity.hiking === 'easy' || activity.hiking === 'none') {
    parts.push(`Walks stay on the easy side, so ${dest} still feels complete without a strenuous hiking itinerary.`);
  } else if (activity.photography === true) {
    const light = activity.photographyTiming === 'sunrise'
      ? 'morning light'
      : activity.photographyTiming === 'sunset'
        ? 'evening light'
        : 'good light';
    parts.push(`The sequence is organized around ${light} and the strongest viewpoints rather than trying to cover everything in ${dest}.`);
  } else if (prefs.minimizeDriving === true) {
    parts.push(`Stops are clustered so the ${dayPhrase} in ${dest} avoid extra backtracking.`);
  } else {
    parts.push(`The ${dayPhrase} are grouped so nearby sights in ${dest} work together instead of bouncing across the park.`);
  }

  if (prefs.minimizeDriving === true && !/backtracking|clustered|driving/i.test(parts.join(' '))) {
    parts.push('Stops are grouped to keep driving down rather than crisscrossing the park.');
  }

  if (mobility.walkingTolerance === 'limited' || mobility.maxWalkMilesPerSegment != null) {
    parts.push('Walks stay short enough that you are not committed to long trail days.');
  }

  const verify = materialVerification(plan);
  if (verify) parts.push(verify);

  return {
    placement: 'after_plan',
    heading: 'Why this trip works',
    markdown: joinSentences(parts),
  };
}

function filterClosingMarkdown(markdown, {
  plan,
  removedStopNames = [],
  driveMinutesAvailable = false,
} = {}) {
  let text = String(markdown || '').trim();
  if (!text) return '';
  text = dropSentencesMatching(text, isCannedSentence);
  if (!driveMinutesAvailable) {
    text = dropSentencesMatching(text, (sentence) => NUMERIC_DRIVE_CLAIM.test(sentence));
  }
  if (removedStopNames.length) {
    text = dropSentencesMatching(text, (sentence) => mentionsAny(sentence, removedStopNames));
  }
  return text;
}

function afterPlanSections(plan) {
  return normalizeNarrativeSections(plan?.narrativeSections).filter((section) => (
    section.placement === 'after_plan' && section.markdown
  ));
}

function visibleItineraryContract(plan) {
  const closing = afterPlanSections(plan)[0] || null;
  return {
    intro: normalizeItineraryIntro(plan?.intro),
    days: daysOf(plan),
    closing,
  };
}

function ensureFullItineraryClosing(plan, options = {}) {
  if (!plan || typeof plan !== 'object') return plan;
  if (options.isPartialRefinement === true) return plan;
  if (daysOf(plan).length === 0) return plan;

  const before = normalizeNarrativeSections(plan.narrativeSections)
    .filter((section) => section.placement === 'before_plan');
  const filteredAfter = afterPlanSections(plan)
    .map((section) => ({
      ...section,
      markdown: filterClosingMarkdown(section.markdown, { plan, ...options }),
    }))
    .filter((section) => section.markdown);

  // Keep a model-authored material note. Synthesize only when a specific
  // access/permit/seasonal dependency exists — never a generic itinerary tail.
  let closing = filteredAfter[0] || null;
  if (!closing) {
    const verify = materialVerification(plan);
    if (verify) {
      closing = { placement: 'after_plan', heading: null, markdown: verify };
    }
  }
  const next = { ...plan };
  next.intro = normalizeItineraryIntro(next.intro);
  next.narrativeSections = closing ? [...before, closing].slice(0, 3) : before.slice(0, 3);
  return next;
}

module.exports = {
  ensureFullItineraryClosing,
  visibleItineraryContract,
  materialVerification,
};
