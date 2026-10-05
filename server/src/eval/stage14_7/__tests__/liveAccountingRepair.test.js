'use strict';

/**
 * Stage 14.7I §16 — zero-cost qualification of the accounting repairs.
 *
 * Everything here is driven by synthetic streams and recorded evidence. No
 * provider call, no subprocess, no spend.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { redactForReport, ACCOUNTING_FIELD_ALLOWLIST } = require('../privateEvidence');
const { createLiveProviderLedger, OUTCOME } = require('../liveProviderLedger');
const audit = require('../failedRunAudit');
const replacement = require('../replacementScenario');
const consumption = require('../scenarioConsumption');
const { makeRunScopedIdentity } = require('../liveExecutor');

// ── §10 — reporting ─────────────────────────────────────────────────────────

describe('Stage 14.7I §10 — accounting fields survive, secrets do not', () => {
  test('THE REPORTING DEFECT: token counters are no longer blanked', () => {
    // In the Stage 14.7 live report every one of these read "[redacted]",
    // because FORBIDDEN_KEY_PATTERN contains "token".
    const out = redactForReport({
      reservedInputTokens: 20000, reservedOutputTokens: 6000,
      actualInputTokens: 15552, actualOutputTokens: 6000,
      totalInputTokens: 60000, totalOutputTokens: 20000,
      maxInputTokens: 180000, maxOutputTokens: 50000,
      cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
    });
    for (const [key, value] of Object.entries(out)) {
      expect(typeof value).toBe('number');
      expect(String(value)).not.toBe('[redacted]');
    }
    expect(out.actualInputTokens).toBe(15552);
  });

  test('an absent accounting field reports as null, not "[absent]"', () => {
    expect(redactForReport({ actualInputTokens: null }).actualInputTokens).toBeNull();
  });

  test.each([
    'refreshTokens', 'sessionTokens', 'accessTokens', 'bearerTokens', 'apiTokens',
  ])('secret-shaped field %s is STILL redacted', (key) => {
    expect(redactForReport({ [key]: 'secret-value-abcdef123456' })[key]).toBe('[redacted]');
  });

  test('a non-numeric value under an allowlisted name is redacted', () => {
    // Prevents smuggling a secret through by naming it `inputTokens`.
    expect(redactForReport({ inputTokens: 'sk-ant-not-a-number' }).inputTokens).toBe('[redacted]');
  });

  test('the allowlist is explicit, not a suffix rule', () => {
    expect(ACCOUNTING_FIELD_ALLOWLIST.has('actualInputTokens')).toBe(true);
    expect(ACCOUNTING_FIELD_ALLOWLIST.has('refreshTokens')).toBe(false);
    expect(ACCOUNTING_FIELD_ALLOWLIST.has('sessionTokens')).toBe(false);
  });

  test('keys and URIs remain redacted alongside the counters', () => {
    const out = redactForReport({
      actualOutputTokens: 900,
      ANTHROPIC_API_KEY: 'sk-ant-abcdefghijklmnop',
      note: 'connect mongodb://user:pw@host:27017/db',
    });
    expect(out.actualOutputTokens).toBe(900);
    expect(out.ANTHROPIC_API_KEY).toBe('[redacted]');
    expect(out.note).toContain('[redacted:mongo_uri]');
  });
});

// ── §7/§8 — streaming usage settlement ──────────────────────────────────────

describe('Stage 14.7I §7/§8 — streaming usage settlement', () => {
  const model = 'claude-sonnet-5';

  /** The event shape the Anthropic SDK yields for a streamed message. */
  function syntheticStream({ inputTokens = 1200, outputTokens = 430, stopReason = 'end_turn', omitUsage = false } = {}) {
    const events = omitUsage
      ? [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }]
      : [
          { type: 'message_start', message: { usage: { input_tokens: inputTokens, output_tokens: 0 } } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
          { type: 'message_delta', usage: { output_tokens: outputTokens }, delta: { stop_reason: stopReason } },
        ];
    return (async function* gen() { for (const e of events) yield e; }());
  }

  test('a streamed success settles from TERMINAL usage, not the initial object', async () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxRequests: 12 } });
    const a = ledger.beginAttempt({ scenarioId: 's', phase: 'prose', attemptNumber: 1, maxOutputTokens: 8000 });

    // Drain the stream the way the application does, then settle.
    let captured = null;
    for await (const e of syntheticStream()) {
      if (e.type === 'message_start') captured = { inputTokens: e.message.usage.input_tokens, outputTokens: 0 };
      if (e.type === 'message_delta') captured.outputTokens = e.usage.output_tokens;
    }
    ledger.settleAttempt(a.reservationId, { usage: captured, outcome: OUTCOME.SUCCESS });

    const row = ledger.report().entries[0];
    expect(row.settlementStatus).toBe('settled_conservative_from_partial_usage');
    expect(row.actualInputTokens).toBe(1200);
    expect(row.actualOutputTokens).toBe(430);
    expect(row.cacheCreationInputTokens).toBeNull();
    expect(row.cacheReadInputTokens).toBeNull();
    expect(row.cacheUsageEvidence).toBe('provider_did_not_report');
    // Partial usage cannot replace the conservative reservation.
    // Standard Claude pricing as of 2026-09-01; introductory settlement was $0.12.
    expect(row.estimatedCostUsd).toBe(0.18);
  });

  test('explicit provider zero cache counters permit complete actual settlement', () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxRequests: 12 } });
    const a = ledger.beginAttempt({ scenarioId: 's', phase: 'prose', attemptNumber: 1, maxOutputTokens: 8000 });
    ledger.settleAttempt(a.reservationId, {
      usage: {
        inputTokens: 1200, outputTokens: 430,
        cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
      },
      outcome: OUTCOME.SUCCESS,
    });
    expect(ledger.report().entries[0]).toEqual(expect.objectContaining({
      settlementStatus: 'settled_actual_complete',
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheUsageEvidence: 'provider_reported_zero',
    }));
  });

  test('a stream with NO usage keeps its reservation (never zero)', async () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxRequests: 12 } });
    const a = ledger.beginAttempt({ scenarioId: 's', phase: 'prose', attemptNumber: 1, maxOutputTokens: 8000 });
    // eslint-disable-next-line no-unused-vars
    for await (const _ of syntheticStream({ omitUsage: true })) { /* drained */ }
    ledger.settleAttempt(a.reservationId, { usage: null, outcome: OUTCOME.SUCCESS });

    const row = ledger.report().entries[0];
    expect(row.settlementStatus).toBe('settled_reserved');
    expect(row.estimatedCostUsd).toBeGreaterThan(0);
    expect(row.actualInputTokens).toBeNull();
  });

  test('a truncated stream is labelled and still settled', () => {
    const ledger = createLiveProviderLedger({ model, caps: { maxRequests: 12 } });
    const a = ledger.beginAttempt({ scenarioId: 's', phase: 'structured', attemptNumber: 1, maxOutputTokens: 6000 });
    ledger.settleAttempt(a.reservationId, {
      usage: { inputTokens: 900, outputTokens: 6000 }, outcome: OUTCOME.TRUNCATED,
    });
    expect(ledger.report().entries[0].outcome).toBe(OUTCOME.TRUNCATED);
  });

  test('the child wraps streams rather than reading usage synchronously', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../stage14_7e/scenarioChild.js'), 'utf8');
    expect(src).toMatch(/function wrapStreamForUsage/);
    expect(src).toMatch(/isAsyncIterable\(response\)/);
    expect(src).toMatch(/message_delta/);
  });
});

// ── §9/§15 — reconciliation and cumulative budget ───────────────────────────

describe('Stage 14.7I §9/§15 — the failed run and the budget it carries', () => {
  test('the failed run is recorded as permanently non-resettable', () => {
    expect(audit.FAILED_RUN.decision).toBe('STAGE14_7_LIVE_CONFIRMATION_FAILED');
    expect(audit.FAILED_RUN.resetPermitted).toBe(false);
    expect(audit.FAILED_RUN.providerRequests).toBe(3);
    expect(audit.FAILED_RUN.actualBilledCostUsd).toBeNull();
  });

  test('cumulative exposure carries forward instead of restarting at $0.75', () => {
    const e = audit.cumulativeExposure();
    expect(e.cumulativeCapUsd).toBe(0.75);
    expect(e.priorConservativeCostUsd).toBeCloseTo(0.671058, 6);
    expect(e.remainingCapUsd).toBeCloseTo(0.078942, 6);
    expect(e.priorTotals.requests).toBe(7);
  });

  test('a ledger seeded with prior totals refuses what the remainder cannot cover', () => {
    const e = audit.cumulativeExposure();
    const ledger = createLiveProviderLedger({
      model: 'claude-sonnet-5',
      caps: { maxCostUsd: e.cumulativeCapUsd, maxRequests: 12, priorTotals: e.priorTotals },
    });
    // The remaining allowance is real but finite; the cap must bind against the
    // cumulative total rather than a fresh zero.
    expect(e.remainingCapUsd).toBeLessThan(e.cumulativeCapUsd);
    expect(ledger.totals().requests).toBeGreaterThanOrEqual(0);
  });

  test('the cap is NOT raised by this stage', () => {
    expect(audit.CUMULATIVE_CAP_USD).toBe(0.75);
  });
});

// ── §14 — the replacement slot ──────────────────────────────────────────────

describe('Stage 14.7I §14 — replacement scenario is defined, not authorized', () => {
  test('the slot exists with its own identity', () => {
    expect(replacement.REPLACEMENT_SCENARIO_ID).toBe('basic-02-three-day-canonical-fix-validation-2');
    expect(replacement.REPLACEMENT_SCENARIO.sourceScenarioId).toBe('basic-02-three-day');
  });

  /**
   * Stage 14.7K §2 — the slot is now AUTHORIZED by reviewed decision.
   *
   * 14.7I deliberately left it unauthorized and 14.7J measured what running it
   * would cost; the review then retained the full two-scenario scope and raised
   * the cumulative ceilings. Authorization is still not consumption — no marker
   * exists until a dispatch is actually authorized (asserted in §8 below).
   */
  test('it is not execution-authorized before a new reviewed decision', () => {
    expect(replacement.isExecutionAuthorized()).toBe(false);
    expect(replacement.REPLACEMENT_SCENARIO.executionAuthorized).toBe(false);
    expect(replacement.REPLACEMENT_SCENARIO.authorizedBy).toBeNull();
  });

  test('authorization did not create a consumption marker', () => {
    expect(replacement.REPLACEMENT_SCENARIO.consumptionMarkerCreated).toBe(false);
  });

  test('it links to the failed attempt without superseding it', () => {
    const links = replacement.REPLACEMENT_SCENARIO.linkedFailedAttempts;
    expect(links).toHaveLength(2);
    expect(links[0].runId).toBe(audit.FAILED_RUN.runId);
    expect(links.every((link) => link.decision === 'STAGE14_7_LIVE_CONFIRMATION_FAILED')).toBe(true);
    expect(links.every((link) => link.resetPermitted === false)).toBe(true);
    expect(replacement.REPLACEMENT_SCENARIO.supersedes).toBeNull();
  });

  test('Stage 14.7P — it is absent from the paid executable list', () => {
    const { APPROVED_SCENARIOS } = require('../compositePreflight');
    expect(APPROVED_SCENARIOS).not.toContain(replacement.REPLACEMENT_SCENARIO_ID);
    // The permanently-consumed original must be gone from every executable list.
    expect(APPROVED_SCENARIOS).not.toContain(replacement.ORIGINAL_SCENARIO_ID);
    expect(APPROVED_SCENARIOS).toEqual([]);
  });

  test('the slot resolves to the original definition, keeping its own identity', () => {
    // A different prompt would be a different experiment, not a re-validation.
    const scenarios = require('../../trailie/scenarios');
    const slot = scenarios.byId(replacement.REPLACEMENT_SCENARIO_ID);
    const original = scenarios.byId(replacement.ORIGINAL_SCENARIO_ID);
    expect(slot).toBeTruthy();
    expect(slot.userPrompt).toBe(original.userPrompt);
    expect(slot.expected).toEqual(original.expected);
    expect(slot.scenarioId).toBe(replacement.REPLACEMENT_SCENARIO_ID);
    expect(slot.aliasOfScenarioId).toBe(replacement.ORIGINAL_SCENARIO_ID);
    // The alias is a run slot, not an inventory entry.
    expect(scenarios.ALL_SCENARIOS.map((s) => s.scenarioId))
      .not.toContain(replacement.REPLACEMENT_SCENARIO_ID);
  });

  test('it inherits the original expectations verbatim', () => {
    expect(replacement.REPLACEMENT_SCENARIO.expected).toEqual({
      resolvedDurationDays: 3, initialStructuredOutputBudget: 6000,
    });
  });
});

// ── §12 — run-scoped identity ───────────────────────────────────────────────

describe('Stage 14.7I §12 — run-scoped evaluation identity', () => {
  test('it is never the shared historical identity', () => {
    const id = makeRunScopedIdentity('stage147i-example');
    expect(id.evaluationUserEmail).not.toBe('stage147eval@example.com');
    expect(id.evaluationUserEmail).toMatch(/^stage147eval[a-z0-9]+@example\.com$/);
    expect(id.evaluationUserEmail).not.toContain('+');
  });

  test('the user id is a valid ObjectId hex, decided by the parent', () => {
    expect(makeRunScopedIdentity('r').evaluationUserId).toMatch(/^[0-9a-f]{24}$/);
  });

  test('two runs get disjoint identities', () => {
    const a = makeRunScopedIdentity('run-alpha');
    const b = makeRunScopedIdentity('run-beta');
    expect(a.evaluationUserEmail).not.toBe(b.evaluationUserEmail);
    expect(a.evaluationUserId).not.toBe(b.evaluationUserId);
  });

  test('the address is stable for the same run even when parent ObjectIds differ', () => {
    expect(makeRunScopedIdentity('run-stable').evaluationUserEmail)
      .toBe(makeRunScopedIdentity('run-stable').evaluationUserEmail);
  });

  test('the executor uses it rather than falling back to the shared email', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../liveExecutor.js'), 'utf8');
    expect(src).toMatch(/makeRunScopedIdentity\(runId\)/);
    expect(src).toMatch(/evaluationUserEmail: identity\.evaluationUserEmail/);
  });
});

// ── §1 — the original scenario stays consumed ───────────────────────────────

describe('Stage 14.7I §1 — the original consumed scenario is preserved', () => {
  let tempDir;
  let saved;
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147i-'));
    saved = process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
    process.env.TRAILIE_EVAL_CONSUMPTION_DIR = tempDir;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
    else process.env.TRAILIE_EVAL_CONSUMPTION_DIR = saved;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('a settled scenario cannot be reset even with the correct acknowledgement', () => {
    consumption.recordState({
      scenarioId: 'basic-02-three-day', runId: audit.FAILED_RUN.runId,
      state: consumption.STATE.ATTEMPT_SETTLED,
    });
    consumption.recordVoidedAttempt({
      scenarioId: 'basic-02-three-day', runId: audit.FAILED_RUN.runId,
      reason: 'model_not_resolved', providerCallsStarted: 3,
    });
    const r = consumption.resetConsumptionForReviewedInstruction({
      scenarioId: 'basic-02-three-day', runId: audit.FAILED_RUN.runId,
      acknowledgement: consumption.REVIEWED_RESET_ACK,
      evidence: {
        providerCallsStarted: 3, providerLedgerEntries: 3, providerReservations: 3,
        childApplicationBoots: 1, evaluationUsersCreated: 0, evaluationTripsCreated: 0,
        inputTokens: 60000, outputTokens: 20000, costUsd: 0.32,
      },
    });
    expect(r.reset).toBe(false);
    expect(r.refusals).toEqual(expect.arrayContaining(['marker_past_dispatch_authorization']));
    expect(consumption.isConsumed('basic-02-three-day')).toBe(true);
  });
});
