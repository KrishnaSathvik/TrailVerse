'use strict';

const {
  NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
  NPS_JOINT_UNIT_ACTIVITY_EXTRACTOR_VERSION,
  NPS_ACTIVITY_TAXONOMY_EXTRACTOR_VERSION,
  OPERATIONAL_NORMALIZATION_QUALIFIER,
} = require('../../utils/evidenceContractVersions');
const { npsSourceDetails, explicitCurrentClosure } = require('../../utils/npsSourceDetails');
const { extractOperationalFacts } = require('../../utils/operationalFactExtraction');
const { isScenicDriveSubject } = require('../../utils/scenicDriveSubject');
const {
  filterActivitiesForLogicalPark,
  JOINT_FETCH_ALIASES,
  jointScopeFor,
} = require('../../utils/npsJointUnitActivityScope');

const SUPPORTED_TOPICS = Object.freeze(new Set([
  'destination_identity', 'overview', 'activities', 'fees', 'hours',
  'alerts_closures', 'campgrounds', 'visitor_services', 'parking', 'accessibility',
  // NPS publishes road closures, trail closures and fire/smoke notices as
  // ALERTS. Declaring `nps` preferred for these topics while `supports()`
  // rejected them meant the structured wave could never satisfy them — and on
  // `live_in_trip_assistance` they are HARD, so the most urgent traveler
  // question was the one guaranteed to depend on a slow discovery chain.
  // They are served from the same alerts call, under the same dedupe key.
  'roads', 'trail_conditions', 'wildfire_smoke',
  // P0-5 — official vehicle size limits live in place/thingstodo prose
  // (longDescription), which the places operation already projects and
  // `extractOperationalFacts` already parses into `vehicle_dimension` facts.
  'vehicle_restrictions',
]));

/**
 * Live operational topics derived from the alerts feed, with the subject matter
 * that assigns an alert to each. An alert is always `alerts_closures`; it
 * additionally becomes topical evidence when its text is about that subject.
 */
const ALERT_DERIVED_TOPICS = Object.freeze([
  ['roads', /\b(road|roads|parkway|highway|scenic drive|loop drive|pass|route \d+|pullout|drive is|driving)\b/i],
  ['trail_conditions', /\b(trail|trails|trailhead|backcountry|hike|hiking|footpath|boardwalk)\b/i],
  ['wildfire_smoke', /\b(wildfire|wild fire|fire|smoke|smoky|air quality|haze|burn)\b/i],
]);

/** Topics the alerts operation can answer, including the derived ones. */
const ALERT_TOPICS = Object.freeze([
  'alerts_closures', ...ALERT_DERIVED_TOPICS.map(([topic]) => topic),
]);
// Profile fetch covers identity/overview/fees/hours. Named activities use
// thingstodo + places so itineraries get concrete trail/viewpoint candidates
// instead of coarse park-profile taxonomy labels alone.
const PROFILE_TOPICS = new Set(['destination_identity', 'overview', 'fees', 'hours']);

// TrailVerse historically used a few non-NPS codes in entity extractors.
// Evidence still keys off the logical entityId, but live NPS fetches must use
// the official park code or destination_identity hard-fails.
// Joint units (sequ/kica → seki): named activities are further scoped in
// normalizeNamedActivities so Kings Canyon geography is not attributed to Sequoia.
const NPS_PARK_CODE_ALIASES = Object.freeze({
  sequ: JOINT_FETCH_ALIASES.sequ,
  kica: JOINT_FETCH_ALIASES.kica,
});

function parkCodeFor(requirement) {
  const match = /^nps:park:([a-z0-9_-]+)$/i.exec(requirement?.entity?.entityId || '');
  return match ? match[1].toLowerCase() : null;
}

function npsFetchParkCode(parkCode) {
  const normalized = String(parkCode || '').toLowerCase();
  return NPS_PARK_CODE_ALIASES[normalized] || normalized;
}

function requestFor(topic) {
  if (PROFILE_TOPICS.has(topic)) return { operation: 'parks', method: 'getParkByCode', keyPart: 'parks' };
  if (topic === 'activities') return { operation: 'named_activities', method: 'getParkActivities', keyPart: 'named-activities' };
  // P0-5 — served from the same named-activities fetch (same dedupe key, no
  // extra call): place/thingstodo longDescriptions are where NPS puts size
  // limits, and extractOperationalFacts already parses them. Structured
  // coverage for this topic usually stays `missing`, which is exactly what
  // sends it down the bounded official-page chain.
  if (topic === 'vehicle_restrictions') return { operation: 'named_activities', method: 'getParkActivities', keyPart: 'named-activities' };
  if (ALERT_TOPICS.includes(topic)) return { operation: 'alerts', method: 'getParkAlerts', keyPart: 'alerts' };
  if (topic === 'campgrounds') return { operation: 'campgrounds', method: 'getParkCampgrounds', keyPart: 'campgrounds' };
  if (topic === 'visitor_services') return { operation: 'visitor_centers', method: 'getParkVisitorCenters', keyPart: 'visitor-centers' };
  if (topic === 'parking') return { operation: 'parkinglots', method: 'getParkParkingLots', keyPart: 'parkinglots' };
  if (topic === 'accessibility') return { operation: 'parks', method: 'getParkByCode', keyPart: 'parks' };
  return null;
}

function baseCandidate({
  parkCode, topic, evidenceType, identity, text, normalizedValue, sourceId, observedAt,
  status = null, url = null, title = null, qualifiers = [],
  extractorVersion = 'nps-evidence-v2',
}) {
  const entityId = `nps:park:${parkCode}`;
  return {
    entityId,
    topic,
    evidenceType,
    claim: {
      identity,
      text: text || null,
      normalizedValue: normalizedValue ?? null,
      unit: null,
      status,
      subjectId: entityId,
      objectId: null,
      qualifiers,
    },
    scope: {
      geographicEntityIds: [entityId],
      validFrom: null,
      validThrough: null,
      audience: 'public',
      locale: 'en-US',
    },
    source: {
      provider: 'nps',
      sourceClass: 'official_owner',
      sourceId: String(sourceId || parkCode),
      url: url || `https://www.nps.gov/${parkCode}/index.htm`,
      title,
      publishedAt: null,
      sourceUpdatedAt: null,
    },
    observedAt,
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion },
  };
}

function inferDifficulty(text) {
  const t = String(text || '').toLowerCase();
  // Word-boundary escapes must be `\b` in the regex literal — `\\b` matches a
  // literal backslash+b and silently classifies every NPS description as null.
  if (/\b(strenuous|difficult|expert|very hard)\b/.test(t)) return 'hard';
  if (/\b(moderate|moderately)\b/.test(t)) return 'moderate';
  if (/\b(easy|accessible|wheelchair|stroller|boardwalk|paved)\b/.test(t)) return 'easy';
  return null;
}

/** Body text arrives as HTML; inference regexes need plain word boundaries. */
function htmlToInferenceText(value) {
  const text = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function inferFacilityKind(name, description = '', category = '') {
  const title = String(name || '').toLowerCase();
  const kind = String(category || '').toLowerCase();
  // NPS place prose routinely mentions nearby facilities ("Lodge visitors",
  // "across from the Visitor Center"). Those words describe context, not the
  // record's identity. Strong structural titles win before facility names.
  if (kind === 'place' && /\b(shuttle stop|trailhead|wayside|overlook|point|shelter|station|parking|bike stand|charging station)\b/.test(title)) return null;
  if (/\bvisitor centers?\b/.test(title) || /\bnature centers?\b/.test(title)) return 'visitor_center';
  if (/\bmuseum\b/.test(title)) return 'museum';
  if (/\b(lodge|lodging|hotel|motel|cabins?)\b/.test(title) && !/\btrail\b/.test(title)) return 'lodging';
  if (/\bpicnic\b/.test(title)) return 'picnic';
  // Non-place activity articles may have generic titles, so their concise
  // descriptions can still identify an indoor/facility experience. A place
  // record stays a place unless its own title establishes the facility kind.
  if (kind !== 'place') {
    const hay = `${title} ${description || ''}`.toLowerCase();
    if (/\bvisitor centers?\b/.test(hay) || /\bnature centers?\b/.test(hay)) return 'visitor_center';
    if (/\bmuseum\b/.test(hay)) return 'museum';
    if (/\blodge\b/.test(hay) && !/\btrail\b/.test(hay)) return 'lodging';
    if (/\bpicnic\b/.test(hay)) return 'picnic';
  }
  return null;
}

// ---- Exposure cues, read per sentence of official text ----------------------
// A cue must describe the visitor's walking edge. Not cues: transport "drop off",
// geology/skin/sun/tide "exposed", proper-noun "Cliffs", measured "height", and
// park-wide safety boilerplate repeated on every record (removed by the caller).
const TRANSPORT_CONTEXT = /\b(pick(?:s|ing)?[- ]?up|passengers?|bus(?:es)?|shuttles?|bicycles?|bikes?|boats?|ferry|vehicles?|point|location|zone|luggage)\b/;
const NON_TERRAIN_EXPOSED = /\bexpos(?:ed|ure)\b.{0,25}\b(skin|sun|sunlight|wind|weather|waves?|tides?|elements|cold|heat|radiation|ingestion|inhalation|people|visitors?)\b|\b(sun|uv|heat|cold|wind|chemical|smoke)\s+exposure\b|\bexposed (?:at|during) (?:low|high) tide\b|\b(?:rock|rocks|layers?|strata|bedrock|formations?|geology|roots?|root system|trusses|beams|timbers|logs?|concrete|foundations?|surface)\b.{0,30}\bexpos(?:ed|ure)\b|\bexpos(?:ed|ure)\b.{0,30}\b(?:rock|rocks|layers?|strata|bedrock|formations?|geology|roots?|root system|trusses|beams|ceiling|granite|basalt|greenstone|landscape|grand staircase)\b|\bexposure can occur\b|\blandscape exposed\b/;
const EDGE_CUES = [
  /\bdrop[- ]?offs\b|\bdrop[- ]?off\b(?!\s+(?:into|and|the|passengers|bicycles|point|location))/,
  /\b(?:considerable|steep|sheer|long|sudden|vertical|large|big|major)\s+drops?\b/,
  /\bcliff[- ]?(?:edges?|faces?)\b|\bedges? of (?:the )?cliffs?\b|\b(?:climbs?|climbing|along|near|above)\s+(?:the |sheer |steep )?cliffs?\b/,
  /\b(?:narrow|sandstone|rock|exposed|open)\s+ledges?\b|\balong (?:a |the )?(?:\w+ )?ledges?\b|\bledges?\b.{0,25}\b(?:above|drop)/,
  /\b(?:fear|afraid) of heights\b|\bexposure to heights\b|\bvertigo\b|\bacrophob/,
  /\biron rungs?\b|\bchains? (?:anchored|bolted|along|to hold)\b|\b(?:handholds|ladders?) (?:up|on|bolted)\b/,
  /\brisk of falling\b|\bfall(?:ing)? hazards?\b|\bfalls? (?:can|could) be fatal\b|\bunfenced\b|\bunguarded edges?\b/,
  /\bexposed (?:ridge|ridgeline|ridges|edges?|ledges?|cliff|cliffs|cliff faces|summits?|slickrock|sections? near|viewpoints?|traverse)\b|\bsteep exposures?\b|\bexposure to (?:a |the )?(?:considerable |steep |sheer |long )?(?:drop|edge|cliff)/,
];
// Severity is judged in the cue's own sentence, never anywhere in the record.
const HIGH_SEVERITY = /\b(sheer|long|steep|significant|severe|scary|extreme|vertical|hundreds of feet|thousands? of feet|no (?:railings?|guardrails?|fences?)|unfenced|narrow ledges?|narrow ridge|exposed edges|iron rungs?|chains?|fatal)\b|\b\d{2,}[,\d]*\s?(?:feet|ft|foot|meters|m)\b/;
// Edge drops that describe a path surface, not a fall hazard.
const PATH_EDGE = /\b(minor|small|slight|low|short|shallow)\s+drop[- ]?offs?\b|\bdrop[- ]?offs?\b.{0,40}\b(pav(?:ed|ing|ement)|curbs?|surface|grade|wheelchair|accessib)|\b(pav(?:ed|ing|ement)|curbs?|surface|wheelchair|accessib)\w*\b.{0,60}\bdrop[- ]?offs?\b/;
const AMBIGUOUS_EXPOSED = /\bexpos(?:ed|ure)\b/;

/** Official HTML → text that keeps paragraph/line breaks as sentence boundaries. */
function htmlToSentenceText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>|<\/(?:p|li|h[1-6]|div|tr)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(?:\.\s*){2,}/g, '. ')
    .trim();
}

/** Every official text field of one record, for exposure inference only. */
function exposureSourceText(item) {
  return [item?.longDescription, item?.bodyText, item?.shortDescription, item?.description, item?.listingDescription]
    .filter((v) => typeof v === 'string' && v.trim()).map(htmlToSentenceText).join(' ');
}

function inferenceSentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

/** Sentences repeated across many records of one park are boilerplate, not a property of a place. */
function boilerplateSentences(texts, { minCount = 5, minShare = 0.1 } = {}) {
  const counts = new Map();
  for (const text of texts) {
    for (const sentence of new Set(inferenceSentences(text).map((s) => s.toLowerCase()))) {
      if (sentence.length >= 30) counts.set(sentence, (counts.get(sentence) || 0) + 1);
    }
  }
  const threshold = Math.max(minCount, Math.ceil(texts.length * minShare));
  return new Set([...counts].filter(([, count]) => count >= threshold).map(([sentence]) => sentence));
}

function exposureCues(sentence) {
  const s = sentence.toLowerCase();
  let edge = EDGE_CUES.some((cue) => cue.test(s));
  if (edge && /\bdrop[- ]?offs?\b/.test(s) && TRANSPORT_CONTEXT.test(s)
    && !EDGE_CUES.slice(1).some((cue) => cue.test(s))) edge = false;
  if (edge && PATH_EDGE.test(s) && !EDGE_CUES.slice(1).some((cue) => cue.test(s)) && !HIGH_SEVERITY.test(s)) {
    return { pathEdge: true };
  }
  if (edge) return { edge: true, high: HIGH_SEVERITY.test(s) };
  if (AMBIGUOUS_EXPOSED.test(s) && !NON_TERRAIN_EXPOSED.test(s)
    && !/\b(no|minimal|without|low|little|limited)\s+exposure\b|\bnot\s+exposed\b|\bunexposed\b/.test(s)) return { ambiguous: true };
  return {};
}

/**
 * Derive exposure only from authoritative description text.
 * Difficulty is NOT exposure. Canyon scenery words like "sheer walls" alone do
 * not prove trail exposure when the surface is paved/flat/accessible.
 * Returns null when unsupported or ambiguous (unknown — never silently low).
 * `options.boilerplate`: park-wide repeated sentences to ignore.
 */
function inferExposure(text, options = {}) {
  const boilerplate = options.boilerplate instanceof Set ? options.boilerplate : null;
  const sentences = inferenceSentences(text).filter((s) => !boilerplate?.has(s.toLowerCase()));
  const t = sentences.join(' ').toLowerCase();
  // A name-derived facility category is not exposure evidence. Use official
  // activity text without the title, so a misleading facility name cannot certify low.
  const body = options.name && String(text).startsWith(`${options.name}. `)
    ? String(text).slice(String(options.name).length + 2).toLowerCase() : t;
  const indoorVisit = /\b(?:indoor exhibits?|indoor galleries|inside (?:the )?(?:museum|visitor center)|interior exhibits?)\b/.test(body);
  const cues = sentences.map(exposureCues);
  const exposureNegated = /\b(no|minimal|without|low|little|limited)\s+exposure\b/.test(t)
    || /\bnot\s+exposed\b/.test(t)
    || /\bunexposed\b/.test(t);
  // Bare "flat" is too weak — Watchman NPS copy says "relatively flat beginning" then climbs.
  const lowSurface = /\b(paved|boardwalk|family[- ]friendly|accessible|wheelchair|stroller)\b/.test(t)
    || /\b(?:relatively\s+)?flat(?:\s+and)?\s+paved\b/.test(t);
  const roadside = /\b(roadside|pull[- ]?out|from the (?:road|parking)|parking[- ]area viewpoint)\b/.test(t);
  // Approach-trail "paved" mentions must not classify a strenuous/slot/river hike as low.
  const hardTerrain = /\b(strenuous|slot canyon|wading|scrambl(?:e|ing)|cables?|chains?)\b/.test(t)
    || /\briver (?:hike|hiking|walking)\b/.test(t)
    || /\bclimbs?\b.{0,40}\bviewpoint\b/.test(t)
    || /\bunpaved\b.{0,40}\bclimbs?\b/.test(t);

  if (cues.some((c) => c.edge)) return cues.some((c) => c.edge && c.high) ? 'high' : 'moderate';
  // An exposure word whose sense the text does not settle stays unknown.
  if (cues.some((c) => c.ambiguous)) return null;
  if (indoorVisit && !/\b(trail|hike|scrambl|cables?|chains?)\b/.test(t)) return 'low';
  // Minor path-edge drops neither prove nor disprove low; positive surface
  // evidence must still be present for low.
  if ((exposureNegated || lowSurface || roadside) && !hardTerrain) return 'low';
  return null;
}

function inferSunsetSuitability(text, tags = []) {
  const hay = `${text || ''} ${(tags || []).join(' ')}`.toLowerCase();
  if (/\b(sunset|sunrise|golden hour|evening light)\b/.test(hay)) return 'supported';
  if (/\b(viewpoint|overlook|vista|rim|lookout|scenic)\b/.test(hay)) return 'possible';
  return null;
}

function activityTypesFrom(item, scenicDriveSubject = isScenicDriveSubject(item)) {
  if (scenicDriveSubject) return ['scenic_drive', 'scenic driving'];
  const tags = (item.activities || item.activityTags || [])
    .map((a) => (typeof a === 'string' ? a : a?.name))
    .filter(Boolean);
  const text = `${item.title || item.name || ''} ${item.shortDescription || item.description || ''}`;
  const types = tags.map((t) => String(t).toLowerCase())
    .filter((t) => !/scenic[-_ ]driv|auto[- ]?tour|self-guided tours - auto/.test(t));
  if (/\bhike\b|\btrail\b/i.test(text)) types.push('hike');
  if (/\bwalk\b|\bstroll\b|\bboardwalk\b/i.test(text)) types.push('walk');
  if (/\bviewpoint\b|\boverlook\b|\bvista\b|\bscenic\b/i.test(text)) types.push('viewpoint');
  if (/\bsunset\b|\bsunrise\b/i.test(text)) types.push('sunset');
  return [...new Set(types)];
}

const { walkingDistanceFields } = require('../../utils/hardConstraintEligibility');

function normalizeProfile(raw, request, observedAt) {
  if (!raw || typeof raw !== 'object') return [];
  const parkCode = request.parameters.parkCode;
  const sourceId = raw.id || raw.parkCode || parkCode;
  const candidates = [baseCandidate({
    parkCode, topic: 'destination_identity', evidenceType: 'fact',
    identity: 'canonical-park-identity', text: raw.fullName || raw.name || null,
    normalizedValue: { parkCode, fullName: raw.fullName || raw.name || null, states: raw.states || null },
    sourceId, observedAt,
  })];
  if (raw.description) candidates.push(baseCandidate({
    parkCode, topic: 'overview', evidenceType: 'description', identity: 'official-park-overview',
    text: raw.description, normalizedValue: raw.description, sourceId, observedAt,
  }));
  for (const fee of raw.entranceFees || []) candidates.push(baseCandidate({
    parkCode, topic: 'fees', evidenceType: 'fact',
    identity: `entrance-fee:${fee.title || fee.cost || 'standard'}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
    text: fee.description || fee.title || null,
    normalizedValue: { title: fee.title || null, cost: fee.cost == null ? null : Number(fee.cost) },
    sourceId, observedAt,
  }));
  for (const hours of raw.operatingHours || []) candidates.push(baseCandidate({
    parkCode, topic: 'hours', evidenceType: 'rule',
    identity: `operating-hours:${hours.name || 'standard'}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
    text: hours.description || hours.name || null,
    normalizedValue: hours.standardHours || null,
    sourceId, observedAt,
  }));
  for (const activity of raw.activities || []) candidates.push(baseCandidate({
    parkCode, topic: 'activities', evidenceType: 'fact',
    identity: `activity-taxonomy:${activity.id || activity.name}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
    text: activity.name || null,
    normalizedValue: {
      name: activity.name || null,
      category: 'taxonomy',
      activityTypes: activity.name ? [String(activity.name).toLowerCase()] : [],
      currentStatus: 'unknown',
      authority: 'official_owner',
    },
    sourceId: activity.id || sourceId,
    observedAt,
    qualifiers: ['activity_taxonomy'],
    extractorVersion: NPS_ACTIVITY_TAXONOMY_EXTRACTOR_VERSION,
  }));
  return candidates;
}

function normalizeNamedActivities(raw, request, observedAt, metadata = {}) {
  const parkCode = request.parameters.parkCode;
  const entityId = `nps:park:${parkCode}`;
  const extractorVersion = jointScopeFor(parkCode)
    ? NPS_JOINT_UNIT_ACTIVITY_EXTRACTOR_VERSION
    : NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION;
  // Joint NPS units (e.g. sequ/kica → seki): drop wrong-subunit geography before
  // stamping candidates onto the logical park entity.
  const thingstodo = filterActivitiesForLogicalPark(
    Array.isArray(raw?.thingstodo) ? raw.thingstodo : [],
    parkCode
  );
  const places = filterActivitiesForLogicalPark(
    Array.isArray(raw?.places) ? raw.places : [],
    parkCode
  );
  const candidates = [];
  // Park-wide safety copy repeated on many records describes the park, not the place.
  const boilerplate = boilerplateSentences([...thingstodo, ...places].map(exposureSourceText));
  const ingestionComplete = metadata.sourceIngestionComplete === true;
  const baseQualifiers = ingestionComplete
    ? ['source_ingestion_complete']
    : [];

  for (const [index, item] of thingstodo.entries()) {
    const name = item.title || item.name || null;
    if (!name) continue;
    // OFFICIAL TEXT. `longDescription` is where NPS puts access and requirement
    // detail, and dropping it is why "requires a high-clearance four-wheel-drive
    // vehicle" never reached any consumer. Keep the short form as the display
    // text; read the long form for suitability inference.
    const description = item.shortDescription || item.description || null;
    const officialDetail = [item.longDescription, description]
      .filter((v) => typeof v === 'string' && v.trim()).join(' ');
    const url = item.url || (item.id ? `https://www.nps.gov/thingstodo/${item.id}.htm` : `https://www.nps.gov/${parkCode}/planyourvisit/things2do.htm`);
    // Same official text for type inference — a "Trailhead" title alone
    // matches no activity regex, so name-only inference left the places corpus
    // typeless and the experiential repair catalogue empty.
    const activityTypes = activityTypesFrom({ ...item, title: name, shortDescription: officialDetail }, isScenicDriveSubject(item));
    const difficulty = inferDifficulty(`${name} ${officialDetail}`);
    const scenicDriveSubject = isScenicDriveSubject(item);
    const facilityKind = scenicDriveSubject ? 'scenic_drive' : inferFacilityKind(name, description, 'thingstodo');
    const exposureLevel = inferExposure(`${name}. ${exposureSourceText(item)}`, {
      name,
      category: 'thingstodo',
      facilityKind,
      boilerplate,
    });
    candidates.push(baseCandidate({
      parkCode,
      topic: 'activities',
      evidenceType: 'fact',
      identity: `thingstodo:${item.id || name}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
      text: description ? `${name}: ${description}` : name,
      normalizedValue: {
        entityId: `${entityId}:thingstodo:${item.id || index}`,
        destinationId: entityId,
        name,
        category: 'thingstodo',
        activityTypes,
        scenicDriveSubject,
        primaryActivityType: scenicDriveSubject ? 'scenic_drive' : null,
        difficulty,
        duration: item.duration || null,
        ...walkingDistanceFields(scenicDriveSubject ? {} : {
          text: `${name} ${officialDetail}`,
          name,
          activityTypes,
          category: 'thingstodo',
          facilityKind,
          item,
        }),
        exposureLevel,
        // NPS supplies `accessibilityInformation`; the old read of
        // `item.accessibility` matched no NPS field and was always null.
        accessibility: item.accessibilityInformation || item.accessibility || null,
        // THE MISSING PRODUCER. Authoritative access/permit/vehicle requirements,
        // mapped onto the operational vocabulary that already existed and had
        // nothing writing to it.
        operationalFacts: extractOperationalFacts({ item, parkCode, observedAt }),
        sourceDetails: npsSourceDetails(item),
        closureStatus: explicitCurrentClosure(item) ? 'closed' : 'unknown',
        seasonalStatus: null,
        currentStatus: 'unknown',
        viewpointTraits: activityTypes.filter((t) => /view|scenic|overlook|sunset|sunrise/.test(t)),
        sunsetSuitability: inferSunsetSuitability(`${name} ${description || ''}`, activityTypes),
        coordinates: (item.latitude != null && item.longitude != null)
          ? { latitude: Number(item.latitude), longitude: Number(item.longitude) }
          : null,
        authority: 'official_owner',
        sourceUrl: url,
        observedAt,
        freshness: 'stable',
      },
      sourceId: item.id || `${parkCode}:thingstodo:${index}`,
      observedAt,
      url,
      title: name,
      // Semantic contract of the operational-fact producer above. Read on cache
      // lookup so pre-fix normalizedValue cannot be served as current.
      qualifiers: [
        'named_activity_candidate', 'static_suitability_only',
        OPERATIONAL_NORMALIZATION_QUALIFIER, ...baseQualifiers,
      ],
      extractorVersion,
    }));
  }

  for (const [index, item] of places.entries()) {
    const name = item.title || item.name || null;
    if (!name) continue;
    // OFFICIAL TEXT. NPS /places items carry their text under
    // `listingDescription` (short) and `bodyText` (full page body, including
    // the foot-by-foot accessibility surveys that state drop-off hazards and
    // trail lengths). Neither shortDescription nor longDescription exists on
    // places — reading only those dropped the entire places corpus, the same
    // field miss that once hid "requires a high-clearance four-wheel-drive
    // vehicle" on thingstodo.
    const description = item.shortDescription || item.description
      || htmlToInferenceText(item.listingDescription) || null;
    const officialDetail = [item.longDescription, htmlToInferenceText(item.bodyText), description]
      .filter((v) => typeof v === 'string' && v.trim()).join(' ');
    const url = item.url || `https://www.nps.gov/${parkCode}/index.htm`;
    const activityTypes = activityTypesFrom({ ...item, title: name, shortDescription: officialDetail }, isScenicDriveSubject(item));
    const scenicDriveSubject = isScenicDriveSubject(item);
    const facilityKind = scenicDriveSubject ? 'scenic_drive' : inferFacilityKind(name, description, 'place');
    candidates.push(baseCandidate({
      parkCode,
      topic: 'activities',
      evidenceType: 'fact',
      identity: `place:${item.id || name}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
      text: description ? `${name}: ${description}` : name,
      normalizedValue: {
        entityId: `${entityId}:place:${item.id || index}`,
        destinationId: entityId,
        name,
        category: facilityKind || 'place',
        activityTypes: facilityKind ? [...new Set([...activityTypes, facilityKind])] : activityTypes,
        scenicDriveSubject,
        primaryActivityType: scenicDriveSubject ? 'scenic_drive' : null,
        difficulty: inferDifficulty(`${name} ${officialDetail}`),
        duration: null,
        ...walkingDistanceFields(scenicDriveSubject ? {} : {
          text: `${name} ${officialDetail}`,
          name,
          activityTypes,
          category: facilityKind || 'place',
          facilityKind,
          item,
        }),
        exposureLevel: inferExposure(`${name}. ${exposureSourceText(item)}`, {
          name,
          category: 'place',
          facilityKind,
          boilerplate,
        }),
        accessibility: item.accessibilityInformation || null,
        operationalFacts: extractOperationalFacts({ item, parkCode, observedAt }),
        sourceDetails: npsSourceDetails(item),
        closureStatus: explicitCurrentClosure(item) ? 'closed' : 'unknown',
        seasonalStatus: null,
        currentStatus: 'unknown',
        viewpointTraits: activityTypes.filter((t) => /view|scenic|overlook|sunset|sunrise/.test(t)),
        sunsetSuitability: inferSunsetSuitability(`${name} ${description || ''}`, activityTypes),
        coordinates: (item.latitude != null && item.longitude != null)
          ? { latitude: Number(item.latitude), longitude: Number(item.longitude) }
          : null,
        authority: 'official_owner',
        sourceUrl: url,
        observedAt,
        freshness: 'stable',
      },
      sourceId: item.id || `${parkCode}:place:${index}`,
      observedAt,
      url,
      title: name,
      qualifiers: [
        'named_place_candidate', 'static_suitability_only',
        OPERATIONAL_NORMALIZATION_QUALIFIER, ...baseQualifiers,
      ],
      extractorVersion,
    }));
  }

  return candidates;
}

/**
 * Which alert-derived topics this COMPLETE feed contains nothing about.
 * `alerts_closures` is never listed: every alert is one, so an empty list there
 * is the existing whole-feed emptiness case.
 */
function emptyAlertTopics(raw) {
  const items = Array.isArray(raw) ? raw : [];
  return ALERT_DERIVED_TOPICS
    .filter(([, pattern]) => !items.some((item) => pattern.test(
      `${item?.title || item?.name || ''} ${item?.description || item?.shortDescription || ''} ${item?.category || ''}`
    )))
    .map(([topic]) => topic);
}

function normalizeList(raw, request, observedAt) {
  const parkCode = request.parameters.parkCode;
  const topic = request.operation === 'alerts' ? 'alerts_closures'
    : request.operation === 'campgrounds' ? 'campgrounds'
      : request.operation === 'parkinglots' ? 'parking'
        : 'visitor_services';
  const evidenceType = request.operation === 'alerts' ? 'live_state' : 'fact';
  const items = Array.isArray(raw) ? raw : [];

  // ALERT FAN-OUT. One fetch, several topics. An alert about a closed road is
  // genuinely `roads` evidence; emitting it only as `alerts_closures` left the
  // `roads` requirement unsatisfiable from the structured wave. Classification
  // is by subject matter, so a fee notice never becomes trail conditions.
  if (request.operation === 'alerts') {
    return items.flatMap((item, index) => {
      const name = item.title || item.name || null;
      const description = item.description || item.shortDescription || null;
      const haystack = `${name || ''} ${description || ''} ${item.category || ''}`;
      const topics = [
        'alerts_closures',
        ...ALERT_DERIVED_TOPICS.filter(([, pattern]) => pattern.test(haystack)).map(([id]) => id),
      ];
      return topics.map((alertTopic) => baseCandidate({
        parkCode,
        topic: alertTopic,
        evidenceType,
        identity: `${request.operation}:${alertTopic}:${item.id || item.name || index}`
          .toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
        text: description ? `${name}: ${description}` : (name || description || null),
        normalizedValue: { title: item.title || null, category: item.category || null },
        sourceId: `${item.id || `${parkCode}:alerts:${index}`}:${alertTopic}`,
        observedAt,
        status: 'active',
        title: name,
      }));
    });
  }

  return items.map((item, index) => {
    const name = item.title || item.name || null;
    const description = item.description || item.shortDescription || null;
    const facilityKind = request.operation === 'visitor_centers'
      ? 'visitor_center'
      : inferFacilityKind(name, description, topic);
    return baseCandidate({
      parkCode, topic, evidenceType,
      identity: `${request.operation}:${item.id || item.name || index}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
      text: description ? `${name}: ${description}` : (name || description || null),
      normalizedValue: request.operation === 'alerts'
        ? { title: item.title || null, category: item.category || null }
        : request.operation === 'visitor_centers'
          ? {
            name,
            category: 'visitor_center',
            coordinates: (item.latitude != null && item.longitude != null)
              ? { latitude: Number(item.latitude), longitude: Number(item.longitude) }
              : null,
            activityTypes: ['visitor_center', 'exhibits', 'orientation'],
            difficulty: 'easy',
            exposureLevel: 'low',
            currentStatus: 'unknown',
            authority: 'official_owner',
          }
          : { name: item.name || null },
      sourceId: item.id || `${parkCode}:${request.operation}:${index}`,
      observedAt,
      status: request.operation === 'alerts' ? 'active' : null,
      title: name,
    });
  });
}

function createNpsEvidenceProvider({ npsClient = null, now = () => new Date() } = {}) {
  const client = () => npsClient || require('../npsService').getNpsService();
  return {
    id: 'nps',
    supports(requirement) {
      return SUPPORTED_TOPICS.has(requirement?.topic) && Boolean(parkCodeFor(requirement));
    },
    estimateCost() {
      return { costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 };
    },
    buildRequest(requirement) {
      const parkCode = parkCodeFor(requirement);
      const descriptor = requestFor(requirement?.topic);
      if (!parkCode || !descriptor) throw new TypeError('Unsupported NPS evidence requirement');
      return {
        provider: 'nps',
        operation: descriptor.operation,
        parameters: { parkCode },
        dedupeKey: `nps|${descriptor.keyPart}|${parkCode}`,
        publicCanonicalRequest: { provider: 'nps', operation: descriptor.operation, parkCode },
      };
    },
    async fetch(request, { signal } = {}) {
      if (signal?.aborted) throw Object.assign(new Error('NPS evidence fetch cancelled'), { code: 'ABORT_ERR' });
      const service = client();
      const parkCode = request.parameters.parkCode;
      const fetchParkCode = npsFetchParkCode(parkCode);
      let raw;
      let explicitComplete = false;
      let providerObservedAt = null;
      let namedActivitiesSource = null;
      let namedActivitiesSelection = null;
      if (request.operation === 'parks' && typeof service.getParkProfileEvidence === 'function') {
        const result = await service.getParkProfileEvidence(fetchParkCode, { signal });
        raw = result?.data || null;
        explicitComplete = result?.isComplete === true;
        providerObservedAt = result?.observedAt || null;
      } else if (request.operation === 'parks') raw = await service.getParkByCode(fetchParkCode);
      else if (request.operation === 'named_activities') {
        if (typeof service.getParkNamedActivitiesEvidence === 'function') {
          const result = await service.getParkNamedActivitiesEvidence(fetchParkCode, { signal });
          raw = result?.data || { thingstodo: [], places: [] };
          if (!raw.thingstodo) raw.thingstodo = [];
          if (!raw.places) raw.places = [];
          explicitComplete = result?.isComplete === true;
          providerObservedAt = result?.observedAt || null;
          // selection reasons: snapshot_hit_complete | snapshot_incomplete | direct_fallback | direct_refresh_failed
          namedActivitiesSelection = result?.selection || null;
          namedActivitiesSource = result?.source || null;
        } else {
          // Legacy test/mock path: cannot prove ingestion completeness.
          const [thingstodo, places] = await Promise.all([
            typeof service.getParkActivities === 'function' ? service.getParkActivities(fetchParkCode) : [],
            typeof service.getParkPlaces === 'function' ? service.getParkPlaces(fetchParkCode) : [],
          ]);
          raw = {
            thingstodo: Array.isArray(thingstodo) ? thingstodo : [],
            places: Array.isArray(places) ? places : [],
          };
          explicitComplete = false;
          namedActivitiesSource = 'legacy_unproven';
        }
      } else if (request.operation === 'alerts' && typeof service.getParkAlertsEvidence === 'function') {
        const result = await service.getParkAlertsEvidence(fetchParkCode, { signal });
        raw = result?.data || [];
        explicitComplete = result?.isComplete === true;
        providerObservedAt = result?.observedAt || null;
      } else if (request.operation === 'alerts') raw = await service.getParkAlerts(fetchParkCode);
      else if (request.operation === 'campgrounds' && typeof service.getParkCampgroundsEvidence === 'function') {
        const result = await service.getParkCampgroundsEvidence(fetchParkCode, { signal });
        raw = result?.data || [];
        explicitComplete = result?.isComplete === true;
        providerObservedAt = result?.observedAt || null;
      }
      else if (request.operation === 'campgrounds') raw = await service.getParkCampgrounds(fetchParkCode);
      else if (request.operation === 'visitor_centers' && typeof service.getParkVisitorCentersEvidence === 'function') {
        const result = await service.getParkVisitorCentersEvidence(fetchParkCode, { signal });
        raw = result?.data || [];
        explicitComplete = result?.isComplete === true;
        providerObservedAt = result?.observedAt || null;
      }
      else if (request.operation === 'visitor_centers') raw = await service.getParkVisitorCenters(fetchParkCode);
      else if (request.operation === 'parkinglots') {
        raw = typeof service.getParkParkingLots === 'function'
          ? await service.getParkParkingLots(fetchParkCode)
          : [];
      }
      else throw new TypeError(`Unsupported NPS operation: ${request.operation}`);
      const observedAt = providerObservedAt || now().toISOString();
      const empty = request.operation === 'named_activities'
        ? (raw.thingstodo.length + raw.places.length) === 0
        : Array.isArray(raw) && raw.length === 0;
      return {
        raw,
        metadata: {
          observedAt,
          parkCode,
          operation: request.operation,
          ...(request.operation === 'named_activities' ? {
            namedActivitiesSource,
            namedActivitiesSelection,
            sourceIngestionComplete: explicitComplete,
          } : {}),
        },
        completeness: {
          isComplete: explicitComplete,
          // The alerts call answers several topics, so it must declare all of
          // them — otherwise absence can never be proven for the derived ones.
          topics: request.operation === 'alerts'
            ? [...ALERT_TOPICS]
            : [request.operation === 'named_activities' ? 'activities' : request.operation],
          scope: { entityId: `nps:park:${parkCode}`, observedAt },
          emptyMeans: empty && explicitComplete ? 'proves_absent' : 'unknown',
          // PER-TOPIC ABSENCE. The alerts feed is rarely empty overall but is
          // very often empty OF FIRE, and "no official fire notice" is the true
          // and useful answer to "is there smoke". A whole-list emptiness test
          // could never express that.
          ...(request.operation === 'alerts' && explicitComplete
            ? { emptyTopics: emptyAlertTopics(raw) }
            : {}),
        },
        providerAttempts: 1,
      };
    },
    normalize(raw, request, metadata = {}) {
      if (request.operation === 'parks') return normalizeProfile(raw, request, metadata.observedAt);
      if (request.operation === 'named_activities') {
        const candidates = normalizeNamedActivities(raw, request, metadata.observedAt, {
          ...metadata,
          sourceIngestionComplete: metadata.sourceIngestionComplete === true,
        });
        const access = require('../../data/officialPlaceAccessFacts')[`nps:park:${request.parameters.parkCode}`];
        if (access) for (const place of access.places) {
          candidates.push(baseCandidate({
            parkCode: request.parameters.parkCode, topic: 'activities', evidenceType: 'fact',
            identity: `facility-access:${place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            text: `${place.name}: ${place.accessibility} ${place.limitation || ''}`,
            normalizedValue: { ...place, activityTypes: [place.category], wheelchairAccessible: true,
              currentStatus: 'unknown', exposureLevel: 'low', difficulty: 'easy' },
            sourceId: `facility-access:${place.name}`, url: place.sourceUrl || access.sourceUrl,
            observedAt: access.reviewedAt, title: place.name,
            qualifiers: ['static_suitability_only', 'reviewed_facility_access:2026-09-23',
              OPERATIONAL_NORMALIZATION_QUALIFIER,
              ...(metadata.sourceIngestionComplete === true ? ['source_ingestion_complete'] : [])],
            extractorVersion: NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
          }));
        }
        return candidates;
      }
      return normalizeList(raw, request, metadata.observedAt);
    },
    classifyError(error) {
      const status = error?.response?.status;
      if (error?.code === 'nps_not_configured') return { code: 'provider_not_configured', retryable: false };
      if (status === 429) return { code: 'provider_rate_limited', retryable: false };
      if (['ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)) return { code: 'provider_timeout', retryable: true };
      if (error?.code === 'ABORT_ERR') return { code: 'provider_cancelled', retryable: false };
      if (status === 401 || status === 403) return { code: 'provider_not_configured', retryable: false };
      return { code: 'provider_unavailable', retryable: status >= 500 || !status };
    },
  };
}

module.exports = {
  SUPPORTED_TOPICS,
  NPS_PARK_CODE_ALIASES,
  npsFetchParkCode,
  createNpsEvidenceProvider,
};
