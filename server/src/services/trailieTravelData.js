'use strict';
const { assessPlaceEligibility } = require('../utils/modelFirstPlaceEligibility');
const { resolveHardConstraints, serializeHardConstraints } = require('../utils/hardConstraintAuthority');

const { createEvidenceReader, usableEvidence } = require('./trailieSimpleTools');
const { normalizeEvidenceLocation, validLocation } = require('../utils/trailieCanonicalLocation');
const { applyPlanPatch } = require('../utils/itineraryPlanPatch');
const { identityChangedStops, acceptedEdgesByPair } = require('../utils/stopIdentity');
const { resolveOperationalAccess, transferDates } = require('../utils/transferOperationalAccess');
const { transferRouteMode } = require('../utils/transferRouteMode');
const { OFFICIAL_PLACE_ACTIVITY_CANDIDATES } = require('../data/officialPlaceActivityCandidates');
const { officialFollowUrl } = require('./providers/webEvidenceProviderShared');
const { operationalFactsFromBundle, indexFactsByPlace, factsForStop } = require('../utils/operationalFactExtraction');
const { getEvidencePolicy } = require('../config/evidencePolicies');
const { tripGuidanceFromRules } = require('../utils/parkWideAccess');
const { normalizeCountryCode } = require('../utils/usPlanGeography');

const { lexical } = require('./providers/namedPlaceEquivalence');
const { resolveParkIdentity } = require('../utils/parkDestinationIdentity');
const { modelEvidenceValue } = require('../utils/modelEvidenceView');
const { hashPayload } = require('../utils/canonicalResponse');
const text = { type: 'string', maxLength: 2000 };
const READ_TOOL = { name: 'read_travel', description: 'Get answer-ready travel facts and grounded places. Named places are explicit identity-resolution requests, independent of search documents. Ask once for the traveler problem. The backend resolves sources, coordinates and dependent routes. Returned unresolved facts are unknown, not negative findings. Use existing fact topics only when narrowing the question; omit them for planning context.',
  input_schema: { type: 'object', additionalProperties: false, required: ['destination', 'question'], properties: {
    destination: text, question: text, topics: { type: 'array', maxItems: 8, items: text },
    dates: { type: 'object', properties: { startDate: text, endDate: text }, additionalProperties: false },
    constraints: { type: 'object', description: 'Traveler requirements that shape which facts matter. State hard restrictions the traveler gave with the memory field names: avoidExposure (true when they avoid exposed terrain or heights) and mobility {maxWalkMilesPerSegment, maxWalkMinutesPerSegment, wheelchair, stroller, avoidStairs}.' }, context: { type: 'object', properties: { start: text, end: text, lodging: text,
      explicitRegion: text, explicitCountry: text }, additionalProperties: false },
    places: { type: 'array', items: text },
    travelMode: { type: 'string', enum: ['driving', 'walking', 'transit', 'bicycling'] },
  } } };
const TOPIC_PROVIDERS = {
  destination_identity: ['nps', 'known_place'], overview: ['nps', 'direct_official_page', 'tavily'],
  activities: ['nps', 'known_place', 'direct_official_page', 'tavily'], alerts_closures: ['nps', 'direct_official_page', 'brave'],
  roads: ['nps', 'direct_official_page', 'brave'], trail_conditions: ['nps', 'direct_official_page', 'brave'],
  wildfire_smoke: ['nps', 'brave'], campgrounds: ['nps', 'ridb'], permits_reservations: ['ridb', 'direct_official_page', 'brave'],
  fees: ['nps', 'direct_official_page'], hours: ['nps', 'direct_official_page'], visitor_services: ['nps'],
  parking: ['nps'], accessibility: ['nps', 'direct_official_page', 'tavily'], vehicle_restrictions: ['nps'],
  rules: ['direct_official_page', 'brave'], pet_policy: ['direct_official_page', 'tavily'],
  transit: ['brave', 'serper'], local_business: ['serper', 'brave'], lodging_strategy: ['serper'],
  flight_strategy: [], weather_current: ['weather'], weather_forecast: ['weather'], climate_normals: ['weather'],
  astronomy: ['astronomy_compute'], fee_free_dates: ['fee_free_calendar'],
};
READ_TOOL.input_schema.properties.topics.items = { ...text, description: `Available fact topics: ${Object.keys(TOPIC_PROVIDERS).join(', ')}. Unknown topics return an explicit unresolved fact.` };
// Typographic apostrophes are the same name ("Pa’rus Trail" = "Pa'rus Trail").
const nameKey = value => String(value || '').replace(/[\u2018\u2019\u02BC]/g, "'").trim().toLowerCase();
const OPERATIONAL_TOPICS = new Set(['alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke', 'vehicle_restrictions',
  'permits_reservations', 'parking', 'accessibility']);
const isOfficialRecord = row => (row?.quality?.authorityClass || row?.source?.sourceClass) === 'official_owner'
  && row?.source?.provider !== 'named_place';
function uniqueNames(names) {
  const unique = new Map();
  for (const name of names) if (typeof name === 'string' && name.trim() && !unique.has(nameKey(name))) unique.set(nameKey(name), name.trim());
  return [...unique.values()];
}
function providerStrength(row) {
  if (row?.source?.provider === 'direct_official_page') return 5;
  if (row?.source?.provider === 'nps') return 4;
  if (row?.source?.provider === 'named_place') return 3;
  if ((row?.quality?.authorityClass || row?.source?.sourceClass) === 'official_owner') return 2;
  return 1;
}
function normalizedSourceUrl(row) {
  return String(row?.source?.url || row?.claim?.normalizedValue?.sourceUrl || '')
    .replace(/^https:\/\/home\.nps\.gov/i, 'https://www.nps.gov');
}
function npsAlertSelectionKey(row) {
  if (row.source?.provider !== 'nps') return null;
  const identity = row.claim?.identity || '';
  const alertTopics = ['alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke'];
  if (!identity.startsWith('alerts:') && !(alertTopics.includes(row.topic)
    && row.claim?.status === 'active' && row.source?.sourceId)) return null;
  // The NPS adapter fans one alert out into several topics. Its sourceId is
  // the original alert ID followed by that topic; the park homepage is not
  // an alert identity. Keep changed claims even when an ID is reused.
  const suffix = `:${row.topic}`;
  const sourceId = row.source?.sourceId;
  const alertId = sourceId
    ? (sourceId.endsWith(suffix) ? sourceId.slice(0, -suffix.length) : sourceId)
    : identity.replace(/^alerts:[^:]+:/, '');
  return `nps-alert|${row.entityId}|${alertId}|${hashPayload({
    text: row.claim?.text, value: row.claim?.normalizedValue,
    status: row.claim?.status, qualifiers: row.claim?.qualifiers, scope: row.scope,
  })}`;
}
/**
 * Remove alternative model-facing representations of the same source fact.
 * Full evidence stays in `s.evidence` for validation and exact identity binding.
 */
function deduplicateModelSelection(rows) {
  const bySource = new Map();
  for (const row of rows) {
    const url = normalizedSourceUrl(row);
    // One official collection/page may legitimately describe several distinct
    // named experiences. Collapse competing representations of the same named
    // fact, never every fact that happens to share its source URL.
    const factName = row.claim?.normalizedValue?.name;
    const key = npsAlertSelectionKey(row)
      || (url ? `${row.topic}|${url}|${factName ? nameKey(factName) : ''}` : `id|${row.evidenceId}`);
    const prior = bySource.get(key);
    if (!prior || providerStrength(row) > providerStrength(prior)) bySource.set(key, row);
  }
  const sourceRows = [...bySource.values()];
  const directTransitEntities = new Set(sourceRows.filter(row => row.topic === 'transit'
    && row.source?.provider === 'direct_official_page').map(row => row.entityId));
  const withoutDiscoveryDuplicates = sourceRows.filter(row => !(row.topic === 'transit'
    && row.source?.provider !== 'direct_official_page' && directTransitEntities.has(row.entityId)));
  const officialActivitiesByName = new Map();
  for (const row of withoutDiscoveryDuplicates) {
    if (row.topic !== 'activities' || row.source?.provider !== 'nps' || !row.claim?.normalizedValue?.name) continue;
    const key = nameKey(row.claim.normalizedValue.name);
    if (!officialActivitiesByName.has(key)) officialActivitiesByName.set(key, []);
    officialActivitiesByName.get(key).push(row);
  }
  return withoutDiscoveryDuplicates.filter(row => {
    if (row.topic !== 'activities' || row.source?.provider !== 'named_place' || !row.claim?.normalizedValue?.name) return true;
    // Only replace an identity-only row when exactly one official activity has
    // the same name. Ambiguous same-name places remain separate.
    return (officialActivitiesByName.get(nameKey(row.claim.normalizedValue.name)) || []).length !== 1;
  });
}
async function resolveDestination(name, { signal } = {}) {
  let parks = [];
  try {
    const nps = require('./npsService').getNpsService();
    // NPS full-text `q` matches any word, so "Zion National Park" returns the first
    // ten parks alphabetically. Match against the full (7-day cached) catalog instead.
    parks = nps.getCachedParks() || await nps.getAllParks();
    if (signal?.aborted) throw new Error('cancelled');
  } catch { /* catalog miss retains known-place resolution */ }
  const label = ` ${lexical(name)} `;
  const destinationAnchors = parks.filter(p => [p.fullName, p.fullName?.replace(p.designation || '', '').trim()].some(n => n && lexical(n).length >= 4 && label.includes(` ${lexical(n)} `))).map(p => ({
    name:p.fullName, shortName:p.fullName?.replace(p.designation || '', '').trim(), parkCode:p.parkCode, source:'nps',sourceId:`nps:park:${p.parkCode}`,country:'US',states:(p.states || '').split(',').filter(Boolean),latitude:Number(p.latitude),longitude:Number(p.longitude) }));
  // Exact or official-record-consistent qualified park name; never fuzzy.
  const identity = resolveParkIdentity(name, parks);
  if (identity) {
    const p = identity.park;
    return { identityMatch: identity.match, destinationAnchors, entityId: `nps:park:${p.parkCode}`, displayName: p.fullName, latitude: p.latitude == null || p.latitude === '' ? null : Number(p.latitude), longitude: p.longitude == null || p.longitude === '' ? null : Number(p.longitude),
      administrativeRegions: (p.states || '').split(',').filter(Boolean).map(code => ({code})), country: 'US', sourceUrl: p.url, sourceClass: 'official_owner' };
  }
  const slug = nameKey(name).replace(/[^a-z0-9]+/g, '-');
  const keys = Object.keys(OFFICIAL_PLACE_ACTIVITY_CANDIDATES).filter(k => k === `place:known:${slug}` || k.startsWith(`place:known:${slug}-`));
  return { destinationAnchors, entityId: keys.length === 1 ? keys[0] : `place:query:${slug}`, displayName: name };
}
function scopedSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs); timer.unref?.();
  return { signal: controller.signal, dispose() { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
}
async function bounded(work, signal) {
  if (signal.aborted) throw new Error('cancelled');
  let abort;
  const cancelled = new Promise((_, reject) => { abort = () => reject(new Error('cancelled')); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([Promise.resolve().then(work), cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

function createSimpleTravelTools({ broker, now = () => new Date(), destinationResolver = resolveDestination,
  reserveDiscovery = false, modelContextCeilingBytes = 36000, maxProviderRequests = 32, maxNamedPlaces = 48, placeBatchSize = 6, providerTimeoutMs = 8000, phaseTimeoutMs = 30000 } = {}) {
  if (![maxProviderRequests, maxNamedPlaces, placeBatchSize].every(n => Number.isInteger(n) && n > 0)) throw new TypeError('Invalid research budget');
  if (typeof reserveDiscovery !== 'boolean') throw new TypeError('Invalid reserve discovery switch');
  if (!Number.isInteger(modelContextCeilingBytes) || modelContextCeilingBytes <= 0) throw new TypeError('Invalid model context ceiling');
  const reader = createEvidenceReader({ broker, now });
  const sessions = new Map();
  const sessionFor = id => {
    if (!sessions.has(id)) sessions.set(id, { evidence: [], reserve: new Map(), attempts: [], requests: 0, unresolved: [], request: null, entity: null, namedResolutions: new Map(), namedDiagnostics: [], researchMs: 0 });
    return sessions.get(id);
  };
  async function read(s, provider, topic, entity, context, extra = {}) {
    if (context.signal?.aborted || s.researchMs >= phaseTimeoutMs || s.requests >= maxProviderRequests) {
      s.unresolved.push({ topic, entityId: entity?.entityId || null, destination: entity?.displayName || null,
        status: 'unresolved', reasonCode: 'research_allowance_reached',
        reason: 'Research allowance reached; this fact remains unconfirmed.' }); return [];
    }
    s.requests++;
    const stage = ['geocode_coordinate', 'named_place'].includes(provider) ? 'locating_places'
      : provider === 'google_maps' ? 'checking_routes'
        : provider === 'weather' ? 'checking_weather'
          : topic === 'activities' ? 'finding_places'
            : topic === 'permits_reservations' ? 'checking_permits'
              : ['alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke'].includes(topic) ? 'checking_current_conditions'
                : ['transit', 'parking', 'vehicle_restrictions', 'accessibility'].includes(topic) ? 'checking_transport'
                  : 'checking_sources';
    try { context.onProgress?.(stage); } catch { /* presentation cannot fail retrieval */ }
    const started = Date.now(), scope = scopedSignal(context.signal, providerTimeoutMs);
    let result;
    try { result = await bounded(() => reader.execute('read_travel', { provider, topic, entity,
      query: s.request?.question, temporalScope: s.request?.dates ? { mode: 'date_range', validFrom: s.request.dates.startDate, validThrough: s.request.dates.endDate } : undefined,
      relevance: { places: s.request?.places || [], constraints: s.request?.constraints || null },
      ...extra }, { ...context, signal: scope.signal, evidence: s.evidence }), scope.signal); }
    catch { result = { status: 'unavailable', evidence: [], reasonCode: scope.signal.aborted ? 'deadline_or_cancelled' : 'request_failed' }; }
    finally { scope.dispose(); }
    s.attempts.push({ provider, topic, status: result.status, reasonCode: result.reasonCode || null,
      providerAttemptCount: result.providerAttemptCount ?? null, cost: result.cost || { costStatus: 'unknown', costUsd: null }, durationMs: Date.now() - started });
    if (provider === 'named_place') s.namedDiagnostics.push({ inputName: entity.displayName,
      querySent: result.placeDiagnostics?.querySent || null, providerStatus: result.status,
      resolutionStatus: result.evidence?.some(e=>!e.claim?.normalizedValue?.alternativeFor) ? 'resolved' : 'unresolved',
      rejectionReason: result.placeDiagnostics?.unresolvedReason || result.reasonCode || null,
      candidates: result.placeDiagnostics?.candidateDiagnostics || [] });
    for (const row of result.evidence || []) if (!s.evidence.some(e => e.evidenceId === row.evidenceId)) s.evidence.push(row);
    for (const row of result.reserve || []) if (row?.evidenceId && !s.reserve.has(row.evidenceId)) s.reserve.set(row.evidenceId, row);
    return result.evidence || [];
  }
  async function fact(s, topic, context) {
    const providers = TOPIC_PROVIDERS[topic];
    if (!providers) { s.unresolved.push({ topic, status: 'unsupported', reason: 'This information is not available through the connected travel sources.' }); return; }
    try { getEvidencePolicy(topic); } catch { s.unresolved.push({ topic, status: 'unsupported' }); return; }
    const parkAnchors = [...new Map((s.entity.destinationAnchors || [])
      .filter(anchor => anchor?.source === 'nps' && anchor?.parkCode && anchor?.sourceId?.startsWith('nps:park:'))
      .map(anchor => [anchor.sourceId, anchor])).values()];
    if (topic === 'activities' && !s.entity.entityId.startsWith('nps:park:') && parkAnchors.length > 1) {
      const reads = await Promise.all(parkAnchors.map(async anchor => ({ anchor, rows: await read(s, 'nps', topic, {
        entityId: anchor.sourceId,
        displayName: anchor.name || anchor.shortName || anchor.parkCode,
        destinationAnchors: [anchor],
      }, context) })));
      for (const { anchor, rows: parkRows } of reads) if (!parkRows.length
        && !s.unresolved.some(item => item.topic === topic && item.entityId === anchor.sourceId)) {
        s.unresolved.push({ topic, entityId: anchor.sourceId,
          destination: anchor.name || anchor.shortName || anchor.parkCode,
          status: 'unresolved', reasonCode: 'official_activity_read_incomplete',
          reason: 'Official activity research did not return usable evidence for this park.' });
      }
      const rows = reads.flatMap(result => result.rows);
      if (!rows.length) s.unresolved.push({ topic, status: 'unresolved', reason: 'No usable source-backed fact was returned.' });
      return;
    }
    // Capability selection, not language interpretation. Try one suitable source;
    // unavailability does not trigger an autonomous alternate search strategy.
    let provider = providers[0];
    if (!s.entity.entityId.startsWith('nps:park:')) provider = s.entity.entityId.startsWith('place:known:') && providers.includes('known_place') ? 'known_place' : providers.find(p => !['nps', 'ridb', 'known_place'].includes(p));
    if (!provider) { s.unresolved.push({ topic, status: 'unsupported' }); return; }
    let entity = s.entity;
    if (['weather', 'astronomy_compute'].includes(provider)) {
      const position = s.evidence.find(e => validLocation(e.claim?.normalizedValue?.location));
      if (!position) { s.unresolved.push({ topic, status: 'unresolved', reason: 'The location could not be confirmed.' }); return; }
      entity = { entityId: position.evidenceId, displayName: s.entity.displayName };
    }
    if (provider === 'direct_official_page' && !entity.sourceUrl) {
      provider = providers.find(p => ['brave', 'serper', 'tavily'].includes(p));
      if (!provider) { s.unresolved.push({topic, status: 'unresolved', reason: 'No official source is established for this place.'}); return; }
    }
    const rows = await read(s, provider, topic, entity, context, provider === 'direct_official_page' ? {webScope: {sourceUrl: entity.sourceUrl}} : {});
    // Source discovery and reading the discovered official page are one dependency,
    // not another search strategy. Search snippets never become verified access.
    if (['brave', 'serper', 'tavily'].includes(provider)) await Promise.all(rows.slice(0, 3).map(row => {
      const url = row.source?.url || row.claim?.normalizedValue?.url;
      return officialFollowUrl(url) ? read(s, 'direct_official_page', topic, entity, context, {webScope: {sourceUrl: url}}) : null;
    }));
    if (!rows.length) s.unresolved.push({ topic, status: 'unresolved', reason: 'No usable source-backed fact was returned.' });
  }
  function placeRow(s, name) {
    const rows = s.evidence.filter(e => !['destination_identity', 'stop_coordinates'].includes(e.topic)
      && usableEvidence(e, now(), {authoritative:true})
      && !(e.claim?.normalizedValue?.alternativeFor && nameKey(e.claim.normalizedValue.alternativeFor)===nameKey(name))
      && [e.claim?.normalizedValue?.name, e.source?.provider === 'named_place' ? e.claim?.normalizedValue?.requestedName : null]
        .some(n => n && nameKey(n) === nameKey(name)));
    // A record without a usable location (some NPS records carry none) never hides
    // a same-name identity that has one.
    // An official owner record outranks a commercial identity for the same name:
    // it carries the suitability and access facts validation is judged on.
    const located = rows.filter(e => validLocation(e.claim?.normalizedValue?.location));
    return located.find(isOfficialRecord)
      || located.find(e => (e.quality?.authorityClass || e.source?.sourceClass) === 'official_owner') || located[0] || rows[0];
  }
  // Exact-name official activity record from this destination's own provider
  // read that the per-read budget held back. Identity-only promotion: no fetch,
  // no fuzzy or proximity match, never a different place.
  function promoteReserved(s, name) {
    const row = [...s.reserve.values()].find(e => isOfficialRecord(e) && e.topic === 'activities'
      && nameKey(e.claim?.normalizedValue?.name) === nameKey(name)
      && validLocation(e.claim?.normalizedValue?.location) && usableEvidence(e, now(), { authoritative: true }));
    if (!row) return null;
    s.reserve.delete(row.evidenceId);
    if (!s.evidence.some(e => e.evidenceId === row.evidenceId)) s.evidence.push(row);
    return row;
  }
  function queryProvenance(s, name, context) {
    const explicit = field => s.request?.context?.[field] && context.userMessage?.includes(s.request.context[field]) ? s.request.context[field] : null;
    return {rawTravelerPlaceText:context.userMessage?.includes(name) ? name : null,
      explicitTravelerRegion:explicit('explicitRegion'), explicitTravelerCountry:explicit('explicitCountry'),
      destinationAnchors:s.entity?.destinationAnchors || [], destinationNames: s.entity?.displayName ? [s.entity.displayName] : [],
      contextualRegions: s.entity?.administrativeRegions || []};
  }
  async function resolveNamedPlaces(s, names, context) {
    const requested=uniqueNames(names);
    for (let offset = 0; offset < requested.length; offset += placeBatchSize) {
    await Promise.all(requested.slice(offset, offset + placeBatchSize).map(async name => {
      if (validLocation(placeRow(s,name)?.claim?.normalizedValue?.location) || s.namedResolutions.has(nameKey(name))) return;
      const reasonCode = context.signal?.aborted || s.researchMs >= phaseTimeoutMs ? 'research_time_budget_exceeded'
        : s.namedResolutions.size >= maxNamedPlaces ? 'named_place_limit_exceeded'
          : s.requests >= maxProviderRequests ? 'provider_request_budget_exceeded' : null;
      if (reasonCode) {
        if (!s.unresolved.some(u => u.place === name && u.reasonCode === reasonCode)) {
          s.unresolved.push({place:name,status:'unresolved',reasonCode,reason:'Research budget reached; this place remains unverified.',requested:requested.length,maximum:reasonCode==='named_place_limit_exceeded'?maxNamedPlaces:maxProviderRequests});
          s.namedDiagnostics.push({inputName:name,querySent:null,providerStatus:'not_attempted',resolutionStatus:'unresolved',rejectionReason:reasonCode,candidates:[]});
        }
        return;
      }
      s.namedResolutions.set(nameKey(name), null);
      const reserved = promoteReserved(s, name);
      if (reserved) { s.namedResolutions.set(nameKey(name), reserved.evidenceId); return; }
      const official=s.evidence.find(e=>e.topic==='destination_identity' && e.source?.provider !== 'geocode_coordinate'
        && usableEvidence(e,now(),{authoritative:true}) && nameKey(e.claim?.normalizedValue?.name)===nameKey(name));
      if (official) {
        const row=structuredClone(official); row.topic='activities'; row.evidenceId=`${official.evidenceId}:place`;
        s.evidence.push(row); s.namedResolutions.set(nameKey(name),row.evidenceId); return;
      }
      const rows=await read(s,'named_place','activities',{entityId:`place:request:${nameKey(name)}`,displayName:name},context,
        {queryProvenance:queryProvenance(s,name,context)});
      const row=rows.find(r=>r.claim?.status === 'resolved_place_identity' && !r.claim?.normalizedValue?.alternativeFor && validLocation(r.claim?.normalizedValue?.location));
      if (row) s.namedResolutions.set(nameKey(name),row.evidenceId);
      else s.unresolved.push({place:name,status:'unresolved',reason:'No unambiguous source-backed place identity was established.'});
    }));
    }
    return requested.map(name=>placeRow(s,name)).filter(Boolean);
  }
  async function groundCoordinates(s, rows, context) {
    await Promise.all(rows.map(async row => {
      const v = row.claim?.normalizedValue;
      if (!v?.name || validLocation(v.location)) return;
      const raw = context.userMessage?.includes(v.name) ? v.name : null;
      const explicit = field => s.request?.context?.[field] && context.userMessage?.includes(s.request.context[field]) ? s.request.context[field] : null;
      const geo = await read(s, 'geocode_coordinate', 'stop_coordinates', { entityId: row.entityId }, context, {
        query: `${v.name}, ${s.entity?.displayName || ''}`, queryProvenance: { rawTravelerPlaceText: raw,
          groundedPlaceText: v.name, explicitTravelerRegion: explicit('explicitRegion'), explicitTravelerCountry: explicit('explicitCountry'),
          destinationAnchors:s.entity?.destinationAnchors || [], destinationNames: s.entity?.displayName ? [s.entity.displayName] : [], contextualRegions: s.entity?.administrativeRegions || [] } });
      const located = geo.find(e => validLocation(e.claim?.normalizedValue?.location));
      if (located) v.location = structuredClone(located.claim.normalizedValue.location);
      else s.unresolved.push({ place: v.name, topic: 'stop_coordinates', status: 'unresolved' });
    }));
  }
  async function routes(s, pairs, context, mode) {
    if (!mode) return;
    await Promise.all(pairs.map(async ([a, b]) => {
      if (!validLocation(a?.claim?.normalizedValue?.location) || !validLocation(b?.claim?.normalizedValue?.location)) return;
      if (s.evidence.some(e => e.topic === 'driving_time' && e.scope?.route?.originEntityId === a.evidenceId
        && e.scope?.route?.destinationEntityId === b.evidenceId && e.scope.route.travelMode === mode)) return;
      const rows = await read(s, 'google_maps', 'driving_time', s.entity || {}, context, { routeScope: {
        origin: { entityId: a.evidenceId }, destination: { entityId: b.evidenceId }, travelMode: mode,
        departureTimeBucket: s.request?.dates?.startDate || now().toISOString() } });
      if (!rows.length) s.unresolved.push({ topic: 'driving_time', origin: a.evidenceId, destination: b.evidenceId, status: 'unresolved' });
    }));
  }
  // Park-wide access rules for every official park on the trip: one official-only
  // discovery per park, then its official pages. Same machinery for any park.
  async function parkAccess(s, context) {
    const parks = new Map();
    if (s.entity?.entityId?.startsWith('nps:park:')) parks.set(s.entity.entityId, { entityId: s.entity.entityId, displayName: s.entity.displayName });
    for (const a of s.entity?.destinationAnchors || []) if (a.sourceId?.startsWith('nps:park:') && !parks.has(a.sourceId)) parks.set(a.sourceId, { entityId: a.sourceId, displayName: a.name });
    await Promise.all([...parks.values()].slice(0, 3).map(async park => {
      const rows = await read(s, 'brave', 'transit', park, context);
      await Promise.all(rows.slice(0, 2).map(row => {
        const url = row.source?.url || row.claim?.normalizedValue?.url;
        return officialFollowUrl(url) ? read(s, 'direct_official_page', 'transit', park, context, { webScope: { sourceUrl: url } }) : null;
      }));
    }));
  }
  function parkRules(s) {
    return s.evidence.filter(e => e.source?.provider === 'direct_official_page' && usableEvidence(e, now(), { authoritative: true }))
      .flatMap(e => e.claim?.normalizedValue?.parkRules || []);
  }
  async function research(args, context, s) {
    s.request = args;
    const started = Date.now(), phase = scopedSignal(context.signal, Math.max(1, phaseTimeoutMs - s.researchMs));
    const ctx = { ...context, signal: phase.signal };
    try {
      s.entity = await bounded(() => destinationResolver(args.destination, {signal: phase.signal}), phase.signal);
      const e = s.entity;
      // Catalog coordinates are admitted only from the injected/trusted resolver,
      // never from model request coordinates (the schema exposes none).
      if (e.sourceClass && Number.isFinite(e.latitude) && Number.isFinite(e.longitude)) {
        s.evidence.push(normalizeEvidenceLocation({ evidenceId: `catalog:${e.entityId}`, entityId: e.entityId, topic: 'destination_identity',
          claim: { identity: e.entityId, normalizedValue: { name: e.displayName, latitude: e.latitude, longitude: e.longitude,
            countryCode: e.country ? String(e.country).trim().toUpperCase() : 'US' } },
          source: { provider: 'nps', sourceClass: e.sourceClass, sourceId: e.entityId, url: e.sourceUrl },
          observation: { observedAt: now().toISOString(), expiresAt: new Date(+now() + 86400000).toISOString() } }));
      }
      const requestedTopics = args.topics?.length ? args.topics : ['overview', 'activities', 'alerts_closures'];
      const topics = [...new Set([...requestedTopics, ...(args.constraints?.mobility ? ['accessibility'] : []), ...(args.constraints?.pets ? ['pet_policy'] : [])])].slice(0, 8);
      const dependent = topics.filter(t => ['weather_current', 'weather_forecast', 'climate_normals', 'astronomy'].includes(t));
      const locationReady = s.evidence.some(row => validLocation(row.claim?.normalizedValue?.location));
      await Promise.all([...topics.filter(t => locationReady || !dependent.includes(t)).map(t => fact(s, t, ctx)), parkAccess(s, ctx)]);
      // Traveler-requested places first so destination locality grounding cannot
      // starve their named-place budget or reorder their diagnostics.
      const requestedPlaces = uniqueNames([...(args.places || []), args.context?.start, args.context?.end, args.context?.lodging]);
      await resolveNamedPlaces(s, requestedPlaces, ctx);
      // Non-NPS destinations (place:query / place:known without catalog coords) resolve
      // as a locality through the same named_place path — no extra provider or model call.
      // Only when the traveler listed no places (pinless / destination-only research),
      // so locality grounding cannot steal named-place budget from explicit stops.
      const needsLocalityDestination = requestedPlaces.length === 0
        && !s.evidence.some(row => row.topic === 'destination_identity')
        && e?.displayName
        && /^place:(query|known):/i.test(String(e.entityId || ''));
      if (needsLocalityDestination) {
        await resolveNamedPlaces(s, [e.displayName], ctx);
        const locality = placeRow(s, e.displayName);
        const value = locality?.claim?.normalizedValue;
        if (locality && validLocation(value?.location)) {
          const countryCode = normalizeCountryCode(value.countryCode || value.country || null);
          s.evidence.push(normalizeEvidenceLocation({
            evidenceId: `locality:${e.entityId}`,
            entityId: e.entityId,
            topic: 'destination_identity',
            claim: {
              identity: e.entityId,
              normalizedValue: {
                name: e.displayName,
                latitude: value.location.lat,
                longitude: value.location.lon,
                ...(countryCode ? { countryCode } : {}),
              },
            },
            source: {
              provider: locality.source?.provider || 'named_place',
              sourceClass: locality.source?.sourceClass || 'commercial_structured',
              sourceId: locality.claim?.identity || e.entityId,
              url: locality.source?.url || null,
            },
            observation: {
              observedAt: now().toISOString(),
              expiresAt: new Date(+now() + 86400000).toISOString(),
            },
          }));
        }
      }
      // Discovery records do not need coordinates merely to inform planning.
      // Ground only identities the model explicitly requested here; a newly
      // proposed stop is grounded later at finalization. This keeps multi-park
      // activity fan-out from multiplying geocoder work.
      const places = requestedPlaces.map(name => placeRow(s, name)).filter(Boolean);
      await groundCoordinates(s, places, ctx);
      if (!locationReady) await Promise.all(dependent.map(t => fact(s, t, ctx)));
      // Transfer routing is finalized against the proposed stop order and activity groups.
      // Research order is not itinerary order.
    } catch { s.unresolved.push({ topic: 'destination_identity', status: 'unavailable', reason: 'The destination lookup did not finish.' }); }
    finally { s.researchMs += Date.now() - started; phase.dispose(); }
    const facts = []; let bytes = 0;
    const state = context.snapshot?.planningState || {};
    const armed = resolveHardConstraints({ priorValidation: state.validationConstraints, admittedState: state,
      turnConstraints: [args.constraints] });
    const activeRestrictions = serializeHardConstraints(armed);
    const eligibilityEvidence = s.evidence.filter(e => usableEvidence(e, now(), { authoritative: true }));
    // Keep resolved identities in the synthesis budget ahead of discovery prose.
    // Synthesis budget order: places the model asked to resolve, then official
    // access/safety facts, then other named places, then the rest. Access facts
    // must never be crowded out by discovery records.
    const requestedIds = new Set(uniqueNames([...(args.places || []), args.context?.start, args.context?.end, args.context?.lodging])
      .map(name => placeRow(s, name)?.evidenceId).filter(Boolean));
    // Test-only opt-in: visibility does not promote a row into guard authority.
    // Only records the existing exact-name promotion path can ground without a
    // new coordinate lookup are discoverable here. No provider work occurs.
    const activeIds = new Set(s.evidence.map(e => e.evidenceId));
    const discoverable = reserveDiscovery ? [...s.reserve.values()].filter(e => !activeIds.has(e.evidenceId)
      && isOfficialRecord(e) && e.topic === 'activities' && e.claim?.normalizedValue?.name
      && validLocation(e.claim?.normalizedValue?.location) && usableEvidence(e, now(), { authoritative: true })) : [];
    const selectionPool = [...s.evidence, ...discoverable];
    const parkWideAccess = tripGuidanceFromRules(parkRules(s), transferDates(context.snapshot?.planningState?.dates));
    const requestedNameKeys = new Set(uniqueNames([...(args.places || []), args.context?.start, args.context?.end, args.context?.lodging]).map(nameKey));
    const accessRequested = /\b(shuttle|transit|transfer|access)\b/i.test(args.question || '');
    const deduplicatedSelection = deduplicateModelSelection(selectionPool);
    const selectionTier = e => {
      const name = e.claim?.normalizedValue?.name;
      const named = Boolean(name && usableEvidence(e, now(), { authoritative: true }));
      const requested = named && (requestedIds.has(e.evidenceId) || requestedNameKeys.has(nameKey(name)));
      const officialActivity = e.topic === 'activities' && e.source?.provider === 'nps';
      if (requested && officialActivity) return 0;
      if (accessRequested && e.topic === 'transit' && e.source?.provider === 'direct_official_page') return 1;
      if (OPERATIONAL_TOPICS.has(e.topic)) return 2;
      if (requested) return 3;
      if (officialActivity) return 4;
      return named ? 5 : 6;
    };
    const orderedEvidence=deduplicatedSelection.map((e,i)=>({e,i,t:selectionTier(e)})).sort((a,b)=>a.t-b.t||a.i-b.i).map(x=>x.e);
    for (const e of orderedEvidence) {
      const fact = {evidenceId:e.evidenceId, topic:e.topic, fact:e.claim?.text, value:modelEvidenceValue(e.claim?.normalizedValue),
        source:e.source?.url, authority:e.source?.sourceClass, observation:e.observation};
      if (activeRestrictions && e.claim?.normalizedValue?.name) {
        const assessment = assessPlaceEligibility(e, activeIds.has(e.evidenceId) ? eligibilityEvidence : [...eligibilityEvidence, e], { avoidExposure: armed.avoidExposure,
          planningState: { mobility: { ...state.mobility, ...armed.mobility }, travelers: state.travelers,
            preferences: { avoidExposure: armed.avoidExposure } } });
        fact.eligibility = { restrictions: activeRestrictions, status: assessment.status,
          reasonCodes: assessment.reasonCodes, evidence: assessment.records.map(r => ({ evidenceId: r.evidenceId,
            exposureLevel: r.claim?.normalizedValue?.exposureLevel ?? null })) };
      }
      const size = Buffer.byteLength(JSON.stringify(fact));
      if (facts.length >= 48 || bytes + size > 28000) continue;
      facts.push(fact); bytes += size;
    }
    const namedPlaceResolutions = uniqueNames([...(args.places || []), args.context?.start, args.context?.end, args.context?.lodging]).map(name => {
      const row=placeRow(s,name); return {requestedName:name,status:row?'resolved':'unresolved',evidenceRef:row?.evidenceId || null,canonicalPlaceId:row?.claim?.identity || null,mapEligible:validLocation(row?.claim?.normalizedValue?.location), alternatives:s.evidence.filter(e=>e.claim?.normalizedValue?.alternativeFor===name && validLocation(e.claim?.normalizedValue?.location)).map(e=>({name:e.claim.normalizedValue.name,canonicalPlaceId:e.claim.identity,evidenceRef:e.evidenceId,resolutionKind:'grounded_alternative'}))};
    });
    const accessBundle = { evidence: s.evidence.filter(row => usableEvidence(row, now(), { authoritative: true })) };
    const accessIndex = indexFactsByPlace({ facts: operationalFactsFromBundle(accessBundle), bundle: accessBundle });
    const operationalAccess = namedPlaceResolutions.filter(p => p.status === 'resolved').map(p => ({
      evidenceRef: p.evidenceRef, name: p.requestedName,
      ...resolveOperationalAccess([factsForStop({ name: p.requestedName, evidenceRef: p.evidenceRef }, accessIndex)], transferDates(context.snapshot?.planningState?.dates)),
    }));
    let modelContext = { facts, namedPlaceResolutions, operationalAccess,
      parkWideAccess,
      omittedFactCount: selectionPool.length - facts.length, unresolved: s.unresolved,
      note: 'Unknown facts are not negative findings. Answer with what is available. No further research is needed.' };
    let reserveFactsDroppedForEnvelope = 0;
    if (reserveDiscovery) {
      // The 28 KB fact allowance is not the complete tool response. Keep a
      // separately measured ceiling for the whole research envelope. If it is
      // exceeded, remove reserve-derived facts from the tail; active evidence
      // and all validation inputs remain untouched.
      while (Buffer.byteLength(JSON.stringify(modelContext)) > modelContextCeilingBytes) {
        const index = facts.findLastIndex(fact => !activeIds.has(fact.evidenceId));
        if (index < 0) break;
        bytes -= Buffer.byteLength(JSON.stringify(facts[index]));
        facts.splice(index, 1);
        reserveFactsDroppedForEnvelope++;
        modelContext = { ...modelContext, facts, omittedFactCount: selectionPool.length - facts.length };
      }
    }
    const modelContextBytes = Buffer.byteLength(JSON.stringify(modelContext));
    return { namedPlaceResolutions, status: s.evidence.length ? 'fulfilled' : 'unresolved', evidence: structuredClone(s.evidence),
      namedPlaceDiagnostics: structuredClone(s.namedDiagnostics), unresolved: structuredClone(s.unresolved), providerOutcomes: structuredClone(s.attempts),
      providerAttemptCount: s.attempts.reduce((n, a) => n + (a.providerAttemptCount || 0), 0), durationMs: Date.now() - started,
      // Numeric accounting stays outside model context and guard authority.
      evidenceDelivery: { reserveDiscovery, activeRecords: s.evidence.length, reserveRecords: s.reserve.size,
        selectionCandidates: selectionPool.length, deduplicatedSelectionCandidates: deduplicatedSelection.length,
        discoverableReserveRecords: discoverable.length,
        deliveredReserveRecords: facts.filter(f => !activeIds.has(f.evidenceId)).length,
        reserveFactsDroppedForEnvelope, modelContextCeilingBytes,
        modelContextWithinCeiling: !reserveDiscovery || modelContextBytes <= modelContextCeilingBytes,
        factBytes: bytes, modelContextBytes,
        activeEvidenceBytes: Buffer.byteLength(JSON.stringify(s.evidence)),
        reserveEvidenceBytes: Buffer.byteLength(JSON.stringify([...s.reserve.values()])) },
      modelContext };

  }
  return { definitions: [READ_TOOL], async execute(name, args, context) {
    const s = sessionFor(context.requestId);
    const invalid = name !== 'read_travel' ? 'unsupported_tool'
      : typeof args?.destination !== 'string' || !args.destination.trim() || args.destination.length > 2000 ? 'invalid_destination'
      : typeof args?.question !== 'string' || !args.question.trim() || args.question.length > 2000 ? 'invalid_question'
      : args.topics != null && (!Array.isArray(args.topics) || args.topics.some(t => typeof t !== 'string') || args.topics.length > 8) ? 'invalid_topics'
      : args.places != null && (!Array.isArray(args.places) || args.places.some(p => typeof p !== 'string' || p.length > 2000)) ? 'invalid_places' : null;
    if (invalid) return {status:'unsupported',evidence:[],unresolved:[{reasonCode:invalid,reason:`Travel request rejected: ${invalid}.`}],providerOutcomes:[]};
    return research(args, context, s);
  }, async finalizeProposal(proposal, context) {
    const s = sessionFor(context.requestId);
    const patch = proposal.plan_patch && applyPlanPatch({priorPlan: context.snapshot.plan, planPatch: proposal.plan_patch});
    const candidate = proposal.plan || patch?.plan;
    for (const row of context.evidence || []) if (!s.evidence.some(e => e.evidenceId === row.evidenceId)) s.evidence.push(row);
    if (!candidate?.days) return { evidence: s.evidence };
    const changedDays = patch?.touchedDayNumbers ? candidate.days.filter(d => patch.touchedDayNumbers.includes(d.dayNumber)) : candidate.days;
    // Accepted stops whose identity a patch left untouched keep it; only new or
    // re-identified stops are grounded. A transfer needs a fresh route only when
    // its stop pair has no accepted edge or one endpoint is newly identified.
    const prior = patch ? context.snapshot.plan : null;
    const changed = new Set(identityChangedStops(prior, changedDays));
    const acceptedEdges = acceptedEdgesByPair(prior);
    const routePairs = changedDays.flatMap(d => (d.stops || []).slice(1).map((stop, i) => {
      if ((d.activityGroups || []).some(g => g.stopIds?.includes(d.stops[i].id) && g.stopIds.includes(stop.id))) return null;
      if (!changed.has(d.stops[i]) && !changed.has(stop) && acceptedEdges.has(`${d.stops[i].id}->${stop.id}`)) return null;
      return [d.stops[i], stop];
    })).filter(Boolean);
    const toGround = [...new Set([...changed, ...routePairs.flat()])];
    // A correction round may repair specific identities, never reopen research.
    // Pinless plans still need destination locality grounding when no prior research ran.
    if (!s.request && !context.narrow && (!patch || toGround.length)) {
      const destination = candidate.parkName || context.snapshot.plan?.parkName || context.requestContext?.formData?.parkName;
      if (destination) {
        await research({
          destination,
          question: 'Ground the proposed trip places and current access.',
          topics: ['activities', 'alerts_closures'],
          places: [...changed].map(st => st.name),
        }, context, s);
      }
    }
    if (!toGround.length) {
      return {
        evidence: s.evidence,
        parkRules: parkRules(s),
        namedPlaceDiagnostics: s.namedDiagnostics,
        providerOutcomes: s.attempts,
        unresolved: s.unresolved,
        providerAttemptCount: 0,
      };
    }
    const all = s.evidence;
    const started = Date.now(), phase = scopedSignal(context.signal, Math.max(1, phaseTimeoutMs - s.researchMs));
    try {
      await resolveNamedPlaces(s, toGround.filter(st => !all.some(e=>e.evidenceId===st.evidenceRef)).map(st=>st.name), {...context,signal:phase.signal});
      const rows = toGround.map(stop => all.find(e=>e.evidenceId===stop.evidenceRef) || placeRow(s,stop.name)).filter(Boolean);
      await groundCoordinates(s, rows, { ...context, signal: phase.signal });
      const transport = { ...context.snapshot.planningState?.transportation };
      // Validated below by the memory guard; never used to persist by this phase.
      for (const u of proposal.memory_updates || []) if (u.field === 'transportation' && context.userMessage.includes(u.sourceQuote || '\u0000')) Object.assign(transport, u.value);
      const { mode } = transferRouteMode(transport, { requestedMode: s.request?.travelMode });
      const find = st => rows.find(r => r.evidenceId === st.evidenceRef) || placeRow(s,st.name);
      const pairs = routePairs.map(([a, b]) => [find(a), find(b)]);
      const bundle = { evidence: s.evidence.filter(row => usableEvidence(row, now(), { authoritative: true })) };
      const ops = indexFactsByPlace({ facts: operationalFactsFromBundle(bundle), bundle });
      await Promise.all(pairs.map(pair => {
        const access = resolveOperationalAccess(pair.map(row => row ? factsForStop({ name: row.claim?.normalizedValue?.name, evidenceRef: row.evidenceId }, ops) : []), transferDates(context.snapshot.planningState?.dates || s.request?.dates));
        const requiredMode = access.requiredMode;
        return routes(s, [pair], { ...context, signal: phase.signal }, requiredMode || mode);
      }));
    } finally { s.researchMs += Date.now() - started; phase.dispose(); }
    return { evidence: s.evidence, parkRules: parkRules(s), namedPlaceDiagnostics: s.namedDiagnostics, providerOutcomes: s.attempts, unresolved: s.unresolved, providerAttemptCount: s.attempts.reduce((n,a) => n + (a.providerAttemptCount || 0), 0) };
  }, dispose: requestId => sessions.delete(requestId) };
}
module.exports = { createSimpleTravelTools, READ_TOOL };
