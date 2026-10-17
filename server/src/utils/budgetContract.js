'use strict';

/**
 * Planning Readiness Pass #4 — normalized budget + cost assessment.
 * Offline, provider-neutral. Never invents prices to fake compliance.
 */

const { extractNumericBudget, normalizeBudgetDigits } = require('./planningInputContract');

const BUDGET_SCOPES = Object.freeze([
  'trip_total',
  'per_person_total',
  'per_day_total',
  'per_person_per_day',
  'unknown',
]);

const COST_CATEGORIES = Object.freeze([
  'entrance_fee',
  'permit',
  'campground',
  'lodging',
  'transport',
  'fuel',
  'activity',
  'food',
  'parking',
  'other',
]);

const MAJOR_COST_CATEGORIES = Object.freeze([
  'entrance_fee',
  'permit',
  'campground',
  'lodging',
  'fuel',
  'food',
  'activity',
  'parking',
  'transport',
]);

function emptyBudgetConstraint() {
  return {
    kind: null,
    amount: null,
    currency: null,
    scope: 'unknown',
    qualitativeTier: null,
    explicit: false,
    derivedTripCeiling: null,
    derivationBasis: null,
    cleared: false,
  };
}

function detectBudgetScope(message, { hasAmount = false } = {}) {
  const text = String(message || '');
  if (/\bper\s+person\s+per\s+day\b|\beach\s+(?:per\s+)?day\b|\/\s*person\s*\/\s*day\b/i.test(text)) {
    return 'per_person_per_day';
  }
  if (/\bper\s+person\b|\beach\b|\/\s*person\b|\bpp\b/i.test(text) && hasAmount) {
    // "$300 each" / "per person" — not "per day" already matched
    if (!/\bper\s+day\b|\/\s*day\b/i.test(text)) return 'per_person_total';
  }
  if (/\bper\s+day\b|\/\s*day\b|\ba\s+day\b/i.test(text) && hasAmount) {
    return 'per_day_total';
  }
  if (/\b(?:total|whole\s+trip|entire\s+trip|for\s+the\s+(?:whole|entire)\s+trip|trip\s+total)\b/i.test(text)) {
    return 'trip_total';
  }
  // Documented product default: bare "$600" / "under $600" / "budget of $800" → trip_total
  if (hasAmount) return 'trip_total';
  return 'unknown';
}

function detectQualitativeTier(message) {
  const text = String(message || '');
  if (/\b(?:forget|remove|clear|drop|no)\b[^.]{0,40}\bbudget\b|\bwe(?:'re| are)\s+flexible\b.*\bbudget\b|\bbudget[^.]{0,20}\bflexible\b/i.test(text)) {
    return null;
  }
  if (
    /\b(?:cheap(?:er)?|budget[- ]?friendly|low[- ]?budget|tight\s+budget|on\s+a\s+budget|keep\s+it\s+cheap)\b/i.test(text)
  ) {
    return 'budget';
  }
  if (/\b(?:luxury|splurge|high[- ]?end)\b/i.test(text) && /\b(?:budget|lodg|stay|hotel|trip|spend)\b/i.test(text)) {
    return 'luxury';
  }
  if (/\bmoderate\s+budget\b|\bbudget\s*(?:is|:)?\s*moderate\b/i.test(text)) {
    return 'moderate';
  }
  return null;
}

function isExplicitBudgetClear(message) {
  return /\b(?:forget|drop|remove|clear|ignore|no)\b[^.]{0,40}\bbudget\b|\bbudget[^.]{0,30}\b(?:flexible|doesn'?t matter|no longer|not important)\b|\bwe(?:'re| are)\s+flexible\b[^.]{0,20}\bbudget\b/i.test(
    String(message || '')
  );
}

/**
 * Parse normalized budgetConstraint from message + optional legacy budget value.
 */
function parseBudgetConstraint(message, {
  legacyBudget = null,
  groupSize = null,
  tripDays = null,
  previous = null,
} = {}) {
  const text = String(message || '');

  if (isExplicitBudgetClear(text)) {
    return {
      ...emptyBudgetConstraint(),
      cleared: true,
      explicit: true,
      derivationBasis: 'explicit_budget_cleared',
    };
  }

  const tier = detectQualitativeTier(text);
  let amount = extractNumericBudget(text);
  if (amount == null && legacyBudget != null && /^\d+(\.\d+)?$/.test(String(legacyBudget).trim())) {
    amount = normalizeBudgetDigits(legacyBudget);
  }

  // Bare "$500" / "$150/day" when budget-scope language is present.
  if (amount == null) {
    const bare = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (
      bare &&
      /\b(?:budget|under|total|per\s+person|per\s+day|each|spend|cost)|\/\s*day\b|\/\s*person\b/i.test(text)
    ) {
      amount = normalizeBudgetDigits(bare[1]);
    }
  }

  if (amount != null) amount = Number(amount);

  let scope = 'unknown';
  let kind = null;
  let qualitativeTier = null;
  let currency = null;
  let explicit = false;

  if (amount != null) {
    kind = 'numeric';
    currency = 'USD';
    scope = detectBudgetScope(text, { hasAmount: true });
    explicit = true;
  } else if (tier) {
    kind = 'tier';
    qualitativeTier = tier;
    scope = 'unknown';
    explicit = true;
  } else if (legacyBudget != null && ['budget', 'moderate', 'luxury'].includes(String(legacyBudget).toLowerCase())) {
    kind = 'tier';
    qualitativeTier = String(legacyBudget).toLowerCase();
    explicit = true;
  } else if (previous && !previous.cleared) {
    // Follow-up omitted budget — preserve prior constraint (Pass #4 PART 4).
    return deriveTripCeiling(previous, { groupSize, tripDays });
  }

  const constraint = {
    ...emptyBudgetConstraint(),
    kind,
    amount,
    currency,
    scope,
    qualitativeTier,
    explicit,
    cleared: false,
  };

  return deriveTripCeiling(constraint, { groupSize, tripDays });
}

/**
 * Derive effective trip-total ceiling from scope + party/days.
 * Does NOT invent groupSize or tripDays.
 */
function deriveTripCeiling(constraint, { groupSize = null, tripDays = null } = {}) {
  if (!constraint || constraint.cleared || constraint.kind !== 'numeric' || constraint.amount == null) {
    return {
      ...(constraint || emptyBudgetConstraint()),
      derivedTripCeiling: null,
      derivationBasis: constraint?.kind === 'tier'
        ? 'qualitative_tier_no_numeric_ceiling'
        : constraint?.cleared
          ? 'budget_cleared'
          : 'no_numeric_budget',
    };
  }

  const amount = Number(constraint.amount);
  const people = groupSize != null && Number.isFinite(Number(groupSize)) ? Number(groupSize) : null;
  const days = tripDays != null && Number.isFinite(Number(tripDays)) ? Number(tripDays) : null;
  const scope = constraint.scope || 'unknown';

  let ceiling = null;
  let basis = null;

  switch (scope) {
    case 'trip_total':
      ceiling = amount;
      basis = 'trip_total';
      break;
    case 'per_person_total':
      if (people == null) {
        basis = 'per_person_total_missing_group_size';
      } else {
        ceiling = amount * people;
        basis = `per_person_total×${people}`;
      }
      break;
    case 'per_day_total':
      if (days == null) {
        basis = 'per_day_total_missing_trip_days';
      } else {
        ceiling = amount * days;
        basis = `per_day_total×${days}`;
      }
      break;
    case 'per_person_per_day':
      if (people == null || days == null) {
        basis = people == null && days == null
          ? 'per_person_per_day_missing_group_size_and_trip_days'
          : people == null
            ? 'per_person_per_day_missing_group_size'
            : 'per_person_per_day_missing_trip_days';
      } else {
        ceiling = amount * people * days;
        basis = `per_person_per_day×${people}×${days}`;
      }
      break;
    default:
      basis = 'budget_scope_unresolved';
      break;
  }

  return {
    ...constraint,
    derivedTripCeiling: ceiling,
    derivationBasis: basis,
  };
}

function createCostComponent({
  category,
  label = null,
  amountMin = null,
  amountMax = null,
  currency = 'USD',
  status = 'unknown',
  basis = 'unavailable',
  sourceEvidenceIds = [],
  appliesTo = 'trip',
  quantity = null,
  entityId = null,
  alternatives = null,
} = {}) {
  if (!COST_CATEGORIES.includes(category)) {
    throw new TypeError(`Unknown cost category: ${category}`);
  }
  return {
    category,
    label: label || category,
    amountMin: amountMin == null ? null : Number(amountMin),
    amountMax: amountMax == null ? (amountMin == null ? null : Number(amountMin)) : Number(amountMax),
    currency,
    status,
    basis,
    sourceEvidenceIds: Array.isArray(sourceEvidenceIds) ? [...sourceEvidenceIds] : [],
    appliesTo,
    quantity: quantity == null ? null : Number(quantity),
    entityId: entityId || null,
    alternatives: Array.isArray(alternatives) ? alternatives : null,
  };
}

/**
 * Scale a cost component by quantity / applicability.
 * Per-vehicle fees are NOT multiplied by groupSize.
 */
function resolveComponentTripAmount(component, { groupSize = null, nights = null } = {}) {
  if (!component || component.status === 'unknown') {
    return { min: null, max: null, reason: 'unknown' };
  }
  if (component.alternatives?.length) {
    // Represent alternatives — do not sum mutually exclusive fees.
    return { min: null, max: null, reason: 'alternatives_not_summed', alternatives: component.alternatives };
  }

  let unitMin = component.amountMin;
  let unitMax = component.amountMax ?? component.amountMin;
  if (unitMin == null) return { min: null, max: null, reason: 'no_amount' };

  let qty = component.quantity != null ? Number(component.quantity) : 1;
  const applies = component.appliesTo;

  if (applies === 'person') {
    if (groupSize == null) return { min: null, max: null, reason: 'missing_group_size_for_per_person' };
    qty = groupSize;
  } else if (applies === 'vehicle') {
    qty = component.quantity != null ? Number(component.quantity) : 1;
  } else if (applies === 'night') {
    const n = nights != null ? nights : component.quantity;
    if (n == null) return { min: null, max: null, reason: 'missing_nights' };
    qty = Number(n);
  } else if (applies === 'day' || applies === 'occurrence') {
    qty = component.quantity != null ? Number(component.quantity) : 1;
  }

  return {
    min: unitMin * qty,
    max: (unitMax == null ? unitMin : unitMax) * qty,
    reason: 'ok',
    quantity: qty,
  };
}

function isTrustedForEnforcement(component) {
  if (!component) return false;
  if (component.status === 'verified') return true;
  if (component.basis === 'user_supplied' || component.basis === 'evidence' || component.basis === 'deterministic_calculation') {
    return component.status !== 'unknown';
  }
  return false;
}

/**
 * Infer which major categories apply for coverage (not every trip needs lodging).
 */
function applicableMajorCategories({
  accommodation = null,
  tripScope = null,
  isDayTrip = false,
  hasRoadTrip = false,
  applicableCategories = null,
} = {}) {
  if (Array.isArray(applicableCategories)) return [...applicableCategories];

  // Conservative defaults: only categories Trailie can often price OR that are
  // clearly implied by accommodation/transport. Food has no authoritative
  // provider — do not force it into every coverage sheet (honest UNKNOWN only
  // when explicitly tracked as a component).
  const cats = new Set(['entrance_fee']);
  const accom = String(accommodation || '').toLowerCase();
  if (!isDayTrip) {
    if (/camp|tent|rv|backcountry/.test(accom)) cats.add('campground');
    else if (/hotel|lodge|cabin|motel|airbnb|glamping|lodging/.test(accom)) cats.add('lodging');
  }
  if (hasRoadTrip || tripScope?.type === 'road_trip' || tripScope?.transportMode === 'drive') {
    cats.add('fuel');
  }
  return [...cats];
}

/**
 * Assess budget against cost components. Conservative verdicts.
 */
function assessBudget({
  budgetConstraint = null,
  components = [],
  accommodation = null,
  tripScope = null,
  groupSize = null,
  tripDays = null,
  nights = null,
  applicableCategories = null,
} = {}) {
  const constraint = budgetConstraint
    ? deriveTripCeiling(budgetConstraint, { groupSize, tripDays })
    : emptyBudgetConstraint();

  const diagnostics = [];
  const unknownCategories = [];
  let knownCostMin = 0;
  let knownCostMax = 0;
  let estimatedCostMin = 0;
  let estimatedCostMax = 0;
  let hasKnown = false;
  let hasEstimated = false;

  const trusted = [];
  const estimated = [];

  for (const raw of components || []) {
    if (raw.alternatives?.length) {
      diagnostics.push({
        code: 'budget_component_alternatives',
        details: `Fee alternatives present for ${raw.label || raw.category}; not summed.`,
        alternatives: raw.alternatives,
      });
      continue;
    }
    const resolved = resolveComponentTripAmount(raw, { groupSize, nights: nights ?? tripDays });
    if (resolved.reason === 'alternatives_not_summed') continue;
    if (resolved.min == null) {
      if (raw.status === 'unknown' || raw.basis === 'unavailable') {
        // tracked via coverage
      } else if (resolved.reason) {
        diagnostics.push({ code: 'budget_component_unresolved', category: raw.category, reason: resolved.reason });
      }
      continue;
    }
    if (isTrustedForEnforcement(raw)) {
      hasKnown = true;
      knownCostMin += resolved.min;
      knownCostMax += resolved.max;
      trusted.push({ ...raw, tripAmountMin: resolved.min, tripAmountMax: resolved.max });
    } else if (raw.status === 'estimated' || raw.basis === 'model_estimate') {
      hasEstimated = true;
      estimatedCostMin += resolved.min;
      estimatedCostMax += resolved.max;
      estimated.push({ ...raw, tripAmountMin: resolved.min, tripAmountMax: resolved.max });
    }
  }

  const applicable = applicableMajorCategories({
    accommodation,
    tripScope,
    isDayTrip: tripDays === 1,
    hasRoadTrip: tripScope?.type === 'road_trip',
    applicableCategories,
  });

  const presentCats = new Set(
    (components || [])
      .filter((c) => c.status !== 'unknown' && c.amountMin != null)
      .map((c) => c.category)
  );
  const unknownPresent = new Set(
    (components || []).filter((c) => c.status === 'unknown' || c.basis === 'unavailable').map((c) => c.category)
  );

  for (const cat of applicable) {
    if (!presentCats.has(cat) || unknownPresent.has(cat)) {
      if (!unknownCategories.includes(cat)) unknownCategories.push(cat);
    }
  }

  // Lodging unknown when hotel selected with no price
  if (/hotel|lodge|cabin|motel|airbnb|lodging/i.test(String(accommodation || ''))) {
    const lodgingKnown = (components || []).some(
      (c) => c.category === 'lodging' && c.status !== 'unknown' && c.amountMin != null
    );
    if (!lodgingKnown && !unknownCategories.includes('lodging')) unknownCategories.push('lodging');
  }
  if (/camp/i.test(String(accommodation || ''))) {
    const campKnown = (components || []).some(
      (c) => c.category === 'campground' && c.status !== 'unknown' && c.amountMin != null
    );
    if (!campKnown && !unknownCategories.includes('campground')) unknownCategories.push('campground');
  }
  if (tripScope?.type === 'road_trip') {
    const fuelKnown = (components || []).some(
      (c) => c.category === 'fuel' && c.status !== 'unknown' && c.amountMin != null
    );
    if (!fuelKnown && !unknownCategories.includes('fuel')) unknownCategories.push('fuel');
  }

  let coverage = 'insufficient';
  const majorUnknown = unknownCategories.filter((c) =>
    ['lodging', 'campground', 'fuel', 'food', 'entrance_fee'].includes(c)
  );
  if (majorUnknown.length === 0 && hasKnown) coverage = 'complete';
  else if (hasKnown) coverage = 'partial';
  else coverage = 'insufficient';

  const ceiling = constraint.derivedTripCeiling;
  let verdict = 'cannot_verify';

  if (constraint.kind === 'tier') {
    verdict = 'cannot_verify';
    diagnostics.push({ code: 'qualitative_tier_only', tier: constraint.qualitativeTier });
  } else if (ceiling == null && constraint.kind === 'numeric') {
    verdict = 'cannot_verify';
    diagnostics.push({
      code: 'budget_scope_unresolved',
      details: constraint.derivationBasis || 'cannot_derive_ceiling',
    });
  } else if (ceiling != null && hasKnown && knownCostMin > ceiling) {
    verdict = 'exceeds_budget';
    diagnostics.push({
      code: 'budget_known_costs_exceed_limit',
      ceiling,
      knownCostMin,
    });
  } else if (ceiling != null && coverage === 'complete' && hasKnown && knownCostMax <= ceiling) {
    // Complete coverage with verified range fully under ceiling
    if (hasEstimated && estimatedCostMax + knownCostMax > ceiling) {
      verdict = 'likely_within_budget';
    } else {
      verdict = 'within_budget';
    }
  } else if (ceiling != null && hasKnown && knownCostMax <= ceiling && coverage !== 'complete') {
    verdict = 'cannot_verify';
    diagnostics.push({
      code: 'budget_coverage_incomplete',
      unknownCategories: [...unknownCategories],
    });
  } else if (ceiling != null && hasKnown && knownCostMin <= ceiling && knownCostMax > ceiling) {
    verdict = 'likely_within_budget';
    diagnostics.push({
      code: 'budget_range_crosses_limit',
      ceiling,
      knownCostMin,
      knownCostMax,
    });
  } else if (ceiling != null && hasEstimated && !hasKnown) {
    if (estimatedCostMax <= ceiling) verdict = 'likely_within_budget';
    else if (estimatedCostMin > ceiling) verdict = 'exceeds_budget';
    else verdict = 'likely_within_budget';
  } else {
    verdict = 'cannot_verify';
  }

  return {
    constraint,
    knownCostMin: hasKnown ? knownCostMin : null,
    knownCostMax: hasKnown ? knownCostMax : null,
    estimatedCostMin: hasEstimated ? estimatedCostMin : null,
    estimatedCostMax: hasEstimated ? estimatedCostMax : null,
    coverage,
    unknownCategories: [...new Set(unknownCategories)],
    verdict,
    diagnostics,
    trustedComponents: trusted,
    estimatedComponents: estimated,
  };
}

/**
 * Parse user-supplied cost mentions (hotel already booked, etc.).
 */
function extractUserSuppliedCosts(message) {
  const text = String(message || '');
  const out = [];

  const moneyNear = (chunk) => {
    const m = String(chunk || '').match(/\$\s*([\d,]+)/);
    return m ? normalizeBudgetDigits(m[1]) : null;
  };

  const hotel = text.match(
    /\b(?:hotel|lodge|lodging|cabin|motel|airbnb)\b[^.!?]{0,80}\b(?:already\s+)?(?:booked|paid|reserved)\b[^.!?]{0,60}/i
  ) || text.match(
    /\b(?:already\s+)?(?:booked|paid|reserved)\b[^.!?]{0,40}\b(?:hotel|lodge|lodging)\b[^.!?]{0,60}/i
  );
  if (hotel) {
    const amountRaw = moneyNear(hotel[0]) || moneyNear(text);
    const amount = amountRaw != null ? Number(amountRaw) : null;
    if (amount != null) {
      out.push(createCostComponent({
        category: 'lodging',
        label: 'User-supplied lodging',
        amountMin: amount,
        amountMax: amount,
        status: 'verified',
        basis: 'user_supplied',
        appliesTo: 'trip',
        quantity: 1,
      }));
    }
  }

  const campsite = text.match(
    /\b(?:campsite|campground|camping)\b[^.!?]{0,60}\b(?:already\s+)?(?:paid|booked)\b[^.!?]{0,60}/i
  );
  if (campsite) {
    const amountRaw = moneyNear(campsite[0]) || moneyNear(text);
    const amount = amountRaw != null ? Number(amountRaw) : null;
    if (amount != null) {
      out.push(createCostComponent({
        category: 'campground',
        label: 'User-supplied camping',
        amountMin: amount,
        amountMax: amount,
        status: 'verified',
        basis: 'user_supplied',
        appliesTo: 'trip',
        quantity: 1,
      }));
    }
  }

  return out;
}

/**
 * Build fee alternatives component (do not sum).
 */
function createFeeAlternatives(alternatives, { entityId = null, label = 'Entrance fee alternatives' } = {}) {
  return createCostComponent({
    category: 'entrance_fee',
    label,
    amountMin: null,
    amountMax: null,
    status: 'verified',
    basis: 'evidence',
    appliesTo: 'occurrence',
    entityId,
    alternatives: alternatives.map((a) => ({
      label: a.label,
      amount: a.amount,
      appliesTo: a.appliesTo || 'occurrence',
    })),
  });
}

/**
 * Validate a free-text budget compliance claim against assessment.
 */
function validateBudgetClaim(claimText, assessment) {
  const text = String(claimText || '');
  const issues = [];
  if (!assessment) return issues;

  const claimsFullTripUnderBudget =
    /\b(?:entire|whole|full)\s+trip\b/i.test(text) ||
    /\b(?:total|trip)\s+(?:comes?\s+in\s+)?(?:under|within)\b/i.test(text) ||
    /\bcomes?\s+in\s+under\b/i.test(text) ||
    /\bstays?\s+under\b/i.test(text) ||
    /\bfits?\s+under\b/i.test(text) ||
    /\bfits?\s+(?:your\s+)?(?:\$\s*\d+\s+)?budget\b/i.test(text) ||
    /\bunder\s+\$\s*\d+/i.test(text) ||
    /\bwithin\s+(?:the\s+)?budget\b/i.test(text);

  if (!claimsFullTripUnderBudget) return issues;
  if (!/\$\s*\d+|\bbudget\b/i.test(text)) return issues;

  if (assessment.verdict !== 'within_budget') {
    issues.push({
      type: 'budget_claim_unsupported',
      severity: 'feasibility',
      reasonCode:
        assessment.verdict === 'exceeds_budget'
          ? 'budget_known_costs_exceed_limit'
          : 'budget_claim_unsupported',
      details:
        assessment.verdict === 'exceeds_budget'
          ? 'Claimed under-budget but known costs already exceed the ceiling.'
          : 'Cannot claim the whole trip is under budget when budgetAssessment does not support verified compliance.',
      verdict: assessment.verdict,
      coverage: assessment.coverage,
      unknownCategories: assessment.unknownCategories || [],
    });
  }

  return issues;
}

/**
 * Repair guidance when candidate prose overclaims budget compliance.
 * Same frozen EvidenceBundle — do not refetch or invent costs.
 */
function buildBudgetClaimRepairInstructions(issues = []) {
  const codes = [...new Set((issues || []).map((i) => i.reasonCode || i.type).filter(Boolean))];
  if (codes.length === 0) return '';
  return [
    `Repair only these validated violations: ${codes.join(', ')}.`,
    'The response claims total budget compliance that is not supported by the current budget assessment.',
    'Remove or qualify that claim. Do not invent missing costs.',
    'Keep the same user constraints and the same frozen EvidenceBundle.',
    'Distinguish verified known fees from unverified lodging/food/fuel categories when coverage is incomplete.',
  ].join('\n');
}

/**
 * Deterministic budget validation issues for itinerary finalize path.
 */
function validateBudgetConstraints(assessment) {
  const issues = [];
  if (!assessment?.constraint?.explicit && assessment?.constraint?.kind == null) return issues;
  if (assessment.constraint?.cleared) return issues;

  for (const d of assessment.diagnostics || []) {
    if (d.code === 'budget_known_costs_exceed_limit') {
      issues.push({
        type: 'budget_known_costs_exceed_limit',
        severity: 'feasibility',
        reasonCode: 'budget_known_costs_exceed_limit',
        details:
          `Known required costs (floor $${d.knownCostMin}) already exceed the traveler's $${d.ceiling} ceiling. ` +
          'Reduce optional paid components or select lower-cost evidence-supported alternatives. Do not modify verified fees.',
        ceiling: d.ceiling,
        knownCostMin: d.knownCostMin,
      });
    }
    if (d.code === 'budget_coverage_incomplete') {
      issues.push({
        type: 'budget_coverage_incomplete',
        severity: 'preference',
        reasonCode: 'budget_coverage_incomplete',
        details:
          `Important cost categories are not fully priced (${(d.unknownCategories || []).join(', ') || 'unknown'}); ` +
          'cannot claim full-trip budget compliance.',
        unknownCategories: d.unknownCategories || [],
      });
    }
    if (d.code === 'budget_scope_unresolved') {
      issues.push({
        type: 'budget_scope_unresolved',
        severity: 'preference',
        reasonCode: 'budget_scope_unresolved',
        details:
          `Budget ceiling cannot be derived (${d.details || assessment.constraint?.derivationBasis}). ` +
          'Do not invent party size or trip days.',
      });
    }
  }

  if (assessment.verdict === 'exceeds_budget' && !issues.some((i) => i.reasonCode === 'budget_known_costs_exceed_limit')) {
    issues.push({
      type: 'budget_known_costs_exceed_limit',
      severity: 'feasibility',
      reasonCode: 'budget_known_costs_exceed_limit',
      details: 'Known supported costs exceed the budget ceiling.',
      ceiling: assessment.constraint?.derivedTripCeiling,
      knownCostMin: assessment.knownCostMin,
    });
  }

  return issues;
}

function legacyBudgetFromConstraint(constraint) {
  if (!constraint || constraint.cleared) return null;
  if (constraint.kind === 'numeric' && constraint.amount != null) return String(constraint.amount);
  if (constraint.kind === 'tier' && constraint.qualitativeTier) return constraint.qualitativeTier;
  return null;
}

function buildBudgetPromptBlock(assessment) {
  if (!assessment?.constraint?.explicit && assessment?.constraint?.kind == null) return '';
  if (assessment.constraint?.cleared) return '';

  const c = assessment.constraint;
  const lines = ['--- BUDGET CONTRACT (MUST RESPECT) ---'];
  if (c.kind === 'numeric') {
    lines.push(`Budget amount: $${c.amount} (${c.scope})`);
    if (c.derivedTripCeiling != null) {
      lines.push(`HARD RULE: Derived trip ceiling = $${c.derivedTripCeiling} (${c.derivationBasis}).`);
    } else {
      lines.push(
        `HARD RULE: Trip ceiling cannot be derived (${c.derivationBasis}). Do not invent party size or days.`
      );
    }
  } else if (c.kind === 'tier') {
    lines.push(`Budget tier: ${c.qualitativeTier} (qualitative — no numeric ceiling).`);
  }

  if (assessment.knownCostMin != null) {
    lines.push(`Known supported costs: $${assessment.knownCostMin}–$${assessment.knownCostMax}`);
  }
  if (assessment.unknownCategories?.length) {
    lines.push(
      `Unknown major categories: ${assessment.unknownCategories.join(', ')}. ` +
      'Do NOT treat unknown as $0. Do NOT invent prices.'
    );
  }
  lines.push(`Budget assessment verdict: ${assessment.verdict} (coverage=${assessment.coverage})`);
  if (assessment.verdict === 'cannot_verify' && c.kind === 'numeric') {
    lines.push(
      'HARD RULE: Full-trip budget compliance is not yet verified. ' +
      'Tell the user that known priced costs were considered, major unpriced categories remain, ' +
      'and therefore you cannot confirm the complete trip stays under the budget. ' +
      'Do NOT invent missing prices. Do NOT claim the whole trip is under budget.'
    );
  }
  lines.push(
    'HARD RULE: Do not say the whole trip fits under the budget unless verdict is within_budget. ' +
    'Distinguish verified costs from estimates. Prefer lower-cost options when restrictive. ' +
    'If known minimum exceeds ceiling, revise the itinerary — never invent cheaper fees.'
  );
  lines.push('--- END BUDGET CONTRACT ---');
  return `\n\n${lines.join('\n')}\n`;
}

module.exports = {
  BUDGET_SCOPES,
  COST_CATEGORIES,
  MAJOR_COST_CATEGORIES,
  emptyBudgetConstraint,
  parseBudgetConstraint,
  deriveTripCeiling,
  createCostComponent,
  createFeeAlternatives,
  resolveComponentTripAmount,
  assessBudget,
  extractUserSuppliedCosts,
  validateBudgetClaim,
  validateBudgetConstraints,
  buildBudgetClaimRepairInstructions,
  legacyBudgetFromConstraint,
  buildBudgetPromptBlock,
  detectBudgetScope,
  isExplicitBudgetClear,
};
