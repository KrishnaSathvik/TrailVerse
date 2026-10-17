/**
 * Latest user-message overrides for Quick Fill / formData fields.
 * When the user corrects trip details in chat, these beat stale metadata.formData
 * in parseConstraints() and should mirror client session context.
 *
 * Pass #1: numeric budget, word group sizes, camping phrases.
 * Pass #2: travelParty, childrenCount, interest add/remove/replace.
 */

const {
  extractGroupSizeFromMessage,
  extractTravelPartySemantics,
  resolveInterestMutation,
  normalizeInterestList,
} = require('./planningInputContract');
const { parseBudgetConstraint, isExplicitBudgetClear } = require('./budgetContract');

function normalizeAccommodation(value) {
  if (!value) return null;
  const v = String(value).toLowerCase();
  if (v === 'lodge' || v === 'hotel' || v === 'motel') return 'lodging';
  if (v === 'tent' || v === 'rv' || v === 'backcountry' || v === 'car camping' || v === 'camp') return 'camping';
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
 * @param {string} userMessage
 * @param {{ interests?: string[] }} [context]
 */
function extractMessageConstraintOverrides(userMessage, context = {}) {
  const msg = userMessage || '';
  if (!msg.trim()) return {};

  const overrides = {};
  const hasCorrectionCue =
    /\b(actually|instead|rather|change|make it|switch|update|now i(?:'ll| will)|remove|no more|without|not anymore|keep it|let'?s|lets|we(?:'ll| will)|we want|add|also like|also want|focus on|more interested|joining)\b/i.test(
      msg
    );

  const party = extractTravelPartySemantics(msg);
  if (party.travelParty) overrides.travelParty = party.travelParty;
  if (party.clearChildren) {
    overrides.hasChildren = false;
    overrides.childrenCount = null;
    overrides.clearChildren = true;
  } else {
    if (party.hasChildren === true) overrides.hasChildren = true;
    if (party.hasChildren === false) overrides.hasChildren = false;
    if (party.childrenCount != null) overrides.childrenCount = party.childrenCount;
  }

  if (/\b(solo|alone|just me|by myself)\b/i.test(msg)) {
    overrides.groupSize = 1;
  } else if (party.groupSize != null && (hasCorrectionCue || party.travelParty)) {
    overrides.groupSize = party.groupSize;
  } else if (hasCorrectionCue) {
    const fromWords = extractGroupSizeFromMessage(msg);
    if (fromWords != null) overrides.groupSize = fromWords;
    else if (/\b(couple|partner|two of us)\b/i.test(msg)) overrides.groupSize = 2;
  }

  // Numeric dollar budgets win over tier words; capture full budgetConstraint (Pass #4).
  if (isExplicitBudgetClear(msg)) {
    overrides.clearBudget = true;
    overrides.budget = null;
  } else {
    const budgetConstraint = parseBudgetConstraint(msg, {});
    if (budgetConstraint.kind === 'numeric' && budgetConstraint.amount != null) {
      if (hasCorrectionCue || /\b(?:under|budget|spend|max|maximum|per\s+person|per\s+day|total|each)\b/i.test(msg)) {
        overrides.budget = String(budgetConstraint.amount);
        overrides.budgetConstraint = budgetConstraint;
      }
    } else if (budgetConstraint.kind === 'tier') {
      overrides.budget = budgetConstraint.qualitativeTier;
      overrides.budgetConstraint = budgetConstraint;
    } else if (/\b(cheaper|budget[- ]?friendly|low[- ]?budget|save money|tight budget|on a budget|keep it cheap)\b/i.test(msg)) {
      overrides.budget = 'budget';
      overrides.budgetConstraint = {
        kind: 'tier',
        amount: null,
        currency: null,
        scope: 'unknown',
        qualitativeTier: 'budget',
        explicit: true,
        derivedTripCeiling: null,
        derivationBasis: 'qualitative_tier_no_numeric_ceiling',
        cleared: false,
      };
    } else if (/\b(luxury|splurge|high[- ]?end)\b/i.test(msg) && hasCorrectionCue) {
      overrides.budget = 'luxury';
    } else if (/\bmoderate\b/i.test(msg) && hasCorrectionCue) {
      overrides.budget = 'moderate';
    }
  }

  const LODGING_TARGET =
    'cabin|hotel|lodge|lodging|motel|airbnb|glamping';
  const CAMPING_TARGET = 'camping|tent|rv|backcountry|car camping|camp';

  // Explicit replacement targets win over leftover source keywords in the same sentence.
  const fromToMatch = msg.match(
    new RegExp(
      `\\b(?:switch|change|replace)\\s+from\\s+[\\w\\s-]{0,40}?\\s+to\\s+(?:a\\s+|an\\s+)?(${LODGING_TARGET}|${CAMPING_TARGET})\\b`,
      'i'
    )
  );
  const switchToMatch = msg.match(
    new RegExp(
      `\\b(?:switch|change)\\s+to\\s+(?:a\\s+|an\\s+)?(${LODGING_TARGET}|${CAMPING_TARGET})\\b`,
      'i'
    )
  );
  const insteadLodgingMatch = msg.match(
    new RegExp(
      `\\b(?:stay\\s+in\\s+(?:a\\s+|an\\s+)?)?(${LODGING_TARGET})\\s+instead\\b`,
      'i'
    )
  );
  const insteadCampingMatch = msg.match(
    /\b(?:go\s+)?(?:camp(?:ing)?|tent|rv)\s+instead\b/i
  );

  if (fromToMatch) {
    overrides.accommodation = normalizeAccommodation(fromToMatch[1]);
  } else if (switchToMatch) {
    overrides.accommodation = normalizeAccommodation(switchToMatch[1]);
  } else if (insteadLodgingMatch) {
    overrides.accommodation = normalizeAccommodation(insteadLodgingMatch[1]);
  } else if (insteadCampingMatch) {
    overrides.accommodation = 'camping';
  } else {
    const wantsCamping =
      /\b(?:let'?s|lets|we(?:'ll| will)|i(?:'ll| will)|we want to)\s+(?:go\s+)?camp(?:ing)?\b/i.test(msg) ||
      /\b(?:backcountry|tent camping|car camping)\b/i.test(msg) ||
      (/\b(camping|camp|tent|rv)\b/i.test(msg) &&
        hasCorrectionCue &&
        !new RegExp(`\\b(?:${LODGING_TARGET})\\b`, 'i').test(msg));

    const rejectsLodging =
      /\b(remove|skip|no|without|avoid|drop)\b.*\b(lodge|lodging|hotel|hotels|motel)\b/i.test(msg) ||
      /\b(no more|not)\b.*\b(lodge|lodging|hotel)\b/i.test(msg);

    const wantsLodging =
      hasCorrectionCue &&
      (/\b(?:let'?s|lets|we(?:'ll| will)|i(?:'ll| will)|we want to)\s+stay in (?:a )?(?:hotel|lodge|cabin|motel|airbnb)\b/i.test(
        msg
      ) ||
        /\bstay in (?:a )?(?:hotel|lodge|cabin|motel|airbnb)\b/i.test(msg) ||
        new RegExp(`\\b(?:actually|rather)\\b[^.]{0,40}\\b(?:${LODGING_TARGET})\\b`, 'i').test(msg));

    if (wantsCamping || (rejectsLodging && /\bcamp/i.test(msg))) {
      overrides.accommodation = 'camping';
    } else if (wantsLodging) {
      const accomMatch = msg.match(
        new RegExp(`\\b(${LODGING_TARGET}|camping|tent|rv|car camping|backcountry)\\b`, 'i')
      );
      if (accomMatch) overrides.accommodation = normalizeAccommodation(accomMatch[1]);
    } else if (hasCorrectionCue) {
      const accomMatch = msg.match(
        /\b(camping|tent|rv|car camping|backcountry|lodge|hotel|motel|cabin|glamping|airbnb|lodging|camp)\b/i
      );
      if (accomMatch) overrides.accommodation = normalizeAccommodation(accomMatch[1]);
    }
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
    const dayMatches = [...msg.matchAll(/(\d+)\s*[- ]?day/gi)];
    if (dayMatches.length) {
      overrides.numDays = parseInt(dayMatches[dayMatches.length - 1][1], 10);
    }
  }

  if (!overrides.clearChildren) {
    if (hasCorrectionCue && /\b(?:kids?|children|toddler|infant|baby|family)\b/i.test(msg) && overrides.hasChildren == null) {
      overrides.hasChildren = true;
    } else if (hasCorrectionCue && /\b(?:no kids?|without kids?|adults? only)\b/i.test(msg)) {
      overrides.hasChildren = false;
      overrides.childrenCount = null;
      overrides.clearChildren = true;
    }
  }

  const existingInterests = normalizeInterestList(context.interests || []);
  const interestMutation = resolveInterestMutation(msg, existingInterests);
  if (interestMutation.interests != null && interestMutation.mode !== 'none') {
    // Only treat as override when mutation is explicit (add/remove/replace) or
    // when seeding and caller had no interests (handled in parseConstraints).
    if (interestMutation.mode === 'add' || interestMutation.mode === 'remove' || interestMutation.mode === 'replace') {
      overrides.interests = interestMutation.interests;
      overrides.interestMutationMode = interestMutation.mode;
    }
  }

  return overrides;
}

/**
 * Merge form-like fields with message overrides (for client session context).
 */
function applyMessageConstraintOverrides(formData = {}, userMessage) {
  const overrides = extractMessageConstraintOverrides(userMessage, {
    interests: formData.interests,
  });
  const merged = { ...formData };

  if (overrides.groupSize != null) merged.groupSize = overrides.groupSize;
  if (overrides.budget != null) merged.budget = overrides.budget;
  if (overrides.clearBudget) {
    merged.budget = null;
    merged.budgetConstraint = overrides.budgetConstraint || {
      kind: null,
      amount: null,
      currency: null,
      scope: 'unknown',
      qualitativeTier: null,
      explicit: true,
      cleared: true,
      derivedTripCeiling: null,
      derivationBasis: 'explicit_budget_cleared',
    };
  } else if (overrides.budgetConstraint) {
    merged.budgetConstraint = overrides.budgetConstraint;
  }
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
  if (overrides.travelParty != null) merged.travelParty = overrides.travelParty;
  if (overrides.clearChildren) {
    merged.hasChildren = false;
    merged.childrenCount = null;
  } else if (overrides.childrenCount != null) {
    merged.childrenCount = overrides.childrenCount;
  }

  return merged;
}

module.exports = {
  extractMessageConstraintOverrides,
  applyMessageConstraintOverrides,
  normalizeAccommodation,
};
