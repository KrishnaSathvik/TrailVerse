'use strict';

const crypto = require('crypto');
const { stableStringify } = require('../../utils/canonicalResponse');

const EXPECTED_LIFECYCLE_JOURNAL = Object.freeze([
  'revision_1_received',
  'revision_1_persist_started',
  'revision_1_persist_succeeded',
  'itinerary_revealed',
  'pending_label_set',
  'revision_2_received',
  'revision_2_persist_started',
  'revision_2_persist_succeeded',
  'prose_revealed',
  'done_reconciled',
]);

const PRESENTATION_OR_LIFECYCLE_FIELDS = new Set([
  'generatedAt', 'contentHash', 'responseRevision', 'previousRevision',
  'lifecycleStatus', 'itineraryReadyAt', 'proseReadyAt', 'reviewMeta', 'auditTrail',
]);

const DAY_REQUIRED = Object.freeze({
  id: 'string', dayNumber: 'number', label: 'string', stops: 'array',
});
const STOP_REQUIRED = Object.freeze({
  id: 'string', order: 'number', type: 'string', name: 'string', note: 'string',
  startTime: 'string', duration: 'number',
});
const STOP_TYPES = new Set([
  'trail', 'landmark', 'campground', 'visitor_center', 'restaurant', 'lodging', 'custom',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function boundedSummary(value) {
  if (typeof value === 'string') return `string(${value.length})`;
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === 'object') return `object(${Object.keys(value).length})`;
  return String(value);
}

function validateCanonicalItinerary(itinerary, { source = 'deterministic_normalization' } = {}) {
  const failures = [];
  const invalidType = (jsonPath, expectedContract, observed) => failures.push({
    code: 'invalid_type', jsonPath, expectedContract,
    observed: boundedSummary(observed), source,
  });

  if (!itinerary || typeof itinerary !== 'object' || Array.isArray(itinerary)) {
    invalidType('$', 'object', itinerary);
  } else if (!Array.isArray(itinerary.days)) {
    invalidType('$.days', 'non-empty array', itinerary.days);
  } else {
    if (itinerary.days.length === 0) failures.push({
      code: 'empty_array', jsonPath: '$.days', expectedContract: 'non-empty array',
      observed: 'array(0)', source,
    });
    itinerary.days.forEach((day, dayIndex) => {
      const dayPath = `$.days[${dayIndex}]`;
      if (!day || typeof day !== 'object' || Array.isArray(day)) {
        invalidType(dayPath, 'object', day);
        return;
      }
      for (const [key, expected] of Object.entries(DAY_REQUIRED)) {
        if (valueType(day[key]) !== expected) invalidType(`${dayPath}.${key}`, expected, day[key]);
      }
      if (!Array.isArray(day.stops)) return;
      day.stops.forEach((stop, stopIndex) => {
        const stopPath = `${dayPath}.stops[${stopIndex}]`;
        if (!stop || typeof stop !== 'object' || Array.isArray(stop)) {
          invalidType(stopPath, 'object', stop);
          return;
        }
        for (const [key, expected] of Object.entries(STOP_REQUIRED)) {
          if (valueType(stop[key]) !== expected) invalidType(`${stopPath}.${key}`, expected, stop[key]);
        }
        if (typeof stop.type === 'string' && !STOP_TYPES.has(stop.type)) failures.push({
          code: 'unsupported_enum', jsonPath: `${stopPath}.type`,
          expectedContract: [...STOP_TYPES].join('|'), observed: boundedSummary(stop.type), source,
        });
      });
    });
  }

  const category = failures.length === 0 ? null : ({
    provider_output: 'provider_produced_invalid_itinerary',
    deterministic_normalization: 'normalizer_corrupted_valid_itinerary',
    persistence_transformation: 'persistence_transformation_corrupted_itinerary',
    fallback: 'fallback_plan_incorrectly_classified',
  }[source] || 'validator_rejected_supported_shape');
  return { valid: failures.length === 0, category, failures };
}

function canonicalFrozenSnapshot(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => !PRESENTATION_OR_LIFECYCLE_FIELDS.has(key)),
  );
}

function recursiveDiff(left, right, path = '$', out = []) {
  if (sha256(left) === sha256(right)) return out;
  const leftType = valueType(left);
  const rightType = valueType(right);
  if (leftType !== rightType || left == null || right == null || typeof left !== 'object') {
    out.push({ jsonPath: path, leftHash: sha256(left), rightHash: sha256(right) });
    return out;
  }
  if (Array.isArray(left)) {
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      recursiveDiff(left[i], right[i], `${path}[${i}]`, out);
    }
    return out;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) recursiveDiff(left[key], right[key], `${path}.${key}`, out);
  return out;
}

function compareCanonicalStates(namedStates = []) {
  const comparisons = [];
  const mismatches = [];
  for (let index = 1; index < namedStates.length; index += 1) {
    const [leftSource, left] = namedStates[index - 1];
    const [rightSource, right] = namedStates[index];
    const leftFrozen = canonicalFrozenSnapshot(left);
    const rightFrozen = canonicalFrozenSnapshot(right);
    const frozenPlanMatches = sha256(leftFrozen) === sha256(rightFrozen);
    comparisons.push({
      leftSource, rightSource, leftHash: sha256(leftFrozen), rightHash: sha256(rightFrozen),
      frozenPlanMatches,
    });
    for (const mismatch of recursiveDiff(left, right)) {
      const topField = mismatch.jsonPath.split('.')[1]?.split('[')[0];
      mismatches.push({
        ...mismatch, leftSource, rightSource,
        classification: PRESENTATION_OR_LIFECYCLE_FIELDS.has(topField)
          ? 'expected_projection_difference' : 'prohibited_plan_mutation',
      });
    }
  }
  return {
    comparisons,
    mismatches,
    prohibitedMismatches: mismatches.filter((row) => row.classification === 'prohibited_plan_mutation'),
  };
}

function evaluateLifecycleJournal(journal) {
  if (!Array.isArray(journal)) return {
    lifecycleJournalMatches: null,
    boundedCode: 'lifecycle_journal_result_missing',
    expectedCount: EXPECTED_LIFECYCLE_JOURNAL.length,
    actualCount: null,
    firstMismatchIndex: null,
  };
  const firstMismatchIndex = EXPECTED_LIFECYCLE_JOURNAL.findIndex((value, index) => journal[index] !== value);
  const matches = journal.length === EXPECTED_LIFECYCLE_JOURNAL.length && firstMismatchIndex === -1;
  return {
    lifecycleJournalMatches: matches,
    expectedCount: EXPECTED_LIFECYCLE_JOURNAL.length,
    actualCount: journal.length,
    firstMismatchIndex: matches ? null : (firstMismatchIndex === -1 ? EXPECTED_LIFECYCLE_JOURNAL.length : firstMismatchIndex),
  };
}

function reconcileExposure({ priorExposure, currentRun, cumulative } = {}) {
  const dimensions = ['requests', 'inputTokens', 'outputTokens', 'costUsd'];
  const dimensionMatches = Object.fromEntries(dimensions.map((dimension) => {
    const expected = Number(priorExposure?.[dimension]) + Number(currentRun?.[dimension]);
    const actual = Number(cumulative?.[dimension]);
    const tolerance = dimension === 'costUsd' ? 1e-9 : 0;
    return [dimension, Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(expected - actual) <= tolerance];
  }));
  return {
    currentRun, priorExposure, cumulative, dimensionMatches,
    reconciles: Object.values(dimensionMatches).every(Boolean),
  };
}

function validateProviderEvidence({ rows = [], providerHttpRequests = null } = {}) {
  if (providerHttpRequests === 0) {
    return { ok: true, failures: [], rows: 0, providerHttpRequests: 0 };
  }
  const failures = [];
  const required = [
    'providerRequestId', 'ledgerAttemptId', 'dispatchAuthorizationId', 'provider',
    'resolvedModel', 'reservationModel', 'dispatchModel', 'sdkRequestModel', 'usageSource',
  ];
  rows.forEach((row) => required.forEach((key) => {
    if (row?.[key] == null || row[key] === '') failures.push(`${key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}_missing`);
  }));
  if (rows.length !== providerHttpRequests) failures.push('provider_http_request_count_mismatch');
  if (new Set(rows.map((row) => row.providerRequestId).filter(Boolean)).size !== rows.length) {
    failures.push('provider_request_id_not_unique');
  }
  if (new Set(rows.map((row) => row.ledgerAttemptId).filter((value) => value != null)).size !== rows.length) {
    failures.push('ledger_attempt_id_not_unique');
  }
  if (new Set(rows.map((row) => row.dispatchAuthorizationId).filter(Boolean)).size !== rows.length) {
    failures.push('dispatch_authorization_id_not_unique');
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)], rows: rows.length, providerHttpRequests };
}

function classifyMongoAvailability(evidence = {}) {
  let classification = null;
  if (!evidence.processRunning || !evidence.portListening) classification = 'mongo_process_stopped';
  else if (evidence.targetMatches === false) classification = 'incorrect_ping_target';
  else if (evidence.cleanupClosedSharedResource) classification = 'cleanup_closed_shared_resource';
  else if (evidence.pingAttemptedDuringShutdown) classification = 'ping_race';
  else if (!evidence.connectionSucceeded || !evidence.pingSucceeded) classification = 'diagnostic_bug';
  return { ...evidence, localMongoStillAvailable: classification == null, classification };
}

function measureForeignRecordPreservation({ before = {}, after = {} } = {}) {
  const report = {
    foreignUsersBefore: before.users ?? null,
    foreignUsersAfter: after.users ?? null,
    foreignTripsBefore: before.trips ?? null,
    foreignTripsAfter: after.trips ?? null,
    foreignLeasesBefore: before.leases ?? null,
    foreignLeasesAfter: after.leases ?? null,
  };
  report.unchanged = Object.values(report).every(Number.isFinite)
    && report.foreignUsersBefore === report.foreignUsersAfter
    && report.foreignTripsBefore === report.foreignTripsAfter
    && report.foreignLeasesBefore === report.foreignLeasesAfter;
  return report;
}

function parseSseTranscript(raw) {
  const events = [];
  for (const block of String(raw || '').split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') continue;
    try { events.push(JSON.parse(data)); } catch { /* bounded parser ignores partial terminal bytes */ }
  }
  return events;
}

function extractCanonicalTranscriptStates(events = []) {
  const revision1 = events.find((event) => event.type === 'itinerary_ready');
  const revision2 = events.find((event) => event.type === 'prose_ready');
  const done = events.find((event) => event.type === 'done');
  return {
    phaseAProviderItinerary: revision1?.response?.itineraryData ?? null,
    revision1Response: revision1?.response ?? null,
    revision1CanonicalPlan: revision1?.canonicalPlan ?? null,
    revision2Response: revision2?.response ?? null,
    revision2CanonicalPlan: revision2?.canonicalPlan ?? null,
    doneCanonicalPlan: done?.canonicalPlan ?? null,
  };
}

module.exports = {
  EXPECTED_LIFECYCLE_JOURNAL,
  validateCanonicalItinerary,
  canonicalFrozenSnapshot,
  compareCanonicalStates,
  evaluateLifecycleJournal,
  reconcileExposure,
  validateProviderEvidence,
  classifyMongoAvailability,
  measureForeignRecordPreservation,
  parseSseTranscript,
  extractCanonicalTranscriptStates,
};
