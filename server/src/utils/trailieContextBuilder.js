/**
 * Builds STRUCTURED_CONTEXT_JSON for Trailie chat turns.
 * Assembles existing backend outputs — does not fetch or validate itineraries.
 */

const {
  buildTripState,
  computeTripStateCompleteness,
} = require('./tripStateBuilder');

const SCHEMA_VERSION = 'trailie-context-v2';

const OFFICIAL_HIGH_CONFIDENCE_SOURCES = new Set(['NPS', 'OpenWeather', 'feeFreeDaysService', 'RIDB']);
const WEB_SOURCE_PATTERN = /brave|serper|tavily|web/i;
const DESERT_PARKS = new Set(['deva', 'jotr', 'arch', 'cany', 'zion', 'grca']);

const MONTH_NAME_TO_NUMBER = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * @typedef {'available'|'missing'|'not_requested'} FactStatus
 * @typedef {'high'|'medium'|'low'|'unknown'} SourceConfidence
 */

/**
 * @param {boolean} requested
 * @param {*} value - fetched value (string, object, etc.)
 * @param {{ source?: string|null, reason?: string|null, fetchedAt?: string|null }} [options]
 */
function createFactSlotMeta(requested, value, options = {}) {
  const { source = null, reason = null, fetchedAt = null } = options;

  if (!requested) {
    return {
      status: 'not_requested',
      source: null,
      fetchedAt: null,
      reason: null,
      data: null,
      confidence: 'unknown',
    };
  }

  if (value === null || value === undefined) {
    return {
      status: 'missing',
      source,
      fetchedAt: null,
      reason: reason || 'fetch_failed_or_unavailable',
      data: null,
      confidence: 'unknown',
    };
  }

  if (typeof value === 'string' && value.trim() === '') {
    const slot = {
      status: 'available',
      source,
      fetchedAt: fetchedAt || new Date().toISOString(),
      reason: null,
      data: [],
    };
    return assignSlotConfidence(slot);
  }

  const slot = {
    status: 'available',
    source,
    fetchedAt: fetchedAt || new Date().toISOString(),
    reason: null,
    data: { present: true },
  };
  return assignSlotConfidence(slot);
}

function assignSlotConfidence(slot) {
  if (!slot) return { status: 'not_requested', confidence: 'unknown', data: null };

  if (slot.status === 'not_requested' || slot.status === 'missing' || slot.data === null) {
    return { ...slot, confidence: 'unknown' };
  }

  let confidence = 'medium';
  if (slot.source && OFFICIAL_HIGH_CONFIDENCE_SOURCES.has(slot.source)) {
    confidence = 'high';
  } else if (slot.source && WEB_SOURCE_PATTERN.test(slot.source)) {
    confidence = 'medium';
  } else if (slot.source) {
    confidence = 'medium';
  }

  if (slot.fetchedAt) {
    const ageMs = Date.now() - new Date(slot.fetchedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      confidence = 'low';
    } else if (ageMs > 60 * 60 * 1000 && confidence === 'high') {
      confidence = 'medium';
    }
  }

  return { ...slot, confidence };
}

function applyConfidenceToLiveData(liveData) {
  return {
    ...liveData,
    nps: assignSlotConfidence(liveData.nps),
    weather: assignSlotConfidence(liveData.weather),
    webSearch: assignSlotConfidence(liveData.webSearch),
    feeFree: assignSlotConfidence(liveData.feeFree),
  };
}

function normalizeConstraints(constraints) {
  if (!constraints) {
    return {
      destination: null,
      parkCode: null,
      dates: null,
      tripLengthDays: null,
      groupSize: null,
      fitness: null,
      budget: null,
      accommodation: null,
      interests: [],
      hasChildren: false,
      hasConstraints: false,
    };
  }

  return {
    destination: constraints.parkCode ? null : null,
    parkCode: constraints.parkCode || null,
    dates: constraints.dates?.start || constraints.dates?.end
      ? { start: constraints.dates.start || null, end: constraints.dates.end || null }
      : null,
    tripLengthDays: constraints.dates?.numDays ?? null,
    groupSize: constraints.groupSize ?? null,
    fitness: constraints.fitnessLevel ?? null,
    budget: constraints.budget ?? null,
    accommodation: constraints.accommodation ?? null,
    interests: Array.isArray(constraints.interests) ? constraints.interests : [],
    hasChildren: !!constraints.hasChildren,
    hasConstraints: !!constraints.hasConstraints,
  };
}

function normalizeNpsMeta(factsMeta, { npsFacts, allExtractedParks = [] }) {
  if (allExtractedParks.length > 1) {
    const parkCodes = allExtractedParks.map((p) => p.parkCode).filter(Boolean);
    if (npsFacts) {
      return assignSlotConfidence({
        status: 'available',
        source: 'NPS',
        fetchedAt: new Date().toISOString(),
        reason: null,
        data: { parks: parkCodes, present: true },
      });
    }
    if (parkCodes.length > 0) {
      return assignSlotConfidence({
        status: 'missing',
        source: 'NPS',
        fetchedAt: null,
        reason: 'multi_park_fetch_failed_or_empty',
        data: null,
      });
    }
  }

  return assignSlotConfidence(factsMeta?.nps || createFactSlotMeta(false, null));
}

function normalizeWebSearchMeta(factsMeta, { webSearchUnavailable, skipWebSearchForGuest }) {
  const base = factsMeta?.webSearch || createFactSlotMeta(false, null);

  if (skipWebSearchForGuest && base.status === 'not_requested') {
    return assignSlotConfidence({
      status: 'not_requested',
      source: null,
      fetchedAt: null,
      reason: 'guest_account_web_search_disabled',
      data: null,
    });
  }

  if (base.status === 'missing' && webSearchUnavailable) {
    return assignSlotConfidence({
      ...base,
      reason: base.reason || 'web_search_unavailable',
    });
  }

  return assignSlotConfidence(base);
}

function hasTripDates({ constraints, metadata, tripState }) {
  const fd = metadata?.formData || {};
  return !!(
    constraints?.dates?.start ||
    constraints?.dates?.end ||
    fd.startDate ||
    fd.endDate ||
    tripState?.dates?.startDate ||
    tripState?.dates?.endDate ||
    tripState?.dates?.season
  );
}

function queryMentionsFees(message = '') {
  return /\b(fee.?free|free\s*entrance|entrance\s*fee|annual\s*pass|america the beautiful|passes?|admission|timed\s*entry|free\s*entry|no\s*fee)\b/i.test(
    message
  );
}

function isFeeFreeRelevant({ lastUserMessage, constraints, metadata, tripState }) {
  return hasTripDates({ constraints, metadata, tripState }) || queryMentionsFees(lastUserMessage);
}

function normalizeFeeFreeMeta({
  factsMeta,
  feeFreeFacts,
  lastUserMessage,
  constraints,
  metadata,
  tripState,
}) {
  const relevant = isFeeFreeRelevant({ lastUserMessage, constraints, metadata, tripState });

  if (!relevant) {
    return assignSlotConfidence({
      status: 'not_requested',
      source: null,
      fetchedAt: null,
      reason: 'fee_free_data_not_relevant_to_this_turn',
      data: null,
    });
  }

  const base = factsMeta?.feeFree;

  if (feeFreeFacts) {
    return assignSlotConfidence({
      status: 'available',
      source: 'feeFreeDaysService',
      fetchedAt: base?.fetchedAt || new Date().toISOString(),
      reason: null,
      data: { present: true },
    });
  }

  if (base?.reason && /^(api_down|fee_free_data_fetch_failed)$/i.test(base.reason)) {
    return assignSlotConfidence({
      status: 'missing',
      source: 'feeFreeDaysService',
      fetchedAt: null,
      reason: base.reason || 'fee_free_data_fetch_failed',
      data: null,
    });
  }

  return assignSlotConfidence({
    status: 'available',
    source: 'feeFreeDaysService',
    fetchedAt: base?.fetchedAt || new Date().toISOString(),
    reason: null,
    data: [],
  });
}

function normalizeLiveData({
  factsMeta,
  npsFacts,
  weatherFacts,
  webSearchFacts,
  feeFreeFacts,
  webSearchUnavailable,
  skipWebSearchForGuest,
  allExtractedParks,
  resolvedMetadata,
  lastUserMessage,
  constraints,
  metadata,
  tripState,
}) {
  const hasPark = !!(resolvedMetadata?.parkCode || allExtractedParks?.length > 0);
  const hasCoords = !!(resolvedMetadata?.lat && resolvedMetadata?.lon);

  let weather = factsMeta?.weather || createFactSlotMeta(false, null);
  if (!factsMeta?.weather && hasCoords && !weatherFacts) {
    weather = createFactSlotMeta(true, null, {
      source: 'OpenWeather',
      reason: 'weather_needed_but_unavailable',
    });
  }

  const liveData = {
    nps: normalizeNpsMeta(factsMeta, { npsFacts, allExtractedParks }),
    weather: assignSlotConfidence(weather),
    webSearch: normalizeWebSearchMeta(factsMeta, { webSearchUnavailable, skipWebSearchForGuest }),
    feeFree: normalizeFeeFreeMeta({
      factsMeta,
      feeFreeFacts,
      lastUserMessage,
      constraints,
      metadata,
      tripState,
    }),
    prosePresent: {
      nps: !!npsFacts,
      weather: !!weatherFacts,
      webSearch: !!webSearchFacts,
      feeFree: !!feeFreeFacts,
    },
    park: {
      parkCode: resolvedMetadata?.parkCode || null,
      parkName: resolvedMetadata?.parkName || null,
      parksMentioned: (allExtractedParks || []).map((p) => ({
        parkCode: p.parkCode,
        parkName: p.parkName,
      })),
      hasPark,
    },
  };

  return applyConfidenceToLiveData(liveData);
}

function conflictToRiskFlag(conflict) {
  const typeMap = {
    fitness_vs_difficulty: 'fitness_mismatch',
    time_vs_scope: 'long_drive',
    day_count: 'crowd_bottleneck',
    schedule_overflow: 'crowd_bottleneck',
    budget_vs_accommodation: 'fitness_mismatch',
    difficulty: 'fitness_mismatch',
    accommodation: 'campground_unavailable',
    overloaded_day: 'crowd_bottleneck',
    time_overlap: 'crowd_bottleneck',
    easy_vs_adventure: 'fitness_mismatch',
  };

  const highTypes = new Set(['day_count', 'schedule_overflow', 'fitness_vs_difficulty']);
  const type = typeMap[conflict.type] || 'fitness_mismatch';

  return {
    type,
    severity: highTypes.has(conflict.type) ? 'high' : 'medium',
    message: conflict.constraintA || conflict.resolution || `Constraint conflict: ${conflict.type}`,
    source: 'constraint_engine',
  };
}

function parseNpsRiskHints(npsFacts, npsMeta) {
  const flags = [];
  if (npsMeta?.status === 'missing' && npsMeta?.reason !== 'multi_park_fetch_failed_or_empty') {
    flags.push({
      type: 'data_stale',
      severity: 'medium',
      message: 'NPS park data unavailable for named park',
      source: 'NPS',
    });
  }
  if (!npsFacts) return flags;

  if (/ACTIVE\s+CLOSURE|CLOSURE|closed to (?:all )?traffic|road closed/i.test(npsFacts)) {
    flags.push({
      type: 'closure',
      severity: 'high',
      message: 'Active closure noted in NPS data',
      source: 'NPS',
    });
  }
  if (/permit|reservation required|lottery|timed entry/i.test(npsFacts)) {
    flags.push({
      type: 'permit_required',
      severity: 'medium',
      message: 'Permit or reservation may be required',
      source: 'NPS',
    });
  }
  if (/wildlife|bear|bison|elk|moose|mountain lion/i.test(npsFacts)) {
    flags.push({
      type: 'wildlife',
      severity: 'medium',
      message: 'Wildlife safety guidance present in NPS data',
      source: 'NPS',
    });
  }
  if (/flash flood|slot canyon|monsoon/i.test(npsFacts)) {
    flags.push({
      type: 'flash_flood',
      severity: 'high',
      message: 'Flash flood risk noted in NPS data',
      source: 'NPS',
    });
  }
  if (/altitude|elevation|thin air|acclimat/i.test(npsFacts)) {
    flags.push({
      type: 'altitude',
      severity: 'medium',
      message: 'Altitude or elevation considerations noted',
      source: 'NPS',
    });
  }

  return flags;
}

function parseWeatherHighF(weatherFacts) {
  if (!weatherFacts) return null;

  let max = null;
  const patterns = [
    /high[:\s]*(\d{2,3})\s*°?\s*f/i,
    /highs?(?:\s+of)?\s+(\d{2,3})/i,
    /currently\s+(\d{2,3})\s*°?\s*f/i,
    /(\d{2,3})\s*°?\s*f/i,
  ];

  for (const pattern of patterns) {
    const match = weatherFacts.match(pattern);
    if (match) {
      const temp = parseInt(match[1], 10);
      if (temp >= 80 && temp <= 130) {
        max = max === null ? temp : Math.max(max, temp);
      }
    }
  }

  return max;
}

function inferQueryMonth({ lastUserMessage, constraints, metadata, tripState }) {
  const msg = (lastUserMessage || '').toLowerCase();

  for (const [name, num] of Object.entries(MONTH_NAME_TO_NUMBER)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(msg)) {
      return num;
    }
  }

  if (tripState?.dates?.season) {
    const season = tripState.dates.season.toLowerCase();
    if (season === 'summer') return 7;
    if (season === 'winter') return 1;
    if (season === 'spring') return 4;
    if (season === 'fall' || season === 'autumn') return 10;
  }

  const dateCandidates = [
    constraints?.dates?.start,
    tripState?.dates?.startDate,
    metadata?.formData?.startDate,
  ].filter(Boolean);

  for (const dateText of dateCandidates) {
    const parsed = new Date(dateText);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getMonth() + 1;
    }

    for (const [name, num] of Object.entries(MONTH_NAME_TO_NUMBER)) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(String(dateText))) {
        return num;
      }
    }
  }

  return new Date().getMonth() + 1;
}

function deriveSeasonalHeatRiskFlags({ parkCode, lastUserMessage, constraints, metadata, tripState }) {
  const flags = [];
  const month = inferQueryMonth({ lastUserMessage, constraints, metadata, tripState });
  const code = (parkCode || '').toLowerCase();

  if (code === 'deva' && month >= 6 && month <= 9) {
    flags.push({
      type: 'extreme_heat',
      severity: 'high',
      message:
        'Death Valley summer conditions create serious heat risk, especially for hiking after sunrise.',
      source: 'seasonal_rules',
    });
  }

  return flags;
}

function parseWeatherRiskHints(weatherFacts, weatherMeta, { parkCode } = {}) {
  if (weatherMeta?.status === 'missing') {
    return [
      {
        type: 'weather_missing',
        severity: 'medium',
        message: 'Weather was needed but unavailable',
        source: null,
      },
    ];
  }
  if (!weatherFacts) return [];

  const flags = [];
  const threshold = DESERT_PARKS.has((parkCode || '').toLowerCase()) ? 90 : 95;
  const temp = parseWeatherHighF(weatherFacts);

  if (temp && temp >= threshold) {
    flags.push({
      type: 'extreme_heat',
      severity: temp >= 105 ? 'high' : 'medium',
      message: `Forecast high near ${temp}°F creates heat risk for hiking.`,
      source: 'OpenWeather',
    });
  }

  if (/snow|ice|freezing|blizzard|winter storm/i.test(weatherFacts)) {
    flags.push({
      type: 'snow_or_ice',
      severity: 'high',
      message: 'Snow or ice conditions in forecast',
      source: 'OpenWeather',
    });
  }
  return flags;
}

function dedupeRiskFlags(flags) {
  const merged = [];
  const seen = new Set();

  for (const flag of flags || []) {
    const key = `${flag.type}|${flag.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(flag);
  }

  return merged;
}

function deriveRiskFlags({
  preflightResult,
  conflicts,
  liveData,
  npsFacts,
  weatherFacts,
  webSearchUnavailable,
  lastUserMessage,
  resolvedMetadata,
  constraints,
  metadata,
  tripState,
}) {
  const parkCode = resolvedMetadata?.parkCode || liveData?.park?.parkCode || null;
  const flags = [];

  for (const blocker of preflightResult?.blockers || []) {
    flags.push({
      type: 'closure',
      severity: 'high',
      message: blocker,
      source: 'preflight',
    });
  }

  for (const warning of preflightResult?.warnings || []) {
    const isCrowd = /peak season|crowd|busy|reservation/i.test(warning);
    flags.push({
      type: isCrowd ? 'crowd_bottleneck' : 'data_stale',
      severity: 'medium',
      message: warning,
      source: 'preflight',
    });
  }

  for (const conflict of conflicts || []) {
    flags.push(conflictToRiskFlag(conflict));
  }

  flags.push(...parseNpsRiskHints(npsFacts, liveData?.nps));
  flags.push(
    ...parseWeatherRiskHints(weatherFacts, liveData?.weather, { parkCode }),
    ...deriveSeasonalHeatRiskFlags({
      parkCode,
      lastUserMessage,
      constraints,
      metadata,
      tripState,
    })
  );

  if (webSearchUnavailable) {
    flags.push({
      type: 'data_stale',
      severity: 'low',
      message: 'Web search unavailable for this query',
      source: null,
    });
  }

  for (const slot of [liveData?.nps, liveData?.weather, liveData?.webSearch, liveData?.feeFree]) {
    if (slot?.confidence === 'low' && slot.status === 'available') {
      flags.push({
        type: 'data_stale',
        severity: 'low',
        message: `${slot.source || 'Live data'} may be stale`,
        source: slot.source,
      });
    }
  }

  return dedupeRiskFlags(flags);
}

function buildTrailieContext({
  provider,
  lastUserMessage,
  constraints,
  intent,
  preflightResult,
  conflicts,
  hypothetical,
  factsMeta,
  resolvedMetadata,
  allExtractedParks,
  npsFacts,
  weatherFacts,
  webSearchFacts,
  feeFreeFacts,
  webSearchUnavailable,
  skipWebSearchForGuest,
  metadata,
  userCity,
  conversationSummary,
  savedTripPlan,
}) {
  const providerMode = provider === 'openai' ? 'architect' : 'buddy';
  const normalizedConstraints = normalizeConstraints(constraints);

  const tripState = buildTripState({
    metadata: metadata || {},
    constraints,
    resolvedMetadata,
    allExtractedParks,
    userCity,
    lastUserMessage,
    conversationSummary,
    savedTripPlan,
  });

  const liveData = normalizeLiveData({
    factsMeta,
    npsFacts,
    weatherFacts,
    webSearchFacts,
    feeFreeFacts,
    webSearchUnavailable,
    skipWebSearchForGuest,
    allExtractedParks,
    resolvedMetadata,
    lastUserMessage,
    constraints,
    metadata,
    tripState,
  });

  if (resolvedMetadata?.parkName && !normalizedConstraints.parkCode) {
    normalizedConstraints.destination = resolvedMetadata.parkName;
  } else if (resolvedMetadata?.parkName) {
    normalizedConstraints.destination = resolvedMetadata.parkName;
  }

  const riskFlags = deriveRiskFlags({
    preflightResult,
    conflicts,
    liveData,
    npsFacts,
    weatherFacts,
    webSearchUnavailable,
    lastUserMessage,
    resolvedMetadata,
    constraints,
    metadata,
    tripState,
  });

  return {
    intent: {
      primary: intent?.primaryIntent || null,
      all: (intent?.intents || []).map((i) => ({ type: i.type, confidence: i.confidence })),
    },
    providerMode,
    userMessage: lastUserMessage ? lastUserMessage.slice(0, 500) : null,
    tripState,
    constraints: normalizedConstraints,
    liveData,
    validation: {
      preflightPassed: (preflightResult?.blockers?.length ?? 0) === 0,
      preflightBlockers: preflightResult?.blockers || [],
      preflightWarnings: preflightResult?.warnings || [],
      conflicts: (conflicts || []).map((c) => ({
        type: c.type,
        constraintA: c.constraintA,
        constraintB: c.constraintB,
        resolution: c.resolution,
      })),
      scenarioMode: hypothetical?.isHypothetical ? hypothetical.scenarioDescription : null,
      riskFlags,
    },
    contextMeta: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      tripStateCompleteness: computeTripStateCompleteness(tripState),
    },
  };
}

function summarizeTrailieContext(trailieContext) {
  if (!trailieContext) return null;

  return {
    schemaVersion: trailieContext.contextMeta?.schemaVersion || SCHEMA_VERSION,
    intent: trailieContext.intent?.primary || null,
    providerMode: trailieContext.providerMode || null,
    liveDataStatuses: {
      nps: trailieContext.liveData?.nps?.status || null,
      weather: trailieContext.liveData?.weather?.status || null,
      webSearch: trailieContext.liveData?.webSearch?.status || null,
      feeFree: trailieContext.liveData?.feeFree?.status || null,
    },
    liveDataConfidence: {
      nps: trailieContext.liveData?.nps?.confidence || null,
      weather: trailieContext.liveData?.weather?.confidence || null,
      webSearch: trailieContext.liveData?.webSearch?.confidence || null,
      feeFree: trailieContext.liveData?.feeFree?.confidence || null,
    },
    riskFlagCount: trailieContext.validation?.riskFlags?.length ?? 0,
    riskFlagTypes: (trailieContext.validation?.riskFlags || []).map((f) => f.type),
    tripStateCompleteness:
      trailieContext.contextMeta?.tripStateCompleteness ??
      computeTripStateCompleteness(trailieContext.tripState || {}),
    openQuestionCount: trailieContext.tripState?.openQuestions?.length ?? 0,
  };
}

function maybeAttachDebugTrailieContext(responseData, trailieContext) {
  if (process.env.TRAILIE_DEBUG_CONTEXT !== 'true' || !responseData) {
    return responseData;
  }
  return {
    ...responseData,
    debugTrailieContext: summarizeTrailieContext(trailieContext),
  };
}

function formatStructuredContextInjection(trailieContext) {
  return `\n\n--- STRUCTURED_CONTEXT_JSON ---\n${JSON.stringify(trailieContext, null, 2)}\n--- END STRUCTURED_CONTEXT_JSON ---\n`;
}

module.exports = {
  SCHEMA_VERSION,
  createFactSlotMeta,
  assignSlotConfidence,
  buildTrailieContext,
  formatStructuredContextInjection,
  normalizeConstraints,
  normalizeLiveData,
  normalizeFeeFreeMeta,
  isFeeFreeRelevant,
  parseWeatherHighF,
  deriveSeasonalHeatRiskFlags,
  deriveRiskFlags,
  summarizeTrailieContext,
  maybeAttachDebugTrailieContext,
  computeTripStateCompleteness,
};
