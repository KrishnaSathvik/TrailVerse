/**
 * Decide whether there is enough context to commit a structured day-by-day
 * itinerary. Missing optional fields must not block a useful plan when they
 * would not materially change the committed result.
 */

const { resolveTurnSufficiencyDecision, DECISIONS } = require('./turnSufficiencyDecision');

function inferDurationFromText(text) {
  if (!text) return null;
  if (/\blong weekend\b/i.test(text)) return 3;
  if (/\bweekend\b/i.test(text)) return 2;
  if (/\b(one|a)\s+week\b/i.test(text)) return 7;
  if (/\btwo weeks\b/i.test(text)) return 14;
  const hyphenDayMatch = text.match(/\b(\d+)\s*[-–]\s*day\b/i);
  if (hyphenDayMatch) return parseInt(hyphenDayMatch[1], 10);
  const dayMatch = text.match(/(\d+)\s*(?:day|night)s?\b/i);
  if (dayMatch) return parseInt(dayMatch[1], 10);
  return null;
}

function inferGroupFromText(text) {
  if (!text) return null;
  if (/\b(solo|alone|just me|by myself)\b/i.test(text)) return 1;
  if (/\b(couple|two of us|with my (wife|husband|partner|girlfriend|boyfriend))\b/i.test(text)) return 2;
  if (/\b(family|with kids?|children)\b/i.test(text)) return 4;
  const groupMatch = text.match(/(\d+)\s*(?:people|person|adults?|of us|travelers?)/i);
  if (groupMatch) return parseInt(groupMatch[1], 10);
  return null;
}

function inferNamedDestinationFromText(text) {
  if (!text) return null;
  // Generic titled place patterns only — never a hardcoded destination list.
  if (/\bstate park\b/i.test(text)) {
    const match = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+State Park)\b/);
    if (match) return match[1];
  }
  return null;
}

/**
 * @param {{
 *   constraints?: object,
 *   metadata?: { parkCode?: string, parkName?: string, resolvedPlaceName?: string, skipUserContext?: boolean },
 *   allExtractedParks?: Array<{ parkCode?: string, parkName?: string }>,
 *   conversationUserText?: string,
 *   skipUserContext?: boolean,
 *   assumeDefaults?: boolean,
 *   askedToProduceTripArtifact?: boolean,
 *   priorPlan?: object,
 * }} input
 * @returns {{ ready: boolean, missing: string[], inferred: object, decision: string, materialMissingInformation: Array, clarificationNeeded: boolean }}
 */
function assessItineraryReadiness({
  constraints = {},
  metadata = {},
  allExtractedParks = [],
  conversationUserText = '',
  skipUserContext = false,
  assumeDefaults = false,
  askedToProduceTripArtifact = false,
  priorPlan = null,
} = {}) {
  const text = conversationUserText || '';
  const useAssumptions = assumeDefaults || skipUserContext || metadata.skipUserContext === true;

  const activeDest =
    metadata?.activeTripContext?.lockedPlanDestination ||
    metadata?.activeTripContext?.primaryDestination ||
    metadata?.activeTripContext?.recommendedOption ||
    null;

  const parkCode =
    metadata?.parkCode ||
    constraints?.parkCode ||
    allExtractedParks[0]?.parkCode ||
    activeDest?.parkCode ||
    null;
  const namedPlace =
    inferNamedDestinationFromText(text) ||
    metadata?.resolvedPlaceName ||
    metadata?.parkName ||
    allExtractedParks[0]?.parkName ||
    activeDest?.name ||
    null;
  const namedDestination =
    parkCode ||
    allExtractedParks.length >= 1 ||
    metadata?.intakeParkName ||
    namedPlace;

  let numDays = constraints?.dates?.numDays || null;
  if (!numDays && constraints?.dates?.start) {
    numDays = 1;
  }
  if (!numDays) {
    numDays = inferDurationFromText(text);
  }

  let groupSize = constraints?.groupSize || null;
  if (!groupSize && constraints?.hasChildren) {
    groupSize = inferGroupFromText(text) || 4;
  }
  if (!groupSize) {
    groupSize = inferGroupFromText(text);
  }
  if (!numDays && useAssumptions && namedDestination) {
    numDays = inferDurationFromText(text) || 2;
  }
  if (!groupSize && useAssumptions && namedDestination) {
    groupSize = 2;
  }

  const sufficiency = resolveTurnSufficiencyDecision({
    userText: text,
    constraints: {
      ...constraints,
      dates: { ...(constraints.dates || {}), numDays: numDays || constraints?.dates?.numDays },
      groupSize: groupSize || constraints.groupSize,
      parkCode,
    },
    metadata: {
      ...metadata,
      parkCode,
      parkName: namedPlace || metadata.parkName,
      resolvedPlaceName: metadata.resolvedPlaceName || namedPlace,
    },
    allExtractedParks,
    destinations: allExtractedParks,
    askedToProduceTripArtifact,
    priorPlan,
    requestedArtifact: 'itinerary',
  });

  const materialMissing = sufficiency.materialMissingInformation || [];
  const missing = materialMissing.map((gap) => {
    if (gap.concept === 'destination') return 'which park or destination to plan';
    if (gap.concept === 'trip_length') return 'trip length or travel dates';
    return gap.concept;
  });

  // Assumptions / skipUserContext may fill material gaps for starter plans.
  const ready = useAssumptions
    ? Boolean(namedDestination) && (Boolean(numDays) || missing.every((m) => !/destination/i.test(m)))
    : sufficiency.decision === DECISIONS.PLAN_NOW
      || sufficiency.decision === DECISIONS.SKETCH_NOW
      || (Boolean(namedDestination) && Boolean(numDays) && missing.length === 0);

  return {
    ready,
    missing,
    inferred: {
      numDays: numDays || undefined,
      groupSize: groupSize || undefined,
      parkCode: parkCode || undefined,
    },
    decision: sufficiency.decision,
    materialMissingInformation: materialMissing,
    clarificationNeeded: !ready && sufficiency.clarificationNeeded === true && !useAssumptions,
  };
}

function formatItineraryGatheringBlock(missing, { assumeDefaults = false } = {}) {
  const list = missing.length > 0 ? missing.join('; ') : 'key trip details';
  if (assumeDefaults) {
    return `
--- DAY-BY-DAY PLAN — REASONABLE ASSUMPTIONS OK ---
The user wants a day-by-day itinerary. Missing: ${list}.
Assume reasonable defaults only where they do not invent geography, and state assumptions briefly.
Deliver a starter plan via create_itinerary or [ITINERARY_JSON] — do NOT respond with intake questions only.
--- END ASSUMPTIONS ---
`;
  }
  return `
--- DAY-BY-DAY PLAN — GATHER INFO FIRST ---
The user wants a day-by-day itinerary but these details still materially change the plan: ${list}.
Ask one focused question (or one tightly related pair). Do NOT dump an intake form. Do NOT include [ITINERARY_JSON] until the material gap is resolved.
If the conversation already answered something above, confirm briefly instead of re-asking.
--- END GATHER INFO ---
`;
}

function formatDayByDayIntakeBlock({ parkName, missing }) {
  const focus = parkName
    ? `They are leaning toward **${parkName}** from your prior recommendations — confirm or adjust.`
    : 'Confirm which destination from your prior recommendations they want planned.';
  const gaps = missing.length > 0 ? missing.join('; ') : 'the one detail that would change the committed plan';
  return `
--- DAY-BY-DAY PLAN INTAKE ---
The user clicked "Want a day-by-day plan?" after a discovery/recommendation answer.
${focus}
Still material: ${gaps}.
Ask only what still changes the plan (max one focused question, or one tightly related pair). Do NOT output [ITINERARY_JSON] on this turn.
--- END INTAKE ---
`;
}

module.exports = {
  assessItineraryReadiness,
  formatItineraryGatheringBlock,
  formatDayByDayIntakeBlock,
  inferDurationFromText,
  inferGroupFromText,
  inferNamedDestinationFromText,
};
