'use strict';

const fs = require('fs');
const path = require('path');
const { createAstronomyEvidenceProvider } = require('../providers/astronomyEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');

function requirement({ from = '2026-08-10T00:00:00.000Z', through = '2026-08-11T23:59:59.999Z' } = {}) {
  return {
    requirementId: `req:astro:${from}:${through}`,
    entity: { entityId: 'nps:park:yose', displayName: 'Yosemite National Park', latitude: 37.7459, longitude: -119.5332 },
    topic: 'astronomy',
    temporalScope: { mode: 'date_range', requestedAt: NOW.toISOString(), validFrom: from, validThrough: through, timezone: 'UTC' },
    preferredProviders: ['astronomy_compute'],
  };
}

describe('WP5C Astronomy evidence provider', () => {
  test('supports bounded date/location requirements and rejects missing scope', () => {
    const provider = createAstronomyEvidenceProvider();
    expect(provider.supports(requirement())).toBe(true);
    expect(provider.supports({ ...requirement(), topic: 'weather_forecast' })).toBe(false);
    expect(provider.supports({ ...requirement(), temporalScope: { mode: 'timeless' } })).toBe(false);
    expect(provider.supports({ ...requirement(), entity: { entityId: 'nps:park:yose' } })).toBe(false);
  });

  test('physical identity is deterministic for coordinates and exact date range', () => {
    const provider = createAstronomyEvidenceProvider();
    const base = provider.buildRequest(requirement());
    const later = provider.buildRequest(requirement({ from: '2026-08-12T00:00:00.000Z', through: '2026-08-12T23:59:59.999Z' }));
    expect(base.dedupeKey).toBe('astronomy_compute|37.7459|-119.5332|2026-08-10|2026-08-11');
    expect(later.dedupeKey).not.toBe(base.dedupeKey);
    expect(provider.estimateCost(base)).toEqual({ costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 });
  });

  test('undated trip null scope does not become January 1970 astronomy', () => {
    const provider = createAstronomyEvidenceProvider();
    const undated = requirement({ from: null, through: null });
    expect(provider.supports(undated)).toBe(false);
    expect(() => provider.buildRequest(undated)).toThrow('Unsupported Astronomy');
    expect(provider.supports(requirement({ through: null }))).toBe(true);
  });

  test('computes repeatable scoped astronomy evidence without network activity', async () => {
    const engine = {
      calculateMoonPhase: jest.fn((date) => ({
        phase: date.getUTCDate() === 10 ? 'Waning Crescent' : 'New Moon',
        illumination: date.getUTCDate() === 10 ? 12 : 2,
        age: 27.1,
        nextNewMoon: new Date('2026-08-12T00:00:00.000Z'),
        nextFullMoon: new Date('2026-08-26T00:00:00.000Z'),
      })),
      calculateMilkyWayVisibility: jest.fn(() => 'Excellent'),
    };
    const provider = createAstronomyEvidenceProvider({ astronomyEngine: engine, now: () => NOW });
    const request = provider.buildRequest(requirement());
    const first = await provider.fetch(request);
    const second = await provider.fetch(request);
    const candidates = provider.normalize(first.raw, request, first.metadata);

    expect(second.raw).toEqual(first.raw);
    expect(engine.calculateMoonPhase).toHaveBeenCalledTimes(4);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      entityId: 'nps:park:yose', topic: 'astronomy', evidenceType: 'fact',
      claim: {
        identity: 'astronomy:nps:park:yose:37.7459:-119.5332:2026-08-10:2026-08-11',
        status: 'computed',
        normalizedValue: { days: [{ date: '2026-08-10', moonPhase: 'Waning Crescent' }, { date: '2026-08-11', moonPhase: 'New Moon' }] },
      },
      scope: { validFrom: '2026-08-10T00:00:00.000Z', validThrough: '2026-08-11T23:59:59.999Z' },
      source: { provider: 'astronomy_compute', sourceClass: 'trusted_specialist' },
    });
  });

  test('adapter imports no broker, store, model, prompt, or paid provider', () => {
    const source = fs.readFileSync(path.join(__dirname, '../providers/astronomyEvidenceProvider.js'), 'utf8');
    expect(source).not.toMatch(/mongoose|models\/|evidenceStore|evidenceCoverage|require\(['"]axios|https?:\/\/|prompt/i);
  });
});
