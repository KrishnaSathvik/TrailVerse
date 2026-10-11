'use strict';

// Structured place identity lookup. Search documents and the coordinate-only
// geocoder never confer place identity through this boundary.
const { createHash } = require('crypto');
const { KNOWN_PLACES, normalizeRegionList, rankGeocodeCandidates } = require('../geocodePlaceService');
const { recordExternalProviderHttpRequest } = require('../../config/providerTestPolicy');
const { PLACE_ENDPOINT, namedPlaceDiagnostics } = require('./namedPlaceDiagnostics');
const { lexical:key, vague, trustedAnchors, matchName } = require('./namedPlaceEquivalence');
const { supportedExperienceAnchor } = require('./namedPlaceExperience');
const { createOfficialRecordsLookup } = require('./namedPlaceOfficialRecords');
const AREA_TYPES = new Set(['locality', 'sublocality', 'administrative_area_level_3']);
const SUPPORTED_TYPES = new Set([...AREA_TYPES, 'park', 'natural_feature', 'route', 'campground', 'lodging', 'point_of_interest', 'establishment', 'tourist_attraction']);
const hash = value => createHash('sha256').update(value).digest('hex');

const DETAILS_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/details/json';
function addressComponent(place, type) {
  return place.address_components?.find(c => c.types?.includes(type));
}
function structuredCountry(place) {
  const value = addressComponent(place, 'country')?.short_name;
  return /^[a-z]{2}$/i.test(value || '') ? value.toUpperCase() : null;
}
function exactCandidate(place, name, anchors) {
  return place?.place_id && !place.partial_match && matchName(name,place,anchors,{requireGeography:false}).type !== 'none'
    && place.types?.some(t => SUPPORTED_TYPES.has(t));
}
// NPS often publishes a named area only as aspects ("Lamar Valley - Wolf Watching",
// "Lamar Valley at Crystal Creek"). When no record carries the exact name, those
// official records identify the same area if — and only if — they are tightly
// clustered. The area then takes the official record nearest the cluster centre.
const ASPECT_CLUSTER_KM = 30;
const plain = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’‘`]/g, '').trim();
function distanceKm(a, b) {
  const rad = d => d * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function officialAspectCluster(name, rows) {
  const requested = plain(name);
  if (!requested || vague(name)) return [];
  const escaped = requested.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const aspect = new RegExp(`^${escaped}\\s*(?:[-–—:]\\s*|\\s+at\\s+)\\S`, 'i');
  const cluster = rows.filter(p => p.officialParkCode && aspect.test(plain(p.name))
    && Number.isFinite(p.geometry?.location?.lat) && Number.isFinite(p.geometry?.location?.lng));
  if (!cluster.length || new Set(cluster.map(p => p.officialParkCode)).size > 1) return [];
  const points = cluster.map(p => p.geometry.location);
  if (points.some(a => points.some(b => distanceKm(a, b) > ASPECT_CLUSTER_KM))) return [];
  const centre = { lat: points.reduce((n, p) => n + p.lat, 0) / points.length, lng: points.reduce((n, p) => n + p.lng, 0) / points.length };
  const representative = cluster.reduce((best, p) => distanceKm(p.geometry.location, centre) < distanceKm(best.geometry.location, centre) ? p : best);
  return [{ ...representative, name: name.trim(), officialAspectOf: representative.name }];
}
// "Lake McDonald" is both a lake and the census place on its shore. When an exact-name
// tie is exactly one physical feature plus same-name localities at the same spot, the
// traveler's stop is the feature. Two features, or a distant town, stay ambiguous.
const COLOCATED_KM = 5;
function colocatedFeature(candidates) {
  const isArea = c => (c.types || []).some(t => AREA_TYPES.has(t) || t === 'political');
  const features = candidates.filter(c => !isArea(c));
  if (features.length !== 1 || features.length === candidates.length) return null;
  const [feature] = features;
  const at = c => ({ lat: c.lat, lng: c.lon });
  return candidates.every(c => c === feature || distanceKm(at(c), at(feature)) <= COLOCATED_KM) ? feature : null;
}
function defaultLookup() {
  return async (query, { signal, name, anchors = [] } = {}) => {
    const apiKey = process.env.GMAPS_SERVER_KEY;
    if (!apiKey) throw Object.assign(new Error('Place lookup is not configured'), { code: 'named_place_not_configured' });
    recordExternalProviderHttpRequest('google_maps');
    const { getGoogleMaps } = require('../googleMapsTransport');
    const points = anchors.filter(a => Number.isFinite(a.latitude) && Number.isFinite(a.longitude));
    const locationBias = points.length ? { location: `${points.reduce((n,a)=>n+a.latitude,0)/points.length},${points.reduce((n,a)=>n+a.longitude,0)/points.length}`, radius:50000 } : {};
    const response = await getGoogleMaps(PLACE_ENDPOINT, {
      params: { query, key: apiKey, region: 'us', ...locationBias }, timeout: 8000, signal,
    });
    const data = response.data;
    if (data?.status === 'ZERO_RESULTS') return [];
    if (data?.status !== 'OK') throw Object.assign(new Error('Place lookup failed'), {
      code: 'named_place_lookup_failed', googleStatus: data?.status,
      googleMessage: data?.error_message, httpStatus: response.status,
    });
    const results = (data.results || []).slice(0, 8);
    results.providerAttempts = 1;
    // Text Search region is not country authority. Enrich each eligible identity
    // by its own provider ID. Alternatives never borrow another result's country.
    const exactResults=results.filter(place=>exactCandidate(place,name,anchors));
    for (const place of exactResults.length ? exactResults : results) {
      if (!place.place_id || place.partial_match || !place.types?.some(t => SUPPORTED_TYPES.has(t)) || structuredCountry(place)) continue;
      recordExternalProviderHttpRequest('google_maps');
      results.providerAttempts += 1;
      const details = await getGoogleMaps(DETAILS_ENDPOINT, {
        params: { place_id: place.place_id, fields: 'place_id,address_components', key: apiKey },
        timeout: 8000, signal,
      });
      if (details.data?.status !== 'OK') throw Object.assign(new Error('Place details failed'), {
        code: 'named_place_lookup_failed', googleStatus: details.data?.status,
        googleMessage: details.data?.error_message, httpStatus: details.status,
      });
      if (details.data.result?.place_id === place.place_id) {
        place.address_components = details.data.result.address_components;
      } else place.detailsIdentityMismatch = true;
    }
    return results;
  };
}
function createNamedPlaceEvidenceProvider({ lookup = defaultLookup(), officialLookup = createOfficialRecordsLookup(), catalog = KNOWN_PLACES, now = () => new Date(),
  onDiagnostic = detail => console.warn('[Trailie named_place]', JSON.stringify(detail)) } = {}) {
  return {
    id: 'named_place', ephemeralOnly: true,
    supports: r => r?.preferredProviders?.includes('named_place') && r?.topic === 'activities' && typeof r?.entity?.displayName === 'string' && r.entity.displayName.trim().length >= 2,
    estimateCost: () => ({ costStatus: 'unknown', costUsd: null, providerAttemptLimit: 9 }),
    buildRequest(r) {
      const name = r.entity.displayName.trim();
      const queryProvenance = r.queryProvenance || {};
      const identity = hash(JSON.stringify({name, queryProvenance}));
      return { provider: 'named_place', operation: 'resolve_identity', dedupeKey: `named_place:${identity}`,
        parameters: { name, query: name, queryProvenance },
        publicCanonicalRequest: { provider:'named_place', operation:'resolve_identity', requestHash:identity } };
    },
    async fetch(request, { signal } = {}) {
      try {
      const { name } = request.parameters;
      if (vague(name)) return {raw:null,metadata:{observedAt:now().toISOString(),querySent:name,unresolvedReason:'descriptive_place_instruction',candidateDiagnostics:[]},completeness:{isComplete:false},providerAttempts:0};
      const anchors=trustedAnchors(request.parameters.queryProvenance);
      const matches = Object.entries(catalog).filter(([alias, p]) => key(alias) === key(name) || key(p.name) === key(name));
      if (new Set(matches.map(([,p])=>JSON.stringify([p.name,p.lat,p.lon]))).size > 1) return {raw:null,metadata:{observedAt:now().toISOString(),unresolvedReason:'ambiguous_catalog_identity'},completeness:{isComplete:false,topics:[],emptyMeans:'unknown'},providerAttempts:0};
      const known = matches.length ? matches[0][1] : null;
      let officialRows = [], officialStatus = 'not_attempted';
      if (!known && anchors.length) {
        try { officialRows = await officialLookup(anchors,{signal}); officialStatus='fulfilled'; }
        catch (error) { if (signal?.aborted) throw error; officialStatus='unavailable'; }
      }
      const exactOfficial=officialRows.filter(p=>matchName(name,p,anchors).type !== 'none'
        && Number.isFinite(p.geometry?.location?.lat) && Number.isFinite(p.geometry?.location?.lng));
      const linkedOfficial=officialRows.filter(p=>supportedExperienceAnchor(name,p,anchors));
      const officialMatches=exactOfficial.length ? exactOfficial : linkedOfficial.length ? linkedOfficial : officialAspectCluster(name, officialRows);
      const results = known ? [] : officialMatches.length ? officialMatches : await lookup(request.parameters.query, { signal, name, anchors });
      const diagnostics = [];
      const candidates = known ? [{ name: known.name, lat: known.lat, lon: known.lon,
        canonicalId:`catalog:place:${hash(key(known.name))}`, source:'trailverse-known-place', types:[], formattedAddress:known.name }]
        : results.slice(0, 8).flatMap(p => {
          const countryCode = structuredCountry(p);
          const match=matchName(name,p,anchors);
          const relationship=supportedExperienceAnchor(name,p,anchors);
          const nameMatch = match.type !== 'none' || Boolean(relationship);
          const reason = !p.place_id ? 'missing_place_id' : p.partial_match ? 'partial_match'
            : !nameMatch ? 'name_mismatch' : !p.types?.some(t => SUPPORTED_TYPES.has(t)) ? 'unsupported_type'
            : p.detailsIdentityMismatch ? 'details_identity_mismatch'
            : !countryCode ? 'country_unknown' : countryCode !== 'US' ? 'country_mismatch' : null;
          const diagnostic = { name: p.name, candidateName:p.name, placeId: p.place_id, canonicalPlaceId:p.officialParkCode ? p.place_id : p.place_id ? `google:place:${p.place_id}` : null, nameMatch, nameMatchType:match.type, destinationAnchor:match.anchor || (p.officialParkCode ? `nps:park:${p.officialParkCode}` : null), country:countryCode, adminRegion:addressComponent(p,'administrative_area_level_1')?.short_name || null, sourceAttempted:p.officialParkCode ? 'nps' : 'google',
            countryEvidence: { countryCode, source: countryCode ? 'provider_address_component' : 'unknown' },
            regionMatch: null, contextMatch: null, rejectionReason: reason };
          diagnostics.push(diagnostic);
          if (reason && reason !== 'name_mismatch') return [];
          // A differently named candidate needs the same independent geographic
          // and coordinate authority as an exact match, never a name shortcut.
          if (!p.types?.some(t=>SUPPORTED_TYPES.has(t)) || p.detailsIdentityMismatch || countryCode!=='US') return [];
          const region = addressComponent(p, 'administrative_area_level_1');
          return [{ name:relationship?.experience.name || p.name, canonicalPlaceName:p.name, exactMatch:nameMatch, ...(relationship || {}), lat:p.geometry?.location?.lat, lon:p.geometry?.location?.lng,
            canonicalId:p.officialParkCode ? p.place_id : `google:place:${p.place_id}`, providerId:p.place_id, source:p.officialParkCode ? 'nps' : 'google', sourceUrl:p.officialUrl, types:p.types,
            formattedAddress:p.formatted_address || '', countryCode,
            stateCode:region?.short_name, admin1:region?.long_name }];
        });
      const valid = candidates.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat)<=90 && Math.abs(p.lon)<=180 && !(p.lat===0 && p.lon===0));
      const provenance=request.parameters.queryProvenance;
      const bias={states:normalizeRegionList((provenance.contextualRegions || []).map(v=>v.name || v.code))};
      const ranked=rankGeocodeCandidates(valid, null, {query:name, bias,
        explicitRegion:normalizeRegionList(provenance.explicitTravelerRegion?.code || provenance.explicitTravelerRegion?.name)[0] || null, explicitCountry:provenance.explicitTravelerCountry || null});
      // A unique exact identity within the allowed geography, never top-result guessing.
      const eligible=ranked.scored.filter(p => p.countryOk && (provenance.explicitTravelerRegion ? p.explicitMatch : !bias.states.length || p.regionMatch));
      const unique=new Map(eligible.filter(p=>p.candidate.exactMatch!==false).map(p=>[p.candidate.canonicalId,p.candidate]));
      const alternatives=[...new Map(eligible.map(p=>[p.candidate.canonicalId,p.candidate])).values()].slice(0,4);
      const selected=unique.size===1 ? [...unique.values()][0] : colocatedFeature([...unique.values()]);
      for (const diagnostic of diagnostics) {
        if (diagnostic.rejectionReason) continue;
        const candidate = candidates.find(c => c.providerId === diagnostic.placeId);
        const rank = ranked.scored.find(r => r.candidate === candidate);
        diagnostic.regionMatch = rank?.regionMatch ?? null;
        diagnostic.contextMatch = rank ? (provenance.explicitTravelerRegion ? rank.explicitMatch : !bias.states.length || rank.regionMatch) : null;
        diagnostic.rejectionReason = !valid.includes(candidate) ? 'invalid_coordinates'
          : !rank ? 'explicit_country_mismatch' : !diagnostic.contextMatch ? 'region_mismatch'
          : unique.size > 1 && candidate !== selected ? (selected ? 'colocated_locality_of_feature' : 'ambiguous_identity') : null;
      }
      return {raw:selected, metadata:{alternatives:selected?[]:alternatives,observedAt:now().toISOString(), unresolvedReason:selected ? null : unique.size>1?'ambiguous_identity':'identity_not_found', querySent:request.parameters.query, candidateDiagnostics:diagnostics,sourceAttempts:[...(known?['catalog']:[]),...(anchors.length?[`nps:${officialStatus}`]:[]),...(!known && !officialMatches.length?['google']:[])]},
        completeness:{isComplete:false,topics:[],emptyMeans:'unknown'},providerAttempts:known || officialMatches.length?0:(results.providerAttempts || 1)};
      } catch (error) {
        const detail = namedPlaceDiagnostics(error);
        try { onDiagnostic(detail); } catch { /* diagnostics cannot alter the provider result */ }
        throw error;
      }
    },
    normalize(raw, request, metadata) {
      const alternatives=!raw;
      return (raw?[raw]:metadata.alternatives||[]).flatMap(raw=>{
      const area=raw.types.some(t=>AREA_TYPES.has(t));
      return [{entityId:raw.canonicalId, topic:'activities', evidenceType:'fact',
        claim:{identity:raw.canonicalId, subjectId:raw.canonicalId, status:'resolved_place_identity',
          text:`${raw.name}: place identity and location resolved; access and availability are not confirmed.`,
          normalizedValue:{name:raw.name, canonicalPlaceName:raw.canonicalPlaceName || raw.name, ...(alternatives?{alternativeFor:request.parameters.name,resolutionKind:'grounded_alternative'}:{requestedName:request.parameters.name,resolutionKind:raw.mapAnchor?'supported_map_anchor':'exact'}), ...(raw.experience?{experience:raw.experience,mapAnchor:raw.mapAnchor}:{}), placeKind:area?'area':'place',
            placeTypes:raw.types, latitude:raw.lat, longitude:raw.lon, providerSource:raw.source,
            currentAccess:'unknown', lodgingAvailability:'unknown'}},
        source:{provider:'named_place',sourceClass:raw.source==='nps'?'official_owner':raw.source==='google'?'commercial_structured':'trusted_specialist',sourceId:raw.canonicalId,
          url:raw.sourceUrl || (raw.providerId?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw.name)}&query_place_id=${encodeURIComponent(raw.providerId)}`:null)},
        observedAt:metadata.observedAt,
        quality:{authorityClass:raw.source==='nps'?'official_owner':raw.source==='google'?'commercial_structured':'trusted_specialist',conflictStatus:'none'},
        provenance:{extractionMethod:'structured_place_identity',queryProvenance:request.parameters.queryProvenance},
      }];
      });
    },
    classifyError: error => ({code:error.code==='named_place_not_configured'?'provider_not_configured':'provider_unavailable',retryable:false}),
  };
}
module.exports={createNamedPlaceEvidenceProvider};
