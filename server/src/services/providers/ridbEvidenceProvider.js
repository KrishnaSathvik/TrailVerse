'use strict';

const RIDB_API_BASE = 'https://ridb.recreation.gov/api/v1';
const SUPPORTED_TOPICS = Object.freeze(new Set(['campgrounds', 'permits_reservations']));
const CAMPGROUND_TYPES = Object.freeze(new Set(['campground', 'camping', 'group campground']));
const PERMIT_TYPES = Object.freeze(new Set(['permit', 'timed entry', 'ticket facility', 'tour ticket']));

function parkCodeFor(requirement) {
  const match = /^nps:park:([a-z0-9_-]+)$/i.exec(requirement?.entity?.entityId || '');
  return match ? match[1].toLowerCase() : null;
}

function normalizedName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function chooseRecArea(records, displayName) {
  const target = normalizedName(displayName);
  return records.find((record) => normalizedName(record.RecAreaName) === target)
    || records.find((record) => {
      const name = normalizedName(record.RecAreaName);
      return name && target && (name.includes(target) || target.includes(name));
    })
    || null;
}

function defaultRidbClient() {
  return {
    async getRecAreaFacilities({ displayName }, { signal } = {}) {
      const apiKey = process.env.RIDB_API_KEY;
      if (!apiKey) {
        throw Object.assign(new Error('RIDB API key is not configured'), { code: 'ridb_not_configured' });
      }
      const axios = require('axios');
      const headers = { apikey: apiKey };
      const search = await axios.get(`${RIDB_API_BASE}/recareas`, {
        params: { query: displayName, limit: 10 }, headers, timeout: 10000, signal,
      });
      const recArea = chooseRecArea(search.data?.RECDATA || [], displayName);
      if (!recArea?.RecAreaID) return { recArea: null, facilities: [], observedAt: new Date().toISOString() };
      const facilities = await axios.get(`${RIDB_API_BASE}/recareas/${recArea.RecAreaID}/facilities`, {
        params: { limit: 50 }, headers, timeout: 10000, signal,
      });
      return {
        recArea,
        facilities: facilities.data?.RECDATA || [],
        observedAt: new Date().toISOString(),
      };
    },
  };
}

function sourceUrl(facility) {
  return facility.FacilityReservationURL
    || facility.FacilityURL
    || (facility.FacilityID ? `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}` : null);
}

function baseCandidate({ parkCode, topic, evidenceType, claim, sourceId, url, observedAt }) {
  const entityId = `nps:park:${parkCode}`;
  return {
    entityId,
    topic,
    evidenceType,
    claim,
    scope: {
      geographicEntityIds: [entityId], validFrom: null, validThrough: null,
      audience: 'public', locale: 'en-US',
    },
    source: {
      provider: 'ridb', sourceClass: 'official_structured', sourceId: String(sourceId),
      url: url || null, title: null, publishedAt: null, sourceUpdatedAt: null,
    },
    observedAt,
    quality: { authorityClass: 'official_structured', scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'ridb-evidence-v1' },
  };
}

function normalizeRidb(raw, request, observedAt) {
  const parkCode = request.parameters.parkCode;
  const parkId = `nps:park:${parkCode}`;
  const recArea = raw?.recArea;
  if (!recArea?.RecAreaID) return [];
  const recAreaId = `ridb:rec_area:${recArea.RecAreaID}`;
  const candidates = [baseCandidate({
    parkCode,
    topic: 'campgrounds',
    evidenceType: 'relationship',
    claim: {
      identity: `ridb-rec-area:${parkId}:${recAreaId}`,
      text: `${recArea.RecAreaName || request.parameters.displayName} recreation area`,
      normalizedValue: { relationship: 'represented_by_rec_area', recAreaId, name: recArea.RecAreaName || null },
      unit: null, status: null, subjectId: parkId, objectId: recAreaId, qualifiers: [],
    },
    sourceId: recArea.RecAreaID,
    url: `https://www.recreation.gov/camping/gateways/${recArea.RecAreaID}`,
    observedAt,
  })];

  for (const facility of raw.facilities || []) {
    if (facility.FacilityID == null) continue;
    const facilityId = `ridb:facility:${facility.FacilityID}`;
    const type = normalizedName(facility.FacilityTypeDescription);
    const common = {
      facilityId,
      recAreaId,
      name: facility.FacilityName || null,
      facilityType: facility.FacilityTypeDescription || null,
      reservationUrl: sourceUrl(facility),
    };
    candidates.push(baseCandidate({
      parkCode,
      topic: 'campgrounds',
      evidenceType: 'relationship',
      claim: {
        identity: `ridb-rec-area-facility:${recAreaId}:${facilityId}`,
        text: `${facility.FacilityName || 'Facility'} belongs to ${recArea.RecAreaName || 'the recreation area'}`,
        normalizedValue: { relationship: 'contains_facility', ...common },
        unit: null, status: null, subjectId: facilityId, objectId: recAreaId, qualifiers: [],
      },
      sourceId: facility.FacilityID, url: sourceUrl(facility), observedAt,
    }));
    if (CAMPGROUND_TYPES.has(type)) {
      candidates.push(baseCandidate({
        parkCode,
        topic: 'campgrounds',
        evidenceType: 'fact',
        claim: {
          identity: `ridb-facility:${facility.FacilityID}`,
          text: facility.FacilityDescription || facility.FacilityName || null,
          normalizedValue: common,
          unit: null, status: 'listing_only', subjectId: facilityId, objectId: recAreaId,
          qualifiers: ['listing_existence_only'],
        },
        sourceId: facility.FacilityID, url: sourceUrl(facility), observedAt,
      }));
    }
    if (PERMIT_TYPES.has(type)) {
      candidates.push(baseCandidate({
        parkCode,
        topic: 'permits_reservations',
        evidenceType: 'fact',
        claim: {
          identity: `ridb-permit-listing:${facility.FacilityID}`,
          text: facility.FacilityDescription || facility.FacilityName || null,
          normalizedValue: { ...common, listingExists: true, currentAvailability: null },
          unit: null, status: 'listing_only', subjectId: parkId, objectId: facilityId,
          qualifiers: ['listing_existence_only', 'availability_unknown', 'owning_agency_rules_control'],
        },
        sourceId: facility.FacilityID, url: sourceUrl(facility), observedAt,
      }));
    }
  }
  return candidates;
}

function createRidbEvidenceProvider({ ridbClient = null, now = () => new Date() } = {}) {
  const client = () => ridbClient || defaultRidbClient();
  return {
    id: 'ridb',
    supports(requirement) {
      return SUPPORTED_TOPICS.has(requirement?.topic) && Boolean(parkCodeFor(requirement));
    },
    estimateCost() {
      return { costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 };
    },
    buildRequest(requirement) {
      const parkCode = parkCodeFor(requirement);
      if (!parkCode || !SUPPORTED_TOPICS.has(requirement?.topic)) {
        throw new TypeError('Unsupported RIDB evidence requirement');
      }
      const displayName = String(requirement.entity?.displayName || '').trim();
      return {
        provider: 'ridb',
        operation: 'rec_area_facilities',
        parameters: { parkCode, displayName },
        dedupeKey: `ridb|rec-area-facilities|${parkCode}`,
        publicCanonicalRequest: { provider: 'ridb', operation: 'rec_area_facilities', parkCode, displayName },
      };
    },
    async fetch(request, { signal } = {}) {
      if (signal?.aborted) throw Object.assign(new Error('RIDB evidence fetch cancelled'), { code: 'ABORT_ERR' });
      const raw = await client().getRecAreaFacilities(request.parameters, { signal });
      return {
        raw,
        metadata: { observedAt: raw?.observedAt || now().toISOString() },
        completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' },
        providerAttempts: 1,
      };
    },
    normalize(raw, request, metadata = {}) {
      return normalizeRidb(raw, request, metadata.observedAt || now().toISOString());
    },
    classifyError(error) {
      const status = error?.response?.status;
      if (error?.code === 'ridb_not_configured' || status === 401 || status === 403) {
        return { code: 'provider_not_configured', retryable: false };
      }
      if (status === 429) return { code: 'provider_rate_limited', retryable: false };
      if (error?.code === 'ABORT_ERR' || error?.code === 'ERR_CANCELED') return { code: 'provider_cancelled', retryable: false };
      if (['ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)) return { code: 'provider_timeout', retryable: true };
      return { code: 'provider_unavailable', retryable: status >= 500 || !status };
    },
  };
}

module.exports = {
  SUPPORTED_TOPICS,
  createRidbEvidenceProvider,
};
