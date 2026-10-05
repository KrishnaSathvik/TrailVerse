'use strict';

/**
 * PHASE 4O — THE CANONICAL PLACE ADAPTER.
 *
 * Phase 4M gave the repair a recommendation boundary: the model selects a
 * `placeRef` and the machine owns the identity. Phase 4N put that boundary in
 * front of a REAL NPS bundle and it held — and then nothing could be merged,
 * because the boundary and the merge disagreed about where a stop's `type`
 * comes from:
 *
 *     the catalogue read   normalizedValue.placeType ?? normalizedValue.type
 *     the producer emits   normalizedValue.category
 *
 * So every one of 60 candidates was `type: null`, the tool schema described
 * `type` as "only used when the list does not already state one", the model
 * correctly omitted it, and the merge rejected the whole repair as malformed.
 *
 * The fix is NOT an alias. `category` is a source bucket — `place`, `thingstodo`,
 * `picnic`, `lodging`, `visitor_center` — and 196 of 265 Grand Teton identities
 * are the bucket `place`, which says nothing about what the place IS. The two
 * vocabularies are not equivalent, so this module owns a third one and both
 * repair classes consume it:
 *
 *     placeKey          identity, lowercased and trimmed
 *     canonicalName     the identity as the evidence states it
 *     canonicalType     a member of the vocabulary `classifyStop` understands
 *     experienceClass   experiential | logistics | rest | unknown
 *     sourceCategories  what the producer actually said (kept, never trusted as a type)
 *     operationalFacts  carried through untouched; a dependency is not a disqualification
 *
 * ORDER INDEPENDENCE IS A PROPERTY, NOT A HOPE.
 * The old builder took the FIRST evidence record per place key, so a place
 * described by two records (Grand Teton has `Chapel of the Transfiguration` as
 * both a `thingstodo` with an activity type and a bare `place` with none) got a
 * different classification depending on the order the broker happened to return.
 * Here every record for one identity is accumulated into commutative sets FIRST
 * and classified ONCE from the accumulation, so shuffling the bundle cannot
 * change a single field.
 *
 * CLASSIFICATION IS POSITIVE AND FAIL-CLOSED.
 * `unknown` is a real answer, and for a repair whose entire purpose is to
 * satisfy an EXPERIENTIAL obligation, `unknown` means "not eligible". 4N showed
 * what the permissive rule costs when metadata integration breaks: convenience
 * stores, cabins and audio-tour narration titles were offered to the model as
 * candidate experiences, because "exclude only what the machine positively knows
 * is non-experiential" excludes nothing at all when the machine knows nothing.
 */

/** Machine-known class of a place. `unknown` is an answer, not an absence. */
const EXPERIENCE_CLASS = Object.freeze({
  EXPERIENTIAL: 'experiential',
  LOGISTICS: 'logistics',
  REST: 'rest',
  UNKNOWN: 'unknown',
});
const { isTaxonomyCandidate } = require('./scenicDriveSubject');

/**
 * Producer `category` → canonical type, for the values that name a FACILITY
 * KIND. `place` and `thingstodo` are deliberately absent: they are source
 * buckets, not types, and treating them as types is the 4N defect.
 */
const CATEGORY_TYPES = Object.freeze({
  museum: { canonicalType: 'museum', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  visitor_center: { canonicalType: 'visitor_center', experienceClass: EXPERIENCE_CLASS.LOGISTICS },
  campground: { canonicalType: 'campground', experienceClass: EXPERIENCE_CLASS.REST },
  lodging: { canonicalType: 'lodging', experienceClass: EXPERIENCE_CLASS.REST },
  picnic: { canonicalType: 'picnic', experienceClass: EXPERIENCE_CLASS.REST },
});

/** A facility category wins over an activity type; fixed order breaks ties. */
const CATEGORY_PRECEDENCE = Object.freeze(['campground', 'lodging', 'picnic', 'visitor_center', 'museum']);

/**
 * Producer `activityTypes` → canonical type. Every experiential value here is a
 * member of `EXPERIENTIAL_TYPES` in `itineraryCompleteness`, so a stop the
 * server types from this table classifies as an experience downstream — the
 * merge no longer depends on the model echoing catalogue metadata back.
 */
const ACTIVITY_TYPES = Object.freeze({
  hiking: { canonicalType: 'hike', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  hike: { canonicalType: 'hike', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  walk: { canonicalType: 'walk', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  'self-guided tours - walking': { canonicalType: 'walk', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  'scenic driving': { canonicalType: 'scenic_drive', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  scenic_drive: { canonicalType: 'scenic_drive', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  viewpoint: { canonicalType: 'viewpoint', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  'wildlife watching': { canonicalType: 'wildlife', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  skiing: { canonicalType: 'activity', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  exhibits: { canonicalType: 'museum', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL },
  // Not experiences, and they must be able to VETO one: NPS tags a visitor
  // centre `exhibits` and `orientation` together, and a visitor centre is
  // exactly what `insufficient_day_coverage` says is not enough.
  orientation: { canonicalType: 'visitor_center', experienceClass: EXPERIENCE_CLASS.LOGISTICS },
  visitor_center: { canonicalType: 'visitor_center', experienceClass: EXPERIENCE_CLASS.LOGISTICS },
  picnic: { canonicalType: 'picnic', experienceClass: EXPERIENCE_CLASS.REST },
  lodging: { canonicalType: 'lodging', experienceClass: EXPERIENCE_CLASS.REST },
  camping: { canonicalType: 'campground', experienceClass: EXPERIENCE_CLASS.REST },
});

/**
 * When several experiential types apply, the most specific commitment wins —
 * a place that is both a hike and a viewpoint is a hike, and describing it as a
 * viewpoint would understate what it asks of a traveler.
 */
const EXPERIENTIAL_PRECEDENCE = Object.freeze([
  'hike', 'walk', 'scenic_drive', 'wildlife', 'viewpoint', 'museum', 'activity',
]);

/** Topics whose evidence describes a PLACE rather than the destination. */
const PLACE_TOPICS = Object.freeze(['activities', 'visitor_services', 'accessibility', 'campgrounds']);

const placeKeyOf = (name) => String(name || '').trim().toLowerCase();
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Accumulate every evidence record that speaks about the same place identity.
 *
 * Commutative and associative by construction — sets and a name chosen by a
 * total order — so the result cannot depend on the order the bundle lists its
 * evidence.
 *
 * @param {object[]} evidence bundle evidence items
 * @returns {Map<string, object>} placeKey → aggregated signals
 */
function collectPlaceSignals(evidence = []) {
  const byKey = new Map();
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (isTaxonomyCandidate(item)) continue;
    if (!PLACE_TOPICS.includes(item?.topic)) continue;
    const normalized = item?.claim?.normalizedValue;
    if (!isObject(normalized)) continue;
    const canonicalName = require('./entityEvidenceProvenance').entityEvidenceProvenance(item).canonicalEntityName;
    const placeKey = placeKeyOf(canonicalName);
    if (!placeKey) continue;

    const signals = byKey.get(placeKey) || {
      placeKey,
      names: new Set(),
      sourceCategories: new Set(),
      activityTypes: new Set(),
      declaredTypes: new Set(),
      primaryTypes: new Set(),
      operationalFactTypes: new Set(),
      operationalFactCount: 0,
      entityIds: new Set(),
      destinationIds: new Set(),
      coordinateJson: new Set(),
      recordCount: 0,
    };
    signals.recordCount += 1;
    if (normalized.primaryActivityType) signals.primaryTypes.add(normalized.primaryActivityType);
    signals.names.add(canonicalName);
    if (typeof normalized.category === 'string' && normalized.category.trim()) {
      signals.sourceCategories.add(normalized.category.trim().toLowerCase());
    }
    // A producer that DOES state a type is still honoured; NPS does not, but the
    // adapter must not assume one producer's shape is the only shape.
    for (const key of ['placeType', 'type']) {
      const value = normalized[key];
      if (typeof value === 'string' && value.trim()) signals.declaredTypes.add(value.trim().toLowerCase());
    }
    for (const activity of Array.isArray(normalized.activityTypes) ? normalized.activityTypes : []) {
      if (typeof activity === 'string' && activity.trim()) signals.activityTypes.add(activity.trim().toLowerCase());
    }
    if (Array.isArray(normalized.viewpointTraits) && normalized.viewpointTraits.length > 0) {
      signals.activityTypes.add('viewpoint');
    }
    for (const fact of Array.isArray(normalized.operationalFacts) ? normalized.operationalFacts : []) {
      if (fact?.type) { signals.operationalFactTypes.add(fact.type); signals.operationalFactCount += 1; }
    }
    if (normalized.entityId) signals.entityIds.add(String(normalized.entityId));
    if (normalized.destinationId) signals.destinationIds.add(String(normalized.destinationId));
    // Accumulated, never first-wins. NPS returns null island (0,0) for many
    // `thingstodo` records, and one identity can carry both that and a real fix,
    // so taking whichever arrived first made the output depend on broker order.
    if (isObject(normalized.coordinates)) {
      const { latitude, longitude } = normalized.coordinates;
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0)) {
        signals.coordinateJson.add(JSON.stringify({ latitude, longitude }));
      }
    }
    byKey.set(placeKey, signals);
  }
  return byKey;
}

/** A total order over strings, so "pick one" never means "pick whichever came first". */
const smallest = (values) => [...values].sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0))[0] ?? null;

/**
 * Classify one accumulated identity. Pure, total, and deterministic.
 *
 * Precedence — chosen so a wrong answer is a REFUSAL rather than a bad
 * recommendation:
 *
 *   1. a facility category the producer stated outright
 *   2. a rest or logistics activity type   (these VETO an experiential sibling)
 *   3. an experiential activity type
 *   4. a type the producer declared directly
 *   5. unknown
 *
 * @returns {{placeKey, canonicalName, canonicalType, experienceClass, ...}}
 */
function classifyPlaceSignals(signals) {
  const canonicalName = smallest(signals.names);
  const base = {
    placeKey: signals.placeKey,
    canonicalName,
    sourceCategories: [...signals.sourceCategories].sort(),
    activityTypes: [...signals.activityTypes].sort(),
    operationalFactTypes: [...signals.operationalFactTypes].sort(),
    operationalFactCount: signals.operationalFactCount,
    entityId: smallest(signals.entityIds),
    destinationId: smallest(signals.destinationIds),
    coordinates: signals.coordinateJson.size ? JSON.parse(smallest(signals.coordinateJson)) : null,
    recordCount: signals.recordCount,
    identityAmbiguous: signals.destinationIds.size > 1,
  };

  if (signals.primaryTypes?.has('scenic_drive')) {
    return { ...base, canonicalType: 'scenic_drive', experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL, classifiedBy: 'primary_activity' };
  }

  // Specific cultural metadata outranks the generic visitor-service container.
  if (signals.sourceCategories.has('museum') || signals.declaredTypes.has('museum')
    || ['museum', 'interpretive_center', 'nature_center', 'historic_interior', 'exhibit_program'].some(t => signals.activityTypes.has(t))
    || (signals.sourceCategories.has('visitor_center') && /\bmuseum\b/i.test(canonicalName))
    || (signals.activityTypes.has('exhibits') && /\b(?:nature|interpretive) cent(?:er|re)\b/i.test(canonicalName))) {
    return { ...base, ...CATEGORY_TYPES.museum, classifiedBy: 'cultural_evidence' };
  }

  for (const category of CATEGORY_PRECEDENCE) {
    if (signals.sourceCategories.has(category)) {
      return { ...base, ...CATEGORY_TYPES[category], classifiedBy: 'source_category' };
    }
  }

  const mapped = [...signals.activityTypes].map((a) => ACTIVITY_TYPES[a]).filter(Boolean);
  const rest = mapped.filter((m) => m.experienceClass === EXPERIENCE_CLASS.REST);
  if (rest.length) {
    return { ...base, ...rest.sort((a, b) => (a.canonicalType < b.canonicalType ? -1 : 1))[0], classifiedBy: 'activity_type' };
  }
  const logistics = mapped.filter((m) => m.experienceClass === EXPERIENCE_CLASS.LOGISTICS);
  if (logistics.length) {
    return { ...base, ...logistics.sort((a, b) => (a.canonicalType < b.canonicalType ? -1 : 1))[0], classifiedBy: 'activity_type' };
  }
  const experiential = mapped.filter((m) => m.experienceClass === EXPERIENCE_CLASS.EXPERIENTIAL);
  if (experiential.length) {
    const byPrecedence = EXPERIENTIAL_PRECEDENCE.find((t) => experiential.some((m) => m.canonicalType === t));
    return {
      ...base,
      canonicalType: byPrecedence,
      experienceClass: EXPERIENCE_CLASS.EXPERIENTIAL,
      classifiedBy: 'activity_type',
    };
  }

  // A producer that states a type directly is trusted for the type, but the
  // CLASS still has to be derived from the shared vocabulary rather than assumed.
  const declared = smallest(signals.declaredTypes);
  if (declared) {
    const known = ACTIVITY_TYPES[declared] || Object.values(CATEGORY_TYPES).find((c) => c.canonicalType === declared);
    if (known) return { ...base, ...known, classifiedBy: 'declared_type' };
    return {
      ...base, canonicalType: declared, experienceClass: EXPERIENCE_CLASS.UNKNOWN, classifiedBy: 'declared_type',
    };
  }

  return {
    ...base, canonicalType: null, experienceClass: EXPERIENCE_CLASS.UNKNOWN, classifiedBy: 'unclassified',
  };
}

/**
 * Every place identity a frozen bundle enumerates, canonicalized.
 * @returns {object[]} sorted by placeKey — a stable enumeration, NOT a ranking
 */
function normalizeEvidencePlaceCandidates(bundle) {
  const signals = collectPlaceSignals(bundle?.evidence);
  return [...signals.values()]
    .map(classifyPlaceSignals)
    .sort((a, b) => (a.placeKey < b.placeKey ? -1 : a.placeKey > b.placeKey ? 1 : 0));
}

/** One evidence record → the canonical shape, for callers holding a single item. */
function normalizeEvidencePlaceCandidate(item) {
  const signals = collectPlaceSignals([item]);
  const first = [...signals.values()][0];
  return first ? classifyPlaceSignals(first) : null;
}

module.exports = {
  ACTIVITY_TYPES,
  CATEGORY_TYPES,
  EXPERIENCE_CLASS,
  EXPERIENTIAL_PRECEDENCE,
  PLACE_TOPICS,
  classifyPlaceSignals,
  collectPlaceSignals,
  normalizeEvidencePlaceCandidate,
  normalizeEvidencePlaceCandidates,
  placeKeyOf,
};
