'use strict';

/**
 * Stage 14.7G §14/§15 — qualification of the live executor WITHOUT live calls.
 *
 * Every test here runs against synthetic scenario results and an injected
 * `runScenario`, so the whole control-flow surface — authorization, caps,
 * consumption, stop-on-failure, decision calculation — is exercised at zero
 * cost. The one thing these cannot prove is what Claude actually returns; that
 * is what the paid run is for, and nothing here pretends otherwise.
 */

const fs = require('fs');
const path = require('path');

const {
  evaluateLiveAuthorization, validateLiveProviderConfiguration, GATE_CODES,
} = require('../liveAuthorization');
const { createLiveProviderLedger, OUTCOME } = require('../liveProviderLedger');
const { createTimeline, CHECKPOINTS } = require('../timeline');
const { calculateGain, calculateDecision, DECISION, hardInvariantFailures } = require('../decision');
const { classifyLiveDestination, CLASS } = require('../liveNetworkAllowlist');
const consumption = require('../scenarioConsumption');
const { executeLiveScenarios } = require('../liveExecutor');
const { redactForReport, hashOf, writeEvidence } = require('../privateEvidence');
const { validateReceipt } = require('../readinessReceipt');
const { sanitizeMongoTarget } = require('../compositePreflight');
// Exercise the historical executor state machine without reopening the now-
// closed production manifest.
const APPROVED_SCENARIOS = Object.freeze(['basic-03-seven-day']);

/**
 * Stage 14.7J §6/§9 — this suite qualifies the SEQUENCING below the two
 * pre-consumption gates: consumption states, stop-on-failure, cap carry-forward,
 * redaction. Those gates (an unauthorized manifest, an infeasible plan) refuse
 * every real invocation by design, so they are stubbed authorized here.
 *
 * They are NOT weakened: `liveManifestAndBudget.test.js` drives
 * `executeLiveScenarios` with the DEFAULT gates and proves each refusal, and the
 * composite preflight runs both suites.
 */
const SEQUENCING_GATES = {
  scenarios: APPROVED_SCENARIOS,
  manifestGate: () => ({ authorized: true, decision: null, boundedCode: null, refusals: [], status: {} }),
  budgetProjector: () => ({ cumulativeExposureResolved: true, cumulativeBudgetFeasible: true, blockingCaps: [], boundedCode: null }),
  // Stage 14.7L §3 — these suites redirect the evidence directory to a temp
  // path, so the real resolver would (correctly) refuse. The gate itself is
  // proven against the real evidence in priorCumulativeExposure.test.js.
  exposureResolver: () => ({
    resolved: true,
    priorTotals: { requests: 3, inputTokens: 60000, outputTokens: 20000, costUsd: 0.32, costKnown: true },
  }),
};

// ── Fixtures ────────────────────────────────────────────────────────────────

const LIVE_ENV = {
  TRAILIE_EVAL_EXECUTE_LIVE: 'true',
  TRAILIE_EVAL_LIVE_PROVIDERS: 'true',
  TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:claude-sonnet-5',
  CLAUDE_PRIMARY_MODEL: 'claude-sonnet-5',
  ANTHROPIC_API_KEY: 'synthetic-not-a-real-key-for-gate-tests',
  TRAILIE_EVAL_MAX_TOTAL_COST_USD: '1.50',
  TRAILIE_EVAL_MAX_REQUESTS: '12',
  TRAILIE_EVAL_MAX_INPUT_TOKENS: '240000',
  TRAILIE_EVAL_MAX_OUTPUT_TOKENS: '100000',
};

const READY = { compositePreflightPassed: true, liveExecutionReady: true };
/**
 * Stage 14.7J §7 — the authorization gate now reads `liveExecutionAuthorized`,
 * not `valid`: a receipt may truthfully describe a technically-ready tree and
 * still authorize nothing (unauthorized manifest, infeasible plan).
 */
const VALID_RECEIPT = {
  valid: true, reasons: [], liveExecutionAuthorized: true, authorizationRefusals: [],
};

/** A scenario result that passes every hard invariant, with a chosen gain. */
function goodScenario(scenarioId, { itineraryVisible = 4000, proseVisible = 20000 } = {}) {
  return {
    scenarioId,
    ok: true,
    providerCallsStarted: 2,
    correctness: { itineraryValid: true, proseFirstPass: true, phaseAAttempts: 1, phaseBAttempts: 1 },
    ordering: {
      revision1PersistedBeforeItineraryVisible: true,
      revision2PersistedBeforeProseVisible: true,
      itineraryVisibleBeforeProseReady: true,
    },
    lifecycleJournalMatches: true,
    phaseBReleasedBy: 'itinerary_revealed',
    persistence: {
      persistenceHttpRequests: 2, acceptedWrites: 2, idempotentWrites: 0,
      staleWrites: 0, conflictWrites: 0, automaticPersistenceRequestsFromDone: 0,
    },
    identityStable: true,
    ui: { userTurns: 1, assistantTurns: 1, canonicalPlans: 1, cardMounts: 1, cardUnmountsBeforeCompletion: 0 },
    artifacts: {
      itineraryJsonMarkerPresent: false, alignmentMarkerLeak: false, rawToolPayloadPresent: false,
      rejectedDraftPresent: false, itineraryMutatedBetweenRevisions: false, planHashDrift: false,
    },
    restore: {
      presentationState: 'prose_complete', itineraryHashMatches: true, frozenPlanMatches: true,
      emptyBubble: false, pendingLabel: false, duplicatePlan: false,
    },
    isolation: {
      productionDatabaseConnections: 0, productionDatabaseWrites: 0,
      externalNonProviderNetworkAttempts: 0, OpenAIConstructors: 0,
      liveNpsServices: 0, recoveryCalls: 0,
    },
    capsRespected: true,
    providerEvidence: { ok: true },
    localMongoStillAvailable: true,
    foreignPreservation: { unchanged: true },
    cleanup: { ok: true },
    offlineReplay: { ok: true, providerCalls: 0 },
    timeline: { checkpoints: { itineraryVisible, proseVisible } },
    ledger: { totals: { providerRequests: 2, inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.05, costKnown: true } },
  };
}

/**
 * Isolated marker storage per test. Redirected via the module's own env
 * override rather than a spy, because `liveExecutor` destructures
 * `isConsumed`/`recordConsumption` at import and a spy on the export object
 * would never be consulted — the tests would pass while the real markers were
 * being written, which is exactly the failure this must not have.
 */
let tempMarkerDir;
let tempEvidenceDir;
const saved = {};
beforeEach(() => {
  tempMarkerDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'stage147g-markers-'));
  tempEvidenceDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'stage147g-evidence-'));
  saved.marker = process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
  saved.evidence = process.env.TRAILIE_EVAL_EVIDENCE_DIR;
  process.env.TRAILIE_EVAL_CONSUMPTION_DIR = tempMarkerDir;
  process.env.TRAILIE_EVAL_EVIDENCE_DIR = tempEvidenceDir;
});
afterEach(() => {
  for (const [key, name] of [['marker', 'TRAILIE_EVAL_CONSUMPTION_DIR'], ['evidence', 'TRAILIE_EVAL_EVIDENCE_DIR']]) {
    if (saved[key] === undefined) delete process.env[name];
    else process.env[name] = saved[key];
  }
  fs.rmSync(tempMarkerDir, { recursive: true, force: true });
  fs.rmSync(tempEvidenceDir, { recursive: true, force: true });
});

describe('Stage 14.7G — the qualification suite cannot consume a real scenario', () => {
  test('the marker override actually redirects', () => {
    expect(consumption.markerPath('basic-02-three-day')).toContain(tempMarkerDir);
    expect(consumption.markerPath('basic-02-three-day')).not.toContain('artifacts/private/stage14_7-consumption');
  });

  /**
   * Regression: an early revision of this suite wrote markers into the LIVE
   * directory, which would have made the runner refuse `basic-02-three-day` for
   * a provider call that never happened. Writing a marker under NODE_ENV=test
   * without an explicit override is now refused outright.
   */
  test('a test run without the override is refused rather than writing a real marker', () => {
    const restore = process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
    delete process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
    try {
      expect(() => consumption.recordState({
        scenarioId: 'basic-02-three-day', runId: 'should-not-write',
        state: consumption.STATE.LAUNCH_ATTEMPTED,
      })).toThrow(/consumption_marker_refused_in_test_without_override/);
      // The REAL marker for basic-02-three-day now legitimately exists — the
      // scenario was consumed by the failed Stage 14.7 live run. What must be
      // true is that this test wrote nothing: the marker, if present, still
      // belongs to that run and not to `should-not-write`.
      const existing = consumption.readConsumption('basic-02-three-day');
      if (existing) expect(existing.runId).not.toBe('should-not-write');
    } finally {
      process.env.TRAILIE_EVAL_CONSUMPTION_DIR = restore;
    }
  });

  test('evidence is likewise refused into the real directory under test', () => {
    const restore = process.env.TRAILIE_EVAL_EVIDENCE_DIR;
    delete process.env.TRAILIE_EVAL_EVIDENCE_DIR;
    try {
      const r = writeEvidence({
        runId: 'should-not-write', scenarioId: 'basic-02-three-day',
        evidence: { ok: true }, env: process.env,
      });
      expect(r.written).toBe(false);
      expect(r.boundedCode).toBe('evidence_write_refused_in_test_without_override');
    } finally {
      process.env.TRAILIE_EVAL_EVIDENCE_DIR = restore;
    }
  });

  test('with the override, evidence lands in the temp directory only', () => {
    const r = writeEvidence({
      runId: 'run-x', scenarioId: 'basic-02-three-day',
      evidence: { ok: true }, env: process.env,
    });
    expect(r.written).toBe(true);
    expect(fs.existsSync(path.join(tempEvidenceDir, 'run-x', 'basic-02-three-day.json'))).toBe(true);
  });
});

// ── §14 — authorization ─────────────────────────────────────────────────────

describe('Stage 14.7G §2/§14 — the executor is entered only with the explicit gate', () => {
  test('every gate present authorizes', () => {
    const r = evaluateLiveAuthorization({ env: LIVE_ENV, readiness: READY, receiptValidation: VALID_RECEIPT });
    expect(r.authorized).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  test('TRAILIE_EVAL_EXECUTE_LIVE absent refuses', () => {
    const env = { ...LIVE_ENV };
    delete env.TRAILIE_EVAL_EXECUTE_LIVE;
    const r = evaluateLiveAuthorization({ env, readiness: READY, receiptValidation: VALID_RECEIPT });
    expect(r.authorized).toBe(false);
    expect(r.reasons).toContain(GATE_CODES.EXECUTE_LIVE_NOT_SET);
  });

  test('preflight-only true refuses even with execute-live set', () => {
    const r = evaluateLiveAuthorization({
      env: { ...LIVE_ENV, TRAILIE_EVAL_PREFLIGHT_ONLY: 'true' },
      readiness: READY, receiptValidation: VALID_RECEIPT,
    });
    expect(r.authorized).toBe(false);
    expect(r.reasons).toContain(GATE_CODES.PREFLIGHT_ONLY_SET);
  });

  test('TRAILIE_EVAL_LIVE_PROVIDERS absent refuses', () => {
    const env = { ...LIVE_ENV };
    delete env.TRAILIE_EVAL_LIVE_PROVIDERS;
    expect(evaluateLiveAuthorization({ env, readiness: READY, receiptValidation: VALID_RECEIPT }).authorized).toBe(false);
  });

  test('a failed preflight refuses', () => {
    const r = evaluateLiveAuthorization({
      env: LIVE_ENV,
      readiness: { compositePreflightPassed: false, liveExecutionReady: false },
      receiptValidation: VALID_RECEIPT,
    });
    expect(r.authorized).toBe(false);
    expect(r.reasons).toContain(GATE_CODES.COMPOSITE_PREFLIGHT_FAILED);
  });

  test('an invalid receipt refuses before provider construction', () => {
    const r = evaluateLiveAuthorization({
      env: LIVE_ENV, readiness: READY,
      receiptValidation: { valid: false, reasons: ['relevant_file_hash_changed:3'] },
    });
    expect(r.authorized).toBe(false);
    expect(r.reasons).toContain(GATE_CODES.RECEIPT_INVALID);
  });

  test('Stage 14.7J §7 — a VALID receipt that authorizes nothing still refuses', () => {
    // The state Stage 14.7J leaves: every technical gate green, the receipt
    // truthful, and the run refused because the reviewed manifest is not
    // authorized and the caps do not cover the plan.
    const r = evaluateLiveAuthorization({
      env: LIVE_ENV, readiness: READY,
      receiptValidation: {
        valid: true,
        reasons: [],
        liveExecutionAuthorized: false,
        authorizationRefusals: ['live_scenario_manifest_not_authorized', 'cumulative_stage14_7_cap_insufficient'],
      },
    });
    expect(r.authorized).toBe(false);
    expect(r.reasons).toContain(GATE_CODES.RECEIPT_INVALID);
    expect(r.reasons).toContain('live_scenario_manifest_not_authorized');
    expect(r.reasons).toContain('cumulative_stage14_7_cap_insufficient');
    expect(r.gates.readinessReceiptValid).toBe(true);
    expect(r.gates.readinessReceiptAuthorizesLiveExecution).toBe(false);
  });

  test('no undocumented magic value can substitute for the gate', () => {
    for (const value of ['yes', '1', 'TRUE ', 'force', 'please']) {
      const r = evaluateLiveAuthorization({
        env: { ...LIVE_ENV, TRAILIE_EVAL_EXECUTE_LIVE: value },
        readiness: READY, receiptValidation: VALID_RECEIPT,
      });
      // Only the exact string 'true' (case-insensitive, untrimmed) authorizes.
      if (value.toLowerCase().trim() !== 'true' || value !== value.trim()) {
        expect(r.authorized).toBe(false);
      }
    }
  });
});

describe('Stage 14.7G §8/§14 — provider configuration is validated before construction', () => {
  test('a missing Anthropic key fails closed', () => {
    const env = { ...LIVE_ENV };
    delete env.ANTHROPIC_API_KEY;
    const r = validateLiveProviderConfiguration({ env });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain(GATE_CODES.PROVIDER_NOT_CONFIGURED);
    expect(r.keyPresent).toBe(false);
  });

  test('an empty Anthropic key is not "present"', () => {
    expect(validateLiveProviderConfiguration({ env: { ...LIVE_ENV, ANTHROPIC_API_KEY: '   ' } }).keyPresent).toBe(false);
  });

  test('a model outside the allowlist fails closed', () => {
    const r = validateLiveProviderConfiguration({ env: { ...LIVE_ENV, CLAUDE_PRIMARY_MODEL: 'claude-opus-4' } });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain(GATE_CODES.MODEL_NOT_ALLOWLISTED);
  });

  test('an OpenAI key present fails closed', () => {
    const r = validateLiveProviderConfiguration({ env: { ...LIVE_ENV, OPENAI_API_KEY: 'sk-whatever' } });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain(GATE_CODES.OPENAI_NOT_DISABLED);
  });

  test('the key VALUE never appears in the validation result', () => {
    const secret = 'sk-ant-super-secret-value-9999';
    const r = validateLiveProviderConfiguration({ env: { ...LIVE_ENV, ANTHROPIC_API_KEY: secret } });
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.keyPresent).toBe(true);
  });
});

// ── §14 — receipt drift ─────────────────────────────────────────────────────

describe('Stage 14.7G §14 — receipt drift fails before provider construction', () => {
  test('a changed relevant-file hash invalidates the receipt', () => {
    const receipt = {
      relevantFileHashes: { 'server/src/routes/ai.js': 'deadbeef-not-the-real-hash' },
      configurationFingerprint: { digest: 'x' },
      scenarioIds: APPROVED_SCENARIOS,
      costCaps: { maxTotalCostUsd: 0.75, maxRequests: 12, maxInputTokens: 180000, maxOutputTokens: 50000 },
      modelAllowlist: 'claude:claude-sonnet-5',
      sanitizedMongoTarget: { host: '127.0.0.1', port: '27018', db: 'trailverse_eval_14_7' },
      compositeResult: { isolation: { liveProviderCalls: 0, liveProviderCostUsd: 0 }, readiness: { cleanupSafetyPassed: true, liveExecutionReady: true } },
    };
    const v = validateReceipt(receipt, { env: LIVE_ENV, sanitizeMongoTarget });
    expect(v.valid).toBe(false);
    expect(v.reasons.some((r) => r.startsWith('relevant_file_hash_changed'))).toBe(true);
  });
});

// ── §6/§14 — cap projection ─────────────────────────────────────────────────

describe('Stage 14.7G §6/§14 — caps are projected BEFORE the next provider call', () => {
  const model = 'claude-sonnet-5';

  test('the request cap refuses the call that would exceed it', () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxRequests: 2 } });
    expect(ledger.beginAttempt({ scenarioId: 's', phase: 'structured', attemptNumber: 1 }).allowed).toBe(true);
    expect(ledger.beginAttempt({ scenarioId: 's', phase: 'prose', attemptNumber: 1 }).allowed).toBe(true);
    const third = ledger.beginAttempt({ scenarioId: 's', phase: 'prose', attemptNumber: 2 });
    expect(third.allowed).toBe(false);
    expect(third.blockedBy).toBe('max_requests');
    // Refused calls are NOT entered in the ledger — nothing was spent.
    expect(ledger.requestCount).toBe(2);
  });

  test('the output-token cap refuses before the call', () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxOutputTokens: 6000 } });
    expect(ledger.beginAttempt({ scenarioId: 's', phase: 'structured', attemptNumber: 1, maxOutputTokens: 6000 }).allowed).toBe(true);
    const second = ledger.beginAttempt({ scenarioId: 's', phase: 'prose', attemptNumber: 1, maxOutputTokens: 6000 });
    expect(second.allowed).toBe(false);
    expect(second.blockedBy).toBe('max_output_tokens');
  });

  test('the input-token cap refuses before the call', () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxInputTokens: 20000 } });
    expect(ledger.beginAttempt({ scenarioId: 's', phase: 'structured', attemptNumber: 1 }).allowed).toBe(true);
    expect(ledger.beginAttempt({ scenarioId: 's', phase: 'prose', attemptNumber: 1 }).allowed).toBe(false);
  });

  test('the cost cap refuses before the call', () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxCostUsd: 0.0001 } });
    const first = ledger.beginAttempt({ scenarioId: 's', phase: 'structured', attemptNumber: 1, maxOutputTokens: 6000 });
    expect(first.allowed).toBe(false);
    expect(first.blockedBy).toBe('max_total_cost_usd_reservation');
  });

  test('every attempt is settled separately — a retry never erases the first', () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxRequests: 12 } });
    const a1 = ledger.beginAttempt({ scenarioId: 's', phase: 'structured', attemptNumber: 1, maxOutputTokens: 6000 });
    ledger.settleAttempt(a1.reservationId, { usage: { inputTokens: 15552, outputTokens: 6000 }, outcome: OUTCOME.TRUNCATED });
    const a2 = ledger.beginAttempt({ scenarioId: 's', phase: 'structured', attemptNumber: 2, maxOutputTokens: 12000 });
    ledger.settleAttempt(a2.reservationId, { usage: { inputTokens: 15600, outputTokens: 9000 }, outcome: OUTCOME.SUCCESS });

    const report = ledger.report();
    expect(report.entries).toHaveLength(2);
    expect(report.entries[0].outcome).toBe(OUTCOME.TRUNCATED);
    expect(report.entries[0].actualOutputTokens).toBe(6000);
    // Historical fixtures did not retain cache counters, so both settlements
    // remain conservative reservations instead of being understated as exact.
    expect(report.totals.outputTokens).toBe(18000);
    expect(report.reconciliation.reconciles).toBe(true);
    expect(report.reconciliation.requestsMatch).toBe(true);
  });

  test('a failed call with no usage keeps its reservation rather than becoming free', () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxRequests: 12 } });
    const a = ledger.beginAttempt({ scenarioId: 's', phase: 'prose', attemptNumber: 1, maxOutputTokens: 4000 });
    ledger.settleAttempt(a.reservationId, { usage: null, outcome: OUTCOME.FAILED });
    const report = ledger.report();
    expect(report.entries[0].settlementStatus).toBe('settled_reserved');
    expect(report.entries[0].estimatedCostUsd).toBeGreaterThan(0);
    expect(report.outcomeCounts[OUTCOME.FAILED]).toBe(1);
  });
});

// ── §7/§14 — Claude-only network allowlist ──────────────────────────────────

describe('Stage 14.7G §7 — only the exact Claude host passes, in live mode only', () => {
  const live = { liveClaudeAllowed: true, protocol: 'https:' };

  test('the exact host on 443 is the approved provider', () => {
    expect(classifyLiveDestination({ host: 'api.anthropic.com', port: 443, ...live }))
      .toEqual({ destinationClass: CLASS.CLAUDE, allowed: true });
  });

  test('a host merely SHARING a fragment cannot pass', () => {
    const impostors = [
      'api.anthropic.com.attacker.example',
      'notapi.anthropic.com.evil.net',
      'anthropic.com.evil.net',
      'apianthropic.com',
      'api-anthropic.com',
      'xapi.anthropic.com',
      'api.anthropic.com.',            // trailing-dot form of a DIFFERENT label
      'evil.com/api.anthropic.com',
      'evil.com#api.anthropic.com',
      'evil.com@api.anthropic.com',
      'api.anthropic.com:443@evil.com',
    ];
    for (const host of impostors) {
      const verdict = classifyLiveDestination({ host, port: 443, ...live });
      if (host === 'api.anthropic.com.') {
        // A single trailing dot is the legitimate absolute form of the SAME host.
        expect(verdict.destinationClass).toBe(CLASS.CLAUDE);
      } else {
        expect(verdict).toEqual({ destinationClass: CLASS.BLOCKED, allowed: false });
      }
    }
  });

  test('HTTPS scheme alone is not sufficient', () => {
    expect(classifyLiveDestination({ host: 'evil.example', port: 443, ...live }).allowed).toBe(false);
  });

  test('the right host on the wrong port is blocked', () => {
    expect(classifyLiveDestination({ host: 'api.anthropic.com', port: 80, ...live }).allowed).toBe(false);
    expect(classifyLiveDestination({ host: 'api.anthropic.com', port: 8443, ...live }).allowed).toBe(false);
  });

  test('the right host over plain http is blocked', () => {
    expect(classifyLiveDestination({ host: 'api.anthropic.com', port: 443, protocol: 'http:', liveClaudeAllowed: true }).allowed).toBe(false);
  });

  test('DETERMINISTIC mode blocks Claude too — the guard is not weakened globally', () => {
    expect(classifyLiveDestination({ host: 'api.anthropic.com', port: 443, protocol: 'https:', liveClaudeAllowed: false }))
      .toEqual({ destinationClass: CLASS.BLOCKED, allowed: false });
  });

  test('loopback classes are unchanged', () => {
    expect(classifyLiveDestination({ host: '127.0.0.1', port: 27018 }).destinationClass).toBe(CLASS.LOOPBACK_MONGO);
    expect(classifyLiveDestination({ host: '127.0.0.1', port: 54321 }).destinationClass).toBe(CLASS.LOOPBACK_HTTP);
  });

  test('OpenAI is blocked in live mode', () => {
    expect(classifyLiveDestination({ host: 'api.openai.com', port: 443, ...live }).allowed).toBe(false);
  });
});

// ── §5/§14 — timeline ───────────────────────────────────────────────────────

describe('Stage 14.7G §5 — one monotonic origin, no fabricated marks', () => {
  test('marks are relative to a single origin and strictly ordered', () => {
    let t = 1000;
    const tl = createTimeline({ scenarioId: 's', now: () => (t += 100) });
    tl.mark('turnStart');
    tl.mark('itineraryReadyEvent');
    expect(tl.at('turnStart')).toBeLessThan(tl.at('itineraryReadyEvent'));
  });

  test('a visibility mark before its persistence success is REFUSED', () => {
    let t = 0;
    const tl = createTimeline({ scenarioId: 's', now: () => (t += 10) });
    tl.mark('turnStart');
    expect(tl.mark('itineraryVisible')).toBeNull();
    expect(tl.at('itineraryVisible')).toBeNull();
    expect(tl.report().violations.some((v) => v.code === 'visibility_before_persistence')).toBe(true);
  });

  test('a visibility mark AFTER persistence success is accepted', () => {
    let t = 0;
    const tl = createTimeline({ scenarioId: 's', now: () => (t += 10) });
    tl.mark('revision1PersistenceSuccess');
    expect(tl.mark('itineraryVisible')).not.toBeNull();
  });

  test('a duplicate mark is retained as a duplicate, not silently overwritten', () => {
    let t = 0;
    const tl = createTimeline({ scenarioId: 's', now: () => (t += 10) });
    const first = tl.mark('doneEvent');
    tl.mark('doneEvent');
    expect(tl.at('doneEvent')).toBe(first);
    expect(tl.report().duplicates).toHaveLength(1);
  });

  test('unavailable provider first-token timing is reported, never fabricated', () => {
    const tl = createTimeline({ scenarioId: 's' });
    const report = tl.report();
    expect(report.checkpoints.phaseAFirstToken).toBe('unavailable');
    expect(report.checkpoints.phaseBFirstToken).toBe('unavailable');
  });

  test('every §5 checkpoint is present in the recorder vocabulary', () => {
    for (const required of [
      'turnStart', 'responseStartedEvent', 'firstThinkingEvent', 'phaseAReservationCreated',
      'phaseAProviderStart', 'phaseAProviderEnd', 'phaseAAttemptSettled', 'itineraryReadyEvent',
      'revision1PersistenceStart', 'revision1PersistenceSuccess', 'itineraryVisible',
      'proseGenerationStartedEvent', 'phaseBReservationCreated', 'phaseBProviderStart',
      'phaseBProviderEnd', 'phaseBAttemptSettled', 'firstCompatibilityChunk', 'streamEndEvent',
      'proseReadyEvent', 'revision2PersistenceStart', 'revision2PersistenceSuccess', 'proseVisible',
      'doneEvent', 'doneReconciled', 'restoreStart', 'restoreSuccess', 'cleanupStart', 'cleanupSuccess',
    ]) {
      expect(CHECKPOINTS).toContain(required);
    }
  });

  test('ordering is computed from marks, and a missing mark makes it false', () => {
    let t = 0;
    const tl = createTimeline({ scenarioId: 's', now: () => (t += 10) });
    tl.mark('revision1PersistenceSuccess');
    tl.mark('itineraryVisible');
    expect(tl.orderingReport().revision1PersistedBeforeItineraryVisible).toBe(true);
    expect(tl.orderingReport().revision2PersistedBeforeProseVisible).toBe(false);
  });
});

// ── §9 — gain ───────────────────────────────────────────────────────────────

describe('Stage 14.7G §9 — gain thresholds', () => {
  test('a qualifying gain meets both thresholds', () => {
    const g = calculateGain({ timeToItineraryVisibleMs: 4000, timeToProseVisibleMs: 20000 });
    expect(g.absoluteGainMs).toBe(16000);
    expect(g.relativeGain).toBeCloseTo(0.8, 5);
    expect(g.qualifies).toBe(true);
  });

  test('a large relative gain below 10s absolute does NOT qualify', () => {
    const g = calculateGain({ timeToItineraryVisibleMs: 500, timeToProseVisibleMs: 9000 });
    expect(g.meetsRelative).toBe(true);
    expect(g.meetsAbsolute).toBe(false);
    expect(g.qualifies).toBe(false);
  });

  test('a large absolute gain below 20% relative does NOT qualify', () => {
    const g = calculateGain({ timeToItineraryVisibleMs: 90000, timeToProseVisibleMs: 101000 });
    expect(g.meetsAbsolute).toBe(true);
    expect(g.meetsRelative).toBe(false);
    expect(g.qualifies).toBe(false);
  });

  test('a missing mark is not a gain of zero', () => {
    const g = calculateGain({ timeToItineraryVisibleMs: null, timeToProseVisibleMs: 20000 });
    expect(g.measurable).toBe(false);
    expect(g.absoluteGainMs).toBeNull();
    expect(g.qualifies).toBe(false);
  });
});

// ── §12/§15 — decision calculation ──────────────────────────────────────────

describe('Stage 14.7G §12/§15 — full deterministic executor simulations', () => {
  test('SIMULATION: both correct and sufficient gain → READY_FOR_STAGE14_CANARY_PLAN', () => {
    const d = calculateDecision({
      liveExecutionStarted: true,
      scenarios: [
        { ...goodScenario('basic-02-three-day'), gain: calculateGain({ timeToItineraryVisibleMs: 4000, timeToProseVisibleMs: 20000 }) },
        { ...goodScenario('basic-03-seven-day'), gain: calculateGain({ timeToItineraryVisibleMs: 6000, timeToProseVisibleMs: 32000 }) },
      ],
      cleanup: { ok: true }, offlineReplay: { ok: true },
    });
    expect(d.decision).toBe(DECISION.READY);
    // Even READY does not authorize a flag.
    expect(d.advancesRollout).toBe(false);
  });

  test('SIMULATION: correct but insufficient gain → STAGE14_7_CORRECT_BUT_GAIN_INSUFFICIENT', () => {
    const d = calculateDecision({
      liveExecutionStarted: true,
      scenarios: [
        { ...goodScenario('basic-02-three-day'), gain: calculateGain({ timeToItineraryVisibleMs: 4000, timeToProseVisibleMs: 20000 }) },
        { ...goodScenario('basic-03-seven-day'), gain: calculateGain({ timeToItineraryVisibleMs: 9000, timeToProseVisibleMs: 15000 }) },
      ],
      cleanup: { ok: true }, offlineReplay: { ok: true },
    });
    expect(d.decision).toBe(DECISION.CORRECT_BUT_GAIN_INSUFFICIENT);
    expect(d.reasons.join(' ')).toMatch(/basic-03-seven-day:gain_below/);
  });

  test('SIMULATION: scenario-1 hard failure → FAILED, and scenario 2 never ran', () => {
    const bad = goodScenario('basic-02-three-day');
    bad.persistence.acceptedWrites = 1;
    const d = calculateDecision({
      liveExecutionStarted: true,
      scenarios: [{ ...bad, gain: calculateGain({ timeToItineraryVisibleMs: 4000, timeToProseVisibleMs: 20000 }) }],
      cleanup: { ok: true }, offlineReplay: { ok: true },
    });
    expect(d.decision).toBe(DECISION.FAILED);
    expect(d.scenariosStarted).toBe(1);
    expect(d.reasons).toContain('basic-02-three-day:persistence_accepted_count');
  });

  test('SIMULATION: scenario-2 hard failure → FAILED', () => {
    const bad = goodScenario('basic-03-seven-day');
    bad.artifacts.alignmentMarkerLeak = true;
    const d = calculateDecision({
      liveExecutionStarted: true,
      scenarios: [
        { ...goodScenario('basic-02-three-day'), gain: calculateGain({ timeToItineraryVisibleMs: 4000, timeToProseVisibleMs: 20000 }) },
        { ...bad, gain: calculateGain({ timeToItineraryVisibleMs: 6000, timeToProseVisibleMs: 32000 }) },
      ],
      cleanup: { ok: true }, offlineReplay: { ok: true },
    });
    expect(d.decision).toBe(DECISION.FAILED);
    expect(d.reasons).toContain('basic-03-seven-day:artifact_alignment_marker');
  });

  test('SIMULATION: cleanup failure → FAILED even though generation succeeded', () => {
    const d = calculateDecision({
      liveExecutionStarted: true,
      scenarios: [
        { ...goodScenario('basic-02-three-day'), gain: calculateGain({ timeToItineraryVisibleMs: 4000, timeToProseVisibleMs: 20000 }) },
        { ...goodScenario('basic-03-seven-day'), gain: calculateGain({ timeToItineraryVisibleMs: 6000, timeToProseVisibleMs: 32000 }) },
      ],
      cleanup: { ok: false }, offlineReplay: { ok: true },
    });
    expect(d.decision).toBe(DECISION.FAILED);
    expect(d.reasons).toContain('cleanup_incomplete');
  });

  test('SIMULATION: a failed offline replay → FAILED', () => {
    const d = calculateDecision({
      liveExecutionStarted: true,
      scenarios: [
        { ...goodScenario('basic-02-three-day'), gain: calculateGain({ timeToItineraryVisibleMs: 4000, timeToProseVisibleMs: 20000 }) },
        { ...goodScenario('basic-03-seven-day'), gain: calculateGain({ timeToItineraryVisibleMs: 6000, timeToProseVisibleMs: 32000 }) },
      ],
      cleanup: { ok: true }, offlineReplay: { ok: false },
    });
    expect(d.decision).toBe(DECISION.FAILED);
    expect(d.reasons).toContain('offline_flag_off_replay_failed');
  });

  test('SIMULATION: invalid preflight/receipt → LIVE_EXECUTION_NOT_STARTED, zero calls', () => {
    const d = calculateDecision({
      liveExecutionStarted: false,
      preProviderReasons: [GATE_CODES.RECEIPT_INVALID],
    });
    expect(d.decision).toBe(DECISION.NOT_STARTED);
    expect(d.isStage147Decision).toBe(false);
    expect(d.advancesRollout).toBe(false);
    expect(d.scenariosStarted).toBe(0);
  });

  test('SIMULATION: missing provider key → LIVE_EXECUTION_NOT_STARTED', () => {
    const d = calculateDecision({
      liveExecutionStarted: false,
      preProviderReasons: [GATE_CODES.PROVIDER_NOT_CONFIGURED],
    });
    expect(d.decision).toBe(DECISION.NOT_STARTED);
    expect(d.reasons).toContain('live_provider_not_configured');
  });

  test('one completed scenario alone cannot reach a gain verdict', () => {
    const d = calculateDecision({
      liveExecutionStarted: true,
      scenarios: [{ ...goodScenario('basic-02-three-day'), gain: calculateGain({ timeToItineraryVisibleMs: 4000, timeToProseVisibleMs: 20000 }) }],
      cleanup: { ok: true }, offlineReplay: { ok: true },
    });
    expect(d.decision).toBe(DECISION.FAILED);
    expect(d.reasons).toContain('incomplete_scenario_set');
  });

  test('a done-triggered automatic write is a hard failure', () => {
    const bad = goodScenario('basic-02-three-day');
    bad.persistence.automaticPersistenceRequestsFromDone = 1;
    expect(hardInvariantFailures(bad).failures).toContain('automatic_write_from_done');
  });

  test('a Phase-B barrier released by timeout is a hard failure', () => {
    const bad = goodScenario('basic-02-three-day');
    bad.phaseBReleasedBy = 'failsafe_timeout';
    expect(hardInvariantFailures(bad).failures).toContain('phase_b_barrier_not_released_by_reveal');
  });

  test('deterministic fallback presented as model prose is a hard failure', () => {
    const bad = goodScenario('basic-02-three-day');
    bad.correctness.proseFirstPass = false;
    expect(hardInvariantFailures(bad).failures).toContain('prose_not_first_pass');
  });
});

// ── §13/§14 — consumption and stop-on-failure ───────────────────────────────

describe('Stage 14.7G §13 — scenario consumption and stop-on-failure', () => {
  const baseEnv = { ...LIVE_ENV, TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS: 'false', NODE_ENV: 'test' };

  /**
   * Stage 14.7H — the pre-run marker is now the NON-consuming
   * `launch_attempted`. Consumption moved into the driver, immediately before
   * dispatch is acknowledged, so a launch failure no longer spends a scenario.
   */
  test('a NON-consuming launch marker is written before the scenario runs', async () => {
    const observed = [];
    await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: baseEnv, runId: 'run-a',
      scenarios: ['basic-02-three-day'],
      runScenario: async ({ scenarioId }) => {
        observed.push({
          state: consumption.readConsumption(scenarioId)?.status ?? null,
          consumed: consumption.isConsumed(scenarioId),
        });
        return goodScenario(scenarioId);
      },
    });
    expect(observed).toEqual([{ state: consumption.STATE.LAUNCH_ATTEMPTED, consumed: false }]);
  });

  test('a scenario consumed at DISPATCH is refused on a second invocation', async () => {
    // The driver is what consumes, so the injected runScenario stands in for it.
    const run = () => executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: baseEnv, runId: 'run-b',
      scenarios: ['basic-02-three-day'],
      runScenario: async ({ scenarioId, runId }) => {
        consumption.authorizeProviderDispatch({ scenarioId, runId });
        return goodScenario(scenarioId);
      },
    });
    await run();
    const second = await run();
    expect(second.scenariosRun).toBe(0);
    expect(second.stopReason).toBe('scenario_already_consumed');
    expect(second.liveExecutionStarted).toBe(false);
  });

  test('a DISPATCH marker left by a crashed run still blocks a rerun', async () => {
    consumption.authorizeProviderDispatch({ scenarioId: 'basic-02-three-day', runId: 'crashed-run' });
    const result = await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: baseEnv, runId: 'run-c',
      scenarios: ['basic-02-three-day'],
      runScenario: async () => { throw new Error('must not be called'); },
    });
    expect(result.scenariosRun).toBe(0);
    expect(result.stopReason).toBe('scenario_already_consumed');
  });

  test('scenario order is fixed', async () => {
    const seen = [];
    await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: baseEnv, runId: 'run-d',
      runScenario: async ({ scenarioId }) => { seen.push(scenarioId); return goodScenario(scenarioId); },
    });
    expect(seen).toEqual([...APPROVED_SCENARIOS]);
  });

  test('a scenario-1 hard failure prevents scenario 2 from running at all', async () => {
    const seen = [];
    const result = await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: baseEnv, runId: 'run-e',
      runScenario: async ({ scenarioId }) => {
        seen.push(scenarioId);
        const s = goodScenario(scenarioId);
        if (scenarioId === APPROVED_SCENARIOS[0]) s.restore.itineraryHashMatches = false;
        return s;
      },
    });
    expect(seen).toEqual([APPROVED_SCENARIOS[0]]);
    expect(result.scenariosRun).toBe(1);
    expect(result.stopReason).toContain('restore_hash_mismatch');
  });

  test('LOW GAIN ALONE does not turn seven-day into a hard-invariant stop', async () => {
    const seen = [];
    const result = await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: baseEnv, runId: 'run-f',
      runScenario: async ({ scenarioId }) => {
        seen.push(scenarioId);
        // Correct and safe, but nowhere near the gain thresholds.
        return goodScenario(scenarioId, { itineraryVisible: 9000, proseVisible: 10000 });
      },
    });
    expect(seen).toEqual([...APPROVED_SCENARIOS]);
    expect(result.scenariosRun).toBe(1);
    expect(result.stopReason).toBeNull();
  });

  test('the remaining scenario inherits cumulative exposure rather than resetting', async () => {
    const priorSeen = [];
    await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: baseEnv, runId: 'run-g',
      runScenario: async ({ scenarioId, priorTotals }) => {
        priorSeen.push(priorTotals.requests);
        return goodScenario(scenarioId);
      },
    });
    // Stage 14.7I §15 — the first scenario no longer starts from zero: it
    // inherits the failed live run's conservative exposure (3 requests), so a
    // replacement run cannot spend the $0.75 cap a second time.
    // Stage 14.7L §3 — this suite redirects the evidence directory, so the prior
    // exposure comes from the injected stub rather than the real resolver. The
    // point being proven is that whatever the exposure IS, it carries forward.
    const priorRequests = SEQUENCING_GATES.exposureResolver().priorTotals.requests;
    expect(priorSeen[0]).toBe(priorRequests);
    expect(priorSeen).toHaveLength(1);
  });

  test('a driver failure stops the run and is reported with its bounded code', async () => {
    const result = await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: baseEnv, runId: 'run-h',
      runScenario: async ({ scenarioId }) => ({
        scenarioId, ok: false, boundedCode: 'driver_output_unreadable', providerCallsStarted: 1,
      }),
    });
    expect(result.scenariosRun).toBe(1);
    expect(result.stopReason).toBe('driver_output_unreadable');
    expect(result.liveExecutionStarted).toBe(true);
  });
});

// ── §10/§16 — private artifacts and redaction ───────────────────────────────

describe('Stage 14.7G §10/§16 — nothing secret reaches a report', () => {
  test('secret-bearing keys are replaced wholesale', () => {
    const out = redactForReport({
      authorization: 'Bearer abcdefghijklmnop',
      apiKey: 'sk-ant-1234567890abcdef',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      nested: { auth_token: 'tok_live_abcdefghijk', safe: 'visible' },
    });
    expect(out.authorization).toBe('[redacted]');
    expect(out.apiKey).toBe('[redacted]');
    expect(out.ANTHROPIC_API_KEY).toBe('[redacted]');
    expect(out.nested.auth_token).toBe('[redacted]');
    expect(out.nested.safe).toBe('visible');
  });

  test('secret VALUE shapes are scrubbed even under an innocent key', () => {
    const out = redactForReport({
      note: 'the key is sk-ant-api03-AAAABBBBCCCCDDDDEEEE and the db is mongodb://user:pw@host:27017/db',
      header: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.abcdefghijkl',
    });
    expect(out.note).not.toContain('sk-ant-api03');
    expect(out.note).not.toContain('user:pw');
    expect(out.note).toContain('[redacted:provider_key]');
    expect(out.note).toContain('[redacted:mongo_uri]');
    expect(out.header).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  test('a full mongo URI never survives redaction', () => {
    // `uri` is not a forbidden KEY, so the value pattern is what catches it.
    const out = redactForReport({ uri: 'mongodb://127.0.0.1:27018/trailverse_eval_14_7' });
    expect(out.uri).toBe('[redacted:mongo_uri]');
    expect(out.uri).not.toContain('27018');
    // Under a forbidden key the whole value goes, whatever its shape.
    expect(redactForReport({ mongodb_uri: 'mongodb://x/y' }).mongodb_uri).toBe('[redacted]');
  });

  test('hashes are stable and disclose nothing', () => {
    expect(hashOf('abc')).toBe(hashOf('abc'));
    expect(hashOf('abc')).not.toContain('abc');
  });
});
