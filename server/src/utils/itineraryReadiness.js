/**
 * Decide whether there is enough context to build a structured day-by-day itinerary.
 */

function inferDurationFromText(text) {
  if (!text) return null;
  if (/\blong weekend\b/i.test(text)) return 3;
  if (/\bweekend\b/i.test(text)) return 2;
  if (/\b(one|a)\s+week\b/i.test(text)) return 7;
  if (/\btwo weeks\b/i.test(text)) return 14;
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

/**
 * @param {{
 *   constraints?: object,
 *   metadata?: { parkCode?: string },
 *   allExtractedParks?: Array<{ parkCode?: string }>,
 *   conversationUserText?: string,
 * }} input
 * @returns {{ ready: boolean, missing: string[], inferred: { numDays?: number, groupSize?: number, parkCode?: string } }}
 */
function assessItineraryReadiness({
  constraints = {},
  metadata = {},
  allExtractedParks = [],
  conversationUserText = '',
}) {
  const text = conversationUserText || '';
  const missing = [];

  const parkCode =
    metadata?.parkCode ||
    constraints?.parkCode ||
    allExtractedParks[0]?.parkCode ||
    null;
  const namedDestination =
    parkCode ||
    allExtractedParks.length === 1 ||
    metadata?.intakeParkName ||
    metadata?.parkName;
  const hasDestination = Boolean(namedDestination);

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

  if (!hasDestination) {
    missing.push('which park or destination to plan');
  }
  if (!numDays) {
    missing.push('trip length or travel dates');
  }
  if (!groupSize) {
    missing.push('who is traveling (solo, couple, family, or group size)');
  }

  return {
    ready: missing.length === 0,
    missing,
    inferred: {
      numDays: numDays || undefined,
      groupSize: groupSize || undefined,
      parkCode: parkCode || undefined,
    },
  };
}

function formatItineraryGatheringBlock(missing) {
  const list = missing.length > 0 ? missing.join('; ') : 'key trip details';
  return `
--- DAY-BY-DAY PLAN — GATHER INFO FIRST ---
The user wants a day-by-day itinerary but these details are still missing: ${list}.
Ask 1–2 targeted questions to fill the gaps (not a long questionnaire). Do NOT include [ITINERARY_JSON] until you know destination, trip length/dates, and who is traveling.
If the conversation already answered something above, confirm it briefly instead of re-asking.
--- END GATHER INFO ---
`;
}

function formatDayByDayIntakeBlock({ parkName, missing }) {
  const focus = parkName
    ? `They are leaning toward **${parkName}** from your prior recommendations — confirm or adjust.`
    : 'Confirm which destination from your prior recommendations they want planned.';
  const gaps = missing.length > 0 ? missing.join('; ') : 'dates, trip length, and who is traveling';
  return `
--- DAY-BY-DAY PLAN INTAKE ---
The user clicked "Want a day-by-day plan?" after a discovery/recommendation answer.
${focus}
Still missing: ${gaps}.
Welcome their request warmly, then ask only what you still need (max 2 questions). Do NOT output [ITINERARY_JSON] on this turn.
--- END INTAKE ---
`;
}

module.exports = {
  assessItineraryReadiness,
  formatItineraryGatheringBlock,
  formatDayByDayIntakeBlock,
  inferDurationFromText,
  inferGroupFromText,
};
