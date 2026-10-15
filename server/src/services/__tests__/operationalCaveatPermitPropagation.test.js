'use strict';

const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');

const now = new Date('2026-10-05T12:00:00Z');
const observation = {
  observedAt: now.toISOString(),
  expiresAt: new Date(+now + 86400000).toISOString(),
};

test('reservation_required operational fact survives onto accepted stop operationalCaveats', () => {
  const evidence = [normalizeEvidenceLocation({
    evidenceId: 'e-angels',
    topic: 'activities',
    entityId: 'nps:place:angels',
    claim: {
      identity: 'nps:place:angels',
      status: 'resolved_place_identity',
      normalizedValue: {
        name: 'Angels Landing',
        countryCode: 'US',
        latitude: 37.269,
        longitude: -112.948,
        operationalFacts: [{
          subject: { entityId: 'nps:place:angels', name: 'Angels Landing', parkCode: 'zion' },
          type: 'reservation_required',
          requirement: 'a permit',
          text: 'A permit is required for Angels Landing.',
          confidence: 'official_text',
          provenance: { authority: 'official_owner', field: 'bodyText', sourceUrl: 'https://www.nps.gov/zion/' },
          observedAt: now.toISOString(),
          subjects: ['Angels Landing'],
        }],
      },
    },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'nps:place:angels' },
    observation,
  })];

  const result = validateSimpleMutation({
    proposal: {
      response: 'A Zion day with Angels Landing.',
      plan: {
        intro: 'A Zion day.',
        days: [{
          id: 'd1',
          dayNumber: 1,
          label: 'Day 1',
          overnightLocation: 'Springdale',
          stops: [{
            id: 's1',
            order: 1,
            type: 'trail',
            name: 'Angels Landing',
            note: '',
            startTime: '',
            timeWindow: 'Morning',
            duration: 240,
            evidenceRef: 'e-angels',
          }],
          dayStructure: {
            type: 'sightseeing',
            startPeriod: 'morning',
            endPeriod: 'evening',
            summary: 'Permit hike day.',
            blocks: [
              {
                kind: 'outing',
                periods: ['morning', 'afternoon'],
                label: 'Angels Landing',
                note: 'The signature hike.',
                stopIds: ['s1'],
              },
              {
                kind: 'downtime',
                periods: ['evening'],
                label: 'Recovery',
                note: 'Dinner and rest.',
                stopIds: [],
              },
            ],
          },
        }],
      },
    },
    message: 'Plan Zion with Angels Landing.',
    evidence,
    now,
  });

  expect(result.ok).toBe(true);
  const caveats = result.plan.days[0].stops[0].operationalCaveats || [];
  expect(caveats.map((c) => c.type)).toContain('reservation_required');
  expect(caveats.find((c) => c.type === 'reservation_required')?.text)
    .toMatch(/permit is required/i);
});
