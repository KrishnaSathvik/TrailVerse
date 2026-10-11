'use strict';

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

const { lexical } = require('./providers/namedPlaceEquivalence');
const text = { type: 'string', maxLength: 2000 };
const READ_TOOL = { name: 'read_travel', description: 'Get answer-ready travel facts and grounded places. Named places are explicit identity-resolution requests, independent of search documents. Ask once for the traveler problem. The backend resolves sources, coordinates and dependent routes. Returned unresolved facts are unknown, not negative findings. Use existing fact topics only when narrowing the question; omit them for planning context.',
  input_schema: { type: 'object', additionalProperties: false, required: ['destination', 'question'], properties: {
    destination: text, question: text, topics: { type: 'array', maxItems: 8, items: text },
    dates: { type: 'object', properties: { startDate: text, endDate: text }, additionalProperties: false },
    constraints: { type: 'object' }, context: { type: 'object', properties: { start: text, end: text, lodging: text,
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
const nameKey = value => String(value || '').trim().toLowerCase();
function uniqueNames(names) {
  const unique = new Map();
  for (const name of names) if (typeof name === 'string' && name.trim() && !unique.has(nameKey(name))) unique.set(nameKey(name), name.trim());
  return [...unique.values()];
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
  const matches = parks.filter(p => [p.fullName, p.parkCode, p.fullName?.replace(p.designation || '', '').trim()].some(n => nameKey(n) === nameKey(name)));
  if (matches.length === 1) {
    const p = matches[0];
    return { destinationAnchors, entityId: `nps:park:${p.parkCode}`, displayName: p.fullName, latitude: p.latitude == null || p.latitude === '' ? null : Number(p.latitude), longitude: p.longitude == null || p.longitude === '' ? null : Number(p.longitude),
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
  maxProviderRequests = 32, maxNamedPlaces = 48, placeBatchSize = 6, providerTimeoutMs = 8000, phaseTimeoutMs = 30000 } = {}) {
  if (![maxProviderRequests, maxNamedPlaces, placeBatchSize].every(n => Number.isInteger(n) && n > 0)) throw new TypeError('Invalid research budget');
  const reader = createEvidenceReader({ broker, now });
  const sessions = new Map();
  const sessionFor = id => {
    if (!sessions.has(id)) sessions.set(id, { evidence: [], attempts: [], requests: 0, unresolved: [], request: null, entity: null, namedResolutions: new Map(), namedDiagnostics: [], researchMs: 0 });
    return sessions.get(id);
  };
  async function read(s, provider, topic, entity, context, extra = {}) {
    if (context.signal?.aborted || s.researchMs >= phaseTimeoutMs || s.requests >= maxProviderRequests) {
      s.unresolved.push({ topic, reason: 'Research allowance reached; this fact remains unconfirmed.' }); return [];
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
    return result.evidence || [];
  }
  async function fact(s, topic, context) {
    const providers = TOPIC_PROVIDERS[topic];
    if (!providers) { s.unresolved.push({ topic, status: 'unsupported', reason: 'This information is not available through the connected travel sources.' }); return; }
    try { getEvidencePolicy(topic); } catch { s.unresolved.push({ topic, status: 'unsupported' }); return; }
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
    return rows.find(e => validLocation(e.claim?.normalizedValue?.location)) || rows[0];
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
          claim: { identity: e.entityId, normalizedValue: { name: e.displayName, latitude: e.latitude, longitude: e.longitude } },
          source: { provider: 'nps', sourceClass: e.sourceClass, sourceId: e.entityId, url: e.sourceUrl },
          observation: { observedAt: now().toISOString(), expiresAt: new Date(+now() + 86400000).toISOString() } }));
      }
      const requestedTopics = args.topics?.length ? args.topics : ['overview', 'activities', 'alerts_closures'];
      const topics = [...new Set([...requestedTopics, ...(args.constraints?.mobility ? ['accessibility'] : []), ...(args.constraints?.pets ? ['pet_policy'] : [])])].slice(0, 8);
      const dependent = topics.filter(t => ['weather_current', 'weather_forecast', 'climate_normals', 'astronomy'].includes(t));
      const locationReady = s.evidence.some(e => validLocation(e.claim?.normalizedValue?.location));
      await Promise.all([...topics.filter(t => locationReady || !dependent.includes(t)).map(t => fact(s, t, ctx)), parkAccess(s, ctx)]);
      const requestedPlaces = uniqueNames([...(args.places || []), args.context?.start, args.context?.end, args.context?.lodging]);
      await resolveNamedPlaces(s, requestedPlaces, ctx);
      const places = s.evidence.filter(e => e.topic !== 'destination_identity' && e.topic !== 'stop_coordinates' && e.claim?.normalizedValue?.name);
      await groundCoordinates(s, places, ctx);
      if (!locationReady) await Promise.all(dependent.map(t => fact(s, t, ctx)));
      // Transfer routing is finalized against the proposed stop order and activity groups.
      // Research order is not itinerary order.
    } catch { s.unresolved.push({ topic: 'destination_identity', status: 'unavailable', reason: 'The destination lookup did not finish.' }); }
    finally { s.researchMs += Date.now() - started; phase.dispose(); }
    const facts = []; let bytes = 0;
    // Keep resolved identities in the synthesis budget ahead of discovery prose.
    const orderedEvidence=[...s.evidence].sort((a,b)=>Number(Boolean(b.claim?.normalizedValue?.name && usableEvidence(b,now(),{authoritative:true}))) - Number(Boolean(a.claim?.normalizedValue?.name && usableEvidence(a,now(),{authoritative:true}))));
    for (const e of orderedEvidence) {
      const fact = {evidenceId:e.evidenceId, topic:e.topic, fact:e.claim?.text, value:e.claim?.normalizedValue,
        source:e.source?.url, authority:e.source?.sourceClass, observation:e.observation};
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
    return { namedPlaceResolutions, status: s.evidence.length ? 'fulfilled' : 'unresolved', evidence: structuredClone(s.evidence),
      namedPlaceDiagnostics: structuredClone(s.namedDiagnostics), unresolved: structuredClone(s.unresolved), providerOutcomes: structuredClone(s.attempts),
      providerAttemptCount: s.attempts.reduce((n, a) => n + (a.providerAttemptCount || 0), 0), durationMs: Date.now() - started,
      // Full evidence stays behind the runtime boundary; this is what the model sees.
      modelContext: { facts, namedPlaceResolutions, operationalAccess,
        parkWideAccess: tripGuidanceFromRules(parkRules(s), transferDates(context.snapshot?.planningState?.dates)), omittedFactCount: s.evidence.length - facts.length,
        unresolved: s.unresolved, note: 'Unknown facts are not negative findings. Answer with what is available. No further research is needed.' } };
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
    if (!toGround.length) return { evidence: s.evidence, parkRules: parkRules(s), namedPlaceDiagnostics: s.namedDiagnostics, providerOutcomes: s.attempts, unresolved: s.unresolved, providerAttemptCount: 0 };
    // A correction round may repair specific identities, never reopen research.
    if (!s.request && !context.narrow) {
      const destination = candidate.parkName || context.snapshot.plan?.parkName || context.requestContext?.formData?.parkName;
      if (destination) await research({ destination, question: 'Ground the proposed trip places and current access.', topics: ['activities', 'alerts_closures'], places: [...changed].map(st => st.name) }, context, s);
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
