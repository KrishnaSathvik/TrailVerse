'use strict';

/**
 * §C — "NOTHING IS WRONG" MUST BE AN ANSWER.
 *
 * A hard requirement that goes unmet terminates the turn with
 * `evidence_incomplete` before any model dispatch. So if `wildfire_smoke` can
 * only be satisfied by finding a smoke alert, then "is there smoke?" answers
 * with nothing at all in the common, good case where the park is fine.
 *
 * The broker already knew how to turn a COMPLETE empty feed into a negative
 * claim. It could not do so per topic: the NPS alerts feed is rarely empty
 * overall, but is very often empty OF FIRE. This closes that gap.
 *
 * Offline: pure provider + broker functions only.
 */

const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');

const NOW = new Date('2026-08-26T12:00:00.000Z');
const THRO = {
  entityId: 'nps:park:thro',
  entityType: 'national_park',
  displayName: 'Theodore Roosevelt National Park',
};

const nps = createNpsEvidenceProvider({});

function requirement(topic, overrides = {}) {
  return {
    requirementId: `req:absence:${topic}`,
    turnId: 'turn:absence',
    topic,
    entity: THRO,
    evidenceTypes: ['live_state'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'live',
    maxAgeSeconds: 900,
    maxStaleSeconds: 0,
    criticality: 'hard',
    absenceSemantics: 'proves_absent',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
    preferredProviders: ['nps'],
    allowedFallbackProviders: [],
    privacyScope: 'public',
    reasonCodes: [],
    ...overrides,
  };
}

/** A park with real alerts, none of which are about fire. */
const ALERTS_WITHOUT_FIRE = [
  { id: 'a1', title: 'Wind Canyon Trail temporarily closed', category: 'Closure', description: 'Trail damage after storms.' },
  { id: 'a2', title: 'Entrance fees increase in October', category: 'Information', description: 'New fee schedule.' },
];

describe('the alerts fetch reports per-topic completeness', () => {
  test('completeness names every topic the alerts feed can answer', async () => {
    const service = { getParkAlerts: async () => ALERTS_WITHOUT_FIRE };
    const provider = createNpsEvidenceProvider({ npsClient: service, now: () => NOW });
    const request = provider.buildRequest(requirement('alerts_closures'));
    const fetched = await provider.fetch(request, {});
    expect(fetched.completeness.topics.sort()).toEqual(
      ['alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke']
    );
  });

  test('a complete feed with no fire alert marks wildfire_smoke empty', async () => {
    const service = {
      getParkAlertsEvidence: async () => ({ data: ALERTS_WITHOUT_FIRE, isComplete: true, observedAt: NOW.toISOString() }),
    };
    const provider = createNpsEvidenceProvider({ npsClient: service, now: () => NOW });
    const request = provider.buildRequest(requirement('wildfire_smoke'));
    const fetched = await provider.fetch(request, {});

    expect(fetched.completeness.isComplete).toBe(true);
    expect(fetched.completeness.emptyTopics).toContain('wildfire_smoke');
    // …but NOT the topics that did have matching alerts.
    expect(fetched.completeness.emptyTopics).not.toContain('trail_conditions');
    expect(fetched.completeness.emptyTopics).not.toContain('alerts_closures');
  });

  test('an INCOMPLETE feed proves nothing', async () => {
    const service = {
      getParkAlertsEvidence: async () => ({ data: ALERTS_WITHOUT_FIRE, isComplete: false, observedAt: NOW.toISOString() }),
    };
    const provider = createNpsEvidenceProvider({ npsClient: service, now: () => NOW });
    const fetched = await provider.fetch(provider.buildRequest(requirement('wildfire_smoke')), {});
    expect(fetched.completeness.isComplete).toBe(false);
    expect(fetched.completeness.emptyTopics || []).toEqual([]);
  });
});

describe('absence becomes a satisfiable negative claim', () => {
  function makeBroker(service) {
    const docs = [];
    const provider = createNpsEvidenceProvider({ npsClient: service, now: () => NOW });
    const broker = createEvidenceBroker({
      providers: [provider],
      queryEvidence: async (req) => docs.filter((d) => d.entityId === req.entity.entityId && d.topic === req.topic && d.isCurrent),
      persistCandidate: async ({ candidate }) => {
        const keys = buildEvidenceKeys(candidate);
        const evidence = { ...candidate, ...keys, isCurrent: true, provenance: { ...candidate.provenance, contentHash: keys.contentHash } };
        docs.push(evidence);
        return { outcome: 'created', evidence };
      },
      acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
      releaseLease: async () => ({ released: true }),
      waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
      recordRefreshEvent: async () => {},
      refreshHashSecret: 'absence-test-secret',
      now: () => NOW,
    });
    return { broker, docs };
  }

  test('"is there smoke" is satisfied when a complete feed has no fire alert', async () => {
    const { broker } = makeBroker({
      getParkAlertsEvidence: async () => ({ data: ALERTS_WITHOUT_FIRE, isComplete: true, observedAt: NOW.toISOString() }),
    });
    const bundle = await broker.resolveEvidence({
      requirements: [requirement('wildfire_smoke')],
      requestId: 'turn:absence:smoke',
    });
    const [resolution] = bundle.resolutions;
    expect(String(resolution.status)).toMatch(/^satisfied_/);

    const claim = bundle.evidence.find((item) => item.topic === 'wildfire_smoke')?.claim;
    expect(claim.polarity).toBe('negative');
    expect(claim.normalizedValue).toBe(false);
  });

  test('a real fire alert is a positive claim, not an absence', async () => {
    const { broker } = makeBroker({
      getParkAlertsEvidence: async () => ({
        data: [{ id: 'f1', title: 'Wildfire smoke advisory', category: 'Caution', description: 'Smoke is affecting air quality.' }],
        isComplete: true,
        observedAt: NOW.toISOString(),
      }),
    });
    const bundle = await broker.resolveEvidence({
      requirements: [requirement('wildfire_smoke')],
      requestId: 'turn:absence:fire',
    });
    const claim = bundle.evidence.find((item) => item.topic === 'wildfire_smoke')?.claim;
    expect(claim.polarity).not.toBe('negative');
    expect(claim.text).toMatch(/smoke/i);
  });

  test('a requirement that does not accept absence is unaffected', async () => {
    const { broker } = makeBroker({
      getParkAlertsEvidence: async () => ({ data: ALERTS_WITHOUT_FIRE, isComplete: true, observedAt: NOW.toISOString() }),
    });
    const bundle = await broker.resolveEvidence({
      requirements: [requirement('wildfire_smoke', { absenceSemantics: 'unknown' })],
      requestId: 'turn:absence:optout',
    });
    expect(bundle.evidence.filter((item) => item.topic === 'wildfire_smoke')).toHaveLength(0);
  });
});
