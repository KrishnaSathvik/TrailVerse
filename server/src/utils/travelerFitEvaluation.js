'use strict';

/**
 * TRAVELER FIT / OPERATIONAL FEASIBILITY.
 *
 * WHY THIS EXISTS
 * ---------------
 * Gate #4 delivered this to a traveller who asked for "three relaxed days …
 * a couple of easy hikes", in BOTH independent runs of the same prompt:
 *
 *     Day anchor: "The Maze district", 240 minutes
 *     "accessible by dirt roads from UT 24 or Green River, check conditions"
 *     "roads and locations rangers confirm are appropriate for your vehicle
 *      and permitted where required"
 *
 * Every validator passed it, and each was right on its own terms: the place is
 * real, the evidence exists, the duration is plausible, the day has an anchor.
 * The question nobody asked was whether this traveller can GET there.
 *
 * Trailie was good at "is this place real" and had no consumer at all for
 * "can we get there, does it fit this traveller, what does it depend on".
 * `trailieOperationalConstraints` already owns exactly the right vocabulary
 * (`VEHICLE_RESTRICTION`, `ACCESS_UNCERTAIN`, `RESERVATION_REQUIRED`), but its
 * `OFFICIAL_RULES` list is empty and nothing in the codebase ever writes
 * `constraints.operationalEvidence` — so it resolves to `[]` on every turn.
 * Until a producer exists, the only authoritative statement of a dependency is
 * the one the plan makes about itself.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a ban list, and not a numeric model. "Relaxed" is not converted into
 * miles and "easy" is not converted into feet of gain — the traveller supplied
 * words, so the rule stays in words (P0-B3).
 *
 * It is an ANCHORING rule. A place carrying an access dependency may absolutely
 * appear in a plan with that dependency stated. What it may not do is silently
 * become the thing a day is built around for a traveller who never indicated
 * the required capability. UNKNOWN must never present as "perfect for you".
 */

const {
  operationalFactsFromBundle,
  indexFactsByPlace,
  bindFactsToStop,
  BINDING_MECHANISM,
} = require('./operationalFactExtraction');
const { CONSTRAINT_TYPE } = require('./trailieOperationalConstraints');
const {
  assessVehicleDimensionFit,
  describeVehicleDimensionConflict,
  resolveTravelerVehicle,
  formatFeet,
} = require('./vehicleDimensionContract');
const {
  resolveRuntimeFitness,
  resolveRuntimeMobility,
  resolveRuntimePace,
  resolveRuntimeTransportMode,
} = require('./canonicalRuntimeProjection');

/** Operational constraint type → the dependency family the fit layer reasons in. */
const TYPE_TO_KIND = Object.freeze({
  [CONSTRAINT_TYPE.VEHICLE_RESTRICTION]: 'vehicle_capability',
  [CONSTRAINT_TYPE.VEHICLE_DIMENSION]: 'vehicle_dimension',
  [CONSTRAINT_TYPE.RESERVATION_REQUIRED]: 'permit',
  [CONSTRAINT_TYPE.ACCESS_UNCERTAIN]: 'remote_self_sufficiency',
  [CONSTRAINT_TYPE.SHUTTLE_TICKET_REQUIRED]: 'water_or_shuttle_access',
  [CONSTRAINT_TYPE.SEASONAL_CLOSURE]: 'seasonal_access',
});

/**
 * PHASE 4Q — SEVERITY AND CAPABILITY, SEPARATED FROM IMPORTANCE.
 *
 * The rule this replaces was `unknown && isAnchor && lowEffort`, which multiplied
 * three unrelated things: how long a stop is, how important it is to its day, and
 * how severe its requirement is. Phase 4P measured the consequence — an official
 * "high-clearance four-wheel-drive required" fact bound to a stop and the whole
 * plan passed, because the stop was thirty minutes long and the traveler had not
 * described themselves as relaxed.
 *
 * A thirty-minute 4WD road still requires 4WD.
 *
 *   HARD_CAPABILITY   you either can reach it or you cannot
 *   ACTION_REQUIRED   you can reach it; something must be arranged first
 *
 * Hard capability decides VALIDITY. Action required decides what must TRAVEL WITH
 * the recommendation — it never silently invalidates a permit hike, because a
 * permit hike is a perfectly good recommendation accompanied by the requirement.
 */
const DEPENDENCY_CLASS = Object.freeze({
  HARD_CAPABILITY: 'hard_capability',
  ACTION_REQUIRED: 'action_required',
});

const CLASS_FOR_KIND = Object.freeze({
  vehicle_capability: DEPENDENCY_CLASS.HARD_CAPABILITY,
  // P0-5 — dimensional limits are hard: a 24-ft RV does not fit a 21-ft road
  // no matter how the day is arranged. Resolution is arithmetic, not a held
  // capability, so CAPABILITY_FOR_KIND deliberately maps it to null.
  vehicle_dimension: DEPENDENCY_CLASS.HARD_CAPABILITY,
  unpaved_or_rough_road: DEPENDENCY_CLASS.HARD_CAPABILITY,
  technical_access: DEPENDENCY_CLASS.HARD_CAPABILITY,
  permit: DEPENDENCY_CLASS.ACTION_REQUIRED,
  water_or_shuttle_access: DEPENDENCY_CLASS.ACTION_REQUIRED,
  // JUDGMENT CALL, stated so it can be overruled in one line: you CAN reach a
  // place with no water or fuel — you have to arrive prepared. That is an action,
  // not a capability you either possess or lack.
  remote_self_sufficiency: DEPENDENCY_CLASS.ACTION_REQUIRED,
  seasonal_access: DEPENDENCY_CLASS.ACTION_REQUIRED,
});

/**
 * TYPED CAPABILITY MATCHING.
 *
 * The previous rule was a bare truthiness test on a single "did they declare any
 * capability" string, so a traveler who mentioned a 4WD silently satisfied a
 * backcountry permit, a boat ticket and a self-sufficiency requirement too.
 * Owning a vehicle is not owning a permit. Every off-diagonal must fail.
 */
const CAPABILITY = Object.freeze({
  VEHICLE: 'vehicle',
  TECHNICAL: 'technical',
  PERMIT: 'permit',
  BACKCOUNTRY: 'backcountry',
  WATER_TRANSPORT: 'water_transport',
});

const CAPABILITY_FOR_KIND = Object.freeze({
  vehicle_capability: CAPABILITY.VEHICLE,
  vehicle_dimension: null,
  unpaved_or_rough_road: CAPABILITY.VEHICLE,
  technical_access: CAPABILITY.TECHNICAL,
  permit: CAPABILITY.PERMIT,
  water_or_shuttle_access: CAPABILITY.WATER_TRANSPORT,
  remote_self_sufficiency: CAPABILITY.BACKCOUNTRY,
  seasonal_access: null,
});

const FIT = Object.freeze({
  COMPATIBLE: 'compatible',
  DEPENDENCY: 'dependency',
  UNKNOWN: 'unknown',
  INCOMPATIBLE: 'incompatible',
});

/**
 * Access-requirement families. Each pattern must describe a REQUIREMENT, not a
 * mood: "remote landscape photography" is a feeling, "reached by rough dirt
 * roads" is a requirement. Remoteness corroborates a dependency; it never
 * creates one on its own.
 */
const VEHICLE_CAPABILITY_SELF = /\b(4wd|4x4|four[- ]wheel[- ]drive|high[- ]clearance|suitable for your vehicle|appropriate for your vehicle|vehicle restrictions?|jeep roads?)\b|\bnot (?:recommended|suitable|advised) for passenger (?:cars|vehicles)\b/i;

const DEPENDENCY_PATTERNS = Object.freeze([
  ['vehicle_capability', VEHICLE_CAPABILITY_SELF],
  // CORROBORATION ONLY (see `requiresCapability` below). A stop saying it is
  // "reached by a dirt road" is describing a surface, not stating that the
  // traveller needs a different vehicle.
  ['unpaved_or_rough_road', /\b(dirt roads?|unpaved roads?|gravel roads?|rough roads?|primitive roads?|washboard|backcountry roads?)\b/i, { requiresCapability: true }],
  ['permit', /\b(permits? (?:are |is )?required|requires? a permit|backcountry permit|day[- ]use permit|permitted where required|reservation is required|requires? a reservation)\b/i],
  ['remote_self_sufficiency', /\b(no potable water|no (?:food|fuel|water|services|gas)[,.]?|bring (?:all|what you need)|self[- ]sufficien\w*|carry all your own)\b/i],
  ['technical_access', /\b(technical (?:terrain|climbing|route)|scrambling required|rope|canyoneering|via ferrata)\b/i],
  ['water_or_shuttle_access', /\b(boat access only|accessible only by boat|ferry[- ]only|shuttle[- ]only|water taxi)\b/i],
]);

/** Corroborating remoteness language — meaningful only beside a real requirement. */
const REMOTENESS = /\b(remote|backcountry|isolated|far from services)\b/i;

/**
 * An explicit constraint that a specialized-access dependency directly violates.
 * These are traveller statements of capability, not inferences from pace.
 */
function hardMobilityConstraint(constraints) {
  // Canonical projection only. This function used to read `constraints.mobilityRaw`
  // (which has no producer anywhere in server/src) and flat root fields — the
  // shape the offline gate harnesses emit. On a real production object both
  // branches resolved to undefined, so a traveller who had stated a wheelchair
  // was never recognised here. See canonicalRuntimeProjection.
  const mobility = resolveRuntimeMobility(constraints);
  if (mobility.wheelchair === true) return 'wheelchair';
  if (mobility.stroller === true) return 'stroller';
  if (mobility.avoidStairs === true) return 'avoid_stairs';
  if (mobility.requiresFrequentBreaks === true) return 'frequent_breaks';
  return null;
}

/**
 * A LOW-EFFORT PROFILE, in the traveller's own terms. This is the population the
 * anchoring rule protects: someone who asked for a relaxed, easy trip and said
 * nothing about specialized vehicles or backcountry travel.
 */
function lowEffortProfile(constraints, userPrompt = '') {
  const pace = String(resolveRuntimePace(constraints) ?? '').toLowerCase();
  // `fitness` and `preferences.fitness` were also harness dialects: the producer
  // emits `fitnessLevel`, and the durable copy lives at
  // `planningState.preferences.fitness`.
  const fitness = String(resolveRuntimeFitness(constraints) ?? '').toLowerCase();
  const prompt = String(userPrompt || '');
  return Boolean(
    pace === 'relaxed'
    || pace === 'light'
    || fitness === 'easy'
    || hardMobilityConstraint(constraints)
    || /\b(relaxed|easygoing|easy[- ]going|take it easy|not rush|without rushing|leisurely)\b/i.test(prompt)
  );
}

/**
 * Which capabilities has the traveller actually established? Nothing in canonical
 * state models vehicle capability or backcountry experience today, so this is
 * currently only ever satisfied by the traveller saying so outright. It is a
 * seam, not a stub: when a producer exists it plugs in here.
 *
 * Returns a SET, per capability. The single-string version this replaces was
 * consumed as a bare truthiness test, which made any one declaration satisfy
 * every requirement in the vocabulary.
 *
 * @returns {Set<string>}
 */
function declaredCapabilities(constraints, userPrompt = '') {
  const prompt = String(userPrompt || '');
  const held = new Set();
  if (/\b(4wd|4x4|four[- ]wheel[- ]drive|high[- ]clearance|jeep|off[- ]road)\b/i.test(prompt)) held.add(CAPABILITY.VEHICLE);
  const mode = String(resolveRuntimeTransportMode(constraints) ?? '').toLowerCase();
  if (/4wd|4x4|high[- ]clearance|jeep/.test(mode)) held.add(CAPABILITY.VEHICLE);
  // A permit is a thing you HOLD. "backcountry" on its own describes where you
  // are willing to go, not a permit you have been issued.
  if (/\b(we have (?:a |the )?permits?|already have (?:a |the )?permits?|permits? in hand|our permits?)\b/i.test(prompt)) held.add(CAPABILITY.PERMIT);
  if (/\b(backcountry|backpacking)\b/i.test(prompt)) held.add(CAPABILITY.BACKCOUNTRY);
  if (/\b(we have (?:a )?(?:boat|kayak|canoe)|our own boat)\b/i.test(prompt)) held.add(CAPABILITY.WATER_TRANSPORT);
  if (/\b(experienced climbers?|canyoneering experience|scrambling experience|we climb)\b/i.test(prompt)) held.add(CAPABILITY.TECHNICAL);
  return held;
}

/**
 * @deprecated Kept only so an external caller reading the old single-string shape
 * does not break. The fit path uses `declaredCapabilities`, because one
 * capability must never satisfy an unrelated requirement.
 */
function declaredCapability(constraints, userPrompt = '') {
  const held = declaredCapabilities(constraints, userPrompt);
  if (held.has(CAPABILITY.VEHICLE)) return 'vehicle';
  if (held.has(CAPABILITY.BACKCOUNTRY) || held.has(CAPABILITY.PERMIT)) return 'backcountry';
  return null;
}

function stopProse(stop) {
  return [stop?.name, stop?.note, stop?.why, stop?.description]
    .filter(Boolean).join(' ');
}

/**
 * What access requirement does this stop assert ABOUT ITSELF?
 * Structured metadata would be better and does not exist yet — the candidate
 * schema (`npsEvidenceProvider` normalizedValue) carries difficulty, exposure,
 * walking distance and accessibility, but no vehicle, permit or road field.
 */
function detectAccessDependency(stop) {
  const text = stopProse(stop);
  const capabilityEstablished = VEHICLE_CAPABILITY_SELF.test(text);
  const kinds = [];
  for (const [kind, pattern, options] of DEPENDENCY_PATTERNS) {
    if (options?.requiresCapability && !capabilityEstablished) continue;
    if (pattern.test(text)) kinds.push(kind);
  }
  return {
    present: kinds.length > 0,
    kinds,
    remote: REMOTENESS.test(text),
  };
}

/**
 * COMPATIBLE / DEPENDENCY / UNKNOWN / INCOMPATIBLE for one candidate.
 *
 * Soft friction (a longer drive, more logistics, genuinely remote but ordinary
 * access) is deliberately NOT a finding — it is planning quality, not a fit
 * failure, and turning every wrinkle into a rejection would stonewall.
 */
function classifyCandidateFit({
  stop, constraints = null, userPrompt = '', authoritativeFacts = [], binding = null,
} = {}) {
  // AUTHORITY ORDER. Official facts about the PLACE first; the stop's own
  // wording is corroboration only. A requirement does not stop being true
  // because the generated note failed to mention it — that false negative is
  // exactly what a self-disclosure-only rule would have.
  const declared = detectAccessDependency(stop);
  const allFacts = Array.isArray(authoritativeFacts) ? authoritativeFacts : [];

  // P0-5 — DIMENSIONAL LIMITS ARE ARITHMETIC, resolved here rather than fed to
  // the capability matcher. Traveler length vs. official maximum:
  //   exceeds       → INCOMPATIBLE, position-independent, both numbers stated
  //   fits / no oversized vehicle mentioned → the limit binds nothing
  //   vehicle named without a length → UNKNOWN via the generic fail-closed path
  const dimensionFacts = allFacts.filter(
    (f) => f?.type === CONSTRAINT_TYPE.VEHICLE_DIMENSION && Number.isFinite(Number(f?.dimension?.maxLengthFeet))
  );
  let facts = allFacts;
  if (dimensionFacts.length > 0) {
    const vehicle = resolveTravelerVehicle({ constraints, userPrompt });
    const limitFact = dimensionFacts.reduce(
      (tightest, f) => (Number(f.dimension.maxLengthFeet) < Number(tightest.dimension.maxLengthFeet) ? f : tightest)
    );
    const maxLengthFeet = Number(limitFact.dimension.maxLengthFeet);
    const outcome = vehicle
      ? assessVehicleDimensionFit({ vehicleLengthFeet: vehicle.lengthFeet, maxLengthFeet })
      : { status: 'compatible' };

    if (outcome.status === 'incompatible') {
      const conflict = describeVehicleDimensionConflict({
        vehicle, maxLengthFeet, subjectName: limitFact?.subject?.name || stop?.name || 'this road',
      });
      const requirement = {
        kind: 'vehicle_dimension',
        dependencyClass: DEPENDENCY_CLASS.HARD_CAPABILITY,
        requirement: conflict,
        // Exact numbers, both machine-owned: the traveler's stated length and
        // the official limit. Never re-derived from prose downstream.
        observedValue: `${formatFeet(outcome.vehicleLengthFeet)} ft`,
        limitValue: `${formatFeet(maxLengthFeet)} ft`,
        plannerRule: limitFact?.plannerRule ?? null,
        confidence: limitFact?.confidence ?? null,
        source: 'official',
        binding: {
          relationship: 'direct',
          mechanism: binding?.mechanism ?? BINDING_MECHANISM.IDENTITY_EQUIVALENT_NAME,
          subjectName: limitFact?.subject?.name ?? null,
          subjectEntityId: limitFact?.subject?.entityId ?? null,
        },
      };
      return {
        fit: FIT.INCOMPATIBLE,
        kinds: ['vehicle_dimension'],
        dependency: { present: true, kinds: ['vehicle_dimension'], remote: false, source: 'official' },
        violates: 'vehicle_dimension_limit',
        requirements: [requirement],
      };
    }
    if (outcome.status !== 'unknown') {
      // Fits, or no oversized vehicle in play: the limit binds nothing here.
      facts = allFacts.filter((f) => !dimensionFacts.includes(f));
    }
  }

  const officialKinds = facts.map((f) => TYPE_TO_KIND[f?.type]).filter(Boolean);
  const kinds = [...new Set([...officialKinds, ...declared.kinds])];
  const dependency = {
    present: kinds.length > 0,
    kinds,
    remote: declared.remote,
    source: officialKinds.length > 0
      ? (declared.kinds.length > 0 ? 'official_and_declared' : 'official')
      : (declared.kinds.length > 0 ? 'declared_only' : 'none'),
  };
  if (!dependency.present) {
    return { fit: FIT.COMPATIBLE, kinds: [], dependency, requirements: [] };
  }

  // PHASE 4Q — the requirement description the producer already wrote, carried
  // rather than discarded. `requirement` and `plannerRule` are the only things
  // that can tell a traveller WHAT to arrange, and both were being dropped here.
  const factForKind = new Map();
  for (const fact of facts) {
    const kind = TYPE_TO_KIND[fact?.type];
    if (kind && !factForKind.has(kind)) factForKind.set(kind, fact);
  }
  const describe = (kind) => {
    const fact = factForKind.get(kind) || null;
    return {
      kind,
      dependencyClass: CLASS_FOR_KIND[kind] || DEPENDENCY_CLASS.HARD_CAPABILITY,
      requirement: fact?.requirement ?? KIND_LANGUAGE[kind] ?? kind,
      plannerRule: fact?.plannerRule ?? null,
      confidence: fact?.confidence ?? null,
      source: fact ? 'official' : 'declared_only',
      // PHASE 4T — WHOSE requirement is this, and how did it get here. A
      // requirement that cannot name its subject cannot be stated truthfully.
      binding: fact
        ? {
          relationship: 'direct',
          mechanism: binding?.mechanism ?? BINDING_MECHANISM.IDENTITY_EQUIVALENT_NAME,
          subjectName: fact?.subject?.name ?? null,
          subjectEntityId: fact?.subject?.entityId ?? null,
        }
        : { relationship: 'direct', mechanism: 'stop_self_disclosure', subjectName: stop?.name ?? null, subjectEntityId: null },
    };
  };

  const held = declaredCapabilities(constraints, userPrompt);
  const satisfied = (kind) => {
    const needed = CAPABILITY_FOR_KIND[kind];
    return Boolean(needed) && held.has(needed);
  };
  const hardKinds = kinds.filter((k) => CLASS_FOR_KIND[k] === DEPENDENCY_CLASS.HARD_CAPABILITY);
  const actionKinds = kinds.filter((k) => CLASS_FOR_KIND[k] === DEPENDENCY_CLASS.ACTION_REQUIRED);
  const unsatisfiedHard = hardKinds.filter((k) => !satisfied(k));
  // An ACTION_REQUIRED obligation the traveller has not discharged still travels
  // with the recommendation; one they already hold does not.
  const outstandingActions = actionKinds.filter((k) => !satisfied(k)).map(describe);

  const hard = hardMobilityConstraint(constraints);
  if (hard && hardKinds.length > 0) {
    return {
      fit: FIT.INCOMPATIBLE, kinds: dependency.kinds, dependency, violates: hard,
      requirements: [...unsatisfiedHard.map(describe), ...outstandingActions],
    };
  }
  if (unsatisfiedHard.length > 0) {
    // A hard capability requirement the traveller has not established. Position
    // in the day is deliberately NOT consulted: a thirty-minute 4WD road still
    // requires 4WD.
    return {
      fit: FIT.UNKNOWN, kinds: dependency.kinds, dependency,
      requirements: [...unsatisfiedHard.map(describe), ...outstandingActions],
    };
  }
  // Every hard requirement is met — by a capability of the RIGHT KIND. Whatever
  // remains is actionable, and an actionable requirement is not a defect.
  return { fit: FIT.DEPENDENCY, kinds: dependency.kinds, dependency, requirements: outstandingActions };
}

/** Longest experiential stop on a day — what the day is actually built around. */
function dayAnchor(stops) {
  let best = null;
  for (const stop of stops) {
    const minutes = Number(stop?.duration) || 0;
    if (!best || minutes > (Number(best.duration) || 0)) best = stop;
  }
  return best;
}

function namedStops(day) {
  return (day?.stops || []).filter((s) => String(s?.name || '').trim());
}

/**
 * @returns {{ok:boolean, reasonCodes:string[], findings:Array<Object>}}
 */
function evaluateTravelerFit({
  itineraryData = null, constraints = null, userPrompt = '', evidenceBundle = null,
} = {}) {
  const days = Array.isArray(itineraryData?.days) ? itineraryData.days : [];
  // Authoritative operational facts, indexed by place identity.
  // PHASE 4T — the index carries the bundle, so a model-authored label is
  // resolved to an ENTITY once, here, instead of being re-guessed by name at
  // every binding site.
  const factIndex = indexFactsByPlace({
    facts: operationalFactsFromBundle(evidenceBundle),
    bundle: evidenceBundle,
  });
  const findings = [];
  const requirements = [];
  const reasonCodes = [];
  // PHASE 4Q — `lowEffort` no longer gates whether a requirement EXISTS. It is
  // kept as presentation weight: the same obligation on a day's anchor deserves
  // a louder surface than one on a short supporting stop.
  const lowEffort = lowEffortProfile(constraints, userPrompt);

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    const stops = namedStops(day);
    if (stops.length === 0) continue;
    const anchor = dayAnchor(stops);
    const dayNumber = Number.isFinite(Number(day?.dayNumber))
      ? Number(day.dayNumber)
      : (Number.isFinite(Number(day?.day)) ? Number(day.day) : i + 1);

    for (const stop of stops) {
      const bound = bindFactsToStop(stop, factIndex);
      const verdict = classifyCandidateFit({
        stop, constraints, userPrompt, authoritativeFacts: bound.facts, binding: bound,
      });
      const isAnchor = stop === anchor;
      // Importance, not severity. It decides how loudly an obligation is
      // surfaced; it never decides whether the obligation is there.
      const presentationWeight = isAnchor && lowEffort ? 'prominent' : 'inline';

      // PHASE 4Q — an ACTION_REQUIRED obligation the traveller has not discharged
      // travels WITH the recommendation instead of invalidating it. Recording it
      // here is what stops "permit required" from being silently green: the
      // machine, not model prose, owns the requirement.
      for (const requirement of verdict.requirements || []) {
        if (requirement.dependencyClass !== DEPENDENCY_CLASS.ACTION_REQUIRED) continue;
        requirements.push({ dayNumber, stopName: stop.name, presentationWeight, ...requirement });
      }

      if (verdict.fit === FIT.COMPATIBLE || verdict.fit === FIT.DEPENDENCY) continue;

      const hardRequirements = (verdict.requirements || [])
        .filter((r) => r.dependencyClass === DEPENDENCY_CLASS.HARD_CAPABILITY);

      if (verdict.fit === FIT.INCOMPATIBLE) {
        reasonCodes.push('traveler_fit_incompatible');
        findings.push({
          dayNumber, stopName: stop.name, fit: verdict.fit,
          kinds: verdict.kinds, violates: verdict.violates,
          source: verdict.dependency?.source || 'declared_only',
          presentationWeight, requirements: hardRequirements,
        });
        continue;
      }

      // UNKNOWN — a HARD CAPABILITY requirement the traveller has not
      // established. Phase 4P measured the old rule (`isAnchor && lowEffort`)
      // letting an official "high-clearance four-wheel-drive required" fact pass
      // on a thirty-minute stop, and letting it pass at ANY position for a
      // traveller who had simply said nothing about themselves. Position and
      // pace take no part here.
      reasonCodes.push('unverified_access_dependency');
      findings.push({
        dayNumber, stopName: stop.name, fit: verdict.fit, kinds: verdict.kinds,
        source: verdict.dependency?.source || 'declared_only',
        presentationWeight, requirements: hardRequirements,
      });
    }
  }

  const unique = [...new Set(reasonCodes)];
  return { ok: unique.length === 0, reasonCodes: unique, findings, requirements };
}

const KIND_LANGUAGE = Object.freeze({
  vehicle_capability: 'a particular kind of vehicle',
  vehicle_dimension: 'a vehicle within the posted size limit',
  unpaved_or_rough_road: 'unpaved or rough-road access',
  permit: 'a permit or reservation',
  remote_self_sufficiency: 'carrying your own water, food and fuel',
  technical_access: 'technical terrain skills',
  water_or_shuttle_access: 'boat or shuttle access',
});

function buildTravelerFitRepairInstructions({ reasonCodes = [], findings = [] } = {}) {
  const codes = [...new Set((reasonCodes || []).filter((c) => typeof c === 'string'))];
  if (codes.length === 0) return '';
  const lines = [];

  const unverified = (findings || []).filter((f) => f.fit === FIT.UNKNOWN);
  if (codes.includes('unverified_access_dependency') && unverified.length > 0) {
    for (const f of unverified.slice(0, 4)) {
      const needs = (f.kinds || []).map((k) => KIND_LANGUAGE[k]).filter(Boolean);
      // PHASE 4Q — no longer "do not make it the anchor". The requirement does
      // not depend on how long the stop is, so neither does the instruction.
      lines.push(
        `Day ${f.dayNumber} includes ${f.stopName}, which needs ${needs.join(' and ') || 'special access'}. `
        + 'This traveller has not said they have that, so it cannot appear as an ordinary stop — '
        + 'not as the anchor of the day and not as a short one either. '
        + 'Replace it with somewhere reachable the ordinary way, or state the requirement plainly '
        + 'in the same breath as the recommendation. Do not invent a substitute you have no evidence for, '
        + 'and if the trip facts hold no comparable alternative, say so.'
      );
    }
  }

  const incompatible = (findings || []).filter((f) => f.fit === FIT.INCOMPATIBLE);
  if (codes.includes('traveler_fit_incompatible') && incompatible.length > 0) {
    for (const f of incompatible.slice(0, 4)) {
      // P0-5 — a dimensional conflict carries its exact numbers ("Your RV is
      // 24 ft; X allows vehicles up to 21 ft"), so the repair can restructure
      // around the road instead of re-guessing what was wrong.
      const detail = (f.requirements || [])
        .map((r) => r?.requirement)
        .filter((r) => typeof r === 'string' && r.trim())
        .join(' ');
      lines.push(
        `Day ${f.dayNumber}: ${f.stopName} requires access this traveller has explicitly ruled out`
        + `${detail ? ` — ${detail}` : '. '} `
        + 'Remove it and rebuild that part of the day around access that works for this traveller '
        + '(shuttle, alternate route, or a different area). Do not describe the removed option as suitable, '
        + 'and do not present the plan as if the conflict did not exist.'
      );
    }
  }

  return lines.join('\n');
}


/**
 * PHASE 2 — TRAVELER-FIT FINDINGS -> SHARED DAY DIAGNOSTICS.
 *
 * `evaluateTravelerFit` has always known which day each finding belongs to; the
 * value simply never reached the shared `dayDiagnostics` shape that the rest of
 * the repair machinery resolves scope from. That was the last creation-path
 * scope hole in the 2026-08-28 audit: `unverified_access_dependency_anchor` was
 * the one failed attempt of 41 whose repair scope a machine could not resolve,
 * purely because the day was dropped in transit.
 *
 * This is a PROJECTION ONLY. `evaluateTravelerFit` is unchanged, no verdict
 * moves, no reason code is added or removed, and no repair behaviour depends on
 * it. It reshapes data that already exists.
 *
 * FAILS CLOSED. If any finding cannot be placed on a day, the whole projection
 * is refused (`ok: false`) rather than emitting a partial map — a partial map
 * would look like a fully resolved scope and silently under-report the damage.
 * An unresolved scope is a correct answer; a guessed one is not.
 *
 * @returns {{ok:boolean, dayDiagnostics:Array<{dayIndex:number|null,dayNumber:number,codes:string[],stopNames:string[]}>, unplaced:number}}
 */
function buildTravelerFitDayDiagnostics({ findings = [] } = {}) {
  const list = Array.isArray(findings) ? findings : [];
  // Type first, then value. `Number(null)` is 0 and passes `Number.isFinite`,
  // so coercing before checking would silently place an unplaceable finding on
  // "day 0" — a guessed scope wearing the shape of a resolved one. Day numbers
  // are 1-based integers or the finding is not placeable.
  const placeable = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;
  const unplaced = list.filter((f) => !placeable(f?.dayNumber)).length;
  if (unplaced > 0) return { ok: false, dayDiagnostics: [], unplaced };

  const byDay = new Map();
  for (const finding of list) {
    const dayNumber = finding.dayNumber;
    if (!byDay.has(dayNumber)) byDay.set(dayNumber, { codes: new Set(), stopNames: [] });
    const row = byDay.get(dayNumber);
    // The code each finding implies, using the SAME mapping `evaluateTravelerFit`
    // uses when it raises them. Nothing new is invented here.
    if (finding.fit === FIT.INCOMPATIBLE) row.codes.add('traveler_fit_incompatible');
    else if (finding.fit === FIT.UNKNOWN) row.codes.add('unverified_access_dependency');
    const name = typeof finding.stopName === 'string' ? finding.stopName.trim() : '';
    if (name && !row.stopNames.includes(name)) row.stopNames.push(name);
  }

  const dayDiagnostics = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayNumber, row]) => ({
      dayIndex: null,
      dayNumber,
      codes: [...row.codes],
      stopNames: row.stopNames.slice(0, 8),
    }))
    .filter((d) => d.codes.length > 0);

  return { ok: true, dayDiagnostics, unplaced: 0 };
}

module.exports = {
  FIT,
  evaluateTravelerFit,
  classifyCandidateFit,
  detectAccessDependency,
  buildTravelerFitRepairInstructions,
  buildTravelerFitDayDiagnostics,
  lowEffortProfile,
  declaredCapability,
  declaredCapabilities,
  CAPABILITY,
  CAPABILITY_FOR_KIND,
  CLASS_FOR_KIND,
  DEPENDENCY_CLASS,
  TYPE_TO_KIND,
  FIT,
};
