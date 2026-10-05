'use strict';

const { BASE_ITINERARY_SCHEMA, PATCH_ITINERARY_TOOL, isValidToolItinerary, isValidPlanPatch } = require('../utils/itineraryToolSchema');
const { applyPlanPatch, preserveUntouchedDays } = require('../utils/itineraryPlanPatch');
const { isAcceptedCanonicalPlan } = require('../utils/canonicalPlanAcceptance');
const { evaluateCandidateConstraints } = require('../utils/candidateViability');
const { transitionLodging } = require('../utils/travelerFactTransition');
const { hashPayload } = require('../utils/canonicalResponse');
const { usableEvidence } = require('./trailieSimpleTools');
const { validLocation } = require('../utils/trailieCanonicalLocation');
const { supportedDurationMaximum } = require('../utils/evidenceActivityDuration');
const { memoryAdmission } = require('./trailieMemoryAuthority');
const { operationalFactsFromBundle, indexFactsByPlace, factsForStop } = require('../utils/operationalFactExtraction');
const { canAuthorizeDrivingIntent, reconcileTransportationDrivingPolicy, DRIVING_POLICY_VALUES,
  DRIVING_POLICY_REASONS } = require('../utils/transportConstraintContract');

// Reuse storage shapes, without the old prompt's quality/stance instructions or
// advanced surfaces this small validator does not yet validate.
const pickSchema = (schema, keys) => ({ type: 'object', additionalProperties: false,
  required: (schema.required || []).filter(k => keys.includes(k)),
  properties: Object.fromEntries(keys.filter(k => schema.properties[k]).map(k => [k, structuredClone(schema.properties[k])])) });
const stopSchema = pickSchema(BASE_ITINERARY_SCHEMA.properties.days.items.properties.stops.items,
  ['id', 'order', 'type', 'name', 'evidenceRef', 'note', 'why', 'startTime', 'timeWindow', 'duration',
    'description']);
const daySchema = pickSchema(BASE_ITINERARY_SCHEMA.properties.days.items, ['id', 'dayNumber', 'label', 'stops', 'date', 'overnightLocation', 'activityGroups', 'travelEdges']);
daySchema.properties.stops.items = stopSchema;
const planSchema = pickSchema(BASE_ITINERARY_SCHEMA, ['intro', 'days', 'narrativeSections']);
planSchema.properties.parkName = { type: 'string', maxLength: 200 };
planSchema.properties.days.items = daySchema;
const patchSchema = structuredClone(PATCH_ITINERARY_TOOL.input_schema);
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
  + 'Quote the current traveler message for memory updates. Every exact field/value must be explicitly supported; an independent verifier rejects unrelated, negated, hypothetical or uncertain claims. Do not infer an unstated year. Use plan_patch for an accepted plan; otherwise plan for creation. '
  + 'Stops must reference retrieved evidence. Do not claim a change was saved until this operation succeeds. '
  + 'Never overwrite dates or constraints using a default or an assumption.',
  input_schema: { type: 'object', additionalProperties: false, required: ['response'], properties: {
    response: { type: 'string', maxLength: 16000 }, memory_updates: { type: 'array', maxItems: 16, items: {
      type: 'object', additionalProperties: false, required: ['field', 'value', 'sourceQuote'], properties: {
        field: { type: 'string', enum: ['dates', 'lodging', 'mobility', 'preferences', 'travelers', 'travelerFacts', 'transportation', 'budget'] },
        value: { type: 'object', description: 'Fields by memory group: dates {startDate,endDate,durationDays}; lodging {baseTown,booked}; mobility {maxWalkMilesPerSegment,maxWalkMinutesPerSegment,wheelchair,stroller,avoidStairs,requiresFrequentBreaks}; preferences {avoidExposure,interests,pace,fitness,maxDailyDriveMinutes}; travelers {adults,children,pets}; travelerFacts {fact}; transportation {mode,rentalCar,drivingPolicy,drivingPolicyReason}; budget {amount,currency,scope}. Omit unknown fields.' }, sourceQuote: { type: 'string' },
  } } }, plan: withoutDescriptions(planSchema), plan_patch: withoutDescriptions(patchSchema),
  } } };

const FIELDS = {
  dates: { startDate: 'date', endDate: 'date', durationDays: 'positive' },
  lodging: { baseTown: 'string', booked: 'boolean' },
  budget: { amount: 'nonnegative', currency: 'string', scope: 'string' },
  mobility: { maxWalkMilesPerSegment: 'positive', maxWalkMinutesPerSegment: 'positive',
    wheelchair: 'boolean', stroller: 'boolean', avoidStairs: 'boolean', requiresFrequentBreaks: 'boolean' },
  preferences: { avoidExposure: 'boolean', interests: 'strings', pace: 'string', fitness: 'string', maxDailyDriveMinutes: 'positive' },
  transportation: { mode: 'string', rentalCar: 'boolean', drivingPolicy: 'string', drivingPolicyReason: 'string' },
  travelers: { adults: 'positive', children: 'nonnegative', pets: 'boolean' },
  travelerFacts: { fact: 'string' },
};
const clone = value => structuredClone(value);
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
  if (type === 'positive' || type === 'nonnegative') return typeof value === 'number' && Number.isFinite(value)
    && (type === 'positive' ? value > 0 : value >= 0);
  if (type === 'strings') return Array.isArray(value) && value.length <= 30 && value.every(v => typed(v, 'string'));
  return typeof value === type && (type !== 'string' || value.trim().length > 0 && value.length <= 2000);
}

function validateSimpleMutation({ proposal, snapshot = {}, message, evidence = [], scope = null, now = new Date(), memoryAuthority = null }) {
  const issues = [];
  const reject = code => issues.push(code);
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
  const prior = snapshot.plan || null;
  let plan = null;
  let touched = null;
  if (proposal.plan && proposal.plan_patch) reject('multiple_plan_mutations');
  if (proposal.plan) {
    if (isAcceptedCanonicalPlan(prior)) reject('existing_plan_requires_patch');
    if (!isValidToolItinerary(proposal.plan)) reject('plan_schema_invalid');
    else plan = clone(proposal.plan);
  }
  if (proposal.plan_patch) {
    // One explanation authority: canonical patch metadata uses the outer response.
    proposal = {...proposal, plan_patch: {...proposal.plan_patch, response: proposal.response}};
    if (!isAcceptedCanonicalPlan(prior)) reject('accepted_plan_required');
    else if (!isValidPlanPatch(proposal.plan_patch)) reject('patch_schema_invalid');
    else {
      const applied = applyPlanPatch({ priorPlan: prior, planPatch: proposal.plan_patch });
      if (!applied.ok) reject(applied.reasonCode || 'patch_invalid');
      else { plan = applied.plan; touched = applied.touchedDayNumbers; }
    }
  }
  if (scope?.dayNumbers && touched?.some(day => !scope.dayNumbers.includes(day))) reject('patch_outside_authorized_scope');
  if (plan) {
    if (!isAcceptedCanonicalPlan(plan)) reject('plan_not_accepted');
    plan = Object.fromEntries(Object.entries(plan).filter(([key]) => Object.hasOwn(BASE_ITINERARY_SCHEMA.properties, key) || key === 'parkName'));
    if (!touched && Number.isInteger(state.dates?.durationDays) && plan.days.length !== state.dates.durationDays) reject('plan_day_count_mismatch');
    const fresh = evidence.filter(row => usableEvidence(row, now, { authoritative: true }));
    const bundle = { evidence: fresh };
    const operational = indexFactsByPlace({ facts: operationalFactsFromBundle(bundle), bundle });
    const byId = new Map(fresh.map(row => [row.evidenceId, row]));
    const numbers = new Set();
    for (const day of plan.days) {
      if (!Number.isInteger(day.dayNumber) || day.dayNumber < 1 || numbers.has(day.dayNumber)) reject('day_identity_invalid');
      numbers.add(day.dayNumber);
      if (touched && !touched.includes(day.dayNumber)) continue;
      let minutes = 0;
      const places = new Set();
      for (const stop of day.stops || []) {
        const named = fresh.filter(r => !['stop_coordinates', 'destination_identity'].includes(r.topic) && [r.claim?.normalizedValue?.name, r.source?.provider === 'named_place' ? r.claim?.normalizedValue?.requestedName : null].some(n => n && n.trim().toLowerCase() === stop.name?.trim().toLowerCase()));
        const row = byId.get(stop.evidenceRef) || (named.length === 1 ? named[0] : null);
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
        Object.assign(stop, { evidenceRef: row.evidenceId, name: value.name, canonicalPlaceName: value.name,
          displayName: value.name, canonicalPlaceId: canonicalIdentity, resolutionStatus: 'resolved' });
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
        if (maximum > 0 && stop.duration > maximum) reject('duration_exceeds_source');
        const records = fresh.filter(r => r.evidenceId === row.evidenceId
          || r.entityId && r.entityId === row.entityId && r.claim?.normalizedValue?.name === value.name
          || r.claim?.subjectId === row.claim?.identity && row.claim?.identity);
        const result = evaluateCandidateConstraints({ records, name: stop.canonicalPlaceName || stop.name,
          type: value.category || 'custom', constraints: { avoidExposure: state.preferences?.avoidExposure, planningState: {
            mobility: state.mobility, travelers: state.travelers,
            preferences: { avoidExposure: state.preferences?.avoidExposure },
          } }, bundle });
        issues.push(...result.reasonCodes);
        if (state.mobility?.maxWalkMinutesPerSegment > 0
          && !(Number.isFinite(value.walkingDurationMinutes) && value.walkingDurationMinutes <= state.mobility.maxWalkMinutesPerSegment)) {
          reject('walking_minutes_not_grounded');
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
      const proposedEdges = day.travelEdges || [];
      day.travelEdges = [];
      for (let i = 1; i < day.stops.length; i += 1) {
        if ((day.activityGroups || []).some(g => g.stopIds?.includes(day.stops[i - 1].id) && g.stopIds.includes(day.stops[i].id))) continue;
        const origin = day.stops[i - 1].evidenceRef;
        const destination = day.stops[i].evidenceRef;
        const route = fresh.find(row => row.topic === 'driving_time' && usableEvidence(row, now, { authoritative: true })
          && row.scope?.route?.originEntityId === origin && row.scope?.route?.destinationEntityId === destination
          && (row.scope?.route?.travelMode !== 'driving' || canAuthorizeDrivingIntent(state.transportation)));
        const seconds = route?.claim?.normalizedValue?.durationSeconds;
        const proposed = proposedEdges.find(e => e.sourceStopId === day.stops[i - 1].id && e.targetStopId === day.stops[i].id);
        if (proposed?.modeIntent === 'drive' && !canAuthorizeDrivingIntent(state.transportation)) reject('driving_not_authorized');
        const verified = Number.isFinite(seconds) && seconds >= 0;
        day.travelEdges.push({ sourceStopId: day.stops[i - 1].id, targetStopId: day.stops[i].id, relationship: 'transfer',
          modeIntent: verified && route.scope.route.travelMode === 'driving' ? 'drive' : null,
          travelMode: verified ? route.scope.route.travelMode : null, status: verified ? 'verified' : 'unverified',
          durationSeconds: verified ? seconds : null, distanceMeters: verified ? route.claim.normalizedValue.distanceMeters ?? null : null,
          source: verified ? { evidenceId: route.evidenceId, provider: route.source.provider, url: route.source.url || null } : null });
        if (!verified && Number.isFinite(state.preferences?.maxDailyDriveMinutes) && canAuthorizeDrivingIntent(state.transportation)) reject('driving_limit_unverifiable');
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
    }
    plan.canonicalContract = 'trailie.itinerary.v2';
    if (touched) {
      plan = preserveUntouchedDays({ priorPlan: prior, nextPlan: plan, touchedDayNumbers: touched });
      for (const day of prior.days) if (!touched.includes(day.dayNumber)
        && hashPayload(day) !== hashPayload(plan.days.find(d => d.dayNumber === day.dayNumber))) reject('frozen_day_changed');
    }
  }
  if (!updates.length && !plan) reject('empty_mutation');
  return { ok: issues.length === 0, issues: [...new Set(issues)], planningState: state, plan, touchedDayNumbers: touched };
}

module.exports = { PROPOSE_TOOL, validateSimpleMutation };
