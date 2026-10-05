'use strict';

const { countPromptTokens, truncatePromptTokens } = require('../utils/promptTokenAccounting');
const {
  evaluateActivitySeasonalSuitability,
} = require('../utils/activitySeasonalSuitability');
const { isSameCanonicalExperience } = require('../utils/canonicalExperience');
const { travelerValueClass, VALUE_CLASS } = require('../utils/travelerValueClass');
const {
  detectRequestedExperienceDimensions,
  selectRequestedExperiencePins,
  packedExperienceDiagnostics,
  candidateMatchesDimension,
} = require('../utils/requestedExperienceCoverage');

const STATUS_LABELS = Object.freeze({
  satisfied_fresh: 'fresh',
  satisfied_stale_safe: 'stale-safe',
  satisfied_partial: 'partial',
});

function oneLine(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function compactValue(value) {
  if (value == null) return '';
  if (['string', 'number', 'boolean'].includes(typeof value)) return oneLine(value);
  if (Array.isArray(value)) return value.map(compactValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}=${compactValue(item)}`)
      .filter((item) => !item.endsWith('='))
      .join('; ');
  }
  return oneLine(value);
}

/**
 * A claim the broker produced from a COMPLETE source that contained nothing on
 * this topic. `absenceCandidates` stamps both markers; both are required, so an
 * ordinary falsy value never reads as proof.
 */
function isProvenAbsence(candidate) {
  return candidate?.claim?.polarity === 'negative'
    && candidate?.claim?.normalizedValue === false;
}

/** Topic-specific, epistemically bounded wording for a proven absence. */
function absenceFinding(candidate) {
  const topic = oneLine(candidate.topic);
  const provider = oneLine(candidate.source?.provider || 'the official source').toUpperCase();
  return `Finding: no matching ${topic} record was present in the complete ${provider} source. `
    + 'This establishes the absence of an official record, not the absence of the condition itself — '
    + 'say what the official source does and does not report, and do not upgrade it to a guarantee.';
}

function suitabilityLine(normalizedValue, { annotateUnknownExposure = false, maxFactTokens = null } = {}) {
  if (!normalizedValue || typeof normalizedValue !== 'object') return '';
  const parts = [];
  if (normalizedValue.difficulty) parts.push(`difficulty=${oneLine(normalizedValue.difficulty)}`);
  if (Number.isFinite(Number(normalizedValue.walkingDistanceMiles)) && Number(normalizedValue.walkingDistanceMiles) > 0) {
    parts.push(`walkingDistanceMiles=${Number(normalizedValue.walkingDistanceMiles)}`);
  }
  if (normalizedValue.duration) parts.push(`duration=${oneLine(normalizedValue.duration)}`);
  const latitude = Number(normalizedValue.coordinates?.latitude);
  const longitude = Number(normalizedValue.coordinates?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    parts.push(`coordinates=${latitude},${longitude}`);
  }
  if (normalizedValue.accessibility) {
    const text=oneLine(normalizedValue.accessibility).replace(/<[^>]*>/g,' ');
    const excerpt=maxFactTokens == null ? {text,truncated:false} : truncatePromptTokens(text,maxFactTokens);
    parts.push(`accessibility${excerpt.truncated ? 'Excerpt' : ''}=${excerpt.text}${excerpt.truncated ? ' (partial source detail)' : ''}`);
  }
  if (normalizedValue.currentStatus) {
    parts.push(`currentStatus=${oneLine(normalizedValue.currentStatus)}`);
  }
  if (normalizedValue.exposureLevel) {
    parts.push(`exposureLevel=${oneLine(normalizedValue.exposureLevel)}`);
  } else if (
    annotateUnknownExposure
    && Object.prototype.hasOwnProperty.call(normalizedValue, 'exposureLevel')
  ) {
    parts.push('exposureLevel=unknown (unresolved — not proven compatible with no-exposure)');
  }
  const types = Array.isArray(normalizedValue.activityTypes)
    ? normalizedValue.activityTypes.map(oneLine).filter(Boolean)
    : [];
  if (types.length) parts.push(`activityTypes=${types.join(',')}`);
  if (normalizedValue.sunsetSuitability) {
    parts.push(`sunsetSuitability=${oneLine(normalizedValue.sunsetSuitability)}`);
  }
  return parts.length ? `Suitability: ${parts.join('; ')}` : '';
}

function renderBlock(candidate, resolution, {
  annotateUnknownExposure = false,
  seasonalSuitability = null,
  maxClaimTokens = null,
  maxFactTokens = null,
} = {}) {
  const provider = oneLine(candidate.source?.provider || 'unknown').toUpperCase();
  const authority = oneLine(candidate.quality?.authorityClass || candidate.source?.sourceClass || 'unknown');
  const freshness = STATUS_LABELS[resolution.status] || 'unresolved';
  const lines = [`[${provider} | ${oneLine(candidate.topic)} | ${freshness} | ${authority}]`];

  const mayRenderClaimText = candidate.retention?.storeClaimText !== false;
  let claimText = mayRenderClaimText ? oneLine(candidate.claim?.text) : '';
  const claimBudget = Number.isFinite(maxClaimTokens) ? Math.max(0, Math.floor(maxClaimTokens)) : null;
  if (claimText && claimBudget != null) {
    claimText = truncatePromptTokens(claimText, claimBudget).text;
  }
  const normalizedValue = candidate.claim?.normalizedValue;
  const normalizedCompact = compactValue(normalizedValue);
  // PROVEN ABSENCE IS A FINDING, NOT A FALSE VALUE.
  //
  // A negative claim means: an authoritative source was read COMPLETELY and
  // contained nothing matching this topic. Rendered as `Value: false` that is
  // indistinguishable from unavailable, unknown, or a false fact — and on
  // 2026-08-27 a model holding a satisfied hard requirement answered "I can't
  // verify" because that is the only safe reading of `false`.
  //
  // The wording states exactly what was proven and no more: the absence of a
  // matching OFFICIAL RECORD, never the absence of the underlying condition.
  if (isProvenAbsence(candidate)) {
    lines.push(absenceFinding(candidate));
  } else if (claimText) lines.push(claimText);
  else if (normalizedCompact) lines.push(`Value: ${normalizedCompact}`);

  const suitability = suitabilityLine(normalizedValue, { annotateUnknownExposure, maxFactTokens });
  if (suitability) lines.push(suitability);
  if (seasonalSuitability?.status === 'uncertain') {
    lines.push('Seasonal suitability: uncertain for the requested timing; do not use as a primary recommendation anchor.');
  }

  const observedAt = oneLine(candidate.observation?.observedAt);
  if (observedAt) lines.push(`Observed: ${observedAt}`);

  const sourceTitle = oneLine(candidate.source?.title);
  const sourceUrl = oneLine(candidate.source?.url);
  if (sourceTitle && sourceUrl) lines.push(`Source: ${sourceTitle} — ${sourceUrl}`);
  else if (sourceUrl) lines.push(`Source: ${sourceUrl}`);
  else if (sourceTitle) lines.push(`Source: ${sourceTitle}`);
  return lines.join('\n');
}

function requestPrioritizesLowExposure(requirements = []) {
  return (requirements || []).some((requirement) =>
    (requirement?.reasonCodes || []).some((code) =>
      /low_exposure|no_exposure|exposure/.test(String(code || ''))
    )
  );
}

function requestPrioritizesEasyEffort(requirements = []) {
  return requestPrioritizesLowExposure(requirements)
    || (requirements || []).some((requirement) =>
      (requirement?.reasonCodes || []).some((code) =>
        /easy_hike|beginner|mobility_short|short_experience|family_or_access|low_walking/.test(String(code || ''))
      )
    );
}

function requestPrioritizesTripLogistics(requirements = []) {
  return (requirements || []).some((requirement) =>
    (requirement?.reasonCodes || []).some((code) =>
      /itinerary_entry|itinerary_operating|itinerary_parking|itinerary_facility|origin_drive|itinerary_permit|itinerary_operational|itinerary_access/.test(String(code || ''))
    )
  );
}

function requestPrioritizesAccessDecision(requirements = []) {
  return (requirements || []).some((requirement) =>
    (requirement?.reasonCodes || []).some((code) =>
      /access_decision|access_execution/.test(String(code || ''))
    )
  );
}

function requestPrioritizesHikeOrScenic(requirements = []) {
  return (requirements || []).some((requirement) =>
    (requirement?.reasonCodes || []).some((code) =>
      /hike|walk|scenic|viewpoint|sunset/.test(String(code || ''))
    )
  );
}

function requestPrioritizesHardHike(requirements = []) {
  return (requirements || []).some((requirement) =>
    (requirement?.reasonCodes || []).includes('requested_hard_hike')
  );
}

function npsParkCodeFromEntityId(value) {
  const match = /^nps:park:([a-z0-9]+)$/i.exec(String(value || ''));
  return match ? match[1].toLowerCase() : null;
}

function npsParkCodeFromUrl(value) {
  const match = /nps\.gov\/([a-z0-9]{4})(?:\/|$)/i.exec(String(value || ''));
  return match ? match[1].toLowerCase() : null;
}

function evidenceConflictsWithParkEntity(candidate, requirement) {
  const entityCode = npsParkCodeFromEntityId(requirement?.entity?.entityId);
  const urlCode = npsParkCodeFromUrl(candidate?.source?.url);
  return Boolean(entityCode && urlCode && entityCode !== urlCode);
}

function operationalOverlapDelta(item, userRequest) {
  const request = String(userRequest || '');
  if (!request) return 0;
  const topic = item.candidate?.topic;
  const hay = `${item.candidate?.claim?.text || ''} ${item.candidate?.source?.title || ''} ${item.candidate?.source?.url || ''}`.toLowerCase();
  const lower = request.toLowerCase();
  let delta = 0;
  const parkingMechanics = /\b(first[- ]come|fills? (early|by|up)|time[- ]limit|limited to \d+|lot (is )?full|parking (is )?(limited|full|not guaranteed))\b/.test(hay);
  if (/\bparking\b/.test(lower) && parkingMechanics) delta -= 28;
  else if (/\bparking\b/.test(lower) && /\bparking\b/.test(hay) && topic === 'activities') delta += 24;
  if (/\b(shuttle|transit)\b/.test(lower) && /\b(shuttle|transit|bus)\b/.test(hay) && topic !== 'fees') delta -= 28;
  if (/\b(reservation|access)\b/.test(lower) && /\b(reservation|timed entry|recreation\.gov)\b/.test(hay)) delta -= 20;
  const places = [...request.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)]
    .map((match) => match[1].toLowerCase())
    .filter((place) => place.length >= 6);
  for (const place of places) {
    if (hay.includes(place)) delta -= 18;
  }
  return delta;
}

function candidatePriorityScore(item, {
  preferLowExposure,
  preferHikeScenic,
  preferEasyEffort,
  preferHardHike,
  preferAccessDecision,
  preferTripLogistics,
  userRequest,
  requestedExperienceDimensions = [],
} = {}) {
  const quals = item.candidate?.claim?.qualifiers || [];
  const nv = item.candidate?.claim?.normalizedValue || {};
  const types = (nv.activityTypes || []).map((t) => String(t).toLowerCase());
  const topic = item.candidate?.topic;
  let score = 50;

  // TRAVELER VALUE (2026-09-02). The offered window is a handful of blocks, so
  // ranking decides what a vacation is built from — and an NPS wayside sign is
  // a legitimate place candidate that must never outrank a real experience
  // (live: a Day-2 refinement pool was 18 wayside signs + 1 trailhead while
  // 130 primary experiences sat unoffered). A preference, not an exclusion:
  // micro-POIs still render when nothing better fills the budget. Scoped to
  // experience-bearing topics; operational topics keep their own economics,
  // and access/logistics requests still want their logistics candidates.
  if (topic === 'activities' || topic === 'visitor_services') {
    const valueClass = travelerValueClass({ name: nv.name, activityTypes: nv.activityTypes });
    if (valueClass === VALUE_CLASS.MICRO_POI) score += 45;
    else if (valueClass === VALUE_CLASS.LOGISTICS && !preferAccessDecision && !preferTripLogistics) score += 20;
    else if (valueClass === VALUE_CLASS.REST) score += 6;
    else if (valueClass === VALUE_CLASS.PRIMARY_EXPERIENCE) score -= 10;
  }
  if (quals.includes('named_activity_candidate')) {
    score -= (preferAccessDecision || preferTripLogistics) ? 6 : 12;
  }
  else if (quals.includes('named_place_candidate')) score -= 18;
  else if (nv.name) score -= 10;
  else if (quals.includes('activity_taxonomy')) score += 20;

  if (preferAccessDecision) {
    if (['roads', 'transit', 'parking', 'permits_reservations', 'alerts_closures', 'weather_forecast', 'weather_current', 'fees'].includes(topic)) {
      score -= 40;
    } else if (topic === 'activities') {
      score += 15;
    }
    score += operationalOverlapDelta(item, userRequest);
    if (String(item.candidate?.claim?.text || '').length > 600) score += 24;
  }

  if (preferTripLogistics) {
    const logisticsTopics = ['fees', 'hours', 'transit', 'parking', 'driving_time', 'permits_reservations', 'roads', 'alerts_closures', 'weather_forecast', 'climate_normals', 'visitor_services'];
    if (logisticsTopics.includes(topic)) {
      // Requested traveler experiences outrank optional visitor-service
      // enrichment in the limited window. Fees/hours/roads still get the
      // logistics boost; visitor_services do not consume the experiential budget.
      if (topic === 'visitor_services' && requestedExperienceDimensions.length > 0) {
        score += 10;
      } else {
        score -= 32;
      }
    }
  }
  if (requestedExperienceDimensions.length > 0 && (topic === 'activities' || topic === 'visitor_services')) {
    const matched = requestedExperienceDimensions.filter((dimension) => candidateMatchesDimension(item.candidate, dimension));
    if (matched.length > 0) score -= 18 + Math.min(8, (matched.length - 1) * 4);
  }

  if (preferLowExposure) {
    const trailLike = types.some((t) => /hike|trail/.test(t))
      && !types.some((t) => /visitor_center|scenic_drive|museum|lodge|viewpoint|picnic|wildlife|historic|exhibit|boat|geothermal|ranger|photography/.test(t));
    const nonTrail = topic === 'visitor_services'
      || types.some((t) => /visitor_center|scenic_drive|museum|lodge|viewpoint|picnic|wildlife|historic|exhibit|boat|geothermal|ranger|photography|accessible/.test(t));
    if (nonTrail && !trailLike) {
      score -= 22;
    } else {
      const exposure = String(nv.exposureLevel || '').toLowerCase();
      if (exposure === 'low') score -= 30;
      else if (exposure === 'moderate' || exposure === 'high') score += 25;
      else {
        score += 12;
      }
      const claimText = String(item.candidate?.claim?.text || '').toLowerCase();
      if (!exposure && (
        /\bunpaved\b.{0,40}\bclimbs?\b/.test(claimText)
        || /\bclimbs?\b.{0,40}\bviewpoint\b/.test(claimText)
        || /\b(drop[- ]?offs?|slot canyon|strenuous)\b/.test(claimText)
      )) {
        score += 18;
      }
    }
  }
  if (preferHardHike) {
    const difficulty = String(nv.difficulty || '').toLowerCase();
    if (/(strenuous|difficult|hard|challenging)/.test(difficulty)) score -= 22;
    else if (difficulty === 'easy') score += 16;
  } else if (preferHikeScenic) {
    if (types.some((t) => /hike|walk|viewpoint|scenic|sunset/.test(t))) score -= 12;
    if (preferEasyEffort && String(nv.difficulty || '').toLowerCase() === 'easy') score -= 8;
    if (preferEasyEffort && String(nv.difficulty || '').toLowerCase() === 'moderate') score -= 4;
    if (preferEasyEffort && types.some((t) => /hik|trail|walk/.test(t))) {
      const miles = Number(nv.walkingDistanceMiles);
      if (Number.isFinite(miles) && miles > 0) {
        // Public packing does not receive the private numeric constraint. Prefer
        // shorter, explicitly measured candidates generically; the private
        // eligibility gate enforces the traveler's exact limit later.
        score += Math.min(20, miles * 5) - 16;
      } else {
        score += 10;
      }
    }
  }
  if (item.seasonalSuitability?.status === 'uncertain') score += 35;
  return score;
}

function packingEntityKey(item) {
  return oneLine(
    item.candidate?.entityId
    || item.candidate?.claim?.normalizedValue?.destinationId
    || item.candidate?.claim?.subjectId
    || 'unknown'
  ) || 'unknown';
}

/**
 * Multi-entity compares: round-robin by entity so one park's large named-activity
 * set cannot starve another park under the shared token budget.
 * Single-entity bundles keep pure priority order.
 */
function orderForTokenBudget(items, scoreOpts) {
  const sorted = [...items].sort((left, right) => {
    const delta = candidatePriorityScore(left, scoreOpts)
      - candidatePriorityScore(right, scoreOpts);
    if (delta !== 0) return delta;
    const leftName = oneLine(left.candidate?.claim?.normalizedValue?.name);
    const rightName = oneLine(right.candidate?.claim?.normalizedValue?.name);
    return leftName.localeCompare(rightName);
  });
  // An itinerary needs both experiences and operational context. A logistics
  // score alone must not fill the window with facility/fee records. Balance
  // the two evidence streams, without prescribing any itinerary stop count.
  if (scoreOpts.preferTripLogistics && !scoreOpts.preferAccessDecision) {
    const experiential = item => {
      const v=item.candidate?.claim?.normalizedValue || {};
      return item.candidate?.topic === 'activities'
        && travelerValueClass({name:v.name,activityTypes:v.activityTypes}) === VALUE_CLASS.PRIMARY_EXPERIENCE;
    };
    const sourceRange = item => require('../utils/evidenceActivityDuration').activityDurationRange(item.candidate?.claim?.normalizedValue?.duration);
    const substantial = item => (sourceRange(item)?.maxMinutes || 0) >= require('../utils/itineraryCompleteness').SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES;
    const dependency = item => require('../utils/tripExperienceQuality').conditionalDependency(
      {name:item.candidate.claim.normalizedValue.name,evidenceRef:item.candidate.evidenceId},
      {evidence:[item.candidate]}, {constraints:scoreOpts.constraints || {}});
    const experiences=sorted.filter(experiential).sort((a,b)=>Number(dependency(a))-Number(dependency(b))
      || Number(substantial(b))-Number(substantial(a))
      || Number(Boolean(sourceRange(b)))-Number(Boolean(sourceRange(a))));
    const context=sorted.filter(item=>!experiential(item));
    sorted.length=0;
    while(experiences.length || context.length){
      if(experiences.length)sorted.push(experiences.shift());
      if(context.length)sorted.push(context.shift());
    }
  }
  const entityKeys = [...new Set(sorted.map(packingEntityKey))];
  if (entityKeys.length <= 1) return sorted;

  const queues = new Map(entityKeys.map((key) => [key, []]));
  for (const item of sorted) {
    queues.get(packingEntityKey(item)).push(item);
  }
  const ordered = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const key of entityKeys) {
      const queue = queues.get(key);
      if (!queue.length) continue;
      ordered.push(queue.shift());
      progressed = true;
    }
  }
  return ordered;
}

function renderEvidenceBundleForPrompt({
  bundle,
  mode = null,
  requirements = [],
  userRequest = '',
  constraints = null,
  excludedEvidenceIds = [],
  maxTokens = 1200,
  // Phase 9C.1D.5B — identities resolved for places the traveler explicitly
  // named. Rendered FIRST and never dropped by the budget: ranking may decide
  // what fills the window, but never hide something the traveler required.
  // Empty (every ordinary turn) renders byte-identically to before.
  pinnedEvidenceIds = [],
  requestedExperienceDimensions = null,
} = {}) {
  const limit = Math.max(0, Math.floor(Number(maxTokens) || 0));
  const pinned = new Set(pinnedEvidenceIds || []);
  const resolutions = new Map((bundle?.resolutions || []).map((item) => [item.requirementId, item]));
  const candidates = new Map((bundle?.evidence || []).map((item) => [item.evidenceId, item]));
  const selected = [];
  const excluded = new Set(excludedEvidenceIds);
  const seasonallyExcludedEvidenceIds = [];
  const preferLowExposure = requestPrioritizesLowExposure(requirements);
  const preferHardHike = requestPrioritizesHardHike(requirements);
  const preferHikeScenic = !preferHardHike && requestPrioritizesHikeOrScenic(requirements);
  const preferEasyEffort = !preferHardHike && requestPrioritizesEasyEffort(requirements);
  const preferAccessDecision = requestPrioritizesAccessDecision(requirements);
  const preferTripLogistics = requestPrioritizesTripLogistics(requirements);
  const experienceDimensions = Array.isArray(requestedExperienceDimensions)
    ? requestedExperienceDimensions
    : detectRequestedExperienceDimensions({ userPrompt: userRequest, constraints });
  const scoreOpts = {
    preferLowExposure,
    preferHikeScenic,
    preferEasyEffort,
    preferHardHike,
    preferAccessDecision,
    preferTripLogistics,
    userRequest,
    constraints,
    requestedExperienceDimensions: experienceDimensions,
  };

  for (const requirement of requirements) {
    const resolution = resolutions.get(requirement?.requirementId);
    if (!resolution || !STATUS_LABELS[resolution.status]) continue;
    for (const evidenceId of resolution.evidenceIds || []) {
      const candidate = candidates.get(evidenceId);
      if (!candidate || candidate.topic !== requirement.topic) continue;
      // Phase 9C.1D.5C-C — a curated relationship is identity/planning context,
      // not a place to offer the model; it never occupies an evidence block.
      if (candidate.source?.provider === 'curated_relationship') continue;
      if (excluded.has(evidenceId)) continue;
      if (evidenceConflictsWithParkEntity(candidate, requirement)) continue;
      const seasonalSuitability = evaluateActivitySeasonalSuitability(candidate, {
        userRequest,
        requirements: [requirement],
      });
      if (seasonalSuitability.status === 'mismatch' && !pinned.has(evidenceId)) {
        seasonallyExcludedEvidenceIds.push(evidenceId);
        continue;
      }
      selected.push({
        evidenceId,
        candidate,
        resolution,
        seasonalSuitability,
        renderBudgetTokens: requirement.renderBudgetTokens,
      });
    }
  }

  const unique = [...new Map(selected.map((item) => [item.evidenceId, item])).values()];
  const namedPinIds = [...pinned];
  const experiencePins = selectRequestedExperiencePins({
    items: unique,
    dimensions: experienceDimensions,
    scoreFn: (item) => candidatePriorityScore(item, scoreOpts),
  }).filter((evidenceId) => !pinned.has(evidenceId));
  for (const evidenceId of experiencePins) pinned.add(evidenceId);
  const ranked = orderForTokenBudget(unique, scoreOpts);
  const byId = new Map(ranked.map((item) => [item.evidenceId, item]));
  const pinOrder = [...namedPinIds, ...experiencePins]
    .map((evidenceId) => byId.get(evidenceId))
    .filter(Boolean);
  const pinnedFirst = pinOrder.length > 0
    ? [...pinOrder, ...ranked.filter((item) => !pinned.has(item.evidenceId))]
    : ranked;
  const ordered = pinnedFirst.filter((item, index, list) => {
    // Phase 9C.1D.5C-E3 — a pinned item is an exact, distinct identity the
    // traveler named; canonical-name dedupe must never drop it. Live case:
    // "Vernal Fall Footbridge" read as a prefix-variant of "Vernal Fall" and
    // vanished from the window although both were explicitly requested.
    if (pinned.has(item.evidenceId)) return true;
    const name = item.candidate?.claim?.normalizedValue?.name;
    if (!name || item.candidate?.topic !== 'activities') return true;
    return !list.slice(0, index).some((prior) => (
      prior.candidate?.topic === 'activities'
      && isSameCanonicalExperience(prior.candidate?.claim?.normalizedValue?.name, name)
    ));
  });
  const blocks = [];
  const includedEvidenceIds = [];
  const omittedEvidenceIds = [];
  for (const item of ordered) {
    const claimBudget = Number.isFinite(item.renderBudgetTokens)
      ? Math.max(40, Math.floor(item.renderBudgetTokens))
      : 180;
    const maxClaimTokens = preferAccessDecision || preferTripLogistics ? Math.min(claimBudget, 90) : claimBudget;
    const block = renderBlock(item.candidate, item.resolution, {
      annotateUnknownExposure: preferLowExposure,
      seasonalSuitability: item.seasonalSuitability,
      maxClaimTokens,
      maxFactTokens:preferTripLogistics ? maxClaimTokens : null,
    });
    const proposed = [...blocks, block].join('\n\n');
    if (pinned.has(item.evidenceId) || countPromptTokens(proposed) <= limit) {
      blocks.push(block);
      includedEvidenceIds.push(item.evidenceId);
    } else {
      omittedEvidenceIds.push(item.evidenceId);
    }
  }
  const { planningJob, packPrimaryEvidence } = require('./primaryEvidencePacking');
  const job = planningJob({ mode, constraints, userRequest, preferTripLogistics, preferAccessDecision });
  const primary = job.itinerary ? packPrimaryEvidence({ items: unique, bundle, constraints, userRequest,
    dimensions: experienceDimensions, pinned, job, limit, scoreFn: item => candidatePriorityScore(item, scoreOpts) }) : null;
  if (primary) {
    includedEvidenceIds.splice(0, includedEvidenceIds.length, ...primary.includedEvidenceIds);
    omittedEvidenceIds.splice(0, omittedEvidenceIds.length, ...primary.omittedEvidenceIds);
  }
  const text = primary?.text ?? blocks.join('\n\n');
  const includedItems = unique.filter((item) => includedEvidenceIds.includes(item.evidenceId));
  const experienceDiagnostics = packedExperienceDiagnostics(includedItems, experienceDimensions);
  return Object.freeze({
    text,
    ...(primary ? { primaryPacking: Object.freeze(primary.primaryPacking) } : {}),
    tokens: countPromptTokens(text),
    includedEvidenceIds: Object.freeze(includedEvidenceIds),
    omittedEvidenceIds: Object.freeze(omittedEvidenceIds),
    seasonallyExcludedEvidenceIds: Object.freeze([...new Set(seasonallyExcludedEvidenceIds)]),
    truncated: omittedEvidenceIds.length > 0,
    requestedExperienceDimensions: Object.freeze([...experienceDimensions]),
    requestedExperiencePins: Object.freeze([...experiencePins]),
    packedExperienceDiagnostics: experienceDiagnostics,
  });
}

module.exports = { renderEvidenceBundleForPrompt };
