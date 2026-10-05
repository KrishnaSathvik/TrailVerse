'use strict';

/**
 * Deterministic itinerary content-sufficiency checks.
 *
 * Complements schema/feasibility validation: a plan can be structurally valid
 * yet still fail to deliver a usable traveler answer (logistics+meal days,
 * no backup when asked, missing requested experiences, etc.).
 *
 * Keep rules generic and objective — never demo-question specific.
 */

const {
  evaluateHardExposureEligibility,
  evaluateHardMobilityEligibility,
  evaluateHardAccessEligibility,
} = require('./hardConstraintEligibility');
const { runtimeMobilityField, resolveRuntimePace, resolveRuntimeFitness, resolveRuntimeActivityPreference } = require('./canonicalRuntimeProjection');
const { isAvoidExposureActive } = require('./planningInputContract');
const {
  buildBackupCandidateContext,
  normalizeCanonicalBackup,
  structuredBackupGroundedInEvidence,
  formatBackupCandidatePromptBlock,
  extractBlockedAccessDependencies,
} = require('./backupCandidateContext');
const {
  canonicalExperienceKey,
  classifyExperienceRelationship,
} = require('./canonicalExperience');
const { evaluateRefinementOwnership } = require('./itineraryPlanPatch');
const { createStopIdentityComparator } = require('./stopExperienceIdentity');
const { hasRecommendedHazard, stripConcernHedges } = require('./hazardRejectionSemantics');
const {
  ASK_PATTERNS,
  evaluateRequestedExperienceCoverage,
  REASON_CODE,
} = require('./requestedExperienceCoverage');

const BACKUP_REQUEST =
  /\b(backup|fall[- ]?back|if .{0,60}(?:doesn'?t|does not|won'?t|cannot|can'?t|fails?|doesn'?t work)|alternative plan|plan b|what if)\b/i;

const WEAK_INDOOR_BACKUP =
  /\b(park film|visitor center (?:film|movie|exhibit)|gift shop|indoor (?:exhibit|film))\b/i;

/** Vague status-check language is not a substantive alternate experience. */
const WEAK_CONDITIONS_BACKUP =
  /\b(check (?:conditions?|status|access|parking|with)|verify (?:access|parking|conditions?|status)|see (?:if|whether)|confirm (?:access|parking|conditions?|status)|ask (?:a )?ranger)\b/i;

/**
 * Exposure the stop prose OFFERS. Deliberately narrower than the prose-safety
 * validator's vocabulary: bare "exposed" is not by itself an unsafe claim here,
 * because structured `exposureLevel` is authoritative for this validator and a
 * separate code covers moderate/high metadata.
 *
 * Safe and negated phrasing is no longer stripped by hand. "avoid cliff edges",
 * "rather than the trail, which has moderate drop-offs" and "low-exposure walk"
 * are all judged by the SAME recommendation/rejection semantics the prose-safety
 * validator uses, which is what stops the two validators disagreeing about the
 * same clause.
 */
const UNSAFE_EXPOSURE_RESIDUAL =
  /\b(?:(?:moderate|significant|high|long|scary|unprotected|narrow|substantial)\s+)?(?:drop[- ]?offs?|exposed (?:sections?|ledges?|edges?|terrain|cliffs?)|cliff[- ]?(?:edges?|sides?)|sheer (?:drops?|cliffs?|walls?)|narrow ledges?|heights?)\b/i;

const MODERATE_HIGH_EXPOSURE_CLAIM =
  /\b(?:moderate|high|significant|scary)\s+exposure\b/i;

const UNSAFE_EXPOSURE_HAZARD = new RegExp(
  `${UNSAFE_EXPOSURE_RESIDUAL.source}|${MODERATE_HIGH_EXPOSURE_CLAIM.source}`,
  'i',
);

const UNSUPPORTED_ABSOLUTE_SAFETY =
  /\b(?:completely|totally|perfectly)\s+safe\b/i;

/** Single experiential stop below this duration (minutes) is thin when alone. */
const SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES = 90;

/**
 * TRAVELER-RELATIVE COVERAGE.
 *
 * The 90-minute floor above answers "is this ONE stop a substantial day on its
 * own?". That is the right question for an ordinary traveler and it is left
 * exactly as it was. It is the WRONG question once the traveler has explicitly
 * asked for less walking: shortening the day's walk is compliance, not laziness,
 * and a validator that only knows how to ask for a longer walk can only ever
 * tell such a traveler to walk more.
 *
 * Under a NON-NUMERIC limited-walking constraint the day is judged on the day
 * instead of on its single longest walk: it must still contain at least
 * `LIMITED_WALKING_MIN_DISTINCT_DAY_EXPERIENCES` genuinely distinct named
 * places, and their scheduled minutes must still reach the SAME floor. The
 * mobility policy changes the SHAPE of a complete day (one long walk -> several
 * short low-effort stops); it never lowers the amount of day the traveler is
 * owed, and it introduces no second magic number.
 */
const LIMITED_WALKING_MIN_DISTINCT_DAY_EXPERIENCES = 2;

/** Bounded coverage policy labels — diagnostics only, never chain-of-thought. */
const COVERAGE_POLICIES = Object.freeze(['standard', 'mobility_limited', 'numeric_mobility']);

const LOGISTICS_META =
  /\b(conditions check|orientation stop|parking(?:-to-trail)? transition|check[- ]?in|supplies|departure buffer|return[- ]to[- ]vehicle|park entrance or visitor center)\b/i;

const REST_MEAL =
  /\b(rest|break|lunch|dinner|breakfast|brunch|snack|midday retreat|heat break|recovery|overnight|hotel|lodging)\b/i;

const EXPERIENTIAL =
  /\b(hike|trail|walk|stroll|viewpoint|overlook|scenic|wildlife|lookout|pools?|canyon|waterfall|beach|boardwalk|petroglyph|formation|arch|mesa|dune|geyser|meadow|summit|rim|grove|falls|shoreline|lake|pass area|scenic drive|highway|parkway|byway|ferry|district|neighborhood|auto[- ]tour|loop (?:road|drive))\b/i;

const GENERIC_PLACE =
  /\b(flexible|ranger[- ]confirmed|scenic hour|final scenic|open[- ]air overlook|roadside (?:sandstone )?viewpoints?)\b/i;

const ADD_MUTATION =
  /\b(?:add|include|insert)\b.{0,40}\b(sunset|sunrise|golden hour|hike|trail|walk|viewpoint|overlook|lunch|rest|picnic)\b/i;

const SUNSET_ASK = ASK_PATTERNS.goldenHour;
const HIKE_ASK = ASK_PATTERNS.hiking;
const SCENIC_ASK = ASK_PATTERNS.viewpoint;
const WILDLIFE_ASK = ASK_PATTERNS.wildlife;

const LIGHT_DAY_HINT =
  /\b(arrival day|depart(?:ure)? day|travel day|transfer day|rest day|drive day|half[- ]day|short day)\b/i;

const EXPLICIT_MINIMAL =
  /\b(minimal activity|mostly rest|rest day|take it easy all day|do almost nothing)\b/i;

function stopText(stop) {
  return `${stop?.name || ''} ${stop?.note || ''} ${stop?.why || ''} ${stop?.type || ''} ${stop?.timeWindow || ''}`.toLowerCase();
}

/**
 * The same fields, kept SEPARATE. Rejection semantics are directional, so
 * joining fields into one string lets a rejection verb in an earlier field
 * govern a hazard in a later one — a false negative on a safety rule.
 */
function stopTextSegments(stop) {
  return [stop?.name, stop?.note, stop?.why, stop?.type, stop?.timeWindow]
    .map((value) => String(value || '').toLowerCase().trim())
    .filter(Boolean);
}

/**
 * Concern-check hedging removed; nothing else is stripped. Kept exported
 * because it is part of this module's published surface, but the hedge
 * vocabulary now lives with the shared polarity semantics so both exposure
 * validators scrub the same phrases.
 */
function residualExposureProse(text) {
  return stripConcernHedges(text);
}

/**
 * True when stop prose OFFERS material unsafe exposure. Structured
 * `exposureLevel` remains authoritative for moderate/high stop metadata
 * (separate code).
 */
function hasUnsafeExposureProse(text) {
  return hasRecommendedHazard(text, UNSAFE_EXPOSURE_HAZARD);
}

function hasUnsupportedAbsoluteSafetyClaim(text, structuredLevel) {
  const level = String(structuredLevel || '').toLowerCase();
  if (level === 'low' || level === 'moderate' || level === 'high') return false;
  const t = String(text || '');
  if (!UNSUPPORTED_ABSOLUTE_SAFETY.test(t)) return false;
  // Absolute safety plus non-exposure language without structured support.
  return /\b(non[- ]?exposed|no exposure|without exposure|zero exposure)\b/i.test(t)
    || /\blow[- ]?exposure\b/i.test(t);
}

/**
 * Exposure prose consistency under an avoid-exposure user constraint.
 * @returns {string[]} reason codes (may be empty)
 */
function evaluateStopExposureConsistency(stop, userPrompt = '', constraints = null) {
  if (!isAvoidExposureActive(constraints, userPrompt)) return [];
  const text = stopText(stop);
  const level = String(stop?.exposureLevel || stop?.exposure || '').toLowerCase();
  const codes = [];

  const eligibility = evaluateHardExposureEligibility(stop, { hardConstraintActive: true });
  codes.push(...eligibility.reasonCodes);

  if (hasUnsupportedAbsoluteSafetyClaim(text, level)) {
    codes.push('exposure_prose_conflict');
    return [...new Set(codes)];
  }

  // Structured low/high already handled; prose may still contradict low.
  // Judged per field: a rejection verb in `name` must not govern `note`.
  if (stopTextSegments(stop).some(hasUnsafeExposureProse)) {
    codes.push('exposure_prose_conflict');
  }

  return [...new Set(codes)];
}

function isSubstantialSingleExperience(stop) {
  const duration = Number(stop?.duration) || 0;
  if (duration <= 0) return false;
  return duration >= SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES;
}

/** The one canonical runtime projection — see canonicalRuntimeProjection.js. */
const mobilityConstraint = runtimeMobilityField;

/**
 * Which coverage policy this traveler gets. Deterministic, from canonical
 * structured state only — never from prose or from a day title.
 *
 * `numeric_mobility` deliberately KEEPS the standard coverage shape: an explicit
 * `maxWalkMilesPerSegment` already has authoritative per-stop eligibility
 * semantics, and this change does not touch them.
 *
 * This selects the mobility policy. Pace and other traveler intent determine
 * coverage severity below; requested experiences and hard safety checks remain
 * independent of whether the day intentionally contains less activity.
 *
 * @returns {'standard'|'mobility_limited'|'numeric_mobility'}
 */
function resolveCoveragePolicy(constraints) {
  const numeric = Number(mobilityConstraint(constraints, 'maxWalkMilesPerSegment'));
  if (Number.isFinite(numeric) && numeric > 0) return 'numeric_mobility';
  if (mobilityConstraint(constraints, 'walkingTolerance') === 'limited') return 'mobility_limited';
  if (mobilityConstraint(constraints, 'wheelchair') === true) return 'mobility_limited';
  return 'standard';
}

/**
 * The day's genuinely distinct named content and the minutes it occupies.
 *
 * Counted from STRUCTURED stop data only (`name`, `type`, `duration`,
 * `timeWindow`, plan order) — never from the day title, which is why a day
 * cannot be talked into completeness by renaming it.
 *
 * Distinctness reuses the module's existing canonical-experience semantics, so
 * padding cannot buy coverage: only a `distinct` stop adds a place or minutes.
 * `same_experience` (a renamed copy), `unknown` (unprovable) and even a
 * legitimate `same_place_distinct_visit` revisit all add nothing here.
 */
function distinctDayContent(namedStopList, compareIdentity = null) {
  const counted = [];
  let minutes = 0;
  for (const stop of namedStopList) {
    const name = String(stop?.name || '').trim();
    if (!isIdentifiablePlaceName(name) || GENERIC_PLACE.test(name)) continue;
    const duration = Number(stop?.duration) || 0;
    if (duration <= 0) continue;
    const isNew = counted.every((existing) => classifyExperienceRelationship(existing, stop, {
      interveningStops: stopsScheduledBetween(namedStopList, existing, stop),
      identityRelation: compareIdentity ? compareIdentity(existing, stop) : null,
    }) === 'distinct');
    if (!isNew) continue;
    counted.push(stop);
    minutes += duration;
  }
  return { distinctPlaces: counted.length, minutes };
}

/**
 * A deliberately lower-walking day that is nonetheless a real day.
 *
 * PASSES (A): a shorter experiential stop plus distinct low-effort experiences —
 * viewpoint, museum, visitor/nature center, lodge area, scenic drive, meal or
 * photography time — that together reach the standard content floor.
 * STILL FAILS (B): one short stop with nothing else meaningful beside it.
 * STILL FAILS (C): the same place or activity repeated to thicken the day.
 *
 * Note what this does NOT do: it never asserts a stop is operationally
 * eligible. Exposure and other hard-constraint eligibility stay authoritative
 * upstream, so coverage can no longer be the reason an unknown-eligibility stop
 * gets added (D).
 */
function limitedWalkingDayIsComplete(namedStopList, compareIdentity = null) {
  const { distinctPlaces, minutes } = distinctDayContent(namedStopList, compareIdentity);
  return distinctPlaces >= LIMITED_WALKING_MIN_DISTINCT_DAY_EXPERIENCES
    && minutes >= SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES;
}

function namedStops(day) {
  return (day?.stops || []).filter((s) => String(s?.name || '').trim());
}

/**
 * Stops scheduled between two stops of the same day, in plan order.
 * Ordinal separation evidence for the same-place revisit rule; returns [] when
 * either stop is not part of the list or they are adjacent.
 */
function stopsScheduledBetween(stops, left, right) {
  const list = Array.isArray(stops) ? stops : [];
  const a = list.indexOf(left);
  const b = list.indexOf(right);
  if (a < 0 || b < 0) return [];
  const [from, to] = a <= b ? [a, b] : [b, a];
  return list.slice(from + 1, to);
}

const EXPERIENTIAL_TYPES = new Set([
  'trail', 'landmark', 'hike', 'walk', 'viewpoint', 'overlook', 'activity', 'scenic',
  'scenic_drive', 'lake', 'historic', 'ranger_program', 'museum', 'wildlife',
  'photography', 'geothermal', 'beach', 'boat', 'accessible',
  // Typed grounded experiences beyond simple POIs
  'area', 'district', 'region', 'route', 'ferry', 'experience',
]);
const LOGISTICS_TYPES = new Set([
  'visitor_center', 'logistics', 'transport', 'parking', 'shuttle', 'drive',
]);
const REST_MEAL_TYPES = new Set([
  'restaurant', 'lodging', 'lodge', 'campground', 'meal', 'picnic', 'picnic_area',
]);

/**
 * Identity-bearing fields beat narrative mentions.
 * A trail whose note mentions a visitor center endpoint is still a trail —
 * narrative "Visitor Center" / parking / shuttle must not override explicit
 * experiential type or name identity (same semantic family as Q2/Q3).
 */
function classifyStop(stop) {
  const type = String(stop?.type || '').toLowerCase().trim();
  const name = String(stop?.name || '');
  const nameText = name.toLowerCase();
  const narrative = `${stop?.note || ''} ${stop?.why || ''} ${stop?.description || ''} ${stop?.timeWindow || ''}`.toLowerCase();
  const text = stopText(stop);

  // 1. Explicit structured type / category
  if (REST_MEAL_TYPES.has(type)) return 'rest_meal';
  if (LOGISTICS_TYPES.has(type)) return 'logistics_meta';
  if (EXPERIENTIAL_TYPES.has(type)) return 'experiential';

  // 2. Canonical name / title identity (not narrative)
  if (
    /\bvisitor center\b/i.test(nameText)
    || LOGISTICS_META.test(nameText)
    || /\b(parking setup|shuttle transfer|hotel check[- ]?in)\b/i.test(nameText)
  ) {
    return 'logistics_meta';
  }

  if (REST_MEAL.test(nameText) && !EXPERIENTIAL.test(nameText)) {
    return 'rest_meal';
  }

  if (EXPERIENTIAL.test(nameText)) {
    return 'experiential';
  }

  // 3. Narrative supplements only when identity is ambiguous
  if (REST_MEAL.test(narrative)) return 'rest_meal';

  // Logistics narrative before experiential narrative — "parking-to-trail
  // transition" must not become an experience anchor via "trail".
  if (LOGISTICS_META.test(narrative) || /\bvisitor center\b/i.test(narrative)) {
    return 'logistics_meta';
  }

  if (EXPERIENTIAL.test(narrative) || EXPERIENTIAL.test(text)) {
    return 'experiential';
  }

  // Identifiable named places/areas count as anchors (e.g. "Logan Pass area").
  if (isIdentifiablePlaceName(name) && !GENERIC_PLACE.test(name)) {
    return 'experiential';
  }

  if (/\b(picnic|interpretive|pause|short stop)\b/i.test(text)) {
    return 'supporting';
  }

  return 'supporting';
}

function isExperiential(stop) {
  return classifyStop(stop) === 'experiential';
}

function isIdentifiablePlaceName(name) {
  const n = String(name || '').trim();
  if (n.length < 4) return false;
  if (GENERIC_PLACE.test(n)) return false;
  // Require at least one capitalised token (place-like) or a known trail/word with length.
  if (/[A-Z][a-z]{2,}/.test(n)) return true;
  // Allow unicode apostrophe place names already lowercased in stopText path —
  // fall back: reject only obvious generics.
  return !/^(scenic|overlook|viewpoint|hike|trail|walk|stop|area)s?$/i.test(n);
}

function collectStructuredAlternatives(itineraryData) {
  const items = [];
  if (Array.isArray(itineraryData?.alternatives)) {
    for (const alt of itineraryData.alternatives) {
      if (typeof alt === 'string' && alt.trim()) items.push({ name: alt.trim() });
      else if (alt && typeof alt === 'object' && String(alt.name || '').trim()) items.push(alt);
    }
  }
  for (const day of itineraryData?.days || []) {
    for (const stop of day?.stops || []) {
      if (Array.isArray(stop.alternatives)) {
        for (const alt of stop.alternatives) {
          if (typeof alt === 'string' && alt.trim()) items.push({ name: alt.trim(), parent: stop.name });
          else if (alt && typeof alt === 'object' && String(alt.name || '').trim()) {
            items.push({ ...alt, parent: stop.name });
          }
        }
      }
      if (Array.isArray(stop.backupOptions)) {
        for (const alt of stop.backupOptions) {
          if (typeof alt === 'string' && alt.trim()) items.push({ name: alt.trim(), parent: stop.name });
          else if (alt && typeof alt === 'object' && String(alt.name || '').trim()) {
            items.push({ ...alt, parent: stop.name });
          }
        }
      }
    }
  }
  return items.filter((a) => isIdentifiablePlaceName(a.name));
}

function extractPrimaryAccessDependencies(prompt) {
  return extractBlockedAccessDependencies(prompt);
}

/**
 * Independence is about the backup's place/access identity — not whether
 * explanatory notes mention the blocked subject ("does not depend on X").
 *
 * A backup depends on a blocked access subject when:
 * - its place name includes that subject, OR
 * - structured dependency fields name that subject
 *
 * Explanatory note/when text may freely refer to the blocked subject.
 */
function alternativeDependsOnBlockedAccess(alternative, dependency) {
  const dep = String(dependency || '').trim().toLowerCase();
  if (!dep) return false;

  const name = String(alternative?.name || '').trim().toLowerCase();
  if (name && name.includes(dep)) return true;

  const structuredFields = [
    alternative?.requires,
    alternative?.dependsOn,
    alternative?.accessDependency,
    alternative?.accessSubject,
    alternative?.requiresAccess,
  ];
  for (const field of structuredFields) {
    if (field == null) continue;
    const values = Array.isArray(field) ? field : [field];
    for (const value of values) {
      const text = String(value || '').trim().toLowerCase();
      if (text && text.includes(dep)) return true;
    }
  }
  return false;
}

function alternativesAvoidPrimaryDependency(alternatives, dependencies) {
  if (!dependencies.length) return true;
  return alternatives.some((alt) =>
    !dependencies.some((dep) => alternativeDependsOnBlockedAccess(alt, dep))
  );
}

function hasActionableOutdoorBackup(alternatives) {
  if (!alternatives.length) return false;
  if (alternatives.every((alt) => WEAK_INDOOR_BACKUP.test(`${alt.name || ''} ${alt.note || ''}`))) {
    return false;
  }
  if (alternatives.every((alt) => WEAK_CONDITIONS_BACKUP.test(`${alt.name || ''} ${alt.note || ''}`))) {
    return false;
  }
  return alternatives.some((alt) => {
    const hay = `${alt.name || ''} ${alt.note || ''}`.toLowerCase();
    if (WEAK_INDOOR_BACKUP.test(hay)) return false;
    if (WEAK_CONDITIONS_BACKUP.test(hay)) return false;
    return EXPERIENTIAL.test(hay) || isIdentifiablePlaceName(alt.name);
  });
}

function alternativesDifferFromPrimaryStops(alternatives, itineraryData) {
  const primaryNames = new Set();
  for (const day of itineraryData?.days || []) {
    for (const stop of namedStops(day)) {
      primaryNames.add(String(stop.name || '').trim().toLowerCase());
    }
  }
  if (primaryNames.size === 0) return true;
  return alternatives.some((alt) => {
    const name = String(alt.name || '').trim().toLowerCase();
    return name && !primaryNames.has(name);
  });
}

function isLighterRefinementRequest(prompt = '') {
  return /\b(?:make|redo|rework)\b.{0,80}\b(?:easier|slower|less busy|more relaxed)\b/i.test(prompt)
    || /\b(?:shorten|simplify)\b.{0,40}\b(?:day|outing|tomorrow|today)\b/i.test(prompt);
}

function dayIsExplicitlyLight(day, userPrompt) {
  const label = `${day?.label || ''} ${day?.title || ''} ${day?.notes || ''}`;
  return EXPLICIT_MINIMAL.test(userPrompt) || (LIGHT_DAY_HINT.test(label) && LIGHT_DAY_HINT.test(userPrompt));
}

function hasSunsetOrientedStop(itineraryData) {
  for (const day of itineraryData?.days || []) {
    for (const stop of namedStops(day)) {
      const text = stopText(stop);
      if (!SUNSET_ASK.test(text) && !/\bgolden hour|late afternoon|dusk\b/i.test(text)) continue;
      if (!isIdentifiablePlaceName(stop.name)) continue;
      if (GENERIC_PLACE.test(stop.name)) continue;
      return true;
    }
  }
  return false;
}

function hasHikeOrWalkStop(itineraryData) {
  for (const day of itineraryData?.days || []) {
    for (const stop of namedStops(day)) {
      const text = stopText(stop);
      const type = String(stop?.type || '').toLowerCase();
      if (type === 'trail') return true;
      if (/\b(hike|trail|walk|stroll|boardwalk)\b/i.test(text) && isIdentifiablePlaceName(stop.name)) {
        return true;
      }
    }
  }
  return false;
}

function hasScenicStop(itineraryData) {
  for (const day of itineraryData?.days || []) {
    for (const stop of namedStops(day)) {
      const text = stopText(stop);
      if (/\b(viewpoint|overlook|scenic|vista|lookout|photography)\b/i.test(text) && isIdentifiablePlaceName(stop.name)) {
        return true;
      }
      if (String(stop?.type || '') === 'landmark' && isIdentifiablePlaceName(stop.name)) return true;
    }
  }
  return false;
}

function hasWildlifeOrientedStop(itineraryData) {
  for (const day of itineraryData?.days || []) {
    for (const stop of namedStops(day)) {
      if (WILDLIFE_ASK.test(stopText(stop))) return true;
    }
  }
  return false;
}

/**
 * Bounded list of explicit refinement mutations from the user prompt.
 * Deterministic — no LLM judge.
 */
function extractRefinementMutations(userPrompt = '') {
  const prompt = String(userPrompt || '');
  const mutations = [];

  let m = prompt.match(ADD_MUTATION);
  if (m) {
    mutations.push({ type: 'add', target: String(m[1] || '').toLowerCase() });
  } else if (/\badd (?:one |a |an )?(?:good )?sunset\b/i.test(prompt)) {
    mutations.push({ type: 'add', target: 'sunset' });
  }

  if (/\b(avoid|skip|reduce|less)\b.{0,40}\b(shuttle|bus)\b/i.test(prompt)) {
    mutations.push({ type: 'avoid', target: 'shuttle' });
  }
  if (/\b(remove|skip|drop)\b.{0,40}\b(long hike|strenuous|hard hike)\b/i.test(prompt)) {
    mutations.push({ type: 'remove', target: 'long_hike' });
  }
  if (/\b(more relaxed|less rushed|slower pace|easier pace)\b/i.test(prompt)
    || /\bmake day\s*\d+\b.{0,40}\b(?:slower|more relaxed|less rushed|easier)\b/i.test(prompt)
    || /\bslower\b.{0,24}\bday\s*\d+\b/i.test(prompt)) {
    mutations.push({ type: 'pace', target: 'relaxed' });
  }
  if (/\breduce driving\b|\bless driving\b|\bcut (?:down )?(?:the )?driving\b/i.test(prompt)) {
    mutations.push({ type: 'reduce', target: 'driving' });
  }

  // Dedupe by type+target
  const seen = new Set();
  return mutations.filter((mut) => {
    const key = `${mut.type}:${mut.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verifyRefinementMutations({ mutations = [], itineraryData = null, priorItineraryData = null } = {}) {
  const reasonCodes = [];
  for (const mut of mutations) {
    if (mut.type === 'add' && SUNSET_ASK.test(mut.target)) {
      if (!hasSunsetOrientedStop(itineraryData)) {
        reasonCodes.push('refinement_missing_added_sunset');
      }
    }
    if (mut.type === 'add' && /\b(hike|trail|walk)\b/i.test(mut.target)) {
      if (!hasHikeOrWalkStop(itineraryData)) {
        reasonCodes.push('refinement_missing_added_hike');
      }
    }
    if (mut.type === 'add' && /\b(viewpoint|overlook)\b/i.test(mut.target)) {
      if (!hasScenicStop(itineraryData)) {
        reasonCodes.push('refinement_missing_added_viewpoint');
      }
    }
    if (mut.type === 'add' && /\blunch\b/i.test(mut.target)) {
      const hasLunch = (itineraryData?.days || []).some((d) =>
        namedStops(d).some((s) => /\blunch\b/i.test(stopText(s)) || s.type === 'restaurant')
      );
      if (!hasLunch) reasonCodes.push('refinement_missing_added_lunch');
    }
    if (mut.type === 'add' && /\brest\b/i.test(mut.target)) {
      const hasRest = (itineraryData?.days || []).some((d) =>
        namedStops(d).some((s) => classifyStop(s) === 'rest_meal')
      );
      if (!hasRest) reasonCodes.push('refinement_missing_added_rest');
    }
    // Relative pacing is checked per affected day by semanticDayValue.

  }
  return { ok: reasonCodes.length === 0, reasonCodes };
}

function dayLabel(day, index) {
  if (Number.isFinite(Number(day?.dayNumber))) return Number(day.dayNumber);
  return Number.isFinite(Number(day?.day)) ? Number(day.day) : index + 1;
}

/**
 * Find cross-day duplicates that the current refinement owns. A full merged
 * candidate can contain old quality debt on untouched days; rejecting that
 * debt would make an unrelated bounded patch impossible to save. Conversely,
 * every duplicate involving a touched day belongs to the candidate mutation
 * and must be repaired before persistence.
 */
function refinementCrossDayDuplicateConflicts(days, touchedDayNumbers, compareIdentity = null) {
  if (!Array.isArray(touchedDayNumbers)) return [];

  const touched = new Set(
    touchedDayNumbers
      .map(Number)
      .filter((dayNumber) => Number.isFinite(dayNumber) && dayNumber > 0)
  );
  if (touched.size === 0) return [];

  const experientialByDay = days.map((day, dayIndex) => ({
    dayIndex,
    dayNumber: dayLabel(day, dayIndex),
    stops: namedStops(day).filter(isExperiential),
  }));
  const conflicts = [];
  const seen = new Set();

  for (let leftIndex = 0; leftIndex < experientialByDay.length; leftIndex += 1) {
    const leftDay = experientialByDay[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < experientialByDay.length; rightIndex += 1) {
      const rightDay = experientialByDay[rightIndex];
      const involvedTouchedDays = [leftDay.dayNumber, rightDay.dayNumber]
        .filter((dayNumber) => touched.has(dayNumber));
      if (involvedTouchedDays.length === 0) continue;

      for (const leftStop of leftDay.stops) {
        for (const rightStop of rightDay.stops) {
          const relationship = classifyExperienceRelationship(leftStop, rightStop, {
            identityRelation: compareIdentity ? compareIdentity(leftStop, rightStop) : null,
          });
          if (relationship === 'distinct' || relationship === 'same_place_distinct_visit') continue;

          const identities = [
            canonicalExperienceKey(leftStop?.name),
            canonicalExperienceKey(rightStop?.name),
          ].sort();
          const key = `${leftDay.dayNumber}:${rightDay.dayNumber}:${identities.join('|')}`;
          if (seen.has(key)) continue;
          seen.add(key);

          conflicts.push({
            dayNumbers: [leftDay.dayNumber, rightDay.dayNumber],
            touchedDayNumbers: involvedTouchedDays,
            conflictType: involvedTouchedDays.length === 2
              ? 'touched_vs_touched'
              : 'touched_vs_untouched',
            experienceIdentity: identities[0] || identities[1] || null,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * @returns {{
 *   ok: boolean,
 *   reasonCodes: string[],
 *   dayDiagnostics: Array<{
 *     dayIndex: number,
 *     dayNumber: number,
 *     codes: string[],
 *     coveragePolicy: 'standard'|'mobility_limited'|'numeric_mobility',
 *     coverageReasonCode?: 'single_short_experience_alone'
 *       |'single_short_experience_supporting_only'
 *       |'limited_walking_day_below_content_floor',
 *     duplicateExperienceConflicts?: Array<{
 *       dayNumbers: number[],
 *       touchedDayNumbers: number[],
 *       conflictType: 'touched_vs_untouched'|'touched_vs_touched',
 *       experienceIdentity: string|null
 *     }>
 *   }>,
 *   coveragePolicy: 'standard'|'mobility_limited'|'numeric_mobility'
 * }}
 */
function evaluateItineraryCompleteness({
  itineraryData = null,
  constraints = null,
  userPrompt = '',
  priorItineraryData = null,
  isRefinement = false,
  evidenceBundle = null,
  touchedDayNumbers = null,
  // Phase 9C.1D.5B — explicit named-experience obligations resolved to evidence
  // identity before generation. Absent/empty keeps this function unchanged.
  namedExperienceRequirements = null,
  // Phase 9C.1D.5C-E3.1 — { trustedReviewerIds, now } for re-validating direct
  // `same_as` from the frozen bundle. Absent means no relationship is trusted;
  // entity identity itself still comes from the bundle.
  relationshipAuthority = null,
  routeArtifact = null,
} = {}) {
  const reasonCodes = [];
  const dayDiagnostics = [];
  const dayValueDiagnostics = [];
  const warnings = [];
  // Legacy backupOptions/contingency/fallback → canonical alternatives before checks.
  const normalizedPlan = itineraryData
    ? normalizeCanonicalBackup(itineraryData)
    : null;
  const days = Array.isArray(normalizedPlan?.days) ? normalizedPlan.days : [];
  const prompt = String(userPrompt || '');
  // Completeness reads the normalized plan for the rest of this function.
  itineraryData = normalizedPlan;
  // Resolved once, from canonical structured constraints only.
  const coveragePolicy = resolveCoveragePolicy(constraints);
  // Phase 9C.1D.5C-E3.1 — authoritative identity answers "same base
  // experience?" when both stops resolve through the frozen bundle; otherwise
  // (null comparator or null verdict) the legacy name classifier decides.
  const compareIdentity = createStopIdentityComparator({
    evidenceBundle,
    trustedReviewerIds: relationshipAuthority?.trustedReviewerIds || [],
    now: relationshipAuthority?.now || new Date(),
  });

  if (days.length === 0) {
    return { ok: false, reasonCodes: ['empty_itinerary'], dayDiagnostics: [], coveragePolicy };
  }

  const expectedDays = Number(
    constraints?.dates?.numDays
      ?? constraints?.dates?.durationDays
      ?? null
  );
  if (Number.isInteger(expectedDays) && expectedDays > 0 && days.length < expectedDays) {
    reasonCodes.push('underfilled_day_count');
  }

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    const dayCodes = [];
    const lighterTouchedDay = isRefinement && isLighterRefinementRequest(prompt)
      && Array.isArray(touchedDayNumbers) && touchedDayNumbers.includes(dayLabel(day, i));
    const dayIntent = require('./dayIntentSemantics').resolveDayIntent({ userPrompt: prompt, constraints,
      dayNumber: dayLabel(day, i), dayCount: days.length, touchedDayNumbers });
    const priorDay = priorItineraryData?.days?.find((d, index) => dayLabel(d, index) === dayLabel(day, i));
    // A bounded edit does not acquire ownership of quality on frozen days.
    if (isRefinement && Array.isArray(touchedDayNumbers) && !touchedDayNumbers.includes(dayLabel(day, i)) && priorDay) continue;
    const named = namedStops(day);
    if (dayIntent.kind === 'rest' && !named.length) {
      dayValueDiagnostics.push({ dayNumber: dayLabel(day, i), codes: [], coverageReasonCode: 'valid_rest_day', dayIntent });
      continue;
    }
    if (named.length === 0) {
      dayCodes.push('empty_day');
      reasonCodes.push('empty_day');
      dayDiagnostics.push({ dayIndex: i, dayNumber: dayLabel(day, i), codes: dayCodes, coveragePolicy });
      continue;
    }

    // A stop with no duration carries zero coverage minutes, so a structurally
    // perfect day fails as `insufficient_day_coverage` — which reads as "add
    // more stops". In the 2026-08-23 gate #2 Acadia turn the model did exactly
    // that: told its day coverage was insufficient, the retry added a third
    // stop and left every duration at 0, and the turn burned three attempts
    // and $0.256 repairing the wrong thing. Naming the real defect is what
    // makes the repair targetable; the schema cannot express a minimum here
    // because the structured-output subset has no numeric constraints.
    const zeroDuration = named.filter((stop) => !(Number(stop?.duration) > 0));
    if (zeroDuration.length === named.length) {
      dayCodes.push('zero_duration_stops');
      reasonCodes.push('zero_duration_stops');
      dayDiagnostics.push({
        dayIndex: i,
        dayNumber: dayLabel(day, i),
        codes: dayCodes,
        coveragePolicy,
        zeroDurationStopNames: zeroDuration.map((stop) => stop?.name).filter(Boolean).slice(0, 8),
      });
      continue;
    }

    if (named.some(stop => !require('./visitExperienceSemantics').areaActionability(stop, evidenceBundle).actionable)) {
      dayCodes.push('experience_not_actionable'); reasonCodes.push('experience_not_actionable');
    }
    const groundedRoles = named.map(stop => require('./semanticDayValue').experienceRole(stop, {bundle:evidenceBundle,classifyStop}));
    const unbound = groundedRoles.some(r => r.reasonCode === 'experience_scope_unbound')
      || !isRefinement && !lighterTouchedDay && !dayIsExplicitlyLight(day, prompt) && groundedRoles.some(r => r.reason === 'visitor_service_support') && !groundedRoles.some(r => r.role === 'primary_experience');
    if (unbound) { dayCodes.push('experience_scope_unbound','insufficient_day_coverage'); reasonCodes.push('experience_scope_unbound','insufficient_day_coverage'); }
    const classes = named.map(classifyStop);
    const experiential = named.filter(stop => require('./semanticDayValue').experienceRole(stop, { bundle: evidenceBundle, classifyStop }).role === 'primary_experience');
    const onlyMetaAndRest = experiential.length === 0
      && classes.every((c) => c === 'logistics_meta' || c === 'rest_meal');

    if (onlyMetaAndRest && !dayIsExplicitlyLight(day, prompt)) {
      dayCodes.push('missing_experience_anchor');
      reasonCodes.push('missing_experience_anchor');
      dayDiagnostics.push({ dayIndex: i, dayNumber: dayLabel(day, i), codes: dayCodes, coveragePolicy, coverageReasonCode: 'only_logistics' });
      continue;
    }

    if (experiential.length === 0 && !dayIsExplicitlyLight(day, prompt)) {
      // Supporting-only days without a clear experience still fail for normal
      // full sightseeing days (e.g. vague pauses with no hike/viewpoint).
      dayCodes.push('missing_experience_anchor');
      reasonCodes.push('missing_experience_anchor');
      dayDiagnostics.push({ dayIndex: i, dayNumber: dayLabel(day, i), codes: dayCodes, coveragePolicy, coverageReasonCode: 'only_supporting_experiences' });
      continue;
    }

    // Traveler context permits a lighter structure; model-authored labels do not.
    let coverageReasonCode = null;

    const dayValue = require('./semanticDayValue').evaluateDayValue({
      day, priorStops: isRefinement ? [] : days.slice(0, i).flatMap(d => d.stops || []),
      bundle: evidenceBundle, classifyStop, compareIdentity,
      dayIntent, priorDay,
      minimumMinutes: SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES,
      availableMinutes: Number(constraints?.planningState?.time?.availableHours) * 60 || null,
      transferMinutes: (routeArtifact?.entries || []).filter(leg => leg.status === 'verified' && leg.binding?.dayIndex === i)
        .reduce((sum, leg) => sum + (Number(leg.durationSeconds) || 0) / 60, 0),
    });
    coverageReasonCode = dayValue.reason;
    if (!dayValue.relativeFits) { dayCodes.push('relative_burden_not_reduced'); reasonCodes.push('relative_burden_not_reduced'); }
    if (!dayValue.ok) {
      dayCodes.push('insufficient_day_coverage');
      reasonCodes.push('insufficient_day_coverage');
    } else if (coverageReasonCode === 'valid_light_day') {
      warnings.push({ code: 'intentionally_light_day', dayNumber: dayLabel(day, i), severity: 'soft' });
    }
    const valueDiagnostic = { dayIndex: i, dayNumber: dayLabel(day, i), codes: [...new Set(dayCodes)],
      coveragePolicy, coverageReasonCode, dayValue };
    dayValueDiagnostics.push(valueDiagnostic);
    if (dayCodes.length) dayDiagnostics.push(valueDiagnostic);

    // Day diversity is about EXPERIENCES, not about names. Two stops at one
    // place collapse into one only when the structured stop semantics fail to
    // show a genuinely different visit — see `classifyExperienceRelationship`.
    // A legitimate revisit is neither a new distinct experience nor padding: it
    // is simply not counted against the day.
    const distinctExperiences = [];
    let paddedExperiences = 0;
    for (const stop of experiential) {
      let resolved = false;
      for (const existing of distinctExperiences) {
        const relationship = classifyExperienceRelationship(existing, stop, {
          interveningStops: stopsScheduledBetween(named, existing, stop),
          identityRelation: compareIdentity ? compareIdentity(existing, stop) : null,
        });
        if (relationship === 'distinct') continue;
        // `unknown` deliberately lands here with `same_experience`: absent
        // positive structural evidence, a repeat is padding.
        if (relationship !== 'same_place_distinct_visit') paddedExperiences += 1;
        resolved = true;
        break;
      }
      if (!resolved) distinctExperiences.push(stop);
    }
    if (
      experiential.length >= 2
      && paddedExperiences > 0
      && !dayIsExplicitlyLight(day, prompt)
    ) {
      dayCodes.push('duplicate_base_experience');
      reasonCodes.push('duplicate_base_experience');
      const last = dayDiagnostics[dayDiagnostics.length - 1];
      if (last && last.dayIndex === i) {
        last.codes = [...new Set([...last.codes, 'duplicate_base_experience'])];
      } else {
        dayDiagnostics.push({ dayIndex: i, dayNumber: dayLabel(day, i), codes: ['duplicate_base_experience'], coveragePolicy });
      }
    }
  }

  // The ordinary new-itinerary contract intentionally remains day-local. For
  // a patch refinement, however, the authoritative touched-day set lets us
  // reject cross-day duplication caused by the mutation without making old
  // duplicates confined to untouched days block an unrelated change.
  if (isRefinement && Array.isArray(touchedDayNumbers)) {
    const conflicts = refinementCrossDayDuplicateConflicts(days, touchedDayNumbers, compareIdentity);
    if (conflicts.length > 0) reasonCodes.push('duplicate_base_experience');

    for (const conflict of conflicts) {
      for (const touchedDayNumber of conflict.touchedDayNumbers) {
        const dayIndex = days.findIndex((day, index) => dayLabel(day, index) === touchedDayNumber);
        if (dayIndex < 0) continue;
        let diagnostic = dayDiagnostics.find((entry) => entry.dayIndex === dayIndex);
        if (!diagnostic) {
          diagnostic = {
            dayIndex,
            dayNumber: touchedDayNumber,
            codes: [],
            coveragePolicy,
          };
          dayDiagnostics.push(diagnostic);
        }
        diagnostic.codes = [...new Set([...diagnostic.codes, 'duplicate_base_experience'])];
        diagnostic.duplicateExperienceConflicts = [
          ...(diagnostic.duplicateExperienceConflicts || []),
          conflict,
        ];
      }
    }
  }

  // Requested experience coverage (clear substantive asks only).
  // Golden-hour stays on its dedicated timing check. Other explicit dimensions
  // (wildlife, geothermal, scenic drive, hiking, …) use class-level coverage
  // that requires a genuine matching stop, not incidental visitor-center prose.
  // `pace=relaxed` is not consulted here and cannot drop a requested category.
  if (SUNSET_ASK.test(prompt) && !hasSunsetOrientedStop(itineraryData)) {
    reasonCodes.push('missing_requested_sunset');
  }
  const experienceCoverage = evaluateRequestedExperienceCoverage({
    itineraryData,
    userPrompt: prompt,
    constraints,
    evidenceBundle,
  });
  reasonCodes.push(...experienceCoverage.reasonCodes);

  if (BACKUP_REQUEST.test(prompt)) {
    const structured = collectStructuredAlternatives(itineraryData);
    const deps = extractPrimaryAccessDependencies(prompt);
    const backupCtx = evidenceBundle
      ? buildBackupCandidateContext({ bundle: evidenceBundle, userPrompt: prompt, maxCandidates: 24 })
      : null;
    const structureOk = structured.length > 0
      && hasActionableOutdoorBackup(structured)
      && alternativesAvoidPrimaryDependency(structured, deps)
      && alternativesDifferFromPrimaryStops(structured, itineraryData);
    let evidenceOk = true;
    if (backupCtx) {
      // When a Frozen EvidenceBundle is supplied, refuse invented backups and
      // fail closed if no independent evidence-backed candidates exist.
      if (backupCtx.candidates.length === 0) {
        evidenceOk = false;
      } else {
        evidenceOk = structuredBackupGroundedInEvidence(structured, backupCtx.candidates);
      }
    }
    if (!structureOk || !evidenceOk) {
      reasonCodes.push('missing_backup_plan');
    }
  }

  if (isAvoidExposureActive(constraints, prompt)) {
    for (const day of days) {
      for (const stop of namedStops(day)) {
        reasonCodes.push(...evaluateStopExposureConsistency(stop, prompt, constraints));
      }
    }
  }

  for (const day of days) {
    for (const stop of namedStops(day)) {
      reasonCodes.push(...evaluateHardAccessEligibility(stop, { constraints, bundle: evidenceBundle }).reasonCodes);
    }
  }

  const maxWalkMilesPerSegment = Number(
    runtimeMobilityField(constraints, 'maxWalkMilesPerSegment')
  );
  if (Number.isFinite(maxWalkMilesPerSegment) && maxWalkMilesPerSegment > 0) {
    for (const day of days) {
      for (const stop of namedStops(day)) {
        const eligibility = evaluateHardMobilityEligibility(stop, { maxWalkMilesPerSegment });
        reasonCodes.push(...eligibility.reasonCodes);
      }
    }
  }

  if (isRefinement || extractRefinementMutations(prompt).length > 0) {
    const mutations = extractRefinementMutations(prompt);
    if (mutations.length > 0) {
      const fulfillment = verifyRefinementMutations({
        mutations,
        itineraryData,
        priorItineraryData,
      });
      reasonCodes.push(...fulfillment.reasonCodes);
    }
  }

  if (isRefinement && priorItineraryData?.days?.length && !Array.isArray(touchedDayNumbers)) {
    const ownership = evaluateRefinementOwnership({
      priorPlan: priorItineraryData,
      nextPlan: itineraryData,
      userPrompt: prompt,
      touchedDayNumbers,
    });
    if (!ownership.ok) reasonCodes.push(...ownership.reasonCodes);
  }

  // Phase 9C.1D.5B — a named request is satisfied only by a stop bound to its
  // evidence identity; the generic category checks above can never clear it.
  // Named codes LEAD the list so a bounded reason slice can never drop them.
  // Required lazily: the named-experience module reaches this one through
  // stopIdentityResolution, so a top-level require would be a load cycle.
  let namedExperienceSatisfaction = null;
  if (Array.isArray(namedExperienceRequirements) && namedExperienceRequirements.length > 0) {
    const { evaluateNamedExperienceSatisfaction } = require('./namedExperienceRequirements');
    const named = evaluateNamedExperienceSatisfaction({
      itineraryData,
      requirements: namedExperienceRequirements,
      evidenceBundle,
    });
    reasonCodes.unshift(...named.reasonCodes);
    namedExperienceSatisfaction = named.satisfiedBy;
  }

  const unique = [...new Set(reasonCodes)];
  return {
    ok: unique.length === 0,
    warnings,
    reasonCodes: unique,
    requestedExperienceCoverage: experienceCoverage,
    dayValueDiagnostics,
    dayDiagnostics,
    coveragePolicy,
    // Internal only (exact vs same_as) — present only when named obligations exist.
    ...(namedExperienceSatisfaction ? { namedExperienceSatisfaction } : {}),
  };
}

/**
 * Deterministic, actionable repair instructions for model retry.
 * Uses frozen evidence only — never invents place names.
 */
function buildCompletenessRepairInstructions({
  reasonCodes = [],
  dayDiagnostics = [],
  backupCandidateContext = null,
  coveragePolicy = 'standard',
  namedExperienceRequirements = null,
} = {}) {
  const codes = [...new Set((reasonCodes || []).filter((c) => typeof c === 'string'))];
  if (codes.length === 0) return '';

  const lines = [
    `Repair only these validated violations: ${codes.join(', ')}.`,
    'Change only what is needed to clear those codes. Keep the same user constraints and the same frozen EvidenceBundle — do not invent new places or new evidence.',
  ];

  if (codes.includes('duplicate_base_experience')) {
    const seenConflicts = new Set();
    const conflicts = (dayDiagnostics || [])
      .flatMap((diagnostic) => diagnostic?.duplicateExperienceConflicts || [])
      .filter((conflict) => {
        const key = JSON.stringify([
          conflict?.experienceIdentity,
          conflict?.dayNumbers,
          conflict?.touchedDayNumbers,
        ]);
        if (seenConflicts.has(key)) return false;
        seenConflicts.add(key);
        return true;
      })
      .slice(0, 4);
    for (const conflict of conflicts) {
      const identity = String(conflict?.experienceIdentity || '').trim().slice(0, 120);
      const days = (Array.isArray(conflict?.dayNumbers) ? conflict.dayNumbers : [])
        .map(Number).filter((dayNumber) => Number.isFinite(dayNumber) && dayNumber > 0)
        .slice(0, 4);
      const touched = (Array.isArray(conflict?.touchedDayNumbers) ? conflict.touchedDayNumbers : [])
        .map(Number).filter((dayNumber) => Number.isFinite(dayNumber) && dayNumber > 0)
        .slice(0, 4);
      if (!identity || days.length < 2) continue;
      lines.push(
        `The same base experience "${identity}" appears on Days ${days.join(' and ')}. `
        + `Keep it on only one day; repair ${touched.map((dayNumber) => `Day ${dayNumber}`).join(' and ')} `
        + 'and leave untouched days unchanged.'
      );
    }
  }

  const thinDays = (dayDiagnostics || []).filter((d) =>
    (d.codes || []).some((c) =>
      c === 'insufficient_day_coverage'
      || c === 'missing_experience_anchor'
      || c === 'empty_day'
      || c === 'duplicate_base_experience'
    )
  );
  if (thinDays.length > 0) {
    const dayList = thinDays.map((d) => `Day ${d.dayNumber}`).join(', ');
    // The repair for a limited-walking traveler must never be "walk more". The
    // 2026-08-21 pincer came from exactly that: the generic thin-day repair asked
    // for more coverage, the cheapest way to supply it was an unverified trail,
    // and operational eligibility then refused it under `avoidExposure`.
    if (coveragePolicy === 'mobility_limited') {
      lines.push(
        `${dayList} still read as an empty day rather than a deliberately lighter one. `
        + 'The traveler asked for LESS walking, so do NOT lengthen a walk, do NOT add a hike, '
        + 'and do NOT claim an unverified trail is suitable. Build the day out of distinct named '
        + 'low-effort places already present in the trip facts — roadside viewpoints, scenic drives, '
        + 'visitor or nature centers, museums, lodge areas, picnic or photography time — each with its '
        + 'own time window and its own realistic duration. Two different named places are not the same '
        + 'place renamed. If no eligible additional place exists in the trip facts, say so plainly '
        + 'rather than inventing one or certifying an unknown-exposure trail.'
      );
    } else {
      lines.push(
        `${dayList} lack sufficient distinct experiential coverage after constraints. `
        // REPAIR INCENTIVE (2026-08-24 value audit). The old wording asked for
        // "additional named places", and the cheapest named places to ground are
        // visitor centres and scenic drives — so repair actively pushed the
        // constructor toward the filler it was supposed to remove. Across every
        // captured plan and candidate, 70.9% of stops were support content and
        // 45.6% were visitor centres alone. Name what a traveller actually wants
        // out of the day, not merely that another place should appear in it.
        + 'Give each flagged day something the traveller would say they DID that day — '
        + 'a walk, a trail, a wildlife or photography outing, a viewpoint they spend real time at, '
        + 'a historic or cultural site they go into — chosen from the trip facts. '
        // B5 (2026-08-24 replay): scenic drives are NOT filler. 14 of the 15
        // drives across every delivered plan were the experience of their day —
        // Cades Cove Loop, Newfound Gap Road, Foothills Parkway, the Tucson
        // Mountain District loop. Only visitor-desk content is reliably support.
        + 'Another visitor center, information desk or ranger station does NOT resolve this: '
        + 'those support a day, they are not what someone took the trip for. '
        + 'A genuine scenic drive CAN be the experience of a day when the driving itself is the point; '
        + 'a drive that merely gets the traveller to the next stop cannot. '
        + 'One substantial experience is worth more than three stops that are really logistics. '
        // B6 — the anchor repair must carry the OPERATIONAL obligation too.
        // On 2026-08-24 this instruction, without the sentence below, is what
        // produced "The Maze district" — a 4WD/permit-only area — as the
        // 240-minute anchor of a relaxed traveller's day, in both independent
        // runs. Told to find something experiential, the model reached for the
        // most dramatic thing available rather than the most suitable.
        + 'Pick something that fits THIS traveller and that they can reach the ordinary way: '
        + 'do not reach for the most remote or most demanding place available just to make the day '
        + 'sound impressive. If a place needs a particular vehicle, a permit, or self-sufficiency, '
        + 'it is not the answer here — and if you mention it at all, say what it requires. '
        + 'Do not pad with logistics/rest alone, and do not rename the same place into two stops. '
        + 'Returning to a place you already used is allowed only when it is genuinely a '
        + 'different visit: give the second stop a different type (a photography stop rather '
        + 'than a trail, for example), its own time window, and schedule another experience '
        + 'between the two. A renamed copy of the same walk is not a second experience. '
        + 'Relaxed pacing does not mean an empty day.'
      );
    }
  }

  if (codes.includes('underfilled_day_count')) {
    lines.push('Add the missing day(s) using frozen evidence-backed experiences; do not shrink trip length.');
  }

  if (codes.includes('refinement_dropped_unaffected_days')) {
    lines.push(
      'This is a refinement of an existing trip. Keep every unaffected day. '
      + 'Return the full itinerary with only the requested day/stop changes applied. '
      + 'Do not replace the whole trip with a partial day list.'
    );
  }

  if (codes.includes('exposure_prose_conflict') || codes.includes('exposure_constraint_violation')) {
    lines.push(
      'Honor the no-exposure preference using structured suitability only. '
      + 'Do not keep moderate/high exposure stops. '
      + 'Do not describe selected low-exposure stops with contradictory unsafe exposure claims '
      + '(long drop-offs, cliff-edge sections, exposed ledges). '
      + 'Safe explanatory wording such as "low-exposure" or "avoids exposed terrain" is allowed when structured evidence supports it. '
      + 'Do not narrate rejected high-exposure candidates into accepted stops.'
    );
  }

  if (codes.includes('constraint_eligibility_unknown')) {
    lines.push(
      'Replace unresolved-exposure trails with named places that are confirmed low-exposure, '
      + 'or with visitor-center / lodge / museum / picnic / scenic-drive stops from the trip facts. '
      + 'Unknown trail exposure does not satisfy an explicit no-exposure preference. '
      + 'Do not invent exposure metadata or new places.'
    );
  }

  if (codes.includes('mobility_distance_exceeds_limit') || codes.includes('mobility_eligibility_unknown')) {
    lines.push(
      'Honor the walking limit as an eligibility rule. Use a trail outing only when frozen evidence verifies its total walking distance is within the limit. '
      + 'Reject known over-limit trails. For unknown-distance places, present them only as an area worth considering and explicitly say the walking distance was not verified; do not certify them as limit-compatible. '
      + 'Prefer evidence-backed roadside viewpoints, scenic drives, visitor centers, museums, and other concrete low-walking experiences when available.'
    );
  }

  if (codes.includes('mobility_prose_claim_unsupported')) {
    lines.push(
      'Remove any blanket claim that every outing stays within the walking limit unless each applicable recommendation has supporting distance evidence. '
      + 'A useful fallback is: "I couldn\'t verify the walking distance closely enough to promise it stays within your limit."'
    );
  }

  // Phase 9C.1D.5B — a missing NAMED place is repaired by that place, never by
  // "an identifiable hike": the category wording below cannot stand in for it.
  const missingNamed = (namedExperienceRequirements || [])
    .filter((r) => r?.status === 'resolved' && codes.includes(r.reasonCode));
  if (missingNamed.length > 0) {
    lines.push(
      'The plan is missing a place the traveler explicitly asked for by name: '
      + missingNamed.map((r) => {
        const also = (r.equivalents || []).map((e) => e.placeName).filter(Boolean);
        return `"${r.requestedName}" (the place named "${r.canonicalPlaceName}" in the trip facts${also.length ? `, also listed as ${also.map((n) => `"${n}"`).join(' or ')}` : ''})`;
      }).join('; ')
      + '. Add each as its own stop under that exact place name. A different hike, walk, or viewpoint does not replace it.'
    );
  }

  if (codes.some((c) => c.startsWith('missing_requested_'))) {
    lines.push(
      'Satisfy the traveler\'s explicit experience asks using identifiable frozen EvidenceBundle candidates. '
      + 'A visitor center that mentions an experience in its description does not count as that experience. '
      + 'A scenic landmark is not a scenic drive. Generic scenery is not a photography timing stop. '
      + 'Relaxed pacing may use fewer stops and less time pressure, but it does not drop a requested '
      + 'experience dimension when frozen evidence includes a genuine candidate.'
    );
    if (codes.includes(REASON_CODE.COVERAGE) || codes.includes(REASON_CODE.SCENIC_DRIVE)) {
      lines.push(
        'If the traveler asked for a scenic drive, include an actual drive / road / route from the trip facts — '
        + 'not an overlook or geyser that happens to be scenic.'
      );
    }
    if (codes.includes(REASON_CODE.GEOTHERMAL)) {
      lines.push(
        'If the traveler asked for geysers, hot springs, or geothermal features, include a stop that is actually that kind of place.'
      );
    }
    if (codes.includes(REASON_CODE.WILDLIFE)) {
      lines.push(
        'If the traveler asked for wildlife, include a wildlife-oriented place from the trip facts, not a visitor-center exhibit about wildlife.'
      );
    }
  }

  if (codes.includes('missing_backup_plan')) {
    lines.push(
      'Populate structured `alternatives` (plan-level required when contingency was asked) with identifiable outdoor places from the frozen EvidenceBundle. '
      + 'The fallback must remain usable if the named primary access/parking subject fails — do not reuse the blocked access path, '
      + 'and do not count identical primary stops, indoor film alone, or vague "check conditions" wording as a backup.'
    );
    if (backupCandidateContext?.required) {
      const block = formatBackupCandidatePromptBlock(backupCandidateContext);
      if (block) lines.push(block);
    }
  }

  return lines.join('\n');
}

function userRequestsBackupPlan(userPrompt = '') {
  return BACKUP_REQUEST.test(String(userPrompt || ''));
}

module.exports = {
  isLighterRefinementRequest,
  evaluateItineraryCompleteness,
  buildCompletenessRepairInstructions,
  userRequestsBackupPlan,
  extractRefinementMutations,
  verifyRefinementMutations,
  classifyStop,
  // Exported so the early structural stage judges "a named stop" by exactly the
  // same rule completeness does — two different definitions here would let a
  // plan pass one gate and fail the other.
  namedStops,
  // Cross-day refinement packing / viability projection must use the same
  // conflict detector the completeness validator uses after merge.
  refinementCrossDayDuplicateConflicts,
  // Exported so the repair ledger derives obligations from the SAME asks the
  // validator enforces. A copied regex would let the ledger promise the model a
  // requirement no validator can ever check (or miss one it does).
  REQUESTED_EXPERIENCE_ASKS: Object.freeze({
    hike: ASK_PATTERNS.hiking,
    goldenHour: ASK_PATTERNS.goldenHour,
    scenic: ASK_PATTERNS.viewpoint,
    scenicDrive: ASK_PATTERNS.scenic_drive,
    wildlife: ASK_PATTERNS.wildlife,
    geothermal: ASK_PATTERNS.geothermal,
    photography: ASK_PATTERNS.photography,
    beach: ASK_PATTERNS.beach,
    waterfall: ASK_PATTERNS.waterfall,
    historic: ASK_PATTERNS.historic,
    backup: ASK_PATTERNS.backup,
  }),
  collectStructuredAlternatives,
  hasUnsafeExposureProse,
  evaluateStopExposureConsistency,
  residualExposureProse,
  normalizeCanonicalBackup,
  resolveCoveragePolicy,
  limitedWalkingDayIsComplete,
  COVERAGE_POLICIES,
  LIMITED_WALKING_MIN_DISTINCT_DAY_EXPERIENCES,
  SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES,
};
