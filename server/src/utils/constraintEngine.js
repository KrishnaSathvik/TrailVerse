/**
 * Constraint Engine — parses user constraints, performs pre-flight checks,
 * builds constraint blocks for AI prompts, and validates itinerary compliance.
 */

const {
  validateDestinationCoverage,
  validateDestinationSequence,
  validateMaxDailyDrive,
  validateRouteLegCoverage,
  validateOvernightDestinationIdentity,
  collectDayDriveMinutes,
  GLOBAL_MAX_ACTIVE_MINUTES,
} = require('./roadTripValidators');
const {
  parseMaxDailyDriveMinutes,
  buildTripScopeFromMessage,
  detectDrivingFeasibilityConstraint,
} = require('./roadTripContract');
const { evaluateRouteLegsAgainstDailyDriveCap } = require('./routeEvidenceDriveBridge');
const { drivingVerificationInstruction } = require('./drivingVerificationCoverage');

// ── Static Data ──────────────────────────────────────────────────────────────

/**
 * Crowd scores by park code × month (0-10, 0 = closed/empty, 10 = peak).
 *
 * Source: NPS Visitor Use Statistics (https://irma.nps.gov/Stats/)
 * Method: Monthly recreation visit counts for each park, normalized to
 *         0-10 scale where 10 = highest-traffic month and 0 = closed or
 *         effectively zero visitation. Parks with seasonal closures
 *         (e.g., Gates of the Arctic, Isle Royale) get 0 for closed months.
 * Data year: 2024 calendar year (published early 2025)
 * Last reviewed: April 2026
 * Next review: January 2027 — pull fresh stats from IRMA and re-normalize
 *
 * Coverage: 60 of the 64 National Parks (Sequoia and Kings Canyon scored
 * separately). Missing: Gateway Arch (urban), Denali, National Park of American
 * Samoa (insufficient data), and Chiricahua (redesignated from a National
 * Monument Oct 20, 2026; not yet scored). Does NOT include Lakeshores,
 * Seashores, Monuments, or Recreation Areas.
 */
const CROWD_SCORES = {
  acad: [0,0,0,1,4,8,10,10,8,7,1,0],
  arch: [2,2,7,8,10,10,9,8,9,7,4,2],
  badl: [0,0,1,1,4,9,10,8,5,2,1,0],
  bibe: [5,5,10,7,5,3,2,2,3,5,7,6],
  bisc: [7,8,10,9,10,8,9,7,7,6,7,8],
  blca: [2,1,2,3,7,9,9,10,9,5,3,1],
  brca: [1,1,3,6,9,10,9,8,10,7,2,1],
  cany: [1,1,6,9,10,8,6,5,8,8,4,2],
  care: [1,1,4,7,10,8,6,5,8,8,3,1],
  cave: [3,4,9,7,7,9,10,6,5,6,5,6],
  chis: [3,5,6,7,7,9,10,9,8,8,7,5],
  cong: [4,5,9,8,10,7,5,4,5,7,7,5],
  crla: [0,0,1,1,2,5,10,7,5,3,1,0],
  cuva: [3,3,5,7,8,9,10,9,8,8,4,3],
  deva: [5,7,10,9,7,5,6,5,6,6,7,7],
  drto: [8,8,9,9,10,10,9,8,7,6,7,8],
  ever: [9,9,10,9,6,6,6,6,4,4,6,8],
  gaar: [0,0,0,0,1,6,9,10,3,0,0,0],
  glac: [0,0,0,1,2,7,10,9,7,2,0,0],
  glba: [0,0,0,0,7,9,10,10,8,3,0,0],
  grca: [3,3,6,8,9,9,10,9,8,8,6,5],
  grte: [1,1,1,1,4,9,10,9,8,3,1,1],
  grba: [1,1,1,3,6,10,9,9,10,7,1,1],
  grsa: [1,1,2,3,7,10,9,7,5,4,1,1],
  grsm: [3,3,6,7,8,9,10,8,8,10,6,5],
  gumo: [3,4,10,8,6,4,4,3,4,7,6,6],
  hale: [7,8,9,9,10,10,10,8,9,9,8,10],
  havo: [9,8,8,7,7,9,10,9,8,8,9,10],
  hosp: [4,6,7,7,7,10,8,7,4,5,5,4],
  indu: [1,2,3,3,5,8,10,8,5,4,2,2],
  isro: [0,0,0,0,2,7,10,10,4,0,0,0],
  jotr: [6,7,10,9,6,4,3,3,4,5,7,8],
  katm: [0,0,0,0,0,3,10,7,4,0,0,0],
  kefj: [0,0,0,0,2,8,10,8,3,0,0,0],
  kica: [2,1,1,3,7,9,10,8,6,4,2,2],
  kova: [5,4,4,4,4,7,8,9,8,10,8,8],
  lacl: [0,0,0,0,1,8,10,9,4,0,0,0],
  lavo: [1,1,1,1,3,7,10,6,6,4,1,1],
  maca: [1,2,6,6,6,8,10,7,6,6,3,2],
  meve: [1,1,2,3,6,10,10,8,7,5,1,1],
  mora: [1,0,1,1,2,5,10,10,6,3,1,1],
  neri: [1,1,3,5,6,8,10,8,6,6,3,2],
  noca: [0,0,0,0,1,4,10,9,8,2,0,0],
  olym: [1,1,2,2,3,5,8,10,6,4,2,1],
  pefo: [3,3,7,7,9,10,9,7,6,8,4,4],
  pinn: [5,7,10,10,10,8,7,6,6,6,7,6],
  redw: [3,3,4,5,8,10,10,9,9,6,4,3],
  romo: [2,1,2,2,4,8,10,8,8,5,2,2],
  sagu: [7,8,10,7,4,3,2,2,3,4,5,6],
  sequ: [2,2,3,4,6,7,10,9,6,5,3,2],
  shen: [1,1,2,4,5,6,6,6,5,10,5,1],
  thro: [0,0,1,1,5,9,10,9,7,3,1,0],
  viis: [8,8,10,9,9,8,8,6,4,5,8,10],
  voya: [1,1,1,0,6,9,10,10,5,2,1,0],
  whsa: [4,4,10,8,7,6,7,5,5,6,5,6],
  wica: [1,1,2,3,5,8,10,8,6,2,1,1],
  wrst: [0,0,0,0,2,7,10,8,3,0,0,0],
  yell: [0,1,0,1,5,9,10,9,8,3,0,0],
  yose: [2,2,3,5,7,9,10,10,9,7,4,3],
  zion: [2,2,6,8,9,10,10,8,8,8,5,3],
};

/** @deprecated Permit data now comes from live RIDB/NPS APIs via factsService.
 *  Kept as empty object for backward compat with any imports. */
const PERMIT_PARKS = {};

/** Difficulty levels ordered from easiest to hardest */
const DIFFICULTY_ORDER = ['easy', 'moderate', 'hard', 'strenuous'];

/** Fitness level → max allowed difficulty */
const FITNESS_TO_MAX_DIFFICULTY = {
  easy: 'easy',
  beginner: 'easy',
  moderate: 'moderate',
  intermediate: 'moderate',
  hard: 'hard',
  advanced: 'hard',
  strenuous: 'strenuous',
  experienced: 'strenuous',
  expert: 'strenuous',
};

const { extractMessageConstraintOverrides } = require('./messageConstraintOverrides');
const {
  extractGroupSizeFromMessage,
  extractNumericBudget,
  extractTravelPartySemantics,
  extractChildrenCount,
  resolveInterestMutation,
  normalizeInterestList,
  normalizeTravelParty,
  userAvoidsTrailExposure,
} = require('./planningInputContract');
const {
  parseBudgetConstraint,
  deriveTripCeiling,
  extractUserSuppliedCosts,
  assessBudget,
  validateBudgetConstraints,
  validateBudgetClaim,
  legacyBudgetFromConstraint,
  buildBudgetPromptBlock,
  isExplicitBudgetClear,
} = require('./budgetContract');
const {
  extractSpokenDuration,
  extractMobilityConstraints,
  extractPartyExtras,
  extractActivityPreferences,
  extractTransportConstraints,
} = require('./travelerStateExtraction');
const { applyTurnConstraintsToRuntime } = require('./canonicalConstraintTranslation');
const { resolvePace } = require('./constraintFamilies');
const {
  normalizePersistedPlanningState,
  planningStateToConstraintSeed,
  applyTripScopeRefinement,
  buildPlanningStateFromRuntime,
} = require('./planningState');

// ── parseConstraints ─────────────────────────────────────────────────────────

/**
 * Extract structured constraints from metadata.formData + user message fallback.
 * Latest explicit user-message corrections override stale Quick Fill formData.
 */
function parseConstraints(metadata, userMessage, { now = new Date(), sourceTurnId = null } = {}) {
  const fd = metadata?.formData || {};
  const msg = userMessage || '';

  // Pass #5 — persisted planningState is structured base (beats conversation history).
  let persisted = null;
  if (metadata?.planningState) {
    const n = normalizePersistedPlanningState(metadata.planningState);
    if (n.ok) persisted = n.state;
  }
  const seed = persisted ? planningStateToConstraintSeed(persisted) : {};

  const pick = (seedVal, formVal) => {
    if (seedVal === null || seedVal === undefined) return formVal;
    if (Array.isArray(seedVal) && seedVal.length === 0) return formVal;
    return seedVal;
  };

  // Park code — from metadata or message
  const parkCode = pick(seed.parkCode, fd.parkCode || metadata?.parkCode || null);

  // Dates
  let startDate = pick(seed.startDate, fd.startDate || fd.dates?.start || null);
  let endDate = pick(seed.endDate, fd.endDate || fd.dates?.end || null);
  let numDays = pick(seed.numDays, fd.numDays || fd.days || null);

  // Explicit day-count in the (latest) message overrides persisted/seed days.
  // Prefer the *last* mention so concatenated conversation text
  // ("5 days… Actually make it 6 days") keeps the refinement.
  const spokenDuration = extractSpokenDuration(msg);
  const hyphenDayMatches = [...msg.matchAll(/\b(\d+)\s*[-–]\s*day\b/gi)];
  const dayMatches = [...msg.matchAll(/(\d+)\s*(?:day|night)/gi)];
  if (hyphenDayMatches.length) {
    numDays = parseInt(hyphenDayMatches[hyphenDayMatches.length - 1][1], 10);
  } else if (dayMatches.length) {
    numDays = parseInt(dayMatches[dayMatches.length - 1][1], 10);
  } else if (spokenDuration.durationDays != null) {
    numDays = spokenDuration.durationDays;
  } else if (!startDate && !numDays && /\bweekend\b/i.test(msg)) {
    numDays = /\blong weekend\b/i.test(msg) ? 3 : 2;
  }

  const temporalResolution = require('./temporalState').resolveTemporalState({
    text: msg, previous: persisted, confirmedDates: { startDate, endDate }, now, sourceTurnId,
  });
  startDate = temporalResolution.dates.startDate;
  endDate = temporalResolution.dates.endDate;
  // A travel window is not a request to resize the canonical itinerary.

  // Group size — digits or one..twelve word numbers
  let groupSize = pick(seed.groupSize, fd.groupSize || fd.travelers || null);
  if (!groupSize) {
    groupSize = extractGroupSizeFromMessage(msg);
  }
  if (!groupSize && /\b(couple|two of us|with my (?:wife|husband|partner|girlfriend|boyfriend))\b/i.test(msg)) {
    groupSize = 2;
  }
  if (!groupSize && /\b(solo|alone|just me|by myself)\b/i.test(msg)) {
    groupSize = 1;
  }

  // Travel party — null when Quick Fill only supplies a count
  let travelParty = normalizeTravelParty(
    pick(seed.travelParty, fd.travelParty || fd.groupType || null)
  );
  const partyFromMsg = extractTravelPartySemantics(msg);
  if (partyFromMsg.travelParty) travelParty = partyFromMsg.travelParty;
  if (partyFromMsg.groupSize != null && !fd.groupSize) {
    // Prefer explicit party-derived size when formData had no count
    groupSize = groupSize || partyFromMsg.groupSize;
  } else if (partyFromMsg.groupSize != null && !groupSize) {
    groupSize = partyFromMsg.groupSize;
  }

  // Budget — normalized budgetConstraint (Pass #4); legacy budget retained
  let budget = pick(seed.budget, fd.budget || null);
  if (seed.clearBudget) budget = null;
  if (!budget && !seed.clearBudget && !seed.budgetConstraint) {
    const numeric = extractNumericBudget(msg);
    if (numeric) budget = numeric;
  }

  let budgetConstraint = parseBudgetConstraint(msg, {
    // When structured previous exists, do not re-infer scope from digit-only legacyBudget
    // on silent reloads (empty message would collapse per_person → trip_total).
    legacyBudget:
      seed.budgetConstraint && !seed.budgetConstraint.cleared ? null : budget,
    groupSize: null,
    tripDays: numDays,
    previous: seed.budgetConstraint || metadata?.persistedBudgetConstraint || null,
  });
  if (seed.clearBudget && !extractNumericBudget(msg) && !/\b\$\s*\d+/.test(msg)) {
    // Only keep cleared if message isn't setting a new budget
    if (isExplicitBudgetClear(msg) || !budgetConstraint.explicit || budgetConstraint.cleared) {
      budgetConstraint = {
        ...budgetConstraint,
        cleared: true,
        kind: null,
        amount: null,
        derivedTripCeiling: null,
        derivationBasis: 'explicit_budget_cleared',
        explicit: true,
      };
      budget = null;
    }
  }
  if (budgetConstraint.cleared) {
    budget = null;
  } else {
    const legacy = legacyBudgetFromConstraint(budgetConstraint);
    if (legacy != null) budget = legacy;
  }

  // Fitness level — honor easy-to-moderate range before single-word extraction
  let fitnessLevel = pick(seed.fitnessLevel, fd.fitnessLevel || fd.fitness || fd.difficulty || null);
  if (!fitnessLevel && /\beasy\s*[-–to]+\s*moderate\b/i.test(msg)) {
    fitnessLevel = 'moderate';
  }
  if (!fitnessLevel) {
    const fitMatch = msg.match(/(?:fitness|difficulty|experience)\s*(?:level|is)?\s*:?\s*(beginner|easy|moderate|intermediate|advanced|hard|strenuous|experienced)/i);
    if (fitMatch) {
      fitnessLevel = fitMatch[1].toLowerCase();
    } else {
      const naturalMatch = msg.match(/\b(beginner|novice|easy|moderate|intermediate|advanced|experienced|expert)\s*(?:hiker|climber|trekker|traveler|level)?\b/i);
      if (naturalMatch) fitnessLevel = naturalMatch[1].toLowerCase();
    }
  }
  if (fitnessLevel) {
    fitnessLevel = fitnessLevel.toLowerCase();
    if (fitnessLevel === 'novice') fitnessLevel = 'beginner';
  }

  // Accommodation
  let accommodation = pick(seed.accommodation, fd.accommodation || fd.lodging || null);
  const lodgingTargetRe =
    /\b(?:hotel|lodge|cabin|glamping|airbnb|lodging|motel)\b/i;
  const campingTargetRe = /\b(?:camp(?:ing)?|tent|rv|backcountry)\b/i;
  const correctionCueRe = /\b(?:actually|instead|rather|switch|change|let'?s|replace)\b/i;
  const fromToAccom = msg.match(
    /\b(?:switch|change|replace)\s+from\s+[\w\s-]{0,40}?\s+to\s+(?:a\s+|an\s+)?(cabin|hotel|lodge|lodging|motel|airbnb|glamping|camping|tent|rv|backcountry)\b/i
  );

  if (fromToAccom) {
    const raw = fromToAccom[1].toLowerCase();
    accommodation = raw === 'camp' ? 'camping' : raw;
  } else if (!accommodation) {
    const accomMatch = msg.match(/\b(camping|tent|rv|car camping|backcountry|lodge|hotel|cabin|glamping|airbnb|camp)\b/i);
    if (accomMatch) {
      const raw = accomMatch[1].toLowerCase();
      accommodation = raw === 'camp' ? 'camping' : raw;
    }
  } else {
    // Only reinterpret accommodation from the *latest* utterance when a
    // correction cue is present — avoid "instead" (city change) collapsing a
    // prior "lodge" preference into coarse "lodging" / unknown stayPreference.
    const focusMsg = (msg.split(/\n+/).filter(Boolean).pop() || msg);
    if (lodgingTargetRe.test(focusMsg) && correctionCueRe.test(focusMsg)) {
      const lodgeMatch = focusMsg.match(/\b(hotel|lodge|cabin|glamping|airbnb|lodging|motel)\b/i);
      if (lodgeMatch) {
        accommodation = lodgeMatch[1].toLowerCase();
      }
    } else if (campingTargetRe.test(focusMsg) && correctionCueRe.test(focusMsg)) {
      const campMatch = focusMsg.match(/\b(camping|tent|rv|car camping|backcountry|camp)\b/i);
      if (campMatch) {
        const raw = campMatch[1].toLowerCase();
        accommodation = raw === 'camp' ? 'camping' : raw;
      }
    }
  }

  // Interests — presence-aware:
  //   seed.interests as Array (including []) = authoritative
  //   seed.interests absent = may fall back to formData (legacy compat)
  let interests;
  if (Object.prototype.hasOwnProperty.call(seed, 'interests') && Array.isArray(seed.interests)) {
    interests = normalizeInterestList(seed.interests);
  } else {
    interests = normalizeInterestList(
      typeof fd.interests === 'string'
        ? fd.interests.split(',').map((s) => s.trim())
        : fd.interests || []
    );
  }

  // Children
  let hasChildren = seed.hasChildren != null ? seed.hasChildren : !!(fd.hasChildren || fd.children);
  let childrenCount =
    seed.childrenCount != null
      ? seed.childrenCount
      : fd.childrenCount != null && Number.isFinite(Number(fd.childrenCount))
        ? Number(fd.childrenCount)
        : null;

  if (partyFromMsg.clearChildren) {
    hasChildren = false;
    childrenCount = null;
  } else {
    if (partyFromMsg.hasChildren === true) hasChildren = true;
    if (partyFromMsg.childrenCount != null) childrenCount = partyFromMsg.childrenCount;
    if (!hasChildren && /\b(?:kids?|children|toddler|family|infant|baby)\b/i.test(msg)) {
      hasChildren = true;
    }
    if (childrenCount == null) {
      const kids = extractChildrenCount(msg);
      if (kids != null) childrenCount = kids;
    }
  }

  // Couple+kids size when neither seed nor formData had an explicit count
  if (
    partyFromMsg.groupSize != null &&
    partyFromMsg.travelParty === 'family' &&
    partyFromMsg.childrenCount != null &&
    !fd.groupSize &&
    seed.groupSize == null
  ) {
    groupSize = partyFromMsg.groupSize;
  } else if (partyFromMsg.groupSize != null && !groupSize) {
    groupSize = partyFromMsg.groupSize;
  }

  const overrides = extractMessageConstraintOverrides(msg, { interests });
  if (overrides.groupSize != null) groupSize = overrides.groupSize;
  if (overrides.budget != null) budget = overrides.budget;
  if (overrides.clearBudget) {
    budget = null;
    budgetConstraint = {
      ...budgetConstraint,
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
    budgetConstraint = deriveTripCeiling(overrides.budgetConstraint, {
      groupSize,
      tripDays: overrides.numDays != null ? overrides.numDays : numDays,
    });
    const legacy = legacyBudgetFromConstraint(budgetConstraint);
    if (legacy != null) budget = legacy;
  }
  if (overrides.fitnessLevel != null) fitnessLevel = overrides.fitnessLevel;
  if (overrides.accommodation != null) accommodation = overrides.accommodation;
  if (overrides.numDays != null) numDays = overrides.numDays;
  if (overrides.startDate != null) startDate = overrides.startDate;
  if (overrides.endDate != null) endDate = overrides.endDate;
  if (overrides.travelParty != null) travelParty = overrides.travelParty;
  if (overrides.clearChildren) {
    hasChildren = false;
    childrenCount = null;
  } else {
    if (overrides.hasChildren != null) hasChildren = overrides.hasChildren;
    if (overrides.childrenCount != null) childrenCount = overrides.childrenCount;
  }

  if (overrides.interests != null) {
    interests = normalizeInterestList(overrides.interests);
  } else {
    const mutation = resolveInterestMutation(msg, interests);
    if (mutation.interests && mutation.mode !== 'none') {
      interests = normalizeInterestList(mutation.interests);
    }
  }

  // Family stop-cap signal: normalized travelParty=family OR hasChildren
  const isFamilyParty = travelParty === 'family' || hasChildren === true;

  if (travelParty === 'solo' && groupSize == null) groupSize = 1;
  if (travelParty === 'couple' && groupSize == null) groupSize = 2;

  // Re-derive ceiling now that groupSize / numDays are final (Pass #4).
  // Pass #5 — always pass previous so a silent follow-up keeps persisted budget.
  if (!budgetConstraint.cleared) {
    if (!overrides.budgetConstraint && !overrides.clearBudget) {
      budgetConstraint = parseBudgetConstraint(msg, {
        legacyBudget:
          seed.budgetConstraint && !seed.budgetConstraint.cleared ? null : budget,
        groupSize,
        tripDays: numDays,
        previous: seed.budgetConstraint || budgetConstraint,
      });    } else {
      budgetConstraint = deriveTripCeiling(budgetConstraint, { groupSize, tripDays: numDays });
    }
    if (budgetConstraint.cleared) budget = null;
    else {
      const legacy = legacyBudgetFromConstraint(budgetConstraint);
      if (legacy != null) budget = legacy;
    }
  }

  const msgCosts = extractUserSuppliedCosts(msg);
  const seedCosts = Array.isArray(seed.costComponents) ? seed.costComponents : [];
  let userCostComponents;
  if (msgCosts.length === 0) {
    userCostComponents = seedCosts.filter((c) => c?.basis === 'user_supplied');
  } else {
    const merged = [...seedCosts.filter((c) => c?.basis === 'user_supplied')];
    for (const c of msgCosts) {
      const dup = merged.some(
        (x) => x.category === c.category && Number(x.amountMin) === Number(c.amountMin)
      );
      if (!dup) merged.push(c);
    }
    userCostComponents = merged;
  }
  // Pass #3 — multi-destination / road-trip contract (offline catalog resolver)
  // Pass #5 — when persisted tripScope exists, patch from latest message only.
  let tripScope = seed.tripScope
    ? applyTripScopeRefinement(seed.tripScope, msg)
    : buildTripScopeFromMessage(msg);
  const maxDailyDriveMinutes =
    tripScope.maxDailyDriveMinutes ??
    parseMaxDailyDriveMinutes(msg) ??
    seed.maxDailyDriveMinutes ??
    null;
  if (maxDailyDriveMinutes != null && tripScope) {
    tripScope = { ...tripScope, maxDailyDriveMinutes };
  }
  // Sticky — once a traveler asks for realistic/manageable driving it stays true for
  // the trip even if a later refinement message doesn't repeat the phrasing.
  const drivingFeasibilityRequired = Boolean(
    tripScope.drivingFeasibilityRequired ||
    detectDrivingFeasibilityConstraint(msg) ||
    maxDailyDriveMinutes != null ||
    seed.drivingFeasibilityRequired
  );
  if (drivingFeasibilityRequired && tripScope) {
    tripScope = { ...tripScope, drivingFeasibilityRequired: true };
  }

  // Pace — one family, not a second regex authority.
  let pace = seed.pace || null;
  const resolvedPace = resolvePace(msg);
  if (resolvedPace.value) pace = resolvedPace.value;

  // Hard user preference — avoid exposed trails (semantic, not raw regex match)
  let avoidExposure = seed.avoidExposure === true ? true : null;
  if (userAvoidsTrailExposure(msg)) avoidExposure = true;

  const mobility = extractMobilityConstraints(msg);
  const partyExtras = extractPartyExtras(msg);
  // Phase 9C.1F.1 — explicit trip-level transport constraint (durable via
  // planningState.transportation.drivingPolicy). Never inferred from silence.
  const transportConstraint = extractTransportConstraints(msg);
  const activityPreferences = extractActivityPreferences(msg);
  if (activityPreferences.avoidExposure) avoidExposure = true;
  const availableHours = spokenDuration.availableHours;

  const finalBudgetAssessment = assessBudget({
    budgetConstraint,
    components: userCostComponents,
    accommodation,
    tripScope,
    groupSize,
    tripDays: numDays,
  });

  const hasConstraints = !!(
    parkCode ||
    numDays ||
    groupSize ||
    budget ||
    fitnessLevel ||
    accommodation ||
    interests.length > 0 ||
    hasChildren ||
    travelParty ||
    pace ||
    avoidExposure ||
    maxDailyDriveMinutes != null ||
    drivingFeasibilityRequired ||
    (tripScope.type !== 'single_destination' && tripScope.destinations.length > 0) ||
    (budgetConstraint.explicit && !budgetConstraint.cleared)
  );

  const constraintsOut = {
    parkCode,
    dates: { start: startDate, end: endDate, numDays, tripWindowDays: temporalResolution.tripWindowDays },
    ...(temporalResolution.action !== 'unchanged' || temporalResolution.pendingTemporalResolution ? { temporalResolution } : {}),
    groupSize,
    travelParty,
    budget,
    budgetConstraint,
    budgetAssessment: finalBudgetAssessment,
    costComponents: userCostComponents,
    fitnessLevel,
    accommodation,
    interests,
    hasChildren,
    childrenCount,
    isFamilyParty,
    maxDailyDriveMinutes,
    drivingFeasibilityRequired,
    tripScope,
    pace,
    avoidExposure,
    mobility,
    time: { availableHours },
    hasOlderTravelers: partyExtras.hasOlderTravelers,
    activityPreferences,
    transportConstraint,
    hasConstraints,
  };

  // ONE canonical constraint-translation boundary. Grounded constraint families
  // (exposure aversion and its explicit reversal, numeric and non-numeric
  // mobility, pace) are applied here so every downstream consumer reads
  // canonical state instead of re-parsing raw conversation text. Current-message
  // values outrank persisted state; untouched fields survive.
  const translated = applyTurnConstraintsToRuntime(constraintsOut, { messageText: msg });
  constraintsOut.hasConstraints = constraintsOut.hasConstraints
    || translated.fields.length > 0
    || constraintsOut.avoidExposure === true
    || constraintsOut.pace != null
    || constraintsOut.mobility?.walkingTolerance != null
    || constraintsOut.mobility?.maxWalkMilesPerSegment != null
    || transportConstraint.drivingPolicy != null
    || transportConstraint.clearDrivingPolicy === true
    || transportConstraint.rentalCar === true;

  // Rebuild durable planning snapshot for this turn (evidence excluded).
  constraintsOut.planningState = buildPlanningStateFromRuntime({
    constraints: constraintsOut,
    previous: persisted,
    formData: fd,
    parkCode,
    userSuppliedCosts: userCostComponents,
    messageText: msg,
  });

  return constraintsOut;
}

// ── preflightCheck ───────────────────────────────────────────────────────────

/**
 * Static pre-flight checks before calling AI.
 * Returns { warnings: string[], blockers: string[] }
 */
function preflightCheck(constraints, parkCode) {
  const warnings = [];
  const blockers = [];
  const code = (parkCode || constraints.parkCode || '').toLowerCase();

  // Get travel month from dates
  let travelMonth = null;
  if (constraints.dates?.start) {
    const d = new Date(constraints.dates.start);
    if (!isNaN(d)) travelMonth = d.getMonth(); // 0-indexed
  }

  // Check crowd score → blocker if park is completely closed that month
  if (code && travelMonth !== null && CROWD_SCORES[code]) {
    const score = CROWD_SCORES[code][travelMonth];
    if (score === 0) {
      const monthName = new Date(2025, travelMonth).toLocaleString('en-US', { month: 'long' });
      blockers.push(`${code.toUpperCase()} has a crowd score of 0 in ${monthName} — the park is effectively closed or inaccessible. Choose different dates or a different park.`);
    } else if (score >= 9) {
      const monthName = new Date(2025, travelMonth).toLocaleString('en-US', { month: 'long' });
      warnings.push(`${monthName} is peak season (extremely crowded). Book reservations well in advance and arrive early.`);
    }
  }

  // Permit reminder
  if (code && PERMIT_PARKS[code]) {
    warnings.push(`Permit/reservation required: ${PERMIT_PARKS[code]}. Book on recreation.gov.`);
  }

  // Fitness contradictions
  if (constraints.fitnessLevel && constraints.interests.length > 0) {
    const fitLevel = constraints.fitnessLevel;
    const wantsStrenuous = constraints.interests.some(i => /strenuous|rock climbing|backpacking|scrambl/i.test(i));
    if ((fitLevel === 'easy' || fitLevel === 'beginner') && wantsStrenuous) {
      warnings.push(`Your fitness level is "${fitLevel}" but your interests include strenuous activities. The plan will prioritize safety over ambition.`);
    }
  }

  // Budget + accommodation tension
  if (constraints.budget && constraints.accommodation) {
    const budgetNum = parseInt(constraints.budget, 10);
    const isLuxury = /lodge|hotel|cabin|glamping|airbnb/i.test(constraints.accommodation);
    if (budgetNum && budgetNum < 200 && isLuxury) {
      warnings.push(`Budget ($${budgetNum}) may be tight for ${constraints.accommodation} accommodation. Consider camping as a backup.`);
    }
  }

  // Family + short trip warning
  if ((constraints.isFamilyParty || constraints.hasChildren) && constraints.dates?.numDays && constraints.dates.numDays <= 2) {
    warnings.push(`A ${constraints.dates.numDays}-day trip with children is tight. The plan will keep days shorter with fewer stops.`);
  }

  return { warnings, blockers };
}

// ── buildConstraintBlock ─────────────────────────────────────────────────────

/**
 * Builds a prompt injection block with explicit user constraints.
 */
function buildConstraintBlock(constraints, { routeCoverage = null } = {}) {
  if (!constraints?.hasConstraints && !constraints?.tripScope) return '';

  const lines = ['--- USER CONSTRAINTS (MUST RESPECT) ---'];

  if (constraints.dates?.numDays) {
    lines.push(`HARD RULE: Trip length = ${constraints.dates.numDays} day(s). Do NOT generate more days.`);
  }
  if (constraints.dates?.start) {
    lines.push(`Start date: ${constraints.dates.start}`);
  }
  if (constraints.dates?.end) {
    lines.push(`End date: ${constraints.dates.end}`);
  }
  if (constraints.groupSize) {
    lines.push(`Group size: ${constraints.groupSize} people`);
  }
  if (constraints.travelParty) {
    lines.push(`Travel party: ${constraints.travelParty}`);
  }
  if (constraints.isFamilyParty || constraints.hasChildren) {
    const kidsBit =
      constraints.childrenCount != null
        ? ` (${constraints.childrenCount} children)`
        : '';
    lines.push(
      `HARD RULE: Family with children${kidsBit} — max 4 stops per day, no strenuous trails, kid-friendly activities only.`
    );
  }
  if (constraints.fitnessLevel) {
    const maxDiff = FITNESS_TO_MAX_DIFFICULTY[constraints.fitnessLevel] || 'moderate';
    lines.push(`HARD RULE: Fitness level = "${constraints.fitnessLevel}". Maximum trail difficulty = "${maxDiff}". Do NOT include trails above this difficulty.`);
  }
  if (constraints.accommodation) {
    lines.push(`HARD RULE: Accommodation preference = "${constraints.accommodation}". Only suggest this type unless unavailable.`);
  }
  if (constraints.budget) {
    lines.push(`Budget: $${constraints.budget}`);
  }
  if (constraints.budgetAssessment) {
    const budgetBlock = buildBudgetPromptBlock(constraints.budgetAssessment);
    if (budgetBlock) {
      // Insert after legacy budget line; strip leading newlines for join consistency
      lines.push(...budgetBlock.trim().split('\n'));
    }
  } else if (constraints.budgetConstraint?.explicit) {
    const stub = assessBudget({
      budgetConstraint: constraints.budgetConstraint,
      components: constraints.costComponents || [],
      accommodation: constraints.accommodation,
      tripScope: constraints.tripScope,
      groupSize: constraints.groupSize,
      tripDays: constraints.dates?.numDays,
    });
    const budgetBlock = buildBudgetPromptBlock(stub);
    if (budgetBlock) lines.push(...budgetBlock.trim().split('\n'));
  }
  if (constraints.interests?.length > 0) {
    lines.push(`Interests: ${constraints.interests.join(', ')}`);
  }
  if (constraints.maxDailyDriveMinutes != null) {
    lines.push(
      `HARD RULE: Maximum daily driving = ${constraints.maxDailyDriveMinutes} minutes. ` +
      `Do NOT schedule a day whose drive legs exceed this user preference.`
    );
  }

  // Phase 8D.6.1 truthfulness: generation precedes stop-route verification.
  // If a caller has attempt coverage, distinguish none/partial/full edge checks
  // without implying that unrepresented journey legs were verified.
  if (
    constraints.drivingFeasibilityRequired &&
    constraints.tripScope?.type !== 'road_trip' &&
    constraints.tripScope?.type !== 'multi_destination'
  ) {
    lines.push(
      'HARD RULE: Traveler explicitly asked to keep driving realistic/manageable. ' +
      drivingVerificationInstruction(routeCoverage)
    );
  }

  const scope = constraints.tripScope;
  if (scope && (scope.type === 'multi_destination' || scope.type === 'road_trip')) {
    lines.push('--- TRIP SCOPE (MUST RESPECT) ---');
    lines.push(`Trip scope type: ${scope.type}`);
    if (scope.origin?.displayName) {
      lines.push(`Origin: ${scope.origin.displayName} (${scope.origin.entityId || 'unresolved'})`);
    }
    if (scope.destinations?.length) {
      const ordered = scope.destinations
        .map((d, i) => `${i + 1}. ${d.displayName || d.entityId}${d.entityId ? ` [${d.entityId}]` : ''}`)
        .join('; ');
      lines.push(`Ordered destinations: ${ordered}`);
      lines.push(
        scope.destinationOrderExplicit && scope.userSuppliedOrder
          ? 'HARD RULE: Preserve the traveler\'s explicit destination order. Do NOT reorder.'
          : scope.optimizationRequested
            ? 'Traveler asked for efficient order — do not invent drive times; use route evidence only.'
            : 'Preserve destination coverage for every requested destination entity.'
      );
    }
    if (scope.routeShape && scope.routeShape !== 'unknown') {
      lines.push(`Route shape: ${scope.routeShape}`);
    }
    if (scope.transportMode) lines.push(`Transport mode: ${scope.transportMode}`);
    if (scope.routeLegs?.length) {
      const legLines = scope.routeLegs.map((leg) => {
        const label = `${leg.fromDisplayName || leg.fromEntityId} → ${leg.toDisplayName || leg.toEntityId}`;
        return leg.status === 'requires_driving_evidence'
          ? `${label} (requires verified driving evidence — do NOT invent duration)`
          : `${label} (${leg.status} — feasibility unverified)`;
      });
      lines.push(`Route legs: ${legLines.join('; ')}`);
    }
    if (scope.unresolvedRouteLegs?.length) {
      lines.push(
        `HARD RULE: ${scope.unresolvedRouteLegs.length} route leg(s) lack coordinates/evidence. ` +
        `Say driving feasibility still needs verification — never invent hours.`
      );
    }
    lines.push(
      'HARD RULE: Allocate meaningful structured time to every requested destination entity id. ' +
      'Coverage is validated on TripPlan destinationEntityId / parkCode — prose mentions do not count.'
    );
    lines.push('--- END TRIP SCOPE ---');
  }

  lines.push('--- END USER CONSTRAINTS ---');
  return '\n\n' + lines.join('\n') + '\n';
}

// ── validateItineraryConstraints ─────────────────────────────────────────────

/**
 * Validates a parsed itinerary against user constraints.
 * Returns array of structured issues.
 */
function validateItineraryConstraints(itineraryData, constraints, options = {}) {
  if (!itineraryData || !itineraryData.days) return [];
  const tripScope = constraints?.tripScope || options.tripScope || null;
  if (!constraints?.hasConstraints && !tripScope) return [];

  const issues = [];

  // 1. Day count check
  if (constraints.dates?.numDays) {
    const expected = constraints.dates.numDays;
    const actual = itineraryData.days.length;
    if (actual > expected) {
      issues.push({
        type: 'day_count',
        severity: 'feasibility',
        details: `Itinerary has ${actual} days but user requested ${expected}`,
        expected,
        actual,
      });
    }
  }

  // 2. Difficulty vs fitness
  if (constraints.fitnessLevel) {
    const maxDiff = FITNESS_TO_MAX_DIFFICULTY[constraints.fitnessLevel] || 'moderate';
    const maxIdx = DIFFICULTY_ORDER.indexOf(maxDiff);

    for (let di = 0; di < itineraryData.days.length; di++) {
      const day = itineraryData.days[di];
      if (!day.stops) continue;
      for (let si = 0; si < day.stops.length; si++) {
        const stop = day.stops[si];
        if (!stop.difficulty) continue;
        const stopIdx = DIFFICULTY_ORDER.indexOf(stop.difficulty.toLowerCase());
        if (stopIdx > maxIdx) {
          issues.push({
            type: 'difficulty',
            severity: 'fitness',
            details: `"${stop.name}" is ${stop.difficulty} but user fitness is "${constraints.fitnessLevel}" (max: ${maxDiff})`,
            dayIndex: di,
            stopIndex: si,
            stopName: stop.name,
            stopDifficulty: stop.difficulty,
            maxAllowed: maxDiff,
          });
        }
      }
    }
  }

  // 3. Accommodation type
  if (constraints.accommodation) {
    const pref = constraints.accommodation.toLowerCase();
    const isCamping = /camping|tent|rv|car camping|backcountry/i.test(pref);
    const isLodging = /lodge|hotel|cabin|glamping|airbnb/i.test(pref);

    for (let di = 0; di < itineraryData.days.length; di++) {
      const day = itineraryData.days[di];
      if (!day.stops) continue;
      for (let si = 0; si < day.stops.length; si++) {
        const stop = day.stops[si];
        if (stop.type !== 'campground' && stop.type !== 'lodging') continue;

        const isCampStop = stop.type === 'campground';
        if (isCamping && !isCampStop) {
          issues.push({
            type: 'accommodation',
            severity: 'preference',
            details: `"${stop.name}" is lodging but user prefers ${pref}`,
            dayIndex: di,
            stopIndex: si,
            stopName: stop.name,
          });
        } else if (isLodging && isCampStop) {
          issues.push({
            type: 'accommodation',
            severity: 'preference',
            details: `"${stop.name}" is camping but user prefers ${pref}`,
            dayIndex: di,
            stopIndex: si,
            stopName: stop.name,
          });
        }
      }
    }
  }

  // 4. Stop count for families (normalized travelParty=family or hasChildren)
  if (constraints.isFamilyParty || constraints.hasChildren) {
    for (let di = 0; di < itineraryData.days.length; di++) {
      const day = itineraryData.days[di];
      if (!day.stops) continue;
      if (day.stops.length > 4) {
        issues.push({
          type: 'overloaded_day',
          severity: 'preference',
          details: `Day ${day.dayNumber || di + 1} has ${day.stops.length} stops but family trips should have max 4`,
          dayIndex: di,
          maxStops: 4,
        });
      }
    }
  }

  // 5. Schedule overflow — GLOBAL FEASIBILITY GUARD (14h/day).
  // Distinct from user preference maxDailyDriveMinutes (section 7).
  // Uses the same canonical daily drive total as validateMaxDailyDrive
  // (stop drivingTimeFromPreviousMin + day.totalDriveMinutes).
  for (let di = 0; di < itineraryData.days.length; di++) {
    const day = itineraryData.days[di];
    if (!day.stops || day.stops.length === 0) continue;

    let totalMinutes = Number(day.bufferMinutes) || 0;
    totalMinutes += collectDayDriveMinutes(day);
    for (const stop of day.stops) {
      totalMinutes += (stop.duration || 0);
    }

    if (totalMinutes > GLOBAL_MAX_ACTIVE_MINUTES) {
      issues.push({
        type: 'schedule_overflow',
        severity: 'feasibility',
        reasonCode: 'drive_activity_day_overflow',
        details: `Day ${day.dayNumber || di + 1} has ${Math.round(totalMinutes / 60 * 10) / 10}h of activity — exceeds ${GLOBAL_MAX_ACTIVE_MINUTES / 60}h max`,
        dayIndex: di,
        totalMinutes,
        globalMaxActiveMinutes: GLOBAL_MAX_ACTIVE_MINUTES,
        guardType: 'global_feasibility',
      });
    }
  }

  // 6. startTime overlap detection (basic: checks that stops are in chronological order)
  for (let di = 0; di < itineraryData.days.length; di++) {
    const day = itineraryData.days[di];
    if (!day.stops || day.stops.length < 2) continue;

    for (let si = 1; si < day.stops.length; si++) {
      const prev = day.stops[si - 1];
      const curr = day.stops[si];
      if (!prev.startTime || !curr.startTime) continue;

      const prevMinutes = parseTime(prev.startTime);
      const currMinutes = parseTime(curr.startTime);
      if (prevMinutes !== null && currMinutes !== null) {
        const prevEnd = prevMinutes + (prev.duration || 0) + (curr.drivingTimeFromPreviousMin || 0);
        if (currMinutes < prevEnd - 15) { // 15min tolerance
          issues.push({
            type: 'time_overlap',
            severity: 'feasibility',
            details: `Day ${day.dayNumber || di + 1}: "${curr.name}" starts at ${curr.startTime} but "${prev.name}" doesn't end until ~${minutesToTime(prevEnd)}`,
            dayIndex: di,
            stopIndex: si,
          });
        }
      }
    }
  }

  // 7. Multi-destination / road-trip contract (Pass #3)
  if (tripScope) {
    issues.push(...validateDestinationCoverage(itineraryData, tripScope));
    issues.push(...validateDestinationSequence(itineraryData, tripScope));
    // Intrinsic: a single mandatory verified leg already > daily cap.
    issues.push(...evaluateRouteLegsAgainstDailyDriveCap({
      tripScope,
      drivingLegs: options.drivingEvidenceLegs || [],
      maxDailyDriveMinutes:
        tripScope.maxDailyDriveMinutes ?? constraints?.maxDailyDriveMinutes ?? null,
    }));
    issues.push(...validateMaxDailyDrive(itineraryData, tripScope, constraints));
    if (tripScope.type === 'road_trip') {
      issues.push(...validateRouteLegCoverage(tripScope, options));
    }
    issues.push(...validateOvernightDestinationIdentity(itineraryData, tripScope));
  } else if (constraints?.maxDailyDriveMinutes != null) {
    issues.push(...validateMaxDailyDrive(itineraryData, null, constraints));
  }

  // 8. Budget realism (Pass #4)
  const assessment =
    options.budgetAssessment ||
    constraints?.budgetAssessment ||
    (constraints?.budgetConstraint
      ? assessBudget({
        budgetConstraint: constraints.budgetConstraint,
        components: options.costComponents || constraints.costComponents || [],
        accommodation: constraints.accommodation,
        tripScope,
        groupSize: constraints.groupSize,
        tripDays: constraints.dates?.numDays,
      })
      : null);
  if (assessment) {
    issues.push(...validateBudgetConstraints(assessment));
    if (options.budgetClaimText) {
      issues.push(...validateBudgetClaim(options.budgetClaimText, assessment));
    }
  }

  return issues;
}

// ── detectHypothetical ───────────────────────────────────────────────────────

/** Real trip friction — backup planning here is normal logistics, not scenario mode. */
function isPracticalContingencyPlanning(userMessage) {
  if (!userMessage) return false;

  const operationalFriction =
    /\b(?:parking|lot|trailhead|shuttle|crowd|crowded|busy|full|wait(?:ing)?|line|sold out|reservation|permit|weather|rain|snow|storm|heat|wind)\b/i;

  if (/\b(?:backup plan|plan b)\b/i.test(userMessage) && operationalFriction.test(userMessage)) {
    return true;
  }

  if (/\bwhat if\b/i.test(userMessage) && operationalFriction.test(userMessage)) {
    return true;
  }

  if (/\balternative\b/i.test(userMessage) && /\b(?:if|when)\b/i.test(userMessage) && operationalFriction.test(userMessage)) {
    return true;
  }

  return false;
}

/**
 * Detects if user message is a hypothetical/scenario question.
 */
function detectHypothetical(userMessage) {
  if (!userMessage) return { isHypothetical: false, scenarioDescription: null };

  if (isPracticalContingencyPlanning(userMessage)) {
    return { isHypothetical: false, scenarioDescription: null };
  }

  if (
    /\b(?:backup plan|plan b)\b/i.test(userMessage) &&
    /\b(?:closed|shut|blocked|unavailable)\b/i.test(userMessage)
  ) {
    return { isHypothetical: true, scenarioDescription: 'backup plan for closure' };
  }

  const patterns = [
    /what if\b/i,
    /what would happen\b/i,
    /hypothetically\b/i,
    /imagine\b/i,
    /in a scenario\b/i,
    /if the road (?:was|were|is) closed/i,
    /if (?:the )?(?:trail|area|basin|canyon|pass|road|highway|route)\b[^.?\n]{0,80}\b(?:closed|shut|blocked|unavailable)/i,
    /if we (?:can't|couldn't|cannot)\b/i,
    /assuming\b.*(?:closed|unavailable|shut|blocked|can't access)/i,
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match) {
      return {
        isHypothetical: true,
        scenarioDescription: match[0],
      };
    }
  }

  return { isHypothetical: false, scenarioDescription: null };
}

// ── detectConflicts ──────────────────────────────────────────────────────────

/**
 * Detects contradictions between parsed constraints AND between constraints
 * and the user's message. Returns structured conflicts for prompt injection.
 */
function detectConflicts(constraints, userMessage, options = {}) {
  if (options.skipUserContext) {
    return [];
  }
  const conflicts = [];
  const msg = (userMessage || '').toLowerCase();

  // 1. Fitness vs. requested difficulty
  if (constraints.fitnessLevel) {
    const maxDiff = FITNESS_TO_MAX_DIFFICULTY[constraints.fitnessLevel] || 'moderate';
    const maxIdx = DIFFICULTY_ORDER.indexOf(maxDiff);

    // Check if user message requests activities above their fitness level
    const wantsHard = /\b(?:challenging|strenuous|hardest|toughest|most difficult|extreme|intense|demanding|ambitious)\b/i.test(msg);
    const specificHardPattern = /\b(?:angels landing|half dome|highline trail|the narrows|chains|scramble|exposed|class \d)\b/i;
    const rejectsSpecificHard = /\b(?:no|not|avoid|skip|without|don't|do not)\b[^.!?]{0,45}\b(?:angels landing|half dome|highline trail|the narrows|chains|scrambl(?:e|ing)|expos(?:ed|ure)|class \d)\b/i.test(msg);
    const wantsSpecificHard = specificHardPattern.test(msg) && !rejectsSpecificHard;

    if ((wantsHard || wantsSpecificHard) && maxIdx <= 1) { // easy or moderate
      conflicts.push({
        type: 'fitness_vs_difficulty',
        constraintA: `Fitness level: ${constraints.fitnessLevel} (max difficulty: ${maxDiff})`,
        constraintB: `User requests: challenging/strenuous activities`,
        resolution: 'fitness',
        prompt: `The user identifies as "${constraints.fitnessLevel}" but is requesting challenging/strenuous activities. These are CONTRADICTORY constraints. You MUST:\n1. Name the conflict clearly: "Your fitness level (${constraints.fitnessLevel}) conflicts with requesting the most challenging hikes."\n2. Present TWO distinct options:\n   - **Option A (Safe — recommended):** A plan matching their fitness level with the most rewarding easy/moderate experiences\n   - **Option B (Ambitious — with warnings):** A plan with harder trails, but with EXPLICIT safety warnings, bail-out points, and fitness requirements for each trail\n3. Do NOT silently merge these into one plan. Do NOT include strenuous trails without flagging the risk.`
      });
    }
  }

  // 2. Easy/relaxing vs. adventurous
  const wantsEasy = /\b(?:easy|relaxing|chill|laid.?back|leisurely|gentle|casual)\b/i.test(msg);
  const wantsAdventure = /\b(?:adventurous|adventure|thrilling|exciting|adrenaline|extreme|push.*limit|maximize.*adventure)\b/i.test(msg);
  if (wantsEasy && wantsAdventure) {
    conflicts.push({
      type: 'easy_vs_adventure',
      constraintA: 'User wants: easy/relaxing',
      constraintB: 'User wants: adventurous/thrilling',
      resolution: 'present_options',
      prompt: `The user wants both "easy/relaxing" AND "adventurous/thrilling" — these pull in opposite directions. You MUST:\n1. Name the conflict: "Easy and adventurous are competing goals."\n2. Present TWO distinct plans:\n   - **Option A (Easy + Scenic):** Dramatic payoffs with minimal effort (viewpoints, short walks, scenic drives)\n   - **Option B (Adventure-Forward):** One big adventure day, then easy recovery\n3. Do NOT blend these into a generic middle-ground plan.`
    });
  }

  // 3. Budget vs. luxury accommodation
  if (constraints.budget && constraints.accommodation) {
    const budgetNum = parseInt(constraints.budget, 10);
    const isLuxury = /lodge|hotel|cabin|glamping|resort/i.test(constraints.accommodation);
    if (budgetNum && budgetNum < 150 && isLuxury) {
      conflicts.push({
        type: 'budget_vs_accommodation',
        constraintA: `Budget: $${constraints.budget}/day`,
        constraintB: `Accommodation: ${constraints.accommodation}`,
        resolution: 'present_options',
        prompt: `Budget ($${constraints.budget}) conflicts with ${constraints.accommodation} preference — most lodges/hotels in national parks cost $150+/night. Present TWO options: one with ${constraints.accommodation} that exceeds budget, one with camping/budget alternatives that fits.`
      });
    }
  }

  // 4. Short trip + too many parks
  const parkCount = (msg.match(/\b(?:and|,)\s*(?:then\s+)?(?:visit|go to|stop at|hit|see)\b/gi) || []).length;
  if (constraints.dates?.numDays && constraints.dates.numDays <= 3 && parkCount >= 2) {
    conflicts.push({
      type: 'time_vs_scope',
      constraintA: `Trip length: ${constraints.dates.numDays} days`,
      constraintB: `Multiple parks requested`,
      resolution: 'present_options',
      prompt: `${constraints.dates.numDays} days is tight for multiple parks. Present TWO options: one deep-dive into the primary park, one multi-park highlight reel with honest tradeoffs about drive time.`
    });
  }

  return conflicts;
}

// ── Intent Detection ─────────────────────────────────────────────────────────

/** Maps user archetypes to regex patterns and prompt adaptation blocks. */
const INTENT_ARCHETYPES = {
  photographer: {
    patterns: [/\bsunrise\b/i, /\bsunset\b/i, /\bgolden hour\b/i, /\bcamera\b/i, /\bphoto(?:s|graphy|graph)?\b/i, /\blandscape shots?\b/i, /\bcapture\b/i],
    prompt: `USER INTENT — PHOTOGRAPHER:
- Prioritize viewpoints, overlooks, and vistas with the best light conditions
- Suggest specific sunrise/sunset times and golden hour windows for each stop
- Recommend less-crowded viewpoints over tourist-heavy ones for cleaner shots
- Note any tripod restrictions or photography permits
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous sunrise hikes for a photographer with beginner fitness.`,
  },
  family: {
    patterns: [/\bkids?\b/i, /\bchildren\b/i, /\btoddler\b/i, /\bstroller\b/i, /\bfamily\b/i, /\binfant\b/i, /\bbaby\b/i],
    prompt: `USER INTENT — FAMILY:
- Max 4 stops per day — kids fatigue fast
- Prioritize easy trails, paved paths, and wheelchair/stroller-accessible routes
- Include stops with restrooms, picnic areas, and shade
- Suggest kid-friendly activities: ranger programs, junior ranger booklets, nature centers
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
  adventurer: {
    patterns: [/\bchallenging\b/i, /\bstrenuous\b/i, /\bsummit\b/i, /\bbackpacking\b/i, /\bscrambl/i, /\bclass \d/i, /\bexposed\b/i, /\bpeak\s*bagg/i],
    prompt: `USER INTENT — ADVENTURER:
- Prioritize the hardest, most rewarding trails with significant elevation gain
- Include elevation profiles and technical difficulty details
- Suggest pre-dawn starts to maximize daylight on long routes
- Note bail-out points and emergency exit routes on exposed trails
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
  relaxer: {
    patterns: [/\brelaxing\b/i, /\beasy\b/i, /\bchill\b/i, /\bscenic driv/i, /\bleisure/i, /\blaid.?back\b/i, /\bslow\s*pace/i],
    prompt: `USER INTENT — RELAXER:
- Max 3 stops per day — no rushing
- No early starts before 9 AM unless specifically requested
- Prioritize scenic drives, short walks, and viewpoint pull-offs
- Include rest/downtime between activities
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
  wildlife: {
    patterns: [/\bwildlife\b/i, /\banimals?\b/i, /\bbirding\b/i, /\bbears?\b/i, /\belk\b/i, /\bbison\b/i, /\bwolf\b/i, /\bwhale\b/i],
    prompt: `USER INTENT — WILDLIFE:
- Prioritize dawn and dusk activity corridors for best wildlife sighting chances
- Recommend meadows, valleys, and water sources where animals congregate
- Include species-specific tips: what's active in the current season
- Note wildlife safety: bear spray, safe distances, food storage requirements
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
  history: {
    patterns: [/\bhistory\b/i, /\bruins\b/i, /\bcultur/i, /\bmuseum\b/i, /\bheritage\b/i, /\branger\s*program/i, /\bguided\s*tour/i, /\bhistoric/i],
    prompt: `USER INTENT — HISTORY/CULTURE:
- Prioritize ranger-led programs, guided tours, and interpretive trails
- Include visitor centers and museum stops with estimated time
- Suggest historical landmarks and cultural sites with context
- Note any timed or reservation-required ranger programs
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
};

/**
 * Detects user intent/archetype from message text and constraints.
 * Returns { primaryIntent, intents: [{type, confidence}], adaptations: string }
 */
function detectIntent(userMessage, constraints) {
  const msg = (userMessage || '').toLowerCase();
  const intents = [];

  for (const [type, archetype] of Object.entries(INTENT_ARCHETYPES)) {
    let matchCount = 0;
    for (const pattern of archetype.patterns) {
      if (pattern.test(msg)) matchCount++;
    }
    // Also check constraints.interests for implicit intents
    if (constraints?.interests?.length > 0) {
      for (const interest of constraints.interests) {
        const interestLower = interest.toLowerCase();
        for (const pattern of archetype.patterns) {
          if (pattern.test(interestLower)) {
            matchCount++;
            break; // count each interest once per archetype
          }
        }
      }
    }
    if (matchCount > 0) {
      const confidence = Math.min(1.0, matchCount / archetype.patterns.length * 2);
      intents.push({ type, confidence });
    }
  }

  // Sort by confidence descending
  intents.sort((a, b) => b.confidence - a.confidence);

  const primaryIntent = intents.length > 0 ? intents[0].type : null;

  // Build adaptations string from all intents with confidence >= 0.3
  const adaptations = intents
    .filter(i => i.confidence >= 0.3)
    .map(i => INTENT_ARCHETYPES[i.type].prompt)
    .join('\n\n');

  return { primaryIntent, intents, adaptations: adaptations || null };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

module.exports = {
  parseConstraints,
  preflightCheck,
  buildConstraintBlock,
  validateItineraryConstraints,
  detectHypothetical,
  detectConflicts,
  detectIntent,
  // Exported for testing
  CROWD_SCORES,
  PERMIT_PARKS,
  DIFFICULTY_ORDER,
  FITNESS_TO_MAX_DIFFICULTY,
  validateBudgetClaim,
  validateBudgetConstraints,
  assessBudget,
};
