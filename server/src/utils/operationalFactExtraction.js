'use strict';

/**
 * OPERATIONAL FACT PRODUCTION — the missing producer.
 *
 * `trailieOperationalConstraints` has owned the right vocabulary all along
 * (`VEHICLE_RESTRICTION`, `RESERVATION_REQUIRED`, `ACCESS_UNCERTAIN`,
 * `SEASONAL_CLOSURE`) and `finalizeItinerary` already consumes operational
 * rules. But `OFFICIAL_RULES` is `[]` and `constraints.operationalEvidence` is
 * read in two places and written in none, so the whole mechanism resolved to
 * `[]` on every turn. That is why Gate #4 could deliver "The Maze district" as
 * the 240-minute anchor of a relaxed traveller's day, twice, past everything.
 *
 * THE DATA WAS NEVER MISSING. `_getParkEvidenceListPaginated` pushes NPS items
 * through raw, and the product's own activity page already renders
 * `isReservationRequired`, `seasonDescription` and `accessibilityInformation`.
 * `npsEvidenceProvider` simply never read them: it takes
 * `shortDescription || description` — dropping `longDescription`, which is
 * exactly where NPS puts access detail — and reads `item.accessibility`, a name
 * NPS does not use. The earliest loss point is the candidate projection.
 *
 * AUTHORITY. A fact is `stated` when it comes from a structured official field
 * and `official_text` when it is read out of official prose. Model-generated
 * wording is NEVER a source here — the fit layer may still use a stop's own
 * self-description as corroboration, but it must not be the only thing standing
 * between a traveller and a 4WD-only district.
 */

const { CONSTRAINT_TYPE } = require('./trailieOperationalConstraints');
const { parseVehicleLengthLimit, namedRoadNearLimit } = require('./vehicleDimensionContract');
const {
  canonicalEntityKey, labelVariants, normalizeLabel,
} = require('./evidenceEntityIdentity');

const OPERATIONAL_FACT_CONFIDENCE = Object.freeze({
  /** Structured official field, e.g. `isReservationRequired: 'true'`. */
  STATED: 'stated',
  /** Read from official description text supplied by the park itself. */
  OFFICIAL_TEXT: 'official_text',
});

/**
 * Requirement families, matched ONLY against official text. Each pattern must
 * describe a requirement rather than a mood — "remote and inaccessible" is
 * scene-setting on its own; "requires a high-clearance four-wheel-drive
 * vehicle" is a requirement.
 */
/**
 * CAPABILITY SIGNAL — the only thing that may CREATE a vehicle restriction.
 *
 * Gate #5 lesson: a road being gravel says nothing about whether a rental sedan
 * can drive it. Theodore Roosevelt's "gravel roads" wording produced a fake
 * dependency and cost a whole itinerary; Great Sand Dunes' "high-clearance
 * four-wheel-drive vehicle is required" is a real one. Only the second shape
 * qualifies.
 */
const VEHICLE_CAPABILITY = /\b(high[- ]clearance(?:\s+four[- ]wheel[- ]drive)?(?:\s+vehicles?)?|four[- ]wheel[- ]drive|4wd|4x4)\b|\bnot (?:recommended|suitable|advised) for passenger (?:cars|vehicles)\b|\bpassenger (?:cars|vehicles) (?:are )?not (?:recommended|advised|permitted|suitable)\b/i;

/**
 * ROAD SURFACE — corroboration only, exactly as remoteness is treated. A surface
 * mention is recorded as supporting detail on a restriction that some capability
 * signal already established; on its own it produces nothing.
 */
const ROAD_SURFACE = /\b(?:rough|unpaved|primitive|dirt|gravel)\s+roads?\b/i;

const TEXT_RULES = Object.freeze([
  {
    type: CONSTRAINT_TYPE.VEHICLE_RESTRICTION,
    pattern: VEHICLE_CAPABILITY,
    // The matched phrase often already ends in "vehicle(s)"; do not say it twice.
    requirement: (m) => (/vehicles?$/i.test(m[0]) ? `${m[0]} access` : `${m[0]} vehicle access`),
    plannerRule: (name, m) => {
      const need = /vehicles?$/i.test(m[0]) ? `${m[0]} access` : `${m[0]} vehicle access`;
      return `${name} requires ${need}. Do not present it as an ordinary stop for a traveller who has not said they have one.`;
    },
  },
  {
    type: CONSTRAINT_TYPE.VEHICLE_RESTRICTION,
    pattern: ROAD_SURFACE,
    // CORROBORATION ONLY — never fires unless a capability signal is present too.
    requiresCapability: true,
    requirement: (m) => `access over ${m[0]}`,
    plannerRule: (name, m) => `${name} is reached over ${m[0]}. Say so plainly if you include it.`,
  },
  {
    type: CONSTRAINT_TYPE.RESERVATION_REQUIRED,
    pattern: /\b(?:a\s+)?permits?\s+(?:is|are)\s+required|\brequires?\s+a\s+permit\b|\bday[- ]use permit\b|\bbackcountry permit\b/i,
    requirement: () => 'a permit',
    plannerRule: (name) => `${name} requires a permit. If you include it, state the permit requirement in the same breath.`,
  },
  {
    type: CONSTRAINT_TYPE.ACCESS_UNCERTAIN,
    pattern: /\bno (?:water|food|fuel|services|gas)(?:,|\s+or\b|\s+and\b|\.|\s*$)/i,
    requirement: () => 'carrying your own water, food and fuel',
    plannerRule: (name) => `${name} has no visitor services; a traveller must arrive self-sufficient.`,
  },
  {
    type: CONSTRAINT_TYPE.SHUTTLE_TICKET_REQUIRED,
    pattern: /\b(shuttle[- ]only|accessible only by shuttle|boat access only|accessible only by boat|ferry[- ]only)\b/i,
    requirement: (m) => m[0],
    plannerRule: (name, m) => `${name} is ${m[0]}; the plan must account for that access.`,
  },
]);

function officialText(item) {
  // longDescription FIRST: it is where NPS puts access and requirement detail,
  // and it is precisely the field the evidence projection was dropping.
  return [item?.longDescription, item?.shortDescription, item?.description, item?.reservationDescription]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' \n');
}

function truthy(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

/** Normalized comparison key for place identity. */
function placeKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[—–-]/g, ' ')
    .replace(/\b(the|a|an|district|area|explore|visit|drive|hike|to|at|of)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {Object} params
 * @param {Object} params.item      a RAW NPS thingstodo/places item
 * @param {string} params.parkCode
 * @returns {Array<Object>} OperationalFact[]
 */
function extractOperationalFacts({ item = null, parkCode = '', observedAt = null } = {}) {
  const name = item?.title || item?.name || null;
  if (!name) return [];
  const url = item?.url || null;
  const entityId = `nps:park:${String(parkCode || '').toLowerCase()}:place:${item?.id || name}`;
  const subject = { entityId, name, parkCode: String(parkCode || '').toLowerCase() };
  const facts = [];
  const seen = new Set();

  const push = (fact) => {
    const dedupe = `${fact.type}::${fact.requirement}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    facts.push(Object.freeze(fact));
  };

  // 1. Structured official fields beat prose.
  if (truthy(item?.isReservationRequired)) {
    push({
      subject,
      type: CONSTRAINT_TYPE.RESERVATION_REQUIRED,
      requirement: 'a reservation or permit',
      plannerRule: `${name} requires a reservation. State that requirement wherever it appears.`,
      confidence: OPERATIONAL_FACT_CONFIDENCE.STATED,
      provenance: { authority: 'official_owner', field: 'isReservationRequired', sourceUrl: url },
      observedAt: observedAt || null,
      subjects: [name],
    });
  }

  // 2. Official prose. Never the title alone — a name is not a requirement.
  const text = officialText(item);
  if (text) {
    // P0-5 — a numeric vehicle length limit becomes a STRUCTURED fact carrying
    // the parsed maximum, so the fit layer can compare two machine-owned
    // numbers instead of asking the model to notice arithmetic in prose.
    const lengthLimit = parseVehicleLengthLimit(text);
    if (lengthLimit) {
      push({
        subject,
        type: CONSTRAINT_TYPE.VEHICLE_DIMENSION,
        requirement: `vehicles no longer than ${lengthLimit.maxLengthFeet} ft`,
        plannerRule: `${name} prohibits vehicles longer than ${lengthLimit.maxLengthFeet} ft. If the traveler's vehicle exceeds that limit, do not build any part of a day around driving it there — use shuttle or alternate access instead.`,
        dimension: { kind: 'length', maxLengthFeet: lengthLimit.maxLengthFeet },
        confidence: OPERATIONAL_FACT_CONFIDENCE.OFFICIAL_TEXT,
        provenance: { authority: 'official_owner', field: 'longDescription', sourceUrl: url, excerpt: lengthLimit.raw },
        observedAt: observedAt || null,
        subjects: [name],
      });
    }

    const capabilityEstablished = VEHICLE_CAPABILITY.test(text);
    for (const rule of TEXT_RULES) {
      if (rule.requiresCapability && !capabilityEstablished) continue;
      const match = text.match(rule.pattern);
      if (!match) continue;
      push({
        subject,
        type: rule.type,
        requirement: rule.requirement(match),
        plannerRule: rule.plannerRule(name, match),
        confidence: OPERATIONAL_FACT_CONFIDENCE.OFFICIAL_TEXT,
        provenance: {
          authority: 'official_owner',
          field: item?.longDescription && rule.pattern.test(item.longDescription)
            ? 'longDescription'
            : (item?.reservationDescription && rule.pattern.test(item.reservationDescription)
              ? 'reservationDescription' : 'shortDescription'),
          sourceUrl: url,
          excerpt: match[0],
        },
        observedAt: observedAt || null,
        subjects: [name],
      });
    }
  }

  return facts;
}

/**
 * P0-5 — VEHICLE DIMENSION FACTS FROM A FETCHED OFFICIAL PAGE.
 *
 * The subject is the entity the PAGE is about, taken from the official page
 * title head ("Going-to-the-Sun Road - Glacier National Park (U.S. National
 * Park Service)" → "Going-to-the-Sun Road") — identity-equivalent naming per
 * 4T, never token containment. Only the spaced separator splits: hyphenated
 * road names stay whole. Deliberately extracts ONLY the dimension rule — an
 * official page is fetched for a specific requirement, and this pass does not
 * widen page extraction into a general fact producer.
 */
function officialPageOperationalFacts({ title, text, url = null, parkCode = '', observedAt = null } = {}) {
  if (!text) return [];
  const limit = parseVehicleLengthLimit(text);
  if (!limit) return [];
  const titleSubject = String(title || '')
    .split(/\s+[-|–—]\s+/)[0]
    // Page-descriptor suffixes are website taxonomy, not place identity:
    // "Going-to-the-Sun Road General Info" names the road.
    .replace(/\s+(?:general\s+info(?:rmation)?|information|overview|details|faqs?)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Prefer the road the RULE is about, from its own surrounding text — a
  // general page ("Directions, Transportation, & Road Conditions") states the
  // rule under a heading naming the road. Page title is the fallback.
  const subjectName = namedRoadNearLimit(text, limit.index) || titleSubject;
  if (!subjectName) return [];
  const code = String(parkCode || '').toLowerCase();
  const subject = {
    entityId: `nps:park:${code}:place:${subjectName}`,
    name: subjectName,
    parkCode: code,
  };
  return [Object.freeze({
    subject,
    type: CONSTRAINT_TYPE.VEHICLE_DIMENSION,
    requirement: `vehicles no longer than ${limit.maxLengthFeet} ft`,
    plannerRule: `${subjectName} prohibits vehicles longer than ${limit.maxLengthFeet} ft. If the traveler's vehicle exceeds that limit, do not build any part of a day around driving it there — use shuttle or alternate access instead.`,
    dimension: { kind: 'length', maxLengthFeet: limit.maxLengthFeet },
    confidence: OPERATIONAL_FACT_CONFIDENCE.OFFICIAL_TEXT,
    provenance: { authority: 'official_owner', field: 'official_page_text', sourceUrl: url, excerpt: limit.raw },
    observedAt: observedAt || null,
    subjects: [subjectName],
  })];
}

/**
 * PHASE 4T — HOW A FACT REACHED A STOP. The mechanism is recorded, never
 * guessed at afterwards, because a blocking fact must be able to say WHY it
 * believes it belongs to this place.
 */
const BINDING_MECHANISM = Object.freeze({
  /** Same upstream entity id, ignoring the `place` / `thingstodo` namespace. */
  ENTITY_IDENTIFIER: 'entity_identifier',
  /** No identifier available on one side; the labels denote the same identity. */
  IDENTITY_EQUIVALENT_NAME: 'identity_equivalent_name',
  /**
   * A different entity whose name overlaps. DEFINED SO IT CAN BE NAMED AND
   * ASSERTED ABSENT — v1 never emits it. Phase 4S found this path attributing
   * `Phelps Lake`'s permit to `Phelps Lake Overlook` and `Grassy Lake Road`'s
   * 4WD requirement to `Grassy Lake Road Campsites`.
   */
  RELATED_PLACE: 'related_place',
});

/**
 * Index operational facts for stop lookup.
 *
 * Accepts either a bare fact array (legacy) or `{ facts, bundle }`. Given the
 * bundle it can also resolve a model-authored stop LABEL to the entity the
 * evidence enumerates — machine identity resolution, done once here rather than
 * re-guessed by every validator.
 */
function indexFactsByPlace(input = []) {
  const facts = Array.isArray(input) ? input : (input?.facts || []);
  const bundle = Array.isArray(input) ? null : (input?.bundle || null);

  const byEntity = new Map();
  const byLabel = new Map();
  for (const fact of facts) {
    const key = placeKey(fact?.subject?.name);
    if (key) {
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push(fact);
    }
    const entity = canonicalEntityKey(fact?.subject?.entityId);
    if (entity) {
      if (!byEntity.has(entity)) byEntity.set(entity, []);
      byEntity.get(entity).push(fact);
    }
  }

  // Label -> entity, from the identities the bundle itself enumerates. A label
  // that denotes two different entities is dropped: an ambiguous resolution is
  // not a resolution. (`placeKey` collapses `Murie Ranch` and `Murie Ranch Hike`
  // onto one key — Phase 4S §3.)
  const entityByLabel = new Map();
  const ambiguous = new Set();
  for (const item of bundle?.evidence || []) {
    const normalized = item?.claim?.normalizedValue;
    const name = typeof normalized?.name === 'string' ? normalized.name : '';
    const entity = canonicalEntityKey(normalized?.entityId);
    if (!name || !entity) continue;
    for (const label of [normalizeLabel(name), placeKey(name)]) {
      if (!label) continue;
      const seen = entityByLabel.get(label);
      if (seen && seen !== entity) ambiguous.add(label);
      else entityByLabel.set(label, entity);
    }
  }
  for (const label of ambiguous) entityByLabel.delete(label);

  // P0-5 — IDENTITY JOIN for facts with synthetic subject ids. A page-derived
  // fact's subject id is minted at extraction; when the bundle itself declares
  // an entity with the identity-equivalent label, the fact belongs to THAT
  // entity — registering it there keeps entity-first binding decisive instead
  // of silently unbinding the fact from any stop stamped with the real id.
  for (const fact of facts) {
    for (const label of [normalizeLabel(fact?.subject?.name), placeKey(fact?.subject?.name)]) {
      const entity = label ? entityByLabel.get(label) : null;
      if (!entity) continue;
      if (!byEntity.has(entity)) byEntity.set(entity, []);
      if (!byEntity.get(entity).includes(fact)) byEntity.get(entity).push(fact);
    }
  }

  const index = {
    byEntity, byLabel, entityByLabel,
    get size() { return byEntity.size + byLabel.size; },
  };
  // Legacy shape: some callers still treat the index as a Map of label -> facts.
  index.has = (key) => byLabel.has(key);
  index.get = (key) => byLabel.get(key);
  return index;
}

/**
 * Resolve the stop's own entity identity: the id it carries, or the one the
 * bundle assigns to its label. Returns null when the machine cannot tell.
 */
/**
 * Generated stop labels append ACTIVITY descriptors to a place name —
 * "Going-to-the-Sun Road scenic drive" is the road, described. Stripping is
 * strictly suffix-bound and strictly activity words: a PLACE-FORMING suffix
 * ("Overlook", "Campground", "Trailhead") names a different entity and is
 * never stripped — that is the Phase 4S Phelps Lake Overlook trap.
 */
const TRAILING_ACTIVITY_DESCRIPTOR =
  /\s+(?:scenic\s+drive|loop\s+drive|drive|tour|visit|experience|exploration|circuit)\s*$/i;

/**
 * P0-5 — DECORATION, NOT CONTAINMENT (4T §3 "a whole name or a decoration of
 * one"). A generated stop label that BEGINS with the full entity name and
 * continues with activity description ("Going-to-the-Sun Road west-side
 * orientation drive") denotes that entity. Two guards keep the 4S trap
 * closed: a remainder containing a PLACE-FORMING noun names a different place
 * ("Phelps Lake Overlook" is not Phelps Lake) — except a "to <place>"
 * remainder, which is a route ALONG the entity and traverses it.
 */
const PLACE_FORMING_WORD =
  /\b(?:overlooks?|campgrounds?|campsites?|trailheads?|visitor\s+center|lodge|lakes?|falls?|points?|pass(?:es)?|creeks?|rivers?|mountains?|meadows?|basins?|canyons?|junctions?|inns?|hotels?|stations?|springs?|geysers?|arch(?:es)?|centers?|museums?|districts?)\b/i;

function labelDecoratesEntity(stopLabel, entityLabel) {
  const stop = normalizeLabel(stopLabel);
  const entity = normalizeLabel(entityLabel);
  if (!stop || !entity || stop === entity) return false;
  if (!stop.startsWith(`${entity} `)) return false;
  const remainder = stop.slice(entity.length + 1).trim();
  if (!remainder) return false;
  if (/^to\s+/.test(remainder)) return true;
  return !PLACE_FORMING_WORD.test(remainder);
}

/** The stop's label plus its activity-suffix-stripped form, variants expanded. */
function stopLabelCandidates(stop) {
  const labels = [String(stop?.name || '')];
  const undecorated = labels[0].replace(TRAILING_ACTIVITY_DESCRIPTOR, '');
  if (undecorated && undecorated !== labels[0]) labels.push(undecorated);
  const variants = [];
  for (const label of labels) {
    for (const variant of labelVariants(label)) {
      if (!variants.includes(variant)) variants.push(variant);
    }
  }
  return variants;
}

function resolveStopEntity(stop, index) {
  const declared = canonicalEntityKey(stop?.evidenceEntityId ?? stop?.entityId);
  if (declared) return declared;
  for (const variant of stopLabelCandidates(stop)) {
    const byName = index?.entityByLabel?.get(variant);
    if (byName) return byName;
    const byKey = index?.entityByLabel?.get(placeKey(variant));
    if (byKey) return byKey;
  }
  return null;
}

/**
 * PHASE 4T — ENTITY-FIRST BINDING.
 *
 * A blocking operational fact must belong to the exact place the traveler is
 * being sent to, not merely to something with a similar name.
 *
 *   1  identifier match            same entity, whatever the namespace  -> bind
 *   2  identifiers DISAGREE        -> bind nothing. The machine knows they are
 *                                     different entities; a string may not overrule it.
 *   3  identity-equivalent label   only when no identifier settles it   -> bind
 *   4  related-place containment   -> NEVER. Removed in 4T.
 *
 * @returns {{facts: object[], mechanism: string|null, subject: object|null}}
 */
function bindFactsToStop(stop, index) {
  const empty = { facts: [], mechanism: null, subject: null };
  if (!index || !stop) return empty;
  const byEntity = index.byEntity instanceof Map ? index.byEntity : new Map();
  const byLabel = index.byLabel instanceof Map ? index.byLabel : new Map();
  if (byEntity.size === 0 && byLabel.size === 0) return empty;

  const stopEntity = resolveStopEntity(stop, index);
  if (stopEntity) {
    const facts = byEntity.get(stopEntity) || [];
    // Whether or not this entity owns a fact, the question is ANSWERED. Falling
    // through to a name match here is exactly how a neighbouring place's
    // requirement used to arrive.
    return facts.length
      ? { facts, mechanism: BINDING_MECHANISM.ENTITY_IDENTIFIER, subject: facts[0].subject ?? null }
      : empty;
  }

  // No identity for this stop. Labels may still denote the same place — but only
  // as a whole name or a decoration of one, never by containing its tokens.
  for (const variant of stopLabelCandidates(stop)) {
    const facts = byLabel.get(placeKey(variant));
    if (!facts || !facts.length) continue;
    // If the fact's own subject has an identity and the stop resolves to a
    // different one, that was already handled above; reaching here means the
    // stop has none, so an equivalent label is the best evidence available.
    return { facts, mechanism: BINDING_MECHANISM.IDENTITY_EQUIVALENT_NAME, subject: facts[0].subject ?? null };
  }
  // Prefix decoration: the stop label extends a known entity name with
  // activity description. Longest entity name wins; place-forming remainders
  // never qualify (see labelDecoratesEntity).
  let decorated = null;
  for (const facts of byLabel.values()) {
    const subjectName = facts[0]?.subject?.name;
    if (!subjectName || !labelDecoratesEntity(stop?.name, subjectName)) continue;
    if (!decorated || String(subjectName).length > String(decorated.facts[0]?.subject?.name || '').length) {
      decorated = { facts, mechanism: BINDING_MECHANISM.IDENTITY_EQUIVALENT_NAME, subject: facts[0].subject ?? null };
    }
  }
  if (decorated) return decorated;
  return empty;
}

/**
 * Facts that apply to a plan stop.
 *
 * Identity-based: the requirement belongs to the PLACE, so it binds whether or
 * not the generated stop mentioned it. That is the whole point — a model that
 * omits "4WD required" does not make the road paved.
 */
function factsForStop(stop, index) {
  return bindFactsToStop(stop, index).facts;
}

/**
 * Harvest every authoritative operational fact carried by a frozen
 * EvidenceBundle, ready for `indexFactsByPlace`.
 */
function operationalFactsFromBundle(bundle) {
  const facts = [];
  for (const candidate of bundle?.evidence || []) {
    const rows = candidate?.claim?.normalizedValue?.operationalFacts;
    if (!Array.isArray(rows)) continue;
    for (const fact of rows) {
      if (fact && fact.type && fact.subject?.name) facts.push(fact);
    }
  }
  return facts;
}

module.exports = {
  BINDING_MECHANISM,
  bindFactsToStop,
  resolveStopEntity,
  OPERATIONAL_FACT_CONFIDENCE,
  operationalFactsFromBundle,
  extractOperationalFacts,
  officialPageOperationalFacts,
  indexFactsByPlace,
  factsForStop,
  placeKey,
};
