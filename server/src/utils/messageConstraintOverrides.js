/**
 * Latest user-message overrides for Quick Fill / formData fields.
 * When the user corrects trip details in chat, these beat stale metadata.formData
 * in parseConstraints() and should mirror client session context.
 */

function normalizeAccommodation(value) {
  if (!value) return null;
  const v = String(value).toLowerCase();
  if (v === 'lodge' || v === 'hotel' || v === 'motel') return 'lodging';
  if (v === 'tent' || v === 'rv' || v === 'backcountry' || v === 'car camping') return 'camping';
  return v;
}

function normalizeFitness(value) {
  if (!value) return null;
  const v = String(value).toLowerCase();
  if (v === 'novice') return 'beginner';
  return v;
}

/**
 * Detect explicit constraint changes in the latest user message.
 * Returns only fields that should override formData / metadata defaults.
 * @param {string} userMessage
 * @returns {Partial<{ groupSize: number, budget: string, fitnessLevel: string, accommodation: string, numDays: number, startDate: string, endDate: string, interests: string[], hasChildren: boolean }>}
 */
function extractMessageConstraintOverrides(userMessage) {
  const msg = userMessage || '';
  if (!msg.trim()) return {};

  const overrides = {};
  const hasCorrectionCue =
    /\b(actually|instead|rather|change|make it|switch|update|now i(?:'ll| will)|remove|no more|without|not anymore)\b/i.test(
      msg
    );

  if (/\b(solo|alone|just me|by myself)\b/i.test(msg)) {
    overrides.groupSize = 1;
  } else if (hasCorrectionCue) {
    const groupMatch = msg.match(/(\d+)\s*(?:people|person|adults?|of us|travelers?)/i);
    if (groupMatch) overrides.groupSize = parseInt(groupMatch[1], 10);
    else if (/\b(couple|partner|two of us)\b/i.test(msg)) overrides.groupSize = 2;
  }

  if (/\b(cheaper|budget[- ]?friendly|low[- ]?budget|save money|tight budget|on a budget)\b/i.test(msg)) {
    overrides.budget = 'budget';
  } else if (/\b(luxury|splurge|high[- ]?end)\b/i.test(msg) && hasCorrectionCue) {
    overrides.budget = 'luxury';
  } else if (/\bmoderate\b/i.test(msg) && hasCorrectionCue) {
    overrides.budget = 'moderate';
  }

  const wantsCamping =
    /\b(camp(ing)? instead|i(?:'ll| will) camp|backcountry|tent camping|car camping)\b/i.test(msg) ||
    (/\b(camping|tent|rv)\b/i.test(msg) && hasCorrectionCue);
  const rejectsLodging =
    /\b(remove|skip|no|without|avoid|drop)\b.*\b(lodge|lodging|hotel|hotels|motel)\b/i.test(msg) ||
    /\b(no more|not)\b.*\b(lodge|lodging|hotel)\b/i.test(msg);

  if (wantsCamping || (rejectsLodging && /\bcamp/i.test(msg))) {
    overrides.accommodation = 'camping';
  } else if (hasCorrectionCue) {
    const accomMatch = msg.match(
      /(camping|tent|rv|car camping|backcountry|lodge|hotel|motel|cabin|glamping|airbnb|lodging)/i
    );
    if (accomMatch) overrides.accommodation = normalizeAccommodation(accomMatch[1]);
  }

  const fitExplicit = msg.match(
    /(?:fitness|difficulty|experience)\s*(?:level|is)?\s*:?\s*(beginner|easy|moderate|intermediate|advanced|hard|strenuous|experienced)/i
  );
  if (fitExplicit && hasCorrectionCue) {
    overrides.fitnessLevel = normalizeFitness(fitExplicit[1]);
  } else if (hasCorrectionCue) {
    const naturalFit = msg.match(
      /\b(beginner|novice|easy|moderate|intermediate|advanced|experienced|expert)\s*(?:hiker|climber|trekker|traveler|level)?\b/i
    );
    if (naturalFit) overrides.fitnessLevel = normalizeFitness(naturalFit[1]);
  }

  if (hasCorrectionCue) {
    const dayMatch = msg.match(/(\d+)\s*[- ]?day/i);
    if (dayMatch) overrides.numDays = parseInt(dayMatch[1], 10);
  }

  if (hasCorrectionCue && /\b(?:kids?|children|toddler|infant|baby|family)\b/i.test(msg)) {
    overrides.hasChildren = true;
  } else if (hasCorrectionCue && /\b(?:no kids?|without kids?|adults? only)\b/i.test(msg)) {
    overrides.hasChildren = false;
  }

  return overrides;
}

/**
 * Merge form-like fields with message overrides (for client session context).
 * @param {Object} formData
 * @param {string} userMessage
 */
function applyMessageConstraintOverrides(formData = {}, userMessage) {
  const overrides = extractMessageConstraintOverrides(userMessage);
  const merged = { ...formData };

  if (overrides.groupSize != null) merged.groupSize = overrides.groupSize;
  if (overrides.budget != null) merged.budget = overrides.budget;
  if (overrides.fitnessLevel != null) merged.fitnessLevel = overrides.fitnessLevel;
  if (overrides.accommodation != null) merged.accommodation = overrides.accommodation;
  if (overrides.numDays != null) {
    merged.numDays = overrides.numDays;
    merged.days = overrides.numDays;
  }
  if (overrides.startDate != null) merged.startDate = overrides.startDate;
  if (overrides.endDate != null) merged.endDate = overrides.endDate;
  if (overrides.interests != null) merged.interests = overrides.interests;
  if (overrides.hasChildren != null) merged.hasChildren = overrides.hasChildren;

  return merged;
}

module.exports = {
  extractMessageConstraintOverrides,
  applyMessageConstraintOverrides,
  normalizeAccommodation,
};
