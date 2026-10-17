'use strict';

const { getEvidencePolicy } = require('../config/evidencePolicies');
const { materializeCandidate } = require('./evidenceBrokerService');
const { hashPayload } = require('../utils/canonicalResponse');
const { normalizeEvidenceLocation, validLocation } = require('../utils/trailieCanonicalLocation');
const { AUTHORITY_ORDER } = require('./evidenceCoverageEvaluator');
const { orderEvidenceForRead } = require('../utils/evidenceReadRelevance');
const { modelEvidenceRow } = require('../utils/modelEvidenceView');

const PROVIDERS = ['nps', 'ridb', 'weather', 'google_maps', 'astronomy_compute', 'fee_free_calendar',
  'known_place', 'named_place', 'brave', 'serper', 'tavily', 'direct_official_page', 'geocode_coordinate'];
const TOPICS = ['destination_identity', 'overview', 'activities', 'alerts_closures', 'roads',
  'trail_conditions', 'wildfire_smoke', 'weather_current', 'weather_forecast', 'climate_normals',
  'driving_time', 'astronomy', 'permits_reservations', 'campgrounds', 'fees', 'hours', 'rules',
  'facilities', 'visitor_services', 'parking', 'accessibility', 'pet_policy', 'transit',
  'vehicle_restrictions', 'local_business', 'lodging_strategy', 'hotel_live', 'flight_live',
  'flight_strategy', 'fee_free_dates', 'stop_coordinates'];

const READ_TOOL = { name: 'read_travel' };

function usableEvidence(row, now = new Date(), { current = false, authoritative = false } = {}) {
  const observation = row?.observation;
  const observed = new Date(observation?.observedAt).getTime();
  const expires = new Date(observation?.expiresAt).getTime();
  const source = row?.source;
  const from = row?.scope?.validFrom ? Date.parse(row.scope.validFrom) : null;
  const through = row?.scope?.validThrough ? Date.parse(row.scope.validThrough) : null;
  return Boolean(row?.evidenceId && source?.provider && source?.sourceClass
    && Number.isFinite(observed) && observed <= +now && Number.isFinite(expires) && expires >= +now
    && !['conflicted', 'open'].includes(row.quality?.conflictStatus)
    && !(row.quality?.conflictingEvidenceIds?.length > 0)
    && (!current || ((!Number.isFinite(from) || from <= +now) && (!Number.isFinite(through) || through >= +now)))
    && (!(current || authoritative) || (AUTHORITY_ORDER.indexOf(row.quality?.authorityClass || source.sourceClass) >= 0
      && AUTHORITY_ORDER.indexOf(row.quality?.authorityClass || source.sourceClass) <= AUTHORITY_ORDER.indexOf('commercial_structured'))));
}

function createEvidenceReader({ broker, now = () => new Date() } = {}) {
  if (typeof broker?.dispatchEphemeral !== 'function') throw new TypeError('Evidence broker required');
  return { definitions: [READ_TOOL], async execute(name, args, { requestId, signal, userMessage, evidence: priorEvidence = [] }) {
    if (name !== READ_TOOL.name || !args || !PROVIDERS.includes(args.provider)
      || typeof args.topic !== 'string' || !args.entity || typeof args.entity !== 'object') {
      return { status: 'invalid_tool_arguments', evidence: [] };
    }
    const at = now();
    let policy;
    try { policy = getEvidencePolicy(args.topic === 'stop_coordinates' ? 'destination_identity' : args.topic); }
    catch { return { status: 'unsupported_topic', evidence: [] }; }
    const requirement = { requirementId: `simple:${requestId}:${hashPayload(args).slice(0, 16)}`,
      topic: args.topic, entity: args.entity, query: args.query,
      temporalScope: args.temporalScope, routeScope: args.routeScope, webScope: args.webScope,
      evidenceTypes: ['fact'], preferredProviders: [args.provider], allowedFallbackProviders: [] };
    // A model-selected ID cannot launder model-authored coordinates into a
    // provider-verified route. Resolve endpoints from this turn's tool results.
    const endpoint = input => {
      const row = priorEvidence.find(r => r.evidenceId === input?.entityId && usableEvidence(r, at));
      const value = row?.claim?.normalizedValue;
      if (!validLocation(value?.location)) return null;
      return { entityId: row.evidenceId, displayName: value.name || input.displayName,
        latitude: value.location.lat, longitude: value.location.lon };
    };
    if (args.provider === 'google_maps') {
      const origin = endpoint(args.routeScope?.origin), destination = endpoint(args.routeScope?.destination);
      if (!origin || !destination) return { status: 'route_endpoints_not_grounded', evidence: [] };
      requirement.routeScope = { ...args.routeScope, origin, destination };
    }
    if (args.provider === 'weather' || args.provider === 'astronomy_compute') {
      const location = endpoint(args.entity);
      if (!location) return { status: 'location_not_grounded', evidence: [] };
      requirement.entity = location;
    }
    if (['geocode_coordinate', 'named_place'].includes(args.provider)) {
      const p = args.queryProvenance || {};
      // Context can improve retrieval, but cannot become traveler authority.
      const explicit = value => typeof value === 'string' && value.length > 0 && userMessage.includes(value) ? value : null;
      const region = p.explicitTravelerRegion;
      const explicitRegion = typeof region === 'string' ? (explicit(region) ? { name: region } : null)
        : region && (explicit(region.code) ? { code: region.code } : explicit(region.name) ? { name: region.name } : null);
      requirement.queryProvenance = { rawTravelerPlaceText: explicit(p.rawTravelerPlaceText),
        explicitTravelerRegion: explicitRegion || null, explicitTravelerCountry: explicit(p.explicitTravelerCountry),
        groundedPlaceText: args.provider === 'named_place' ? null : typeof p.groundedPlaceText === 'string' ? p.groundedPlaceText : args.query,
        destinationAnchors: Array.isArray(p.destinationAnchors) ? p.destinationAnchors : [],
        destinationNames: Array.isArray(p.destinationNames) ? p.destinationNames : [],
        contextualRegions: Array.isArray(p.contextualRegions) ? p.contextualRegions : [] };
    }
    const result = await broker.dispatchEphemeral({ requirement, requestId, signal });
    // Live providers observe data during the awaited fetch, after `at` above.
    const receivedAt = now();
    const evidence = [];
    for (const candidate of result.normalizedCandidates || []) {
      if (candidate.topic !== args.topic) continue;
      // Never stamp missing observation time as fresh merely because it was read now.
      if (!candidate.observedAt && !candidate.observation?.observedAt) continue;
      const row = materializeCandidate(candidate.topic === 'stop_coordinates'
        ? { ...candidate, topic: 'destination_identity' } : candidate, { now: receivedAt });
      // The ephemeral geocoder has no persistent-store freshness topic. Reuse
      // geography's clock while retaining its coordinates-only identity role.
      row.topic = candidate.topic;
      row.evidenceId = `simple:${hashPayload(row)}`;
      if (usableEvidence(row, receivedAt)) evidence.push(normalizeEvidenceLocation(row));
    }
    // Keep individual reads bounded; never cut a fact or imply omitted records
    // were absent from the provider's response. Rows are ordered by relevance
    // to the model's structured request BEFORE the budget applies.
    const selected = [];
    const reserve = [];
    let bytes = 2;
    for (const row of orderEvidenceForRead(evidence, { query: args.query, ...(args.relevance || {}) })) {
      const size = Buffer.byteLength(JSON.stringify(modelEvidenceRow(row)), 'utf8') + 1;
      if (selected.length >= 8 || bytes + size > 12000) { reserve.push(row); continue; }
      selected.push(row); bytes += size;
    }
    const omitted = evidence.length - selected.length;
    return { status: result.status, evidence: selected,
      // Over-budget rows never reach the model through this read. They remain
      // available only for exact identity binding of model-named places.
      reserve,
      reasonCode: result.reasonCode || null,
      ...(args.provider === 'named_place' ? { placeDiagnostics: { querySent: args.entity.displayName, ...(result.metadata || {}) } } : {}),
      ...(result.status === 'unsupported' ? { reason: 'No configured provider supports this request. Use available information and explain important uncertainty naturally; do not widen research.',
        available_information: selected } : {}),
      completeness: omitted ? { ...result.completeness, isComplete: false } : result.completeness || null,
      ...(omitted ? { omittedEvidenceCount: omitted, evidenceTruncated: true } : {}),
      provider: result.provider, providerAttemptCount: result.providerAttemptCount || 0,
      cost: result.cost || { costStatus: 'unknown', costUsd: null },
      freshnessPolicy: policy.freshnessClass };
  } };
}

module.exports = { createEvidenceReader, usableEvidence };
Object.defineProperty(module.exports, 'createSimpleTravelTools', { get: () => require('./trailieTravelData').createSimpleTravelTools });
Object.defineProperty(module.exports, 'READ_TOOL', { get: () => require('./trailieTravelData').READ_TOOL });
