/**
 * Canonical tripState for STRUCTURED_CONTEXT_JSON.
 * Merges layered sources with explicit precedence (lowest → highest):
 * defaults < aiContext < conversationSummary < savedTripPlan < quickFill < currentMessage
 */

function emptyTripState() {
  return {
    destination: { parkCode: null, parkName: null, region: null, state: null },
    dates: { startDate: null, endDate: null, season: null, flexible: null },
    durationDays: null,
    travelers: {
      count: null,
      groupType: null,
      kids: null,
      pets: null,
      accessibilityNeeds: [],
    },
    lodging: { type: null, baseTown: null, booked: null },
    transportation: { mode: null, startLocation: null, airport: null, rentalCar: null },
    preferences: {
      fitness: null,
      interests: [],
      budget: null,
      pace: null,
      riskTolerance: null,
    },
    previousDecisions: [],
    openQuestions: [],
  };
}

function isPresent(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function mergeInto(target, source) {
  if (!source) return target;

  if (source.destination) {
    for (const key of ['parkCode', 'parkName', 'region', 'state']) {
      if (isPresent(source.destination[key])) target.destination[key] = source.destination[key];
    }
  }

  if (source.dates) {
    for (const key of ['startDate', 'endDate', 'season', 'flexible']) {
      if (isPresent(source.dates[key])) target.dates[key] = source.dates[key];
    }
  }

  if (isPresent(source.durationDays)) target.durationDays = source.durationDays;

  if (source.travelers) {
    for (const key of ['count', 'groupType', 'kids', 'pets']) {
      if (isPresent(source.travelers[key])) target.travelers[key] = source.travelers[key];
    }
    if (source.travelers.accessibilityNeeds?.length) {
      target.travelers.accessibilityNeeds = [...source.travelers.accessibilityNeeds];
    }
  }

  if (source.lodging) {
    for (const key of ['type', 'baseTown', 'booked']) {
      if (isPresent(source.lodging[key])) target.lodging[key] = source.lodging[key];
    }
  }

  if (source.transportation) {
    for (const key of ['mode', 'startLocation', 'airport', 'rentalCar']) {
      if (isPresent(source.transportation[key])) target.transportation[key] = source.transportation[key];
    }
  }

  if (source.preferences) {
    for (const key of ['fitness', 'budget', 'pace', 'riskTolerance']) {
      if (isPresent(source.preferences[key])) target.preferences[key] = source.preferences[key];
    }
    if (source.preferences.interests?.length) {
      target.preferences.interests = [...source.preferences.interests];
    }
  }

  if (source.previousDecisions?.length) {
    target.previousDecisions = [...source.previousDecisions];
  }

  return target;
}

function calcDurationDays(startDate, endDate, fallbackDays) {
  if (isPresent(fallbackDays)) return Number(fallbackDays);
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
    }
  }
  return null;
}

function parseSummaryText(text) {
  if (!text || !text.trim()) return null;

  const layer = emptyTripState();

  const parkMatch = text.match(
    /(?:Park:\s*([^\n]+))|(?:going to|visiting|trip to|plan for|heading to|explore)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+National\s+Park)?)/
  );
  const parkName = parkMatch?.[1]?.trim() || parkMatch?.[2]?.trim();
  if (parkName) layer.destination.parkName = parkName;

  const dateMatch = text.match(/(?:Dates:\s*([^\n]+))|(?:from|between|starting|arriving|dates?:?\s*)(\w+ \d{1,2}(?:\s*[-–to]+\s*\w+ \d{1,2})?(?:,?\s*\d{4})?)/i);
  const dateText = dateMatch?.[1]?.trim() || dateMatch?.[2]?.trim();
  if (dateText) {
    layer.dates.startDate = dateText;
    const dayMatch = dateText.match(/(\d+)\s*(?:day|night)/i);
    if (dayMatch) layer.durationDays = parseInt(dayMatch[1], 10);
  }

  const groupMatch = text.match(/(?:Group size:\s*(\d+))|(\d+)\s*(?:people|person|adults?|of us|travelers?|in (?:our|the) group)/i);
  const groupSize = groupMatch?.[1] || groupMatch?.[2];
  if (groupSize) layer.travelers.count = parseInt(groupSize, 10);

  const budgetMatch = text.match(/(?:Budget:\s*\$?([\d,]+(?:\s*[-–to]+\s*\$?[\d,]+)?))|(?:budget|spend|spending|afford)\s*(?:is|of|around|about)?\s*\$?([\d,]+)/i);
  const budget = budgetMatch?.[1] || budgetMatch?.[2];
  if (budget) layer.preferences.budget = budget.replace(/,/g, '');

  const interestPatterns =
    /(hiking|camping|photography|wildlife|stargazing|fishing|kayaking|rock climbing|backpacking|scenic drives?|waterfalls?|sunrise|sunset|family.friendly|kid.friendly|accessible|easy trails?|moderate|challenging|strenuous)/gi;
  const interests = [...new Set((text.match(interestPatterns) || []).map((i) => i.toLowerCase()))];
  if (interests.length) layer.preferences.interests = interests.slice(0, 8);

  const fitnessMatch = text.match(
    /(?:Fitness level:\s*([^\n]+))|(?:fitness|difficulty|experience|skill)\s*(?:level|is)?\s*:?\s*(beginner|easy|moderate|advanced|experienced|hard|strenuous)/i
  );
  if (fitnessMatch) layer.preferences.fitness = (fitnessMatch[1] || fitnessMatch[2]).toLowerCase();

  const accomMatch = text.match(/(?:Accommodation:\s*([^\n]+))|(camping|tent|rv|car camping|backcountry|lodge|hotel|cabin|glamping|airbnb)/i);
  if (accomMatch) layer.lodging.type = (accomMatch[1] || accomMatch[2]).toLowerCase();

  const adjustments = text.match(/User adjustments:\s*([^\n]+)/i);
  if (adjustments?.[1]) {
    layer.previousDecisions = adjustments[1]
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(-3);
  }

  return layer;
}

/**
 * Extract structured facts from older user messages (not the latest turn).
 */
function extractConversationSummaryFromMessages(messages = []) {
  const userMsgs = messages.filter((m) => m.role === 'user');
  const olderText = userMsgs.slice(0, -1).map((m) => m.content).join(' ');
  const systemSummary = messages.find(
    (m) => m.role === 'system' && /\[CONVERSATION CONTEXT/.test(m.content || '')
  );
  const text = [olderText, systemSummary?.content || ''].filter(Boolean).join('\n');
  return parseSummaryText(text);
}

function layerFromAiContext(aiContext) {
  if (!aiContext || typeof aiContext !== 'object') return null;

  const layer = emptyTripState();
  if (aiContext.preferredFitness) layer.preferences.fitness = aiContext.preferredFitness;
  if (aiContext.preferredBudget) layer.preferences.budget = aiContext.preferredBudget;
  if (Array.isArray(aiContext.topInterests) && aiContext.topInterests.length) {
    layer.preferences.interests = [...aiContext.topInterests];
  }

  const recent = Array.isArray(aiContext.recentParks) ? aiContext.recentParks : [];
  const lastRecent = recent[recent.length - 1];
  if (lastRecent?.code) layer.destination.parkCode = lastRecent.code;
  if (lastRecent?.name) layer.destination.parkName = lastRecent.name;

  return layer;
}

function layerFromFormData(formData = {}, metadata = {}) {
  if (!formData || Object.keys(formData).length === 0) return null;

  const layer = emptyTripState();
  layer.destination.parkCode = formData.parkCode || metadata.parkCode || null;
  layer.destination.parkName = metadata.parkName || formData.parkName || null;
  layer.dates.startDate = formData.startDate || formData.dates?.start || null;
  layer.dates.endDate = formData.endDate || formData.dates?.end || null;
  layer.durationDays = calcDurationDays(
    layer.dates.startDate,
    layer.dates.endDate,
    formData.numDays || formData.days
  );
  layer.travelers.count = formData.groupSize || formData.travelers || null;
  layer.travelers.kids = formData.hasChildren || formData.children || null;
  layer.lodging.type = formData.accommodation || formData.lodging || null;
  layer.preferences.fitness = formData.fitnessLevel || formData.fitness || formData.difficulty || null;
  layer.preferences.budget = formData.budget || null;
  layer.preferences.interests = Array.isArray(formData.interests)
    ? [...formData.interests]
    : typeof formData.interests === 'string'
      ? formData.interests.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  return layer;
}

function layerFromSavedTripPlan(savedTripPlan) {
  if (!savedTripPlan) return null;

  const layer = layerFromFormData(savedTripPlan.formData || {}, {
    parkCode: savedTripPlan.parkCode,
    parkName: savedTripPlan.parkName,
  });

  if (!layer) {
    const fallback = emptyTripState();
    if (savedTripPlan.parkCode) fallback.destination.parkCode = savedTripPlan.parkCode;
    if (savedTripPlan.parkName) fallback.destination.parkName = savedTripPlan.parkName;
    return fallback;
  }

  if (savedTripPlan.parkCode) layer.destination.parkCode = savedTripPlan.parkCode;
  if (savedTripPlan.parkName) layer.destination.parkName = savedTripPlan.parkName;
  return layer;
}

function layerFromCurrentMessage({
  constraints,
  resolvedMetadata,
  allExtractedParks,
  userCity,
  lastUserMessage,
}) {
  const msg = lastUserMessage || '';
  const park = allExtractedParks?.[0] || {};
  const layer = emptyTripState();

  layer.destination.parkCode =
    resolvedMetadata?.parkCode || park.parkCode || constraints?.parkCode || null;
  layer.destination.parkName = resolvedMetadata?.parkName || park.parkName || null;

  if (constraints?.dates?.start) layer.dates.startDate = constraints.dates.start;
  if (constraints?.dates?.end) layer.dates.endDate = constraints.dates.end;
  layer.durationDays = calcDurationDays(
    layer.dates.startDate,
    layer.dates.endDate,
    constraints?.dates?.numDays
  );

  if (constraints?.groupSize) layer.travelers.count = constraints.groupSize;
  if (constraints?.hasChildren) layer.travelers.kids = true;
  if (constraints?.accommodation) layer.lodging.type = constraints.accommodation;
  if (constraints?.fitnessLevel) layer.preferences.fitness = constraints.fitnessLevel;
  if (constraints?.budget) layer.preferences.budget = constraints.budget;
  if (constraints?.interests?.length) layer.preferences.interests = [...constraints.interests];

  const seasonMatch = msg.match(/\b(spring|summer|fall|autumn|winter)\b/i);
  if (seasonMatch) layer.dates.season = seasonMatch[1].toLowerCase();

  if (/\b(flexible dates?|date flexible|dates? are flexible)\b/i.test(msg)) {
    layer.dates.flexible = true;
  }

  if (/\b(solo|alone|just me|by myself)\b/i.test(msg)) {
    layer.travelers.count = 1;
    layer.travelers.groupType = 'solo';
  } else if (/\b(couple|partner|two of us)\b/i.test(msg)) {
    layer.travelers.groupType = 'couple';
  } else if (/\b(family|families)\b/i.test(msg)) {
    layer.travelers.groupType = 'family';
  }

  if (/\b(dog|dogs|pet|pets)\b/i.test(msg)) layer.travelers.pets = true;

  const accessibility = [];
  if (/\b(wheelchair|mobility|ada)\b/i.test(msg)) accessibility.push('mobility');
  if (/\b(stroller|strollers)\b/i.test(msg)) accessibility.push('stroller');
  if (/\b(accessible|accessibility)\b/i.test(msg)) accessibility.push('accessible');
  if (accessibility.length) layer.travelers.accessibilityNeeds = accessibility;

  if (/\b(relaxed|leisurely|slow pace)\b/i.test(msg)) layer.preferences.pace = 'relaxed';
  if (/\b(packed|aggressive|fast pace|see everything)\b/i.test(msg)) layer.preferences.pace = 'packed';

  if (/\b(fly|flying|flight|airport)\b/i.test(msg)) layer.transportation.mode = 'fly';
  if (/\b(road trip|driving|drive from)\b/i.test(msg)) layer.transportation.mode = 'drive';
  if (/\b(rental car|rent a car)\b/i.test(msg)) layer.transportation.rentalCar = true;

  const airportMatch = msg.match(/\b([A-Z]{3})\s+airport\b/i);
  if (airportMatch) layer.transportation.airport = airportMatch[1].toUpperCase();

  if (userCity?.name) layer.transportation.startLocation = userCity.name;

  return layer;
}

function deriveOpenQuestions(tripState) {
  const questions = [];
  if (!tripState.destination.parkCode && !tripState.destination.parkName) {
    questions.push('destination');
  }
  if (!tripState.dates.startDate && !tripState.durationDays && !tripState.dates.season) {
    questions.push('dates_or_duration');
  }
  if (!tripState.travelers.count) questions.push('group_size');
  if (!tripState.preferences.fitness) questions.push('fitness_level');
  if (!tripState.lodging.type) questions.push('lodging_preference');
  return questions;
}

function computeTripStateCompleteness(tripState) {
  const checks = [
    !!(tripState.destination.parkCode || tripState.destination.parkName),
    !!(tripState.dates.startDate || tripState.durationDays || tripState.dates.season),
    !!tripState.travelers.count,
    !!tripState.preferences.fitness,
    !!tripState.lodging.type,
    !!tripState.preferences.budget,
    tripState.preferences.interests.length > 0,
    !!tripState.transportation.startLocation,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100) / 100;
}

/**
 * Build canonical tripState from layered sources (lowest → highest priority).
 */
function buildTripState({
  metadata = {},
  constraints,
  resolvedMetadata,
  allExtractedParks,
  userCity,
  lastUserMessage,
  conversationSummary,
  savedTripPlan,
}) {
  let state = emptyTripState();

  mergeInto(state, layerFromAiContext(metadata.aiContext));
  mergeInto(state, conversationSummary);
  mergeInto(state, layerFromSavedTripPlan(savedTripPlan));
  mergeInto(state, layerFromFormData(metadata.formData, metadata));
  mergeInto(
    state,
    layerFromCurrentMessage({
      constraints,
      resolvedMetadata,
      allExtractedParks,
      userCity,
      lastUserMessage,
    })
  );

  state.openQuestions = deriveOpenQuestions(state);
  return state;
}

module.exports = {
  emptyTripState,
  buildTripState,
  extractConversationSummaryFromMessages,
  computeTripStateCompleteness,
  mergeInto,
  layerFromAiContext,
  layerFromFormData,
  layerFromSavedTripPlan,
  layerFromCurrentMessage,
  deriveOpenQuestions,
};
