'use strict';

const { validateDayCompleteness, validateBaseTransition } = require('../utils/dayCompleteness');
const { BASE_ITINERARY_SCHEMA, PATCH_ITINERARY_TOOL, isValidToolItinerary, isValidPlanPatch } = require('../utils/itineraryToolSchema');
const { applyPlanPatch, preserveUntouchedDays } = require('../utils/itineraryPlanPatch');
const { acceptedStopsById, preservedIdentitySource, acceptedEdgesByPair } = require('../utils/stopIdentity');
const { isAcceptedCanonicalPlan } = require('../utils/canonicalPlanAcceptance');
const { assessPlaceEligibility } = require('../utils/modelFirstPlaceEligibility');
const { transitionLodging } = require('../utils/travelerFactTransition');
const { hashPayload } = require('../utils/canonicalResponse');
const { usableEvidence } = require('./trailieSimpleTools');
const { validLocation } = require('../utils/trailieCanonicalLocation');
const { supportedDurationMaximum } = require('../utils/evidenceActivityDuration');
const { memoryAdmission, memoryFactRelationship } = require('./trailieMemoryAuthority');
const { resolveHardConstraints, serializeHardConstraints } = require('../utils/hardConstraintAuthority');
const { operationalFactsFromBundle, indexFactsByPlace, factsForStop } = require('../utils/operationalFactExtraction');
const { resolveOperationalAccess, transferDates } = require('../utils/transferOperationalAccess');
const { transferRouteMode, drivingProhibited } = require('../utils/transferRouteMode');
const { reconcileTransportationDrivingPolicy, DRIVING_POLICY_VALUES,
  DRIVING_POLICY_REASONS } = require('../utils/transportConstraintContract');
const { validateClaimedExperienceMapAnchor } = require('../utils/experienceMapAnchorTruth');
const {
  evaluateTripSchemaVersion,
  stampTripSchemaVersion,
} = require('../../../shared/tripSchemaVersion.cjs');
const { evaluateUsPlanGeography } = require('../utils/usPlanGeography');
const { validateOvernightLimit, validateGuidanceLinks, normalizeGuidanceLinkLabels } = require('../utils/itineraryReliability');

// Reuse storage shapes, without the old prompt's quality/stance instructions or
// advanced surfaces this small validator does not yet validate.
const pickSchema = (schema, keys) => ({ type: 'object', additionalProperties: false,
  required: (schema.required || []).filter(k => keys.includes(k)),
  properties: Object.fromEntries(keys.filter(k => schema.properties[k]).map(k => [k, structuredClone(schema.properties[k])])) });
const stopSchema = pickSchema(BASE_ITINERARY_SCHEMA.properties.days.items.properties.stops.items,
  ['id', 'order', 'type', 'name', 'evidenceRef', 'note', 'why', 'startTime', 'timeWindow', 'duration',
    'description', 'timingReason']);
stopSchema.required = stopSchema.required.filter(key => key !== 'startTime');
stopSchema.properties.revisitReason = { type: 'string', maxLength: 300,
  description: 'Only when this place already appears on another day: why repeating it serves the traveler\u2019s stated priority. Otherwise choose a different experience.' };
const daySchema = pickSchema(BASE_ITINERARY_SCHEMA.properties.days.items, ['id', 'dayNumber', 'label', 'stops', 'date', 'overnightLocation', 'activityGroups', 'travelEdges', 'dayStructure']);
daySchema.properties.stops.items = stopSchema;
daySchema.required.push('dayStructure');
const planSchema = pickSchema(BASE_ITINERARY_SCHEMA, ['intro', 'days', 'narrativeSections']);
planSchema.properties.parkName = { type: 'string', maxLength: 200 };
planSchema.properties.days.items = daySchema;
const patchSchema = structuredClone(PATCH_ITINERARY_TOOL.input_schema);
patchSchema.properties.intro = structuredClone(planSchema.properties.intro);
patchSchema.properties.narrativeSections = structuredClone(planSchema.properties.narrativeSections);
patchSchema.properties.operations.minItems = 0;
patchSchema.properties.operations.items.properties.day = daySchema;
patchSchema.properties.operations.items.properties.stop = { ...stopSchema, required: [] };
function withoutDescriptions(value) {
  if (Array.isArray(value)) return value.map(withoutDescriptions);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'description').map(([key, child]) => [key, withoutDescriptions(child)]));
  return value;
}

const PROPOSE_TOOL = { name: 'propose_trip_update', description:
  'Required when creating or materially changing the traveler’s trip: prose alone does not create the product itinerary. Also use for source-grounded memory changes. Supply the answer and requested update together. '
  + 'Quote the traveler’s own words from this conversation for memory updates, never your own. Every exact field/value must be explicitly supported; an independent verifier rejects unrelated, negated, hypothetical or uncertain claims. Do not infer an unstated year. Use plan_patch for an accepted plan; otherwise plan for creation. '
  + 'Stops must reference retrieved evidence. The response field is published only after acceptance: describe the completed change, not a conditional proposal. '
  + 'Never overwrite dates or constraints using a default or an assumption.',
  input_schema: { type: 'object', additionalProperties: false, required: ['response'], properties: {
    response: { type: 'string', maxLength: 16000 }, memory_updates: { type: 'array', maxItems: 16, items: {
      type: 'object', additionalProperties: false, required: ['field', 'value', 'sourceQuote'], properties: {
        field: { type: 'string', enum: ['dates', 'lodging', 'mobility', 'preferences', 'travelers', 'travelerFacts', 'transportation', 'budget'] },
        value: { type: 'object', description: 'Fields by memory group: dates {startDate,endDate,durationDays,travelMonth (month name only, e.g. October)}; lodging {baseTown,booked}; mobility {maxWalkMilesPerSegment,maxWalkMinutesPerSegment,wheelchair,stroller,avoidStairs,requiresFrequentBreaks}; preferences {avoidExposure,interests (activities they enjoy),pace (whole-trip pace such as relaxed, only when the traveler describes the whole trip — a request about one day changes that day, not memory),fitness (the hiking difficulty they want, e.g. easy hikes or shorter hikes),maxDailyDriveMinutes}; travelers {adults,children,pets}; travelerFacts {fact}; transportation {mode,rentalCar,drivingPolicy,drivingPolicyReason} (transportation.mode accepts only drive or fly, and only when supported by the traveler’s journey. rentalCar separately records explicitly stated rental-car availability. A traveler may fly and rent a car. A rental car alone does not establish how the traveler reaches the destination. Omit unsupported or unknown values.); budget {amount,currency,scope}. Omit unknown fields.' }, sourceQuote: { type: 'string' },
  } } }, plan: withoutDescriptions(planSchema), plan_patch: withoutDescriptions(patchSchema),
  } } };
PROPOSE_TOOL.input_schema.properties.memory_updates.items.properties.value.description += ' lodging also accepts maxHotelChanges, a nonnegative integer explicitly requested by the traveler.';

const FIELDS = {
  dates: { startDate: 'date', endDate: 'date', durationDays: 'positive', travelMonth: 'month' },
  lodging: { baseTown: 'string', booked: 'boolean', maxHotelChanges: 'nonnegative' },
  budget: { amount: 'nonnegative', currency: 'string', scope: 'string' },
  mobility: { maxWalkMilesPerSegment: 'positive', maxWalkMinutesPerSegment: 'positive',
    wheelchair: 'boolean', stroller: 'boolean', avoidStairs: 'boolean', requiresFrequentBreaks: 'boolean' },
  preferences: { avoidExposure: 'boolean', interests: 'strings', pace: 'string', fitness: 'string', maxDailyDriveMinutes: 'positive' },
  transportation: { mode: 'string', rentalCar: 'boolean', drivingPolicy: 'string', drivingPolicyReason: 'string' },
  travelers: { adults: 'positive', children: 'nonnegative', pets: 'boolean' },
  travelerFacts: { fact: 'string' },
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const clone = value => structuredClone(value);
const LODGING_TYPES = new Set(['lodging', 'lodge', 'hotel', 'accommodation']);
const placeName = value => String(value || '').replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// The overnight base is the day's base, not an attraction: a lodging stop naming that
// base is folded into it, unless it is the day's only stop (an arrival day).
function foldLodgingBase(day, previousDay) {
  const bases = new Set([placeName(day.overnightLocation), placeName(previousDay?.overnightLocation)].filter(Boolean));
  const isBase = st => LODGING_TYPES.has(st.type) && bases.has(placeName(st.name));
  if (!(day.stops || []).some(isBase) || !(day.stops || []).some(st => !isBase(st))) return;
  const removed = new Set(day.stops.filter(isBase).map(st => st.id));
  day.stops = day.stops.filter(st => !removed.has(st.id)).map((st, i) => ({ ...st, order: i + 1 }));
  if (day.dayStructure?.blocks) day.dayStructure.blocks = day.dayStructure.blocks.map(block => {
    const stopIds = (block.stopIds || []).filter(id => !removed.has(id));
    return { ...block, stopIds };
  });
  if (day.activityGroups) day.activityGroups = day.activityGroups
    .map(g => ({ ...g, stopIds: (g.stopIds || []).filter(id => !removed.has(id)) })).filter(g => g.stopIds.length >= 2);
}
// A sightseeing place repeated on another day must say why (the traveler's priority);
// towns, localities and lodging recur naturally as bases and transfers.
function repeatedWithoutReason(days, touched) {
  const seen = new Map();
  const recurring = st => st.placeKind === 'area' || LODGING_TYPES.has(st.type)
    || (st.placeTypes || []).some(t => ['locality', 'sublocality', 'political', 'administrative_area_level_3'].includes(t));
  for (const day of days) for (const st of day.stops || []) {
    const key = st.canonicalPlaceId || placeName(st.name);
    if (!key || recurring(st)) continue;
    const first = seen.get(key);
    if (!first) { seen.set(key, day.dayNumber); continue; }
    if (first === day.dayNumber) continue;
    const involvesChange = !touched || touched.includes(day.dayNumber) || touched.includes(first);
    if (involvesChange && !(typeof st.revisitReason === 'string' && st.revisitReason.trim())) return true;
  }
  return false;
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
// Validate the existing tool schema locally too: function calling is not a
// trusted write boundary, even when a provider advertises strict output.
function conforms(value, schema) {
  if (!schema) return true;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && !types.includes(type) && !(types.includes('integer') && Number.isInteger(value))) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (type === 'number' && !Number.isFinite(value)) return false;
  if (type === 'object') {
    if ((schema.required || []).some(key => !Object.hasOwn(value, key))) return false;
    return Object.entries(value).every(([key, v]) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
      && (schema.additionalProperties !== false || Object.hasOwn(schema.properties || {}, key))
      && conforms(v, schema.properties?.[key]));
  }
  if (type === 'array') return (!schema.maxItems || value.length <= schema.maxItems) && value.every(v => conforms(v, schema.items));
  return true;
}
function typed(value, type) {
  if (type === 'date') return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (type === 'month') return typeof value === 'string' && MONTHS.includes(value);
  if (type === 'positive' || type === 'nonnegative') return typeof value === 'number' && Number.isFinite(value)
    && (type === 'positive' ? value > 0 : value >= 0);
  if (type === 'strings') return Array.isArray(value) && value.length <= 30 && value.every(v => typed(v, 'string'));
  return typeof value === type && (type !== 'string' || value.trim().length > 0 && value.length <= 2000);
}

function validateSimpleMutation({ proposal, snapshot = {}, message, evidence = [], scope = null, now = new Date(), memoryAuthority = null,
  turnConstraints = [], constraintUpdates = null }) {
  const issues = [];
  // Which stops failed which traveler restriction, and the evidence behind it,
  // so a correction can repair those stops instead of guessing.
  const restrictionFindings = [];
  const durationFindings = [];
  const reject = code => issues.push(code);
  // Unsupported future TripPlan schemas fail closed before any reinterpretation.
  const priorPlan = snapshot.plan || null;
  if (priorPlan?.days?.length) {
    const priorSchema = evaluateTripSchemaVersion(priorPlan);
    if (!priorSchema.ok) {
      return {
        ok: false,
        issues: [priorSchema.code],
        planningState: clone(snapshot.planningState || {}),
        plan: null,
        touchedDayNumbers: null,
      };
    }
  }
  if (!object(proposal) || !conforms(proposal, PROPOSE_TOOL.input_schema) || !(typeof proposal.response === 'string' && proposal.response.trim() && proposal.response.length <= 16000)
    || Object.keys(proposal).some(k => !['response', 'memory_updates', 'plan', 'plan_patch'].includes(k))) {
    return { ok: false, issues: ['mutation_schema_invalid'] };
  }
  const updates = proposal.memory_updates || [];
  if (!Array.isArray(updates) || updates.length > 16) return { ok: false, issues: ['memory_schema_invalid'] };
  let state = clone(snapshot.planningState || {});
  for (const update of updates) {
    const shape = FIELDS[update?.field];
    if (!shape || !object(update.value) || !Object.keys(update.value).length
      || Object.entries(update.value).some(([key, value]) => !Object.hasOwn(shape, key) || !typed(value, shape[key]))) {
      reject('memory_schema_invalid'); continue;
    }
    if (!typed(update.sourceQuote, 'string') || !message.includes(update.sourceQuote)) {
      reject('memory_source_missing'); continue;
    }
    const authority = memoryAdmission(memoryAuthority, message, update);
    if (authority !== 'explicit') {
      reject(`memory_authority_${authority}`); continue;
    }
    if (update.field === 'lodging') {
      // Reuse the typed transition, NEVER its phrase recognizer. The old location
      // is invalidated at this accepted update boundary, before any new geocoding.
      if (update.value.baseTown) state.lodging = transitionLodging(state.lodging || {}, { place: update.value.baseTown, kindOfChange: 'relocation' });
      if (update.value.booked !== undefined) state.lodging = { ...state.lodging, booked: update.value.booked };
      if (update.value.maxHotelChanges !== undefined) {
        if (!Number.isInteger(update.value.maxHotelChanges)) reject('memory_schema_invalid');
        else state.lodging = { ...state.lodging, maxHotelChanges: update.value.maxHotelChanges };
      }
    } else if (update.field === 'travelerFacts') {
      state.travelerFacts = [...(Array.isArray(state.travelerFacts) ? state.travelerFacts : []),
        { fact: update.value.fact, sourceQuote: update.sourceQuote }].slice(-100);
    } else state[update.field] = { ...state[update.field], ...update.value };
  }
  if (state.dates?.startDate && state.dates?.endDate && state.dates.startDate > state.dates.endDate) reject('date_order_invalid');
  if (updates.some(u => u.field === 'dates') && state.dates?.durationDays != null) {
    if (!Number.isInteger(state.dates.durationDays)) reject('duration_days_invalid');
    if (state.dates.startDate && state.dates.endDate
      && (Date.parse(state.dates.endDate) - Date.parse(state.dates.startDate)) / 86400000 + 1 !== state.dates.durationDays) {
      reject('date_duration_mismatch');
    }
  }
  for (const update of updates.filter(u => u.field === 'transportation')) {
    const value = update.value || {};
    if (value.mode && !['fly', 'drive'].includes(value.mode)
      || value.drivingPolicy && !DRIVING_POLICY_VALUES.includes(value.drivingPolicy)
      || value.drivingPolicyReason && !DRIVING_POLICY_REASONS.includes(value.drivingPolicyReason)) reject('transport_memory_invalid');
  }
  if (updates.some(u => u.field === 'transportation') && !issues.some(code => code.startsWith('memory_'))) reconcileTransportationDrivingPolicy(state.transportation);
  if (updates.length && !issues.some(code => code.startsWith('memory_'))) {
    state.simpleMemoryProvenance = updates.map(u => ({ field: u.field, sourceQuote: u.sourceQuote, authority: 'semantic_verified' }));
  }
  // Rejected memory is atomic: even a supported sibling must not leak into
  // route authorization or the returned candidate state on a failed proposal.
  if (issues.some(code => code.startsWith('memory_'))) state = clone(snapshot.planningState || {});
  // Hard restrictions are armed independently of memory admission; memory only
  // decides what is saved. See utils/hardConstraintAuthority.
  const armed = resolveHardConstraints({
    priorValidation: snapshot.planningState?.validationConstraints || null,
    admittedState: state, turnConstraints,
    proposedUpdates: Array.isArray(constraintUpdates) ? constraintUpdates : updates, message,
    relationship: (update, key) => memoryFactRelationship(memoryAuthority, message, update, key),
    admitted: update => memoryAdmission(memoryAuthority, message, update) === 'explicit',
  });
  const constraintState = { ...state,
    preferences: { ...(state.preferences || {}), avoidExposure: armed.avoidExposure ? true : state.preferences?.avoidExposure },
    mobility: { ...(state.mobility || {}), ...armed.mobility } };
  const validationConstraints = serializeHardConstraints(armed);
  if (validationConstraints) state.validationConstraints = validationConstraints;
  else delete state.validationConstraints;
  const prior = priorPlan;
  let plan = null;
  let touched = null;
  if (proposal.plan && proposal.plan_patch) reject('multiple_plan_mutations');
  if (proposal.plan) {
    if (isAcceptedCanonicalPlan(prior)) reject('existing_plan_requires_patch');
    if (!isValidToolItinerary(proposal.plan)) reject('plan_schema_invalid');
    else plan = clone(proposal.plan);
  }
  if (proposal.plan_patch) {
    // The conversational explanation is distinct from the saved trip overview.
    proposal = {...proposal, plan_patch: {...proposal.plan_patch, response: proposal.response}};
    if (!isAcceptedCanonicalPlan(prior)) reject('accepted_plan_required');
    else if (!isValidPlanPatch(proposal.plan_patch) && !(proposal.plan_patch.operations.length === 0
      && (Object.hasOwn(proposal.plan_patch, 'intro') || Object.hasOwn(proposal.plan_patch, 'narrativeSections')))) reject('patch_schema_invalid');
    else {
      const applied = proposal.plan_patch.operations.length
        ? applyPlanPatch({ priorPlan: prior, planPatch: proposal.plan_patch })
        : { ok: true, plan: clone(prior), touchedDayNumbers: [] };
      if (!applied.ok) issues.push(...(applied.reasonCodes?.length ? applied.reasonCodes : ['patch_invalid']));
      else {
        plan = applied.plan; touched = applied.touchedDayNumbers;
        plan.intro = Object.hasOwn(proposal.plan_patch, 'intro') ? proposal.plan_patch.intro : prior.intro;
        if (Object.hasOwn(proposal.plan_patch, 'narrativeSections')) plan.narrativeSections = clone(proposal.plan_patch.narrativeSections);
      }
    }
  }
  if (scope?.dayNumbers && touched?.some(day => !scope.dayNumbers.includes(day))) reject('patch_outside_authorized_scope');
  if (plan) {
    if (!isAcceptedCanonicalPlan(plan)) reject('plan_not_accepted');
    plan = Object.fromEntries(Object.entries(plan).filter(([key]) => Object.hasOwn(BASE_ITINERARY_SCHEMA.properties, key) || key === 'parkName'));
    if (Number.isInteger(state.dates?.durationDays) && plan.days.length !== state.dates.durationDays) reject('plan_day_count_mismatch');
    const fresh = evidence.filter(row => usableEvidence(row, now, { authoritative: true }));
    const bundle = { evidence: fresh };
    const operational = indexFactsByPlace({ facts: operationalFactsFromBundle(bundle), bundle });
    const byId = new Map(fresh.map(row => [row.evidenceId, row]));
    // An accepted stop whose identity the patch left untouched keeps its
    // canonical identity; only new or re-identified stops need fresh grounding.
    // Constraint changes this turn re-evaluate every touched stop from evidence.
    const constraintsChanged = updates.some(u => ['mobility', 'travelers'].includes(u.field)
      || (u.field === 'preferences' && u.value && Object.hasOwn(u.value, 'avoidExposure')));
    const priorStops = touched && !constraintsChanged ? acceptedStopsById(prior) : new Map();
    const priorEdges = touched ? acceptedEdgesByPair(prior) : new Map();
    const preservedIds = new Set();
    const routeRefs = stop => new Set([stop.evidenceRef, ...(preservedIds.has(stop.id)
      ? fresh.filter(r => r.claim?.identity && r.claim.identity === stop.canonicalPlaceId).map(r => r.evidenceId) : [])]);
    const numbers = new Set();
    plan.days.forEach((day, index) => { if (!touched || touched.includes(day.dayNumber)) foldLodgingBase(day, plan.days[index - 1]); });
    for (const day of plan.days) {
      if (!Number.isInteger(day.dayNumber) || day.dayNumber < 1 || numbers.has(day.dayNumber)) reject('day_identity_invalid');
      numbers.add(day.dayNumber);
      if (touched && !touched.includes(day.dayNumber)) continue;
      let minutes = 0;
      const places = new Set();
      for (const stop of day.stops || []) {
        if (preservedIdentitySource(stop, priorStops)) {
          preservedIds.add(stop.id);
          if (places.has(stop.canonicalPlaceId)) reject('duplicate_stop');
          places.add(stop.canonicalPlaceId);
          if (!Number.isFinite(stop.duration) || stop.duration <= 0) reject('duration_invalid');
          else minutes += stop.duration;
          const operationalFacts = factsForStop(stop, operational);
          if (operationalFacts.some(f => ['trail_closed', 'road_closed', 'seasonal_closure'].includes(f.type))) reject('official_closure_conflict');
          if (stop.driveMinutes != null || stop.travelMinutes != null || stop.driveTimeVerified === true) reject('unbound_drive_claim');
          delete stop.drivingTimeFromPreviousMin; delete stop.latitude; delete stop.longitude; delete stop.coordinateSource;
          continue;
        }
        const named = fresh.filter(r => !['stop_coordinates', 'destination_identity'].includes(r.topic) && [r.claim?.normalizedValue?.name, r.source?.provider === 'named_place' ? r.claim?.normalizedValue?.requestedName : null].some(n => n && n.trim().toLowerCase() === stop.name?.trim().toLowerCase()));
        let row = byId.get(stop.evidenceRef) || (named.length === 1 ? named[0] : null);
        // The referenced record may carry no usable location; an exactly same-name
        // identity from this turn that does is the same place, mapped.
        if (row && !validLocation(row.claim?.normalizedValue?.location)) {
          const located = named.filter(r => validLocation(r.claim?.normalizedValue?.location));
          if (located.length === 1) row = located[0];
        }
        if (!row || row.topic === 'stop_coordinates' || row.topic === 'destination_identity') { reject('stop_identity_unresolved'); continue; }
        const canonicalIdentity = row.claim?.identity || row.evidenceId;
        if (places.has(canonicalIdentity)) reject('duplicate_stop');
        places.add(canonicalIdentity);
        if (!Number.isFinite(stop.duration) || stop.duration <= 0) reject('duration_invalid');
        else minutes += stop.duration;
        const value = row.claim?.normalizedValue || {};
        if (!typed(value.name, 'string')) { reject('stop_identity_unresolved'); continue; }
        // Bind the exact retrieved identity, not a semantic name/quality matcher.
        if (stop.evidenceRef && ![value.name, row.source?.provider === 'named_place' ? value.requestedName : null].some(n => n && n.trim().toLowerCase() === stop.name.trim().toLowerCase())) reject('stop_name_identity_mismatch');
        Object.assign(stop, { evidenceRef: row.evidenceId, name: value.name, canonicalPlaceName: value.canonicalPlaceName || value.name,
          displayName: value.name, canonicalPlaceId: canonicalIdentity, resolutionStatus: 'resolved' });
        const stopCountry = value.countryCode || value.country || null;
        if (stopCountry) stop.countryCode = String(stopCountry).trim().toUpperCase();
        else delete stop.countryCode;
        // Only trusted provider evidence can supply experience/anchor identity.
        delete stop.experience; delete stop.mapAnchor;
        if (value.experience && value.mapAnchor) { stop.experience=clone(value.experience); stop.mapAnchor=clone(value.mapAnchor); }
        // Narrow Case 3: distinct experience↔mapAnchor requires trusted relationship
        // evidence. Pinless experiences and same-identity places are unaffected.
        const experienceAnchorIssue = validateClaimedExperienceMapAnchor({ stop, evidenceValue: value });
        if (experienceAnchorIssue) reject(experienceAnchorIssue);
        if (value.placeKind) {
          stop.placeKind = value.placeKind;
          stop.placeTypes = clone(value.placeTypes || []);
          if (value.placeKind === 'area' && ['lodging', 'lodge'].includes(stop.type)) stop.type = 'custom';
        }
        stop.location = validLocation(value.location) ? clone(value.location) : { status: 'unresolved', lat: null, lon: null, source: null, authority: null, sourceRef: null };
        stop.sourceReferences = [{ evidenceId: row.evidenceId, url: row.source?.url || null, observedAt: row.observation?.observedAt || null }];
        const operationalFacts = factsForStop(stop, operational);
        stop.operationalCaveats = operationalFacts.map(f => ({ type: f.type, text: f.text || f.description || null }));
        if (operationalFacts.some(f => ['trail_closed', 'road_closed', 'seasonal_closure'].includes(f.type))) {
          reject('official_closure_conflict');
        }
        const maximum = supportedDurationMaximum(value);
        if (maximum > 0 && stop.duration > maximum) {
          reject('duration_exceeds_source');
          durationFindings.push({ dayNumber: day.dayNumber, stopId: stop.id, stopName: value.name,
            evidenceRef: row.evidenceId, proposedMinutes: stop.duration, maximumMinutes: maximum,
            sourceDuration: value.duration || null });
        }
        const result = assessPlaceEligibility(row, fresh, { avoidExposure: constraintState.preferences?.avoidExposure,
          planningState: { mobility: constraintState.mobility, travelers: constraintState.travelers,
            preferences: { avoidExposure: constraintState.preferences?.avoidExposure } } }, stop);
        const records = result.records;
        issues.push(...result.reasonCodes);
        if (result.reasonCodes.length) {
          const facts = records.map(r => r.claim?.normalizedValue || {});
          const first = key => facts.map(f => f[key]).find(v => v != null) ?? null;
          restrictionFindings.push({ dayNumber: day.dayNumber, stopId: stop.id, stopName: value.name, evidenceRef: row.evidenceId,
            reasonCodes: [...result.reasonCodes],
            evidence: { exposureLevel: first('exposureLevel'), difficulty: first('difficulty'), walkingDistanceMiles: first('walkingDistanceMiles') } });
        }
        // The model cannot author verified measurements or coordinates.
        for (const key of ['walkingDistanceMiles', 'exposureLevel', 'difficulty', 'physicalDifficulty']) {
          delete stop[key];
          if (value[key] != null) stop[key] = value[key];
        }
        if (stop.driveMinutes != null || stop.travelMinutes != null || stop.driveTimeVerified === true) reject('unbound_drive_claim');
        delete stop.drivingTimeFromPreviousMin; delete stop.latitude; delete stop.longitude; delete stop.coordinateSource;
      }
      let drivingMinutes = 0;
      day.travelEdges = [];
      for (let i = 1; i < day.stops.length; i += 1) {
        if ((day.activityGroups || []).some(g => g.stopIds?.includes(day.stops[i - 1].id) && g.stopIds.includes(day.stops[i].id))) continue;
        const origins = routeRefs(day.stops[i - 1]);
        const destinations = routeRefs(day.stops[i]);
        const priorEdge = preservedIds.has(day.stops[i - 1].id) && preservedIds.has(day.stops[i].id)
          ? priorEdges.get(`${day.stops[i - 1].id}->${day.stops[i].id}`) : null;
        const operationalAccess = resolveOperationalAccess([factsForStop(day.stops[i - 1], operational), factsForStop(day.stops[i], operational)], transferDates(state.dates));
        const requiredMode = operationalAccess.requiredMode;
        const freshRoute = fresh.find(row => row.topic === 'driving_time' && usableEvidence(row, now, { authoritative: true })
          && origins.has(row.scope?.route?.originEntityId) && destinations.has(row.scope?.route?.destinationEntityId)
          && row.scope?.route?.travelMode === transferRouteMode(state.transportation, { requiredMode, requestedMode: row.scope?.route?.travelMode }).mode)
          || (!drivingProhibited(state.transportation) && fresh.find(row => row.topic === 'driving_time'
            && origins.has(row.scope?.route?.originEntityId) && destinations.has(row.scope?.route?.destinationEntityId)
            && row.scope?.route?.travelMode === 'driving' && ['restricted', 'required_alternative'].includes(operationalAccess.status)));
        // A transfer between two unchanged accepted stops keeps its accepted
        // measurement unless this turn produced a fresh one, or this turn's
        // traveler-memory change could alter the mode or access judgement.
        if (!freshRoute && priorEdge && !updates.some(u => ['transportation', 'dates'].includes(u.field))) {
          const kept = clone(priorEdge);
          day.travelEdges.push(kept);
          if (kept.status === 'verified' && Number.isFinite(kept.durationSeconds) && kept.durationSeconds >= 0) {
            minutes += kept.durationSeconds / 60;
            if (kept.travelMode === 'driving') { drivingMinutes += kept.durationSeconds / 60; day.stops[i].drivingTimeFromPreviousMin = kept.durationSeconds / 60; }
          } else if (Number.isFinite(state.preferences?.maxDailyDriveMinutes) && transferRouteMode(state.transportation).mode === 'driving') reject('driving_limit_unverifiable');
          continue;
        }
        const route = freshRoute;
        const seconds = route?.claim?.normalizedValue?.durationSeconds;
        const mode = transferRouteMode(state.transportation, { requiredMode, requestedMode: route?.scope?.route?.travelMode });
        const verified = Number.isFinite(seconds) && seconds >= 0;
        day.travelEdges.push({ sourceStopId: day.stops[i - 1].id, targetStopId: day.stops[i].id, relationship: 'transfer',
          modeIntent: verified && route.scope.route.travelMode === 'driving' ? 'drive' : null,
          modeAuthority: mode.authority, operationalAccess,
          travelMode: verified ? route.scope.route.travelMode : null, status: verified ? 'verified' : 'unverified',
          durationSeconds: verified ? seconds : null, distanceMeters: verified ? route.claim.normalizedValue.distanceMeters ?? null : null,
          source: verified ? { evidenceId: route.evidenceId, provider: route.source.provider, url: route.source.url || null } : null });
        if (!verified && Number.isFinite(state.preferences?.maxDailyDriveMinutes) && transferRouteMode(state.transportation).mode === 'driving') reject('driving_limit_unverifiable');
        if (verified) {
          minutes += seconds / 60;
          if (route.scope.route.travelMode === 'driving') {
            drivingMinutes += seconds / 60;
            day.stops[i].drivingTimeFromPreviousMin = seconds / 60;
          }
        }
      }
      const cap = state.preferences?.maxDailyDriveMinutes;
      if (Number.isFinite(cap) && drivingMinutes > cap) reject('daily_drive_limit_exceeded');
      if (day.stops.some(st => !st.id) || new Set(day.stops.map(st => st.id)).size !== day.stops.length) reject('stop_identity_invalid');
      if (minutes > 1440) reject('day_exceeds_24_hours');
      const replaced = proposal.plan_patch?.operations?.some(op => op.dayNumber === day.dayNumber
        && (op.op === 'update_day' || ['add_stop', 'remove_stop', 'reorder_stops'].includes(op.op)
          || op.stop && ['startTime', 'timeWindow', 'duration'].some(key => Object.hasOwn(op.stop, key))));
      issues.push(...validateDayCompleteness(day, { required: !touched || replaced }));
    }
    for (let i = 1; i < plan.days.length; i += 1) {
      if (!touched || touched.includes(plan.days[i].dayNumber) || touched.includes(plan.days[i - 1].dayNumber)) {
        issues.push(...validateBaseTransition(plan.days[i - 1], plan.days[i]));
      }
    }
    if (repeatedWithoutReason(plan.days, touched)) reject('repeated_place_without_reason');
    plan.canonicalContract = 'trailie.itinerary.v2';
    if (touched) {
      plan = preserveUntouchedDays({ priorPlan: prior, nextPlan: plan, touchedDayNumbers: touched });
      for (const day of prior.days) if (!touched.includes(day.dayNumber)
        && hashPayload(day) !== hashPayload(plan.days.find(d => d.dayNumber === day.dayNumber))) reject('frozen_day_changed');
    }
    // U.S. geography: resulting canonical plan must keep confirmed domestic places
    // and never persist confirmed foreign stops. Experience-only foreign plans fail here.
    issues.push(...evaluateUsPlanGeography({ plan, evidence: fresh }));
  }
  if (updates.some(u => u.field === 'dates') && prior) {
    plan = plan || clone(prior);
    const bundle = { evidence: evidence.filter(row => usableEvidence(row, now, { authoritative: true })) };
    const operational = indexFactsByPlace({ facts: operationalFactsFromBundle(bundle), bundle });
    for (const day of plan.days || []) for (const edge of day.travelEdges || []) {
      edge.operationalAccess = resolveOperationalAccess([edge.sourceStopId, edge.targetStopId].map(id => factsForStop(day.stops.find(s => s.id === id) || {}, operational)), transferDates(state.dates));
    }
  }
  // An explicitly authorized no-driving correction invalidates old driving
  // measurements even when this turn only changes traveler memory.
  if (updates.some(u => u.field === 'transportation') && drivingProhibited(state.transportation) && (plan || prior)) {
    plan = plan || clone(prior);
    for (const day of plan.days || []) {
      for (const stop of day.stops || []) delete stop.drivingTimeFromPreviousMin;
      day.travelEdges = (day.travelEdges || []).map(edge => edge.travelMode === 'driving' || edge.modeIntent === 'drive'
        ? { ...edge, travelMode: null, modeIntent: null, status: 'unverified', durationSeconds: null, distanceMeters: null, source: null, modeAuthority: 'traveler' }
        : edge);
    }
  }
  if (plan || prior) issues.push(...validateOvernightLimit(plan || prior, state.lodging));
  if (plan?.narrativeSections?.length) {
    plan = { ...plan, narrativeSections: normalizeGuidanceLinkLabels(plan.narrativeSections, evidence.filter(row => usableEvidence(row, now)), prior?.narrativeSections || []) };
  }
  if (plan) issues.push(...validateGuidanceLinks(plan.narrativeSections || [], evidence.filter(row => usableEvidence(row, now)), prior?.narrativeSections || []));
  if (!plan && prior?.days?.length && Number.isInteger(state.dates?.durationDays)
    && state.dates.durationDays !== prior.days.length) reject('plan_day_count_mismatch');
  if (!updates.length && !plan) reject('empty_mutation');
  const uniqueIssues = [...new Set(issues)];
  // Stamp only on a successful accept. Never rewrite itinerary content to
  // “fix” an unsupported future schema version.
  if (uniqueIssues.length === 0 && plan?.days?.length) {
    const nextSchema = evaluateTripSchemaVersion(plan);
    if (!nextSchema.ok) uniqueIssues.push(nextSchema.code);
    else plan = stampTripSchemaVersion(plan);
  }
  return { ok: uniqueIssues.length === 0, issues: uniqueIssues, planningState: state, plan, touchedDayNumbers: touched,
    restrictionFindings, durationFindings, activeRestrictions: validationConstraints };
}

module.exports = { PROPOSE_TOOL, validateSimpleMutation };
