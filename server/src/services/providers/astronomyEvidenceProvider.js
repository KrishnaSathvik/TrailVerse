'use strict';

const MAX_RANGE_DAYS = 31;

function compactCoordinate(value) {
  return Number(Number(value).toFixed(4));
}

function dateKey(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function scopedParameters(requirement) {
  const latitude = Number(requirement?.entity?.latitude);
  const longitude = Number(requirement?.entity?.longitude);
  const from = dateKey(requirement?.temporalScope?.validFrom);
  const through = dateKey(requirement?.temporalScope?.validThrough || requirement?.temporalScope?.validFrom);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !from || !through || through < from) return null;
  const dayCount = Math.round((new Date(`${through}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)) / 86400000) + 1;
  if (dayCount < 1 || dayCount > MAX_RANGE_DAYS) return null;
  return {
    entityId: requirement.entity.entityId,
    displayName: requirement.entity.displayName || null,
    latitude: compactCoordinate(latitude), longitude: compactCoordinate(longitude),
    from, through, dayCount,
    validFrom: `${from}T00:00:00.000Z`, validThrough: `${through}T23:59:59.999Z`,
  };
}

function defaultEngine() {
  return require('../astronomicalService');
}

function calculateDays(parameters, engine) {
  const days = [];
  const cursor = new Date(`${parameters.from}T12:00:00.000Z`);
  for (let index = 0; index < parameters.dayCount; index += 1) {
    const date = new Date(cursor.getTime() + index * 86400000);
    const moon = engine.calculateMoonPhase(date);
    days.push({
      date: date.toISOString().slice(0, 10),
      moonPhase: moon.phase,
      moonIlluminationPercent: Number(moon.illumination),
      moonAgeDays: Number(moon.age),
      nextNewMoon: moon.nextNewMoon instanceof Date ? moon.nextNewMoon.toISOString() : moon.nextNewMoon,
      nextFullMoon: moon.nextFullMoon instanceof Date ? moon.nextFullMoon.toISOString() : moon.nextFullMoon,
      milkyWayVisibility: engine.calculateMilkyWayVisibility(moon, date.getUTCMonth(), parameters.latitude),
    });
  }
  return days;
}

function createAstronomyEvidenceProvider({ astronomyEngine = null, now = () => new Date() } = {}) {
  const engine = () => astronomyEngine || defaultEngine();
  return {
    id: 'astronomy_compute',
    supports(requirement) {
      return requirement?.topic === 'astronomy' && Boolean(scopedParameters(requirement));
    },
    estimateCost() {
      return { costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 };
    },
    buildRequest(requirement) {
      const parameters = scopedParameters(requirement);
      if (requirement?.topic !== 'astronomy' || !parameters) throw new TypeError('Unsupported Astronomy evidence requirement');
      return {
        provider: 'astronomy_compute', operation: 'calculate_date_range', parameters,
        dedupeKey: `astronomy_compute|${parameters.latitude}|${parameters.longitude}|${parameters.from}|${parameters.through}`,
        publicCanonicalRequest: {
          provider: 'astronomy_compute', operation: 'calculate_date_range',
          latitude: parameters.latitude, longitude: parameters.longitude,
          validFrom: parameters.validFrom, validThrough: parameters.validThrough,
        },
      };
    },
    async fetch(request, { signal } = {}) {
      if (signal?.aborted) throw Object.assign(new Error('Astronomy computation cancelled'), { code: 'ABORT_ERR' });
      return {
        raw: { days: calculateDays(request.parameters, engine()) },
        metadata: { computedAt: now().toISOString() },
        completeness: { isComplete: true, topics: ['astronomy'], emptyMeans: 'unknown' },
        providerAttempts: 1,
      };
    },
    normalize(raw, request, metadata = {}) {
      if (!Array.isArray(raw?.days) || raw.days.length === 0) return [];
      const parameters = request.parameters;
      const observedAt = metadata.computedAt || now().toISOString();
      return [{
        entityId: parameters.entityId, topic: 'astronomy', evidenceType: 'fact',
        claim: {
          identity: `astronomy:${parameters.entityId}:${parameters.latitude}:${parameters.longitude}:${parameters.from}:${parameters.through}`,
          text: `${parameters.displayName || 'Destination'} astronomy for ${parameters.from} through ${parameters.through}`,
          normalizedValue: { latitude: parameters.latitude, longitude: parameters.longitude, days: raw.days },
          unit: null, status: 'computed', subjectId: parameters.entityId, objectId: null,
          qualifiers: ['deterministic_calculation', 'not_live_sky_conditions'],
        },
        scope: {
          geographicEntityIds: [parameters.entityId], validFrom: parameters.validFrom, validThrough: parameters.validThrough,
          audience: 'public', locale: 'en-US',
        },
        source: {
          provider: 'astronomy_compute', sourceClass: 'trusted_specialist',
          sourceId: 'trailverse-astronomy-algorithms-v1', url: null,
          title: 'TrailVerse deterministic astronomy calculation', publishedAt: null, sourceUpdatedAt: null,
        },
        observedAt,
        quality: { authorityClass: 'trusted_specialist', scopeMatch: 'exact', conflictStatus: 'none' },
        provenance: { extractionMethod: 'deterministic_computation', extractorVersion: 'astronomy-evidence-v1' },
      }];
    },
    classifyError(error) {
      if (error?.code === 'ABORT_ERR') return { code: 'provider_cancelled', retryable: false };
      return { code: 'provider_invalid_response', retryable: false };
    },
  };
}

module.exports = { createAstronomyEvidenceProvider };
