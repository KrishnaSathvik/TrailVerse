'use strict';

/**
 * WEB-WAVE ENTRY IS DEMAND-DRIVEN.
 *
 * Measured on the 2026-08-27 THRO creation benchmark, from real span intervals:
 *
 *   structured        11 → 1,122 ms    1,122 ms   25%
 *   web_discovery  1,128 → 3,765 ms    2,637 ms   59%
 *   official_pages 3,766 → 4,507 ms      741 ms   16%
 *                                     ─────────
 *   web waves                          3,378 ms   75% of the evidence wall
 *
 * Exactly three requirements entered wave 2 — `transit`, `events`,
 * `permits_reservations` — and the evidence store shows what 3.4 seconds bought:
 *
 *   events   5 reputable_web rows, no official row: never met its own
 *            `official_owner` authority floor, so it satisfied nothing
 *   transit  the official-page follow returned the park's ACCESSIBILITY page.
 *            Theodore Roosevelt has no shuttle system and no transit page
 *   permits  an official permits page — which `ridb` had already supplied in
 *            wave 1, at 234 ms
 *
 * The traveler asked for wildlife, scenery, photography, relaxed drives and easy
 * walking. None of the three was requested, and none changed the plan.
 *
 * The fix is not faster web acquisition. It is not entering the wave.
 */

const { planEvidenceRequirements } = require('../../../../../src/services/evidencePlannerService');
const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');
const { shouldEnrichResolution } = require('../../../../../src/services/webEvidencePolicyService');

const NOW = new Date('2026-08-27T12:00:00.000Z');
const THRO = {
  entityId: 'nps:park:thro',
  entityType: 'national_park',
  displayName: 'Theodore Roosevelt National Park',
  latitude: 46.979,
  longitude: -103.538,
  resolutionConfidence: 1,
};

const BENCHMARK = 'Plan three easygoing days in Theodore Roosevelt National Park. '
  + 'We care most about wildlife, scenery, photography, and relaxed drives with some easy walking.';

function plan(prompt, extra = {}) {
  return planEvidenceRequirements({
    turnId: 'turn:demand',
    userPrompt: prompt,
    intent: classifyTrailieIntent({ userPrompt: prompt }),
    resolvedEntities: [THRO],
    now: NOW,
    ...extra,
  });
}
const topics = (requirements) => requirements.map((r) => r.topic);

// ---------------------------------------------------------------------------
// §C — transit
// ---------------------------------------------------------------------------

describe('transit is planned on demand, not universally', () => {
  test('ordinary self-drive creation plans no transit', () => {
    expect(topics(plan(BENCHMARK))).not.toContain('transit');
  });

  test('an explicit shuttle question plans it', () => {
    expect(topics(plan('Plan three days at Theodore Roosevelt. How does the shuttle work?')))
      .toContain('transit');
  });

  test('an explicit transit or bus question plans it', () => {
    expect(topics(plan('Plan two days at Theodore Roosevelt using public transit.'))).toContain('transit');
    expect(topics(plan('Plan two days at Theodore Roosevelt. Is there a bus?'))).toContain('transit');
  });

  test('a traveler without a car plans it', () => {
    expect(topics(plan('Plan three days at Theodore Roosevelt without a car.'))).toContain('transit');
  });

  test('a declared car-free transportation state plans it even without the words', () => {
    const requirements = plan(BENCHMARK, {
      constraints: { transportation: { hasCar: false } },
    });
    expect(topics(requirements)).toContain('transit');
  });

  test('a declared car trip does not', () => {
    const requirements = plan(BENCHMARK, {
      constraints: { transportation: { hasCar: true } },
    });
    expect(topics(requirements)).not.toContain('transit');
  });
});

// ---------------------------------------------------------------------------
// §D — events
// ---------------------------------------------------------------------------

describe('events is planned on demand, not universally', () => {
  test('ordinary creation plans no events', () => {
    expect(topics(plan(BENCHMARK))).not.toContain('events');
  });

  test('an explicit ranger-program question plans it', () => {
    expect(topics(plan('Plan three days at Theodore Roosevelt. Are there ranger programs while I am there?')))
      .toContain('events');
  });

  test('explicit event or tour interest plans it', () => {
    expect(topics(plan('Plan two days at Theodore Roosevelt with any special events.'))).toContain('events');
    expect(topics(plan('Plan two days at Theodore Roosevelt including guided tours.'))).toContain('events');
  });

  test('the capability itself is not removed', () => {
    // A direct events question routes to `activities_tours_events`, where the
    // topic is `required` — that branch is untouched by this change.
    const direct = plan('Any ranger programs at Theodore Roosevelt this week?')
      .find((r) => r.topic === 'events');
    expect(direct).toBeDefined();
    expect(direct.criticality).toBe('required');

    // On an ITINERARY turn that mentions programs, it stays optional enrichment.
    const withinPlan = plan('Plan three days at Theodore Roosevelt with ranger programs.')
      .find((r) => r.topic === 'events');
    expect(withinPlan).toBeDefined();
    expect(withinPlan.criticality).toBe('optional');
  });
});

// ---------------------------------------------------------------------------
// §F — importance is not the same as "fetch again"
// ---------------------------------------------------------------------------

describe('shouldEnrichResolution separates unresolved from merely important', () => {
  const permits = {
    topic: 'permits_reservations',
    criticality: 'required',
    reasonCodes: ['itinerary_permit_dependency'],
    minimumAuthorityClass: 'official_operator',
    temporalScope: { mode: 'timeless' },
  };

  test('an authoritative structured result is NOT re-fetched from the web', () => {
    // ridb served this in wave 1 at 234 ms, with the authority the requirement asked for.
    expect(shouldEnrichResolution(permits, {
      status: 'satisfied_stale_safe',
      authorityClasses: ['official_operator'],
      candidateSummary: { insufficientAuthority: 0, conflicted: 0 },
      conflictStatus: 'none',
    })).toBe(false);
  });

  test('an authority-deficient result still enriches', () => {
    // What we SELECTED is only reputable_web, so a web wave can still add to it.
    expect(shouldEnrichResolution(permits, {
      status: 'satisfied_partial',
      authorityClasses: ['reputable_web'],
      candidateSummary: { insufficientAuthority: 3, conflicted: 0 },
      conflictStatus: 'none',
    })).toBe(true);
  });

  // ADEQUACY READS THE SELECTION, NOT THE DISCARD PILE.
  //
  // `candidateSummary.insufficientAuthority` counts candidates the coverage
  // evaluator threw away. Treating that count as an evidence gap made web
  // enrichment self-sustaining: the wave writes reputable_web rows, a
  // decision-critical requirement floored at official_* can never select them,
  // so they sit in cache as permanent rejects and re-trigger the wave forever.
  test('rejected weak candidates do not make an authoritative selection inadequate', () => {
    expect(shouldEnrichResolution(permits, {
      status: 'satisfied_partial',
      authorityClasses: ['official_operator'],
      // Three reputable_web rows a previous web wave left behind.
      candidateSummary: { insufficientAuthority: 3, conflicted: 0 },
      conflictStatus: 'none',
    })).toBe(false);
  });

  test('conflict that leaves nothing selected still enriches, through the status gate', () => {
    // A resolution is only reported `conflicted` when selection came up empty,
    // and that status is admitted before adequacy is ever consulted.
    expect(shouldEnrichResolution(permits, {
      status: 'conflicted',
      authorityClasses: [],
      candidateSummary: { insufficientAuthority: 0, conflicted: 2 },
      conflictStatus: 'open',
    })).toBe(true);
  });

  test('discarded conflicted candidates do not re-trigger a wave on their own', () => {
    // Selection succeeded with official evidence; a web wave can only supply
    // reputable_web, which cannot adjudicate a disagreement between official
    // sources anyway.
    expect(shouldEnrichResolution(permits, {
      status: 'satisfied_partial',
      authorityClasses: ['official_operator'],
      candidateSummary: { insufficientAuthority: 0, conflicted: 2 },
      conflictStatus: 'open',
    })).toBe(false);
  });

  test('an unresolved requirement still enriches — this gate is unchanged', () => {
    for (const status of ['missing', 'unsupported', 'conflicted']) {
      expect(shouldEnrichResolution(permits, { status })).toBe(true);
    }
  });

  test('safety and currentness topics are unaffected', () => {
    const roads = {
      topic: 'roads',
      criticality: 'hard',
      reasonCodes: ['explicit_open_now_question'],
      minimumAuthorityClass: 'official_owner',
      temporalScope: { mode: 'current' },
    };
    // Still enriches when unresolved…
    expect(shouldEnrichResolution(roads, { status: 'missing' })).toBe(true);
    // …and is not re-fetched when an official source already answered it.
    expect(shouldEnrichResolution(roads, {
      status: 'satisfied_stale_safe',
      authorityClasses: ['official_owner'],
      candidateSummary: { insufficientAuthority: 0, conflicted: 0 },
      conflictStatus: 'none',
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §J — coverage
// ---------------------------------------------------------------------------

describe('coverage reflects only what the task legitimately needs', () => {
  const { evaluateEvidenceGate } = require('../../../../../src/services/trailieV2ExecutionService');

  test('a fully served benchmark plan reports complete coverage', () => {
    const requirements = plan(BENCHMARK);
    const gate = evaluateEvidenceGate(requirements, {
      resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh' })),
    });
    expect(gate).toMatchObject({ hardComplete: true, coverage: 'complete' });
  });

  test('nothing unserviceable is planned for the benchmark turn', () => {
    const requirements = plan(BENCHMARK);
    expect(requirements.filter((r) => (r.preferredProviders || []).length === 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §G — no empty waves, proven through the real layered resolver
// ---------------------------------------------------------------------------

describe('zero web demand means zero web waves', () => {
  const { buildEvidenceKeys } = require('../../../../../src/utils/evidenceKey');
  const { createEvidenceBroker } = require('../../../../../src/services/evidenceBrokerService');
  const { createLayeredEvidenceResolver } = require('../../../../../src/services/layeredEvidenceBroker');
  const { createTurnTimeline } = require('../../../../../src/utils/turnTimeline');

  const LIVE_TOPICS = new Set(['alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke']);
  const { OPERATIONAL_NORMALIZATION_QUALIFIER } = require('../../../../../src/utils/evidenceContractVersions');

  function candidate(topic) {
    // `activities` is only coverage-eligible from the v2 extractor when stamped
    // ingestion-complete and with the current normalization contract — the same
    // shape production writes.
    const activities = topic === 'activities';
    return {
      entityId: 'nps:park:thro',
      topic,
      // Must match the requirement's declared evidenceTypes, or the coverage
      // evaluator rejects it and the requirement looks unresolved.
      evidenceType: LIVE_TOPICS.has(topic) ? 'live_state' : 'fact',
      claim: {
        identity: topic, text: topic, normalizedValue: topic, unit: null, status: null,
        subjectId: 'nps:park:thro', objectId: null,
        qualifiers: activities
          ? ['source_ingestion_complete', OPERATIONAL_NORMALIZATION_QUALIFIER]
          : [],
      },
      scope: { geographicEntityIds: ['nps:park:thro'], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
      source: { provider: 'nps', sourceClass: 'official_owner', sourceId: `nps-${topic}`, url: null, title: null },
      quality: { authorityClass: 'official_owner', freshnessStatus: 'fresh', scopeMatch: 'exact', corroboratingEvidenceIds: [], conflictingEvidenceIds: [], conflictStatus: 'none' },
      provenance: {
        extractionMethod: 'structured_adapter',
        extractorVersion: activities ? 'nps-activities-v8' : 'nps-evidence-v1',
        rawPayloadHash: null, contentHash: 'pending',
      },
      observedAt: NOW.toISOString(),
    };
  }

  function makeResolver(supportedTopics) {
    const docs = [];
    const provider = {
      id: 'nps',
      supports: (r) => supportedTopics.includes(r.topic),
      estimateCost: () => ({ costStatus: 'known', costUsd: 0 }),
      buildRequest: (r) => ({
        provider: 'nps', operation: 'parks', parameters: { parkCode: 'thro' },
        dedupeKey: `nps|parks|thro|${r.topic}`,
        publicCanonicalRequest: { provider: 'nps', operation: 'parks', parkCode: 'thro', topic: r.topic },
      }),
      fetch: async () => ({ raw: {}, metadata: { observedAt: NOW.toISOString() }, completeness: { isComplete: true, emptyMeans: 'unknown' }, providerAttempts: 1 }),
      normalize: (_raw, request) => [candidate(request.publicCanonicalRequest.topic)],
      classifyError: () => ({ code: 'provider_unavailable', retryable: false }),
    };
    const broker = createEvidenceBroker({
      providers: [provider],
      queryEvidence: async (r) => docs.filter((d) => d.topic === r.topic && d.isCurrent),
      persistCandidate: async ({ candidate: c }) => {
        const keys = buildEvidenceKeys(c);
        const evidence = { ...c, ...keys, isCurrent: true, provenance: { ...c.provenance, contentHash: keys.contentHash } };
        docs.push(evidence);
        return { outcome: 'created', evidence };
      },
      acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
      releaseLease: async () => ({ released: true }),
      waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
      recordRefreshEvent: async () => {},
      refreshHashSecret: 'wave-gating-secret',
      now: () => NOW,
    });
    return createLayeredEvidenceResolver({ broker, now: () => NOW });
  }

  async function wavesFor(requirements, supportedTopics) {
    const timeline = createTurnTimeline();
    await makeResolver(supportedTopics).resolveEvidence({
      requirements, requestId: 'turn-waves', beginSpan: (stage, meta) => timeline.begin(stage, meta),
    });
    return new Set(timeline.snapshot({ totalMs: 1 }).spans.map((s) => s.wave).filter(Boolean));
  }

  test('a fully structured-served plan runs the structured wave only', async () => {
    const requirements = plan(BENCHMARK);
    const supported = requirements.map((r) => r.topic);
    expect(await wavesFor(requirements, supported)).toEqual(new Set(['structured']));
  });

  test('one genuinely web-only requirement still opens the wave', async () => {
    const requirements = plan('Plan three days at Theodore Roosevelt. How does the shuttle work?');
    // Everything except transit is structured-served.
    const supported = requirements.map((r) => r.topic).filter((t) => t !== 'transit');
    expect(await wavesFor(requirements, supported)).toContain('web_discovery');
  });

  test('the benchmark turn plans nothing that needs a web provider', () => {
    const { WEB_PROVIDER_BY_TOPIC } = require('../../../../../src/services/webEvidencePolicyService');
    const webOnly = plan(BENCHMARK)
      .filter((r) => WEB_PROVIDER_BY_TOPIC[r.topic])
      .filter((r) => !(r.preferredProviders || []).includes('nps'))
      .map((r) => r.topic);
    expect(webOnly).toEqual([]);
  });
});
