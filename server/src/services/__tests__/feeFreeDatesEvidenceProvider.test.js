'use strict';

const fs = require('fs');
const path = require('path');
const { createFeeFreeDatesEvidenceProvider } = require('../providers/feeFreeDatesEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');

function requirement(year = 2026, entityId = 'nps:park:yose') {
  return {
    requirementId: `req:fee-free:${year}:${entityId}`,
    entity: { entityId, displayName: 'Yosemite National Park' },
    topic: 'fee_free_dates',
    temporalScope: {
      mode: 'date_range', requestedAt: NOW.toISOString(),
      validFrom: `${year}-01-01T00:00:00.000Z`, validThrough: `${year}-12-31T23:59:59.999Z`, timezone: 'UTC',
    },
    preferredProviders: ['fee_free_calendar'],
  };
}

describe('WP5C fee-free date evidence provider', () => {
  test('uses calendar year and immutable version in physical identity', () => {
    const provider = createFeeFreeDatesEvidenceProvider({ now: () => NOW });
    const verified = provider.buildRequest(requirement(2026));
    const projected = provider.buildRequest(requirement(2027));
    expect(verified.dedupeKey).toBe('fee_free_calendar|nps:park:yose|2026|nps-2026-v1');
    expect(projected.dedupeKey).toBe('fee_free_calendar|nps:park:yose|2027|trailverse-projected-2027-v1');
    expect(provider.estimateCost(verified)).toEqual({ costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 });
  });

  // Regression (WP11B): two different parks in one turn must NOT share a dedupeKey.
  // The physical fetch reads the same national calendar, but each requirement is
  // entity-scoped, so the dedupeKey must include the entity — otherwise the broker
  // sees same-dedupeKey + different-fingerprint and throws evidence_refresh_dedupe_collision.
  test('distinct parks yield distinct dedupeKeys (no multi-destination collision)', () => {
    const provider = createFeeFreeDatesEvidenceProvider({ now: () => NOW });
    const yell = provider.buildRequest(requirement(2026, 'nps:park:yell'));
    const grte = provider.buildRequest(requirement(2026, 'nps:park:grte'));
    expect(yell.dedupeKey).not.toBe(grte.dedupeKey);
    expect(yell.dedupeKey).toContain('nps:park:yell');
    expect(grte.dedupeKey).toContain('nps:park:grte');
  });

  test('normalizes verified NPS dates as stable official-owner public evidence', async () => {
    const provider = createFeeFreeDatesEvidenceProvider({ now: () => NOW });
    const request = provider.buildRequest(requirement(2026));
    const fetched = await provider.fetch(request);
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      entityId: 'nps:park:yose', topic: 'fee_free_dates', evidenceType: 'rule',
      claim: {
        identity: 'nps-fee-free-calendar:2026:nps-2026-v1', status: 'verified',
        normalizedValue: {
          year: 2026, version: 'nps-2026-v1',
          days: expect.arrayContaining([{ date: '2026-11-11', label: 'Veterans Day' }]),
          waives: 'entrance_fees_only', reservationsAndPermitsWaived: false,
        },
      },
      scope: { validFrom: '2026-01-01T00:00:00.000Z', validThrough: '2026-12-31T23:59:59.999Z' },
      source: { provider: 'fee_free_calendar', sourceClass: 'official_owner', sourceId: 'nps-fee-free-calendar:2026:nps-2026-v1' },
      quality: { authorityClass: 'official_owner' },
    });
  });

  test('marks projected dates below owning-agency authority', async () => {
    const provider = createFeeFreeDatesEvidenceProvider({ now: () => NOW });
    const request = provider.buildRequest(requirement(2027));
    const fetched = await provider.fetch(request);
    const [candidate] = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidate).toMatchObject({
      claim: { status: 'projected', qualifiers: expect.arrayContaining(['not_official_schedule']) },
      source: { sourceClass: 'trusted_specialist' },
      quality: { authorityClass: 'trusted_specialist' },
    });
  });

  test('adapter is a local versioned source with no broker, model, prompt, or HTTP imports', () => {
    const source = fs.readFileSync(path.join(__dirname, '../providers/feeFreeDatesEvidenceProvider.js'), 'utf8');
    expect(source).not.toMatch(/mongoose|models\/|evidenceStore|evidenceCoverage|require\(['"](?:axios|https|http)|prompt/i);
  });
});
