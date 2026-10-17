'use strict';

/**
 * Actionable contingency-answer contract (Phase 12H2-D).
 *
 * When a traveler asks what to do if a primary place/access option fails,
 * the prose answer must be a grounded Plan B — not merely an alternate road
 * name. This is a content contract on access_contingency turns. It is not a
 * new TravelerJob and does not force an itinerary card.
 *
 *   named fallback
 *   + why it fits
 *   + 1–3 concrete grounded actions when evidence supports them
 *   + condition for using it
 */

const { namesLooselyMatch } = require('./backupCandidateContext');

const REASON_CODE = Object.freeze({
  REQUIRED: 'actionable_contingency_required',
  MISSING_FALLBACK: 'contingency_fallback_missing',
  MISSING_FIT: 'contingency_fit_missing',
  MISSING_ACTIONS: 'contingency_actions_missing',
  MISSING_CONDITION: 'contingency_condition_missing',
  INVENTED: 'contingency_invented_place',
  UNSUPPORTED: 'contingency_unsupported_alternative',
  CONSTRAINT: 'contingency_constraint_violation',
  NO_SUPPORTED_FALLBACK: 'contingency_no_supported_fallback',
  LIMITED_FALLBACK: 'contingency_limited_fallback',
  EXCEPTION_UNSTATED: 'contingency_exception_unstated',
});

const STATED_LIMITATION =
  /\b(?:cannot (?:be )?established|could not (?:establish|verify|find)|do not establish|does not establish|no (?:authoritative |named )?(?:alternate|fallback|backup)|not (?:enough|able) to (?:establish|name)|official (?:sources?|facts?) do not)\b/i;

const CONDITION =
  /\b(?:if|when|should)\b[\s\S]{0,90}\b(?:fill(?:s|ed)?|full|closed?|sold out|cancel(?:led|ed)|unavailable|doesn'?t work(?: out)?|does not work(?: out)?|fails?|obscured|socked in|shuttle|ferry|parking|road|reservation|weather|viewpoint|access|lot)\b/i;

const FIT =
  /\b(?:because|works? because|stays|remains|still (?:an? |the )?|fits?|honors?|easy|short walk|photograph|photogenic|nearby|without (?:much )?driv|independently|accessible|avoids? (?:exposure|heights?)|compatible|relaxed|minimal driv)\b/i;

const ACTION =
  /\b(?:walk(?:ing)?|hike|hiking|stop(?:s|ping)? at|visit|see|photograph|wander|picnic|stroll|pullouts?|overlook|boardwalk|short walks?)\b/i;

const HARD_EXPOSURE =
  /\b(?:strenuous|steep exposed|exposed (?:trail|hike|ledge)|drop-?offs?|scary heights?|hard (?:hike|trail)|difficult (?:trail|hike)|scramble)\b/i;

const GENERIC_LABELS = new Set([
  'visitor center', 'visitor-center', 'scenic drive', 'national park',
  'parking lot', 'trailhead', 'shuttle', 'ferry', 'reservation',
]);

const PLACE_PHRASE =
  /\b([A-Z][a-zA-Z']+(?:\s+(?:of|the|and|at|de|del|la)\s+[A-Z][a-zA-Z']+|\s+[A-Z][a-zA-Z']+){1,4})\b/g;

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PLACE_SUFFIXES = new Set([
  'road', 'valley', 'lake', 'trail', 'falls', 'overlook', 'ridge', 'river',
  'pass', 'creek', 'peak', 'meadow', 'campground', 'gulch', 'wash', 'narrows',
  'point', 'loop', 'drive',
]);

const ACTIVITY_TITLE_START = /^(?:enjoy|hike|visit|see|walk|explore|try|scenic|fishing|snowshoeing|hiking|wildlife|camping|astronomy|stargazing)$/;

function coresFor(name) {
  const tokens = norm(name).split(' ').filter(Boolean);
  const cores = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    for (let len = 2; len <= 4 && index + len <= tokens.length; len += 1) {
      const slice = tokens.slice(index, index + len);
      const last = slice[slice.length - 1];
      if (!PLACE_SUFFIXES.has(last)) continue;
      if (ACTIVITY_TITLE_START.test(slice[0])) continue;
      const span = slice.join(' ');
      if (span.length >= 8) cores.add(span);
    }
  }
  if (cores.size === 0 && tokens.length >= 2) {
    const tail = tokens.slice(-3).join(' ');
    if (tail.length >= 8) cores.add(tail);
  }
  return [...cores].sort((left, right) => right.length - left.length);
}

function mentionsName(haystack, name) {
  if (namesLooselyMatch(haystack, name)) return true;
  const hay = norm(haystack);
  return coresFor(name).some((core) => hay.includes(core));
}

function extractNamedFromEvidence(bundle) {
  const rows = [];
  const seen = new Set();
  for (const candidate of bundle?.evidence || []) {
    const nv = candidate?.claim?.normalizedValue || {};
    const name = String(nv.name || candidate?.source?.title || '').trim();
    if (!name) continue;
    const key = norm(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const quals = candidate?.claim?.qualifiers || [];
    rows.push({
      name,
      evidenceId: candidate.evidenceId || null,
      topic: candidate.topic || null,
      activityTypes: Array.isArray(nv.activityTypes) ? nv.activityTypes.map(String) : [],
      isActivity: candidate.topic === 'activities'
        || quals.includes('named_activity_candidate')
        || quals.includes('named_place_candidate'),
    });
  }
  return rows;
}

function extractPlaceLikeNames(text) {
  const names = [];
  const source = String(text || '');
  for (const match of source.matchAll(PLACE_PHRASE)) {
    const phrase = String(match[1] || '').trim();
    if (!phrase) continue;
    if (GENERIC_LABELS.has(norm(phrase))) continue;
    if (/^(If|When|There|From|Official|Try|Use|Keep|The|Plan|This|That|Your|Our)\b/.test(phrase)) {
      continue;
    }
    names.push(phrase);
  }
  return names;
}

function mentionedCandidates(text, candidates) {
  return (candidates || []).filter((row) => mentionsName(text, row.name));
}

function findFallback(text, grounded) {
  const hits = mentionedCandidates(text, grounded);
  if (hits.length === 0) return null;
  for (const sentence of sentences(text)) {
    if (!/\b(?:instead|fallback|backup|option|use|try|go to)\b/i.test(sentence)) continue;
    const local = mentionedCandidates(sentence, grounded);
    if (local.length > 0) return local[0];
  }
  return hits[0];
}

function inventedNames(text, allowed) {
  const allowedList = allowed || [];
  const found = [];
  for (const phrase of extractPlaceLikeNames(text)) {
    if (GENERIC_LABELS.has(norm(phrase))) continue;
    const grounded = allowedList.some((row) => mentionsName(phrase, row.name) || mentionsName(row.name, phrase));
    if (!grounded) found.push(phrase);
  }
  return found;
}

function hikingIsEasy(constraints) {
  const value = constraints?.hiking
    || constraints?.explicit?.hiking
    || constraints?.planning?.mobility?.hiking
    || constraints?.mobility?.hiking;
  return value === 'easy' || value === 'easy-only';
}

function exposureAvoided(constraints) {
  return constraints?.avoidExposure === true
    || constraints?.explicit?.avoidExposure === true
    || constraints?.planning?.avoidExposure === true;
}

function allowedFromPrompt(userPrompt) {
  return extractPlaceLikeNames(userPrompt).map((name) => ({ name, fromPrompt: true }));
}

function evaluateActionableContingencyAnswer({
  text = '',
  userPrompt = '',
  bundle = null,
  candidates = null,
  required = true,
  constraints = null,
} = {}) {
  if (!required) {
    return {
      ok: true,
      fallbackName: null,
      concreteActions: [],
      conditionPresent: false,
      fitPresent: false,
      exception: null,
      reasonCodes: [],
    };
  }

  const grounded = Array.isArray(candidates) && candidates.length > 0
    ? candidates.map((row) => ({
      name: row.name,
      evidenceId: row.evidenceId || null,
      isActivity: row.isActivity !== false,
      activityTypes: row.activityTypes || [],
    }))
    : extractNamedFromEvidence(bundle);
  const activityCandidates = grounded.filter((row) => row.isActivity !== false
    && (row.topic == null || row.topic === 'activities' || row.isActivity));
  const promptAllowed = allowedFromPrompt(userPrompt);
  const allowed = [...grounded, ...promptAllowed];
  const invented = inventedNames(text, allowed);
  const reasonCodes = [];

  if (invented.length > 0) {
    return {
      ok: false,
      fallbackName: null,
      concreteActions: [],
      conditionPresent: CONDITION.test(text),
      fitPresent: FIT.test(text),
      exception: null,
      invented,
      reasonCodes: [REASON_CODE.INVENTED],
    };
  }

  if (grounded.length === 0) {
    if (STATED_LIMITATION.test(text)) {
      return {
        ok: true,
        fallbackName: null,
        concreteActions: [],
        conditionPresent: CONDITION.test(text),
        fitPresent: FIT.test(text),
        exception: REASON_CODE.NO_SUPPORTED_FALLBACK,
        reasonCodes: [REASON_CODE.NO_SUPPORTED_FALLBACK],
      };
    }
    return {
      ok: false,
      fallbackName: null,
      concreteActions: [],
      conditionPresent: CONDITION.test(text),
      fitPresent: FIT.test(text),
      exception: { code: REASON_CODE.NO_SUPPORTED_FALLBACK },
      reasonCodes: [REASON_CODE.NO_SUPPORTED_FALLBACK, REASON_CODE.EXCEPTION_UNSTATED],
    };
  }

  const fallback = findFallback(text, grounded);
  const conditionPresent = CONDITION.test(text);
  const fitPresent = FIT.test(text);
  const namedActivities = mentionedCandidates(text, activityCandidates);
  const concreteActions = namedActivities.map((row) => row.name);
  if (fallback && ACTION.test(text) && concreteActions.length === 0) {
    concreteActions.push(fallback.name);
  } else if (fallback && ACTION.test(text) && !concreteActions.includes(fallback.name)) {
    // Fallback plus an action verb still counts as one concrete thing to do.
    if (mentionsName(text, fallback.name)) concreteActions.unshift(fallback.name);
  }

  if (!fallback) reasonCodes.push(REASON_CODE.MISSING_FALLBACK);
  if (!fitPresent) reasonCodes.push(REASON_CODE.MISSING_FIT);
  if (!conditionPresent) reasonCodes.push(REASON_CODE.MISSING_CONDITION);

  if (activityCandidates.length > 0) {
    const hasAction = concreteActions.length >= 1 && ACTION.test(text);
    if (!hasAction) reasonCodes.push(REASON_CODE.MISSING_ACTIONS);
  } else if (fallback && !STATED_LIMITATION.test(text)) {
    reasonCodes.push(REASON_CODE.LIMITED_FALLBACK);
  }

  if ((hikingIsEasy(constraints) || exposureAvoided(constraints)) && HARD_EXPOSURE.test(text)
    && !/\b(?:avoid|not the|skip the|instead of the)\b.{0,24}\b(?:exposed|strenuous|steep)\b/i.test(text)) {
    reasonCodes.push(REASON_CODE.CONSTRAINT);
  }

  if (reasonCodes.length > 0) {
    return {
      ok: false,
      fallbackName: fallback?.name || null,
      concreteActions,
      conditionPresent,
      fitPresent,
      exception: activityCandidates.length === 0 ? REASON_CODE.LIMITED_FALLBACK : null,
      reasonCodes,
    };
  }

  return {
    ok: true,
    fallbackName: fallback.name,
    concreteActions,
    conditionPresent: true,
    fitPresent: true,
    exception: activityCandidates.length === 0 ? REASON_CODE.LIMITED_FALLBACK : null,
    reasonCodes: [],
  };
}

function candidateLabel(row) {
  return row?.name || null;
}

function buildActionableContingencyRepairInstructions({
  reasonCodes = [],
  candidates = [],
} = {}) {
  const names = (candidates || []).map(candidateLabel).filter(Boolean);
  const pool = names.length ? names.slice(0, 6).join(', ') : 'the supplied evidence-backed places';
  const codes = new Set(reasonCodes);
  if (codes.has(REASON_CODE.INVENTED) || codes.has(REASON_CODE.UNSUPPORTED)) {
    return `Keep only fallback names and activities from the supplied evidence (${pool}). Do not invent places. Tie the option to the stated failure condition.`;
  }
  if (codes.has(REASON_CODE.NO_SUPPORTED_FALLBACK) || codes.has(REASON_CODE.EXCEPTION_UNSTATED)) {
    return 'Official facts do not establish a named fallback. Say that limitation clearly. Do not invent a place to satisfy the backup request.';
  }
  return [
    'Keep the grounded fallback.',
    'Explain why it fits this traveler.',
    `Add concrete supported things to do from the supplied evidence (${pool}).`,
    'Tie the option to the stated failure condition.',
  ].join(' ');
}

function actionableContingencyPromptBlock({ required, candidates = [] } = {}) {
  if (!required) return null;
  const names = (candidates || []).map(candidateLabel).filter(Boolean);
  return {
    required: true,
    candidates: names,
    instructions: [
      'The traveler asked what to do if a primary place or access option fails.',
      'Answer in prose with an actionable fallback: name one evidence-backed option, say why it fits, give 1–3 concrete supported things to do when those facts exist, and state the condition for using it.',
      'Do not turn this into a day-by-day itinerary unless the traveler asked for one.',
      'Do not invent places. If official facts do not establish a fallback, say so.',
    ].join(' '),
  };
}

module.exports = {
  REASON_CODE,
  evaluateActionableContingencyAnswer,
  buildActionableContingencyRepairInstructions,
  actionableContingencyPromptBlock,
  extractNamedFromEvidence,
};
