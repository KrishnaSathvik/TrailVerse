/**
 * Canonical tripState for STRUCTURED_CONTEXT_JSON.
 * Merges layered sources with explicit precedence (lowest → highest):
 * defaults < aiContext < conversationSummary < savedTripPlan < quickFill < currentMessage
 */

const { buildTripScopeFromMessage, applyTripScopeToTripState } = require('./roadTripContract');
const { planningStateToTripStateLayer } = require('./planningState');
const { mapStayPreference } = require('./stayPreferenceMapper');
const { extractTransportConstraints } = require('./travelerStateExtraction');
const {
  normalizeDrivingPolicyFields,
  reconcileTransportationDrivingPolicy,
} = require('./transportConstraintContract');

function emptyTripState() {
  return {
    destination: { parkCode: null, parkName: null, region: null, state: null },
    dates: { startDate: null, endDate: null, season: null, flexible: null },
    durationDays: null,
    travelers: {
      count: null,
      groupType: null,
      kids: null,
      childrenCount: null,
      pets: null,
      accessibilityNeeds: [],
    },
    lodging: { type: null, stayPreference: null, baseTown: null, booked: null },
    transportation: {
      mode: null,
      startLocation: null,
      airport: null,
      departureCity: null,
      departureAirportCode: null,
      rentalCar: null,
      drivingPolicy: null,
      drivingPolicyReason: null,
    },
    preferences: {
      fitness: null,
      interests: [],
      budget: null,
      pace: null,
      riskTolerance: null,
      maxDailyDriveMinutes: null,
      budgetConstraint: null,
    },
    roadTrip: null,
    tripScope: null,
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
    for (const key of ['count', 'groupType', 'kids', 'childrenCount', 'pets']) {
      if (isPresent(source.travelers[key])) target.travelers[key] = source.travelers[key];
    }
    if (source.travelers.kids === false) target.travelers.kids = false;
    if (source.travelers.childrenCount === null && Object.prototype.hasOwnProperty.call(source.travelers, 'childrenCount')) {
      target.travelers.childrenCount = null;
    }
    if (source.travelers.accessibilityNeeds?.length) {
      target.travelers.accessibilityNeeds = [...source.travelers.accessibilityNeeds];
    }
  }

  if (source.lodging) {
    for (const key of ['type', 'stayPreference', 'baseTown', 'booked']) {
      if (isPresent(source.lodging[key])) target.lodging[key] = source.lodging[key];
    }
  }

  if (source.transportation) {
    if (source.transportation.clearMode === true) {
      target.transportation.mode = null;
    }
    // Phase 9C.1F.1 — explicit restoration clears; a layer that is silent
    // about the policy leaves it alone.
    if (source.transportation.clearDrivingPolicy === true) {
      target.transportation.drivingPolicy = null;
      target.transportation.drivingPolicyReason = null;
    }
    if (source.transportation.drivingPolicy === 'prohibited') {
      Object.assign(target.transportation, normalizeDrivingPolicyFields(source.transportation));
    }
    for (const key of [
      'mode',
      'startLocation',
      'airport',
      'departureCity',
      'departureAirportCode',
      'rentalCar',
    ]) {
      if (isPresent(source.transportation[key])) target.transportation[key] = source.transportation[key];
    }
    if (!isPresent(source.transportation.airport)
      && isPresent(source.transportation.departureAirportCode)) {
      target.transportation.airport = source.transportation.departureAirportCode;
    }
    if (!isPresent(source.transportation.departureAirportCode)
      && isPresent(source.transportation.airport)) {
      target.transportation.departureAirportCode = source.transportation.airport;
    }
    reconcileTransportationDrivingPolicy(target.transportation);
  }

  if (source.preferences) {
    for (const key of ['fitness', 'budget', 'pace', 'riskTolerance', 'maxDailyDriveMinutes', 'budgetConstraint']) {
      if (isPresent(source.preferences[key])) target.preferences[key] = source.preferences[key];
    }
    if (source.preferences.budgetConstraint?.cleared) {
      target.preferences.budget = null;
      target.preferences.budgetConstraint = source.preferences.budgetConstraint;
    }
    if (source.preferences.avoidExposure === true || source.preferences.avoidExposure === false) {
      target.preferences.avoidExposure = source.preferences.avoidExposure;
    }
    if (source.preferences.interests?.length) {
      target.preferences.interests = [...source.preferences.interests];
    }
  }

  if (source.tripScope) {
    target.tripScope = source.tripScope;
    target.roadTrip = source.tripScope;
  }
  if (source.roadTrip) {
    target.roadTrip = source.roadTrip;
    target.tripScope = source.roadTrip;
  }

  if (source.previousDecisions?.length) {
    target.previousDecisions = [...source.previousDecisions];
  }

  return target;
}

// Historical name: this is requested plan length, not inclusive calendar span.
function calcDurationDays(startDate, endDate, fallbackDays) {
  return isPresent(fallbackDays) ? Number(fallbackDays) : null;
}

function applyStayPreference(layer, rawAccommodation, messageText = '') {
  if (!rawAccommodation) return;
  const mapped = mapStayPreference({
    rawAccommodation,
    messageText,
    previousStayPreference: layer.lodging.stayPreference,
  });
  layer.lodging.type = mapped.accommodationClass !== 'unknown'
    ? mapped.accommodationClass
    : String(rawAccommodation).toLowerCase();
  if (mapped.stayPreference !== 'unknown') {
    layer.lodging.stayPreference = mapped.stayPreference;
  }
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
  if (accomMatch) applyStayPreference(layer, accomMatch[1] || accomMatch[2], text);

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
  if (formData.childrenCount != null) layer.travelers.childrenCount = formData.childrenCount;
  if (formData.travelParty) layer.travelers.groupType = formData.travelParty;
  applyStayPreference(layer, formData.accommodation || formData.lodging);
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
  if (constraints?.travelParty) layer.travelers.groupType = constraints.travelParty;
  if (constraints?.hasChildren === true) layer.travelers.kids = true;
  if (constraints?.hasChildren === false) layer.travelers.kids = false;
  if (constraints?.childrenCount != null) layer.travelers.childrenCount = constraints.childrenCount;
  if (constraints?.childrenCount === null && constraints?.hasChildren === false) {
    layer.travelers.childrenCount = null;
  }
  if (constraints?.accommodation) {
    applyStayPreference(layer, constraints.accommodation, msg);
  }
  if (constraints?.fitnessLevel) layer.preferences.fitness = constraints.fitnessLevel;
  if (constraints?.budget) layer.preferences.budget = constraints.budget;
  if (constraints?.budgetConstraint) {
    layer.preferences.budgetConstraint = constraints.budgetConstraint;
    if (constraints.budgetConstraint.cleared) layer.preferences.budget = null;
  }
  if (constraints?.interests?.length) layer.preferences.interests = [...constraints.interests];
  if (constraints?.pace) layer.preferences.pace = constraints.pace;
  if (constraints?.avoidExposure === true) layer.preferences.avoidExposure = true;
  if (constraints?.maxDailyDriveMinutes != null) {
    layer.preferences.maxDailyDriveMinutes = constraints.maxDailyDriveMinutes;
  }

  // Prefer precomputed tripScope from parseConstraints; else derive offline.
  const tripScope = constraints?.tripScope || buildTripScopeFromMessage(msg);
  if (tripScope && (tripScope.destinations?.length > 0 || tripScope.type === 'road_trip')) {
    applyTripScopeToTripState(layer, tripScope);
  }

  const seasonMatch = msg.match(/\b(spring|summer|fall|autumn|winter)\b/i);
  if (seasonMatch) layer.dates.season = seasonMatch[1].toLowerCase();

  if (/\b(flexible dates?|date flexible|dates? are flexible)\b/i.test(msg)) {
    layer.dates.flexible = true;
  }

  // Prefer normalized constraints.travelParty over re-inferring from message regex.
  if (!layer.travelers.groupType) {
    if (/\b(solo|alone|just me|by myself)\b/i.test(msg)) {
      layer.travelers.count = layer.travelers.count || 1;
      layer.travelers.groupType = 'solo';
    } else if (/\b(couple|partner|two of us)\b/i.test(msg)) {
      layer.travelers.groupType = 'couple';
    } else if (/\b(family|families)\b/i.test(msg)) {
      layer.travelers.groupType = 'family';
    } else if (/\bfriends\b/i.test(msg)) {
      layer.travelers.groupType = 'friends';
    } else if (/\bgroup of\b/i.test(msg)) {
      layer.travelers.groupType = 'group';
    }
  }

  if (/\b(dog|dogs|pet|pets)\b/i.test(msg)) layer.travelers.pets = true;

  const accessibility = [];
  if (/\b(wheelchair|mobility|ada)\b/i.test(msg)) accessibility.push('mobility');
  if (/\b(stroller|strollers)\b/i.test(msg)) accessibility.push('stroller');
  if (/\b(accessible|accessibility)\b/i.test(msg)) accessibility.push('accessible');
  if (accessibility.length) layer.travelers.accessibilityNeeds = accessibility;

  if (/\b(relaxed|leisurely|slow pace)\b/i.test(msg)) layer.preferences.pace = 'relaxed';
  if (/\b(packed|aggressive|fast pace|see everything)\b/i.test(msg)) layer.preferences.pace = 'packed';

  const preferNotToFly =
    /\bprefer\s+not\s+to\s+fly\b|\b(?:do\s+not|don['’]?t)\s+(?:want|prefer)\s+to\s+fly\b|\bno\s+flights?\b/i.test(msg);
  if (preferNotToFly) {
    layer.transportation.clearMode = true;
  }
  if (!preferNotToFly && /\b(fly|flying|flight|airport)\b/i.test(msg)) {
    layer.transportation.mode = 'fly';
  }
  // Phase 9C.1F.1 — an explicit prohibition in this message outranks the
  // broad drive/rental signals in the SAME message ("no driving" contains
  // "driving"); an explicit restoration clears a persisted prohibition.
  const transportConstraint = extractTransportConstraints(msg);
  if (transportConstraint.drivingPolicy === 'prohibited') {
    layer.transportation.drivingPolicy = transportConstraint.drivingPolicy;
    layer.transportation.drivingPolicyReason = transportConstraint.drivingPolicyReason;
  } else {
    if (transportConstraint.clearDrivingPolicy) layer.transportation.clearDrivingPolicy = true;
    if (/\b(road trip|driving|drive from)\b/i.test(msg)) layer.transportation.mode = 'drive';
    if (/\b(rental car|rent a car)\b/i.test(msg) || transportConstraint.rentalCar === true) {
      layer.transportation.rentalCar = true;
    }
  }

  const airportMatch = msg.match(/\b([A-Z]{3})\s+airport\b/i);
  if (airportMatch) {
    layer.transportation.airport = airportMatch[1].toUpperCase();
    layer.transportation.departureAirportCode = layer.transportation.airport;
  }

  if (userCity?.name) {
    layer.transportation.startLocation = userCity.name;
    layer.transportation.departureCity = userCity.name;
  }

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
 *
 * Pass #5 precedence:
 * defaults < aiContext < legacy savedTrip/formData history < conversationSummary
 * < persisted planningState < Quick Fill formData < latest message/constraints
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
  skipUserContext = false,
}) {
  let state = emptyTripState();

  if (!skipUserContext) {
    mergeInto(state, layerFromAiContext(metadata.aiContext));
    mergeInto(state, layerFromSavedTripPlan(savedTripPlan));
  }
  mergeInto(state, conversationSummary);

  // Persisted normalized planningState beats conversation re-extraction.
  const planningRaw =
    resolvedMetadata?.planningState
    || metadata?.planningState
    || savedTripPlan?.planningState
    || constraints?.planningState
    || null;
  if (planningRaw) {
    const layer = planningStateToTripStateLayer(planningRaw);
    if (layer) mergeInto(state, layer);
  }

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

  // Authoritative temporal projection can intentionally contain nulls.
  // A conversation summary (including assistant prose) must not resurrect them.
  if (constraints?.dates) {
    state.dates.startDate = constraints.dates.start || null;
    state.dates.endDate = constraints.dates.end || null;
    state.tripWindowDays = constraints.dates.tripWindowDays ?? null;
    if (constraints.dates.numDays != null) state.durationDays = constraints.dates.numDays;
    state.planDayCalendarBindings = constraints.planningState?.planDayCalendarBindings || [];
  }
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
