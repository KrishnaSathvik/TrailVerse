'use strict';

const APPROVED = new Set(['resolved_metadata', 'geocoder', 'stored', 'trailverse_catalog']);
const AUTHORITIES = new Set(['official_owner', 'official_partner', 'trusted_specialist', 'commercial_structured', 'external_geocoder']);
function validLocation(location) {
  return location?.status === 'resolved' && APPROVED.has(location.source)
    && AUTHORITIES.has(location.authority) && Boolean(location.sourceRef)
    && Number.isFinite(location.lat) && Number.isFinite(location.lon)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lon) <= 180;
}
// Only called at the trusted provider ingestion boundary, never on model output.
function normalizeEvidenceLocation(row) {
  const result = structuredClone(row);
  const value = result.claim?.normalizedValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const point = value.coordinates || value;
  const lat = point.latitude, lon = point.longitude;
  const authority = result.source?.sourceClass;
  const source = ['geocode_coordinate', 'named_place'].includes(result.source?.provider)
    ? (value.providerSource === 'nps' && authority === 'official_owner' ? 'resolved_metadata' : value.providerSource === 'trailverse-known-place' ? 'trailverse_catalog' : 'geocoder')
    : authority === 'official_owner' ? 'resolved_metadata'
      : result.source?.provider === 'known_place' ? 'trailverse_catalog' : 'resolved_metadata';
  const location = { lat, lon, source, authority, status: 'resolved',
    sourceRef: result.evidenceId || result.source?.sourceId || result.claim?.identity,
    sourceEntity: result.claim?.subjectId || result.entityId || null };
  const trustedGeocoder = !['geocode_coordinate', 'named_place'].includes(result.source?.provider) || (['google', 'open-meteo', 'trailverse-known-place'].includes(value.providerSource) || (value.providerSource === 'nps' && authority === 'official_owner'));
  if (trustedGeocoder && validLocation(location)) value.location = location;
  else if (!validLocation(value.location)) delete value.location;
  delete value.coordinates; delete value.latitude; delete value.longitude;
  return result;
}
module.exports = { validLocation, normalizeEvidenceLocation };
