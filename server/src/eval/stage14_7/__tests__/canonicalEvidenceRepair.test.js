'use strict';

const fs = require('fs');
const path = require('path');

const {
  EXPECTED_LIFECYCLE_JOURNAL,
  validateCanonicalItinerary,
  compareCanonicalStates,
  evaluateLifecycleJournal,
  reconcileExposure,
  validateProviderEvidence,
  classifyMongoAvailability,
  measureForeignRecordPreservation,
  parseSseTranscript,
  extractCanonicalTranscriptStates,
} = require('../canonicalEvidenceRepair');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const LIVE_EVIDENCE = path.join(
  REPO_ROOT,
  'artifacts/private/stage14_7-live/stage147g-mshqzkal-cda9db',
  'basic-02-three-day-model-fix-validation-1.json',
);

describe('Stage 14.7P — canonical live-evidence repair', () => {
  test('the preserved provider itinerary satisfies the exact supported tool contract', () => {
    const evidence = JSON.parse(fs.readFileSync(LIVE_EVIDENCE, 'utf8'));
    const states = extractCanonicalTranscriptStates(parseSseTranscript(evidence.rawSseTranscript));
    const result = validateCanonicalItinerary(states.phaseAProviderItinerary, {
      source: 'provider_output',
    });

    expect(result.valid).toBe(true);
    expect(result.failures).toEqual([]);
    expect(states.phaseAProviderItinerary.days).toHaveLength(3);
  });

  test('reports a bounded field-level validation failure instead of itinerary_invalid', () => {
    const result = validateCanonicalItinerary({ days: [{ id: 'd1', stops: 'not-an-array' }] }, {
      source: 'provider_output',
    });

    expect(result.valid).toBe(false);
    expect(result.category).toBe('provider_produced_invalid_itinerary');
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid_type',
        jsonPath: '$.days[0].stops',
        expectedContract: 'array',
        observed: 'string(12)',
        source: 'provider_output',
      }),
    ]));
  });

  test('the live revision snapshots preserve frozen itinerary bytes', () => {
    const evidence = JSON.parse(fs.readFileSync(LIVE_EVIDENCE, 'utf8'));
    const states = extractCanonicalTranscriptStates(parseSseTranscript(evidence.rawSseTranscript));
    const diff = compareCanonicalStates([
      ['A_phase_a_accepted', states.revision1CanonicalPlan],
      ['B_itinerary_ready', states.revision1CanonicalPlan],
      ['E_prose_ready', states.revision2CanonicalPlan],
      ['terminal_done', states.doneCanonicalPlan],
    ]);

    expect(diff.prohibitedMismatches).toEqual([]);
    expect(diff.comparisons.every((row) => row.frozenPlanMatches)).toBe(true);
    expect(diff.mismatches.every((row) => row.classification !== 'prohibited_plan_mutation')).toBe(true);
  });

  test('the exact ten-entry journal populates lifecycleJournalMatches', () => {
    expect(evaluateLifecycleJournal(EXPECTED_LIFECYCLE_JOURNAL)).toEqual({
      lifecycleJournalMatches: true,
      expectedCount: 10,
      actualCount: 10,
      firstMismatchIndex: null,
    });
  });

  test('missing journal input fails qualification instead of defaulting false', () => {
    expect(evaluateLifecycleJournal(undefined)).toEqual(expect.objectContaining({
      lifecycleJournalMatches: null,
      boundedCode: 'lifecycle_journal_result_missing',
    }));
  });

  test('reconciles prior, current and cumulative exposure independently', () => {
    const result = reconcileExposure({
      priorExposure: { requests: 3, inputTokens: 60000, outputTokens: 20000, costUsd: 0.32 },
      currentRun: { requests: 2, inputTokens: 37714, outputTokens: 7733, costUsd: 0.152758 },
      cumulative: { requests: 5, inputTokens: 97714, outputTokens: 27733, costUsd: 0.472758 },
    });

    expect(result.reconciles).toBe(true);
    expect(result.dimensionMatches).toEqual({
      requests: true, inputTokens: true, outputTokens: true, costUsd: true,
    });
  });

  test('requires one bounded provider evidence row per HTTP request', () => {
    const rows = [1, 2].map((n) => ({
      providerRequestId: `req-${n}`,
      ledgerAttemptId: n,
      dispatchAuthorizationId: `dispatch-${n}`,
      provider: 'claude',
      resolvedModel: 'claude-sonnet-5',
      reservationModel: 'claude-sonnet-5',
      dispatchModel: 'claude-sonnet-5',
      sdkRequestModel: 'claude-sonnet-5',
      usageSource: 'provider_terminal_usage',
    }));
    expect(validateProviderEvidence({ rows, providerHttpRequests: 2 }).ok).toBe(true);
    delete rows[0].providerRequestId;
    expect(validateProviderEvidence({ rows, providerHttpRequests: 2 })).toEqual(expect.objectContaining({
      ok: false,
      failures: expect.arrayContaining(['provider_request_id_missing']),
    }));
  });

  test.each([
    [{ processRunning: false, portListening: false, connectionSucceeded: false, pingSucceeded: false }, 'mongo_process_stopped'],
    [{ processRunning: true, portListening: true, connectionSucceeded: false, pingSucceeded: false, targetMatches: false }, 'incorrect_ping_target'],
    [{ processRunning: true, portListening: true, connectionSucceeded: false, pingSucceeded: false, cleanupClosedSharedResource: true }, 'cleanup_closed_shared_resource'],
    [{ processRunning: true, portListening: true, connectionSucceeded: true, pingSucceeded: false, pingAttemptedDuringShutdown: true }, 'ping_race'],
    [{ processRunning: true, portListening: true, connectionSucceeded: false, pingSucceeded: false, targetMatches: true }, 'diagnostic_bug'],
    [{ processRunning: true, portListening: true, connectionSucceeded: true, pingSucceeded: true, targetMatches: true }, null],
  ])('classifies Mongo availability evidence', (input, classification) => {
    expect(classifyMongoAvailability(input).classification).toBe(classification);
  });

  test('measures foreign users, trips and leases directly', () => {
    expect(measureForeignRecordPreservation({
      before: { users: 1, trips: 2, leases: 3 },
      after: { users: 1, trips: 2, leases: 3 },
    })).toEqual({
      foreignUsersBefore: 1,
      foreignUsersAfter: 1,
      foreignTripsBefore: 2,
      foreignTripsAfter: 2,
      foreignLeasesBefore: 3,
      foreignLeasesAfter: 3,
      unchanged: true,
    });
  });
});
