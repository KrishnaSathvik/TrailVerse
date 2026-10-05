'use strict';

const GENERIC = new Set(['national', 'state', 'park', 'parks', 'monument', 'historic', 'site', 'recreation', 'area', 'the', 'of']);

function tokens(value) {
  return [...new Set(String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter((token) => token.length >= 3 && !GENERIC.has(token)))];
}

function verifyWebDestinationRelevance({ requested = {}, url = '', title = '', text = '', coordinates = null, officialRelationship = null } = {}) {
  const entityId = String(requested.entityId || '').toLowerCase();
  if (officialRelationship?.verified === true && officialRelationship.entityId === entityId) {
    return { accepted: true, scopeMatch: 'exact', relationshipConfidence: 1, method: 'verified_official_relationship' };
  }

  const requestedCode = entityId.match(/^nps:park:([a-z0-9]{4})$/)?.[1] || null;
  const urlCode = String(url).match(/nps\.gov\/([a-z0-9]{4})(?:\/|$)/i)?.[1]?.toLowerCase() || null;
  if (requestedCode && urlCode) {
    return requestedCode === urlCode
      ? { accepted: true, scopeMatch: 'exact', relationshipConfidence: 1, method: 'nps_url_code' }
      : { accepted: false, scopeMatch: 'unknown', relationshipConfidence: 0, method: 'nps_url_code_mismatch' };
  }

  if (coordinates && Number.isFinite(Number(requested.latitude)) && Number.isFinite(Number(requested.longitude))) {
    const latDelta = Math.abs(Number(coordinates.latitude) - Number(requested.latitude));
    const lonDelta = Math.abs(Number(coordinates.longitude) - Number(requested.longitude));
    if (latDelta <= 0.5 && lonDelta <= 0.5) {
      return { accepted: true, scopeMatch: 'exact', relationshipConfidence: 0.9, method: 'geographic_proximity' };
    }
  }

  const requestedTokens = tokens(requested.displayName);
  const titleTokens = tokens(title);
  const titleDeclaresPlace = /\b(?:national|state)\s+(?:park|monument|recreation area|historic site)\b/i.test(String(title || ''));
  const titleMatchesRequested = requestedTokens.some((token) => titleTokens.includes(token));
  if (titleDeclaresPlace && requestedTokens.length > 0 && !titleMatchesRequested) {
    return { accepted: false, scopeMatch: 'unknown', relationshipConfidence: 0, method: 'conflicting_title_entity' };
  }
  const haystack = new Set(tokens(`${title} ${text}`));
  const matched = requestedTokens.filter((token) => haystack.has(token));
  const confidence = requestedTokens.length ? matched.length / requestedTokens.length : 0;
  if (matched.length > 0 && confidence >= 0.5) {
    return { accepted: true, scopeMatch: 'exact', relationshipConfidence: Math.min(0.95, 0.65 + confidence * 0.3), method: 'canonical_name_match' };
  }
  return { accepted: false, scopeMatch: 'unknown', relationshipConfidence: confidence, method: 'ownership_unresolved' };
}

module.exports = { verifyWebDestinationRelevance };
