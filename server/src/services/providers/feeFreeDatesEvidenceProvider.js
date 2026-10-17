'use strict';

const CALENDAR_METADATA = Object.freeze({
  2026: Object.freeze({ version: 'nps-2026-v1', status: 'verified', authorityClass: 'official_owner' }),
  2027: Object.freeze({ version: 'trailverse-projected-2027-v1', status: 'projected', authorityClass: 'trusted_specialist' }),
});

function targetYear(requirement) {
  const value = requirement?.temporalScope?.validFrom || requirement?.temporalScope?.requestedAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

function defaultCalendarSource() {
  const { FEE_FREE_DAYS_BY_YEAR } = require('../feeFreeDaysService');
  return {
    getCalendar(year) {
      const metadata = CALENDAR_METADATA[year];
      const days = FEE_FREE_DAYS_BY_YEAR[year];
      return metadata && days ? { year, ...metadata, days } : null;
    },
  };
}

function createFeeFreeDatesEvidenceProvider({ calendarSource = null, now = () => new Date() } = {}) {
  const source = () => calendarSource || defaultCalendarSource();
  const calendarFor = (year) => source().getCalendar(year);
  return {
    id: 'fee_free_calendar',
    supports(requirement) {
      const year = targetYear(requirement);
      return requirement?.topic === 'fee_free_dates' && Boolean(year && CALENDAR_METADATA[year]);
    },
    estimateCost() {
      return { costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 };
    },
    buildRequest(requirement) {
      const year = targetYear(requirement);
      const metadata = year && CALENDAR_METADATA[year];
      if (requirement?.topic !== 'fee_free_dates' || !metadata) throw new TypeError('Unsupported fee-free calendar requirement');
      const parameters = {
        entityId: requirement.entity?.entityId,
        displayName: requirement.entity?.displayName || null,
        year, ...metadata,
      };
      return {
        provider: 'fee_free_calendar', operation: 'read_versioned_calendar', parameters,
        // Each requirement is entity-scoped (candidates carry geographicEntityIds:
        // [entityId]), so the dedupeKey MUST include the entity — the national
        // calendar is read per-park, but two parks in one turn must not collide.
        dedupeKey: `fee_free_calendar|${requirement.entity?.entityId}|${year}|${metadata.version}`,
        publicCanonicalRequest: {
          provider: 'fee_free_calendar', operation: 'read_versioned_calendar', year, version: metadata.version,
        },
      };
    },
    async fetch(request, { signal } = {}) {
      if (signal?.aborted) throw Object.assign(new Error('Fee-free calendar read cancelled'), { code: 'ABORT_ERR' });
      const raw = calendarFor(request.parameters.year);
      if (!raw || raw.version !== request.parameters.version) {
        throw Object.assign(new Error('Fee-free calendar version is unavailable'), { code: 'calendar_version_unavailable' });
      }
      return {
        raw, metadata: { readAt: now().toISOString() },
        completeness: { isComplete: true, topics: ['fee_free_dates'], emptyMeans: 'unknown' },
        providerAttempts: 1,
      };
    },
    normalize(raw, request, metadata = {}) {
      if (!raw || !Array.isArray(raw.days) || raw.days.length === 0) return [];
      const { entityId, displayName, year, version, status, authorityClass } = request.parameters;
      const sourceId = `${status === 'verified' ? 'nps' : 'trailverse'}-fee-free-calendar:${year}:${version}`;
      const qualifiers = status === 'verified'
        ? ['official_nps_schedule', 'entrance_fees_only']
        : ['projected_calendar', 'not_official_schedule', 'verify_with_owning_agency'];
      return [{
        entityId, topic: 'fee_free_dates', evidenceType: 'rule',
        claim: {
          identity: `nps-fee-free-calendar:${year}:${version}`,
          text: `${displayName || 'NPS site'} fee-free entrance dates for ${year}`,
          normalizedValue: {
            year, version, days: raw.days.map((day) => ({ date: day.date, label: day.label })),
            waives: 'entrance_fees_only', reservationsAndPermitsWaived: false,
          },
          unit: null, status, subjectId: entityId, objectId: 'nps:policy:fee-free-entrance', qualifiers,
        },
        scope: {
          geographicEntityIds: [entityId], validFrom: `${year}-01-01T00:00:00.000Z`,
          validThrough: `${year}-12-31T23:59:59.999Z`, audience: 'public', locale: 'en-US',
        },
        source: {
          provider: 'fee_free_calendar', sourceClass: authorityClass, sourceId,
          url: status === 'verified' ? 'https://www.nps.gov/planyourvisit/fee-free-parks.htm' : null,
          title: status === 'verified' ? `NPS ${year} fee-free entrance days` : `TrailVerse projected ${year} fee-free dates`,
          publishedAt: null, sourceUpdatedAt: null,
        },
        observedAt: metadata.readAt || now().toISOString(),
        quality: { authorityClass, scopeMatch: 'exact', conflictStatus: 'none' },
        provenance: { extractionMethod: 'versioned_public_calendar', extractorVersion: 'fee-free-evidence-v1' },
      }];
    },
    classifyError(error) {
      if (error?.code === 'ABORT_ERR') return { code: 'provider_cancelled', retryable: false };
      return { code: 'provider_not_configured', retryable: false };
    },
  };
}

module.exports = { CALENDAR_METADATA, createFeeFreeDatesEvidenceProvider };
