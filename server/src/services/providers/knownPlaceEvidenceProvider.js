'use strict';

const { candidatesForEntity } = require('../../data/officialPlaceActivityCandidates');

const SUPPORTED_TOPICS = Object.freeze(new Set(['destination_identity', 'activities']));

function placeIdFor(requirement) {
  const entityId = requirement?.entity?.entityId || '';
  return /^place:known:[a-z0-9-]+$/i.test(entityId) ? entityId.toLowerCase() : null;
}

function createKnownPlaceEvidenceProvider({ now = () => new Date() } = {}) {
  return {
    id: 'known_place',
    supports(requirement) {
      return SUPPORTED_TOPICS.has(requirement?.topic) && Boolean(placeIdFor(requirement));
    },
    estimateCost() {
      return { costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 };
    },
    buildRequest(requirement) {
      const entityId = placeIdFor(requirement);
      if (!entityId) throw new TypeError('Unsupported known-place evidence requirement');
      const topic = requirement.topic;
      const operation = topic === 'activities' ? 'activities' : 'identity';
      return {
        provider: 'known_place',
        operation,
        parameters: {
          entityId,
          displayName: requirement.entity?.displayName || null,
          latitude: requirement.entity?.latitude ?? null,
          longitude: requirement.entity?.longitude ?? null,
          topic,
        },
        dedupeKey: `known_place|${operation}|${entityId}`,
        publicCanonicalRequest: { provider: 'known_place', operation, entityId },
      };
    },
    async fetch(request) {
      const topics = request.operation === 'activities' ? ['activities'] : ['destination_identity'];
      return {
        raw: {
          entityId: request.parameters.entityId,
          displayName: request.parameters.displayName,
          latitude: request.parameters.latitude,
          longitude: request.parameters.longitude,
          topic: request.parameters.topic,
          activityCandidates: request.operation === 'activities'
            ? candidatesForEntity(request.parameters.entityId, {
              displayName: request.parameters.displayName,
            })
            : [],
        },
        metadata: { observedAt: now().toISOString() },
        completeness: {
          isComplete: true,
          topics,
          scope: { entityId: request.parameters.entityId, observedAt: now().toISOString() },
          emptyMeans: request.operation === 'activities'
            && candidatesForEntity(request.parameters.entityId, {
              displayName: request.parameters.displayName,
            }).length === 0
            ? 'unknown'
            : 'unknown',
        },
        providerAttempts: 1,
      };
    },
    normalize(raw, request, metadata = {}) {
      if (!raw?.entityId) return [];
      if (request.operation === 'activities') {
        return (raw.activityCandidates || []).map((item, index) => ({
          entityId: raw.entityId,
          topic: 'activities',
          evidenceType: 'fact',
          claim: {
            identity: `named-place:${String(item.name || index).toLowerCase().replace(/[^a-z0-9:]+/g, '-')}`,
            text: item.note
              ? `${item.name}: ${item.note}`
              : item.name,
            normalizedValue: {
              entityId: `${raw.entityId}:activity:${index}`,
              destinationId: raw.entityId,
              name: item.name,
              category: item.category || null,
              activityTypes: item.activityTypes || [],
              difficulty: item.difficulty || null,
              duration: item.duration || null,
              walkingDistanceMiles: Number.isFinite(Number(item.walkingDistanceMiles))
                ? Number(item.walkingDistanceMiles)
                : null,
              exposureLevel: item.exposureLevel || null,
              accessibility: item.accessibility || null,
              seasonalStatus: item.seasonalStatus || null,
              currentStatus: item.currentStatus || 'unknown',
              viewpointTraits: item.viewpointTraits || [],
              sunsetSuitability: item.sunsetSuitability || null,
              coordinates: null,
              authority: item.authority || 'official_owner',
              sourceUrl: item.sourceUrl || null,
              observedAt: metadata.observedAt || null,
              freshness: 'stable',
            },
            unit: null,
            status: item.currentStatus === 'open' || item.currentStatus === 'closed'
              ? item.currentStatus
              : null,
            subjectId: raw.entityId,
            objectId: null,
            qualifiers: ['named_activity_candidate', 'static_suitability_only'],
          },
          scope: {
            geographicEntityIds: [raw.entityId],
            validFrom: null,
            validThrough: null,
            audience: 'public',
            locale: 'en-US',
          },
          source: {
            provider: 'known_place',
            sourceClass: item.authority || 'official_owner',
            sourceId: `${raw.entityId}:${item.name}`,
            url: item.sourceUrl || null,
            title: item.name,
            publishedAt: null,
            sourceUpdatedAt: null,
          },
          observedAt: metadata.observedAt,
          quality: {
            authorityClass: item.authority || 'official_owner',
            scopeMatch: 'exact',
            conflictStatus: 'none',
          },
          provenance: {
            extractionMethod: 'official_place_activity_catalog',
            extractorVersion: 'known-place-activities-v1',
          },
        }));
      }

      if (!raw.displayName) return [];
      return [{
        entityId: raw.entityId,
        topic: 'destination_identity',
        evidenceType: 'fact',
        claim: {
          identity: 'known-place-identity',
          text: raw.displayName,
          normalizedValue: {
            name: raw.displayName,
            latitude: raw.latitude,
            longitude: raw.longitude,
          },
          unit: null,
          status: null,
          subjectId: raw.entityId,
          objectId: null,
          qualifiers: [],
        },
        scope: {
          geographicEntityIds: [raw.entityId],
          validFrom: null,
          validThrough: null,
          audience: 'public',
          locale: 'en-US',
        },
        source: {
          provider: 'known_place',
          sourceClass: 'trusted_specialist',
          sourceId: raw.entityId,
          url: null,
          title: raw.displayName,
          publishedAt: null,
          sourceUpdatedAt: null,
        },
        observedAt: metadata.observedAt,
        quality: { authorityClass: 'trusted_specialist', scopeMatch: 'exact', conflictStatus: 'none' },
        provenance: { extractionMethod: 'known_place_catalog', extractorVersion: 'known-place-v1' },
      }];
    },
    classifyError() {
      return { code: 'provider_unavailable', retryable: false };
    },
  };
}

module.exports = {
  SUPPORTED_TOPICS,
  createKnownPlaceEvidenceProvider,
};
