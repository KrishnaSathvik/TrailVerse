'use strict';

/**
 * Canonical routable endpoint identity for Google Maps driving_time evidence.
 * Eligibility is based on location identity (entityId + coordinates), not NPS park type.
 */

function normalizeRoutingEndpoint(entity = {}) {
  const entityId = entity?.entityId == null
    ? null
    : String(entity.entityId).trim().toLowerCase() || null;
  const displayName = String(entity?.displayName || entity?.name || '').trim();
  const latitude = Number.isFinite(Number(entity?.latitude ?? entity?.lat))
    ? Number(entity.latitude ?? entity.lat)
    : null;
  const longitude = Number.isFinite(Number(entity?.longitude ?? entity?.lon))
    ? Number(entity.longitude ?? entity.lon)
    : null;
  return {
    entityId,
    displayName,
    latitude,
    longitude,
    entityType: entity?.entityType == null
      ? null
      : String(entity.entityType).trim().toLowerCase() || null,
  };
}

function isRoutableEndpoint(entity) {
  const point = normalizeRoutingEndpoint(entity);
  if (!point.entityId) return false;
  if (point.entityType === 'unresolved_destination') return false;
  if (String(point.entityId).startsWith('unresolved:')) return false;
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) return false;
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) return false;
  return true;
}

module.exports = {
  isRoutableEndpoint,
  normalizeRoutingEndpoint,
};
