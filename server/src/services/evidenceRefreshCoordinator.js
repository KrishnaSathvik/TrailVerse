'use strict';

const { createHash } = require('crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function semanticFingerprint(request) {
  return createHash('sha256').update(JSON.stringify(stable({
    provider: request?.provider,
    operation: request?.operation,
    parameters: request?.parameters,
    publicCanonicalRequest: request?.publicCanonicalRequest,
  }))).digest('hex');
}

function coordinatorError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createEvidenceRefreshCoordinator({
  acquireLease,
  releaseLease,
  executeRefresh,
  executeEphemeral,
  waitForRefresh,
  leaseMs = 30000,
} = {}) {
  if (![acquireLease, releaseLease, executeRefresh, waitForRefresh].every((item) => typeof item === 'function')) {
    throw new TypeError('Refresh coordinator requires lease, execution, and wait functions');
  }
  const inFlight = new Map();
  const ephemeralInFlight = new Map();

  async function executeRecord(record, { ownerId }) {
    let ownedLease = null;
    try {
      if (record.ephemeral) {
        record.state = 'fetching';
        const result = await executeEphemeral({
          request: record.request, requirementCount: record.requirementCount,
          signal: record.controller.signal, lifecycle: record,
        });
        record.state = 'settled';
        return result;
      }
      const leaseResult = await acquireLease({
        leaseKey: record.dedupeKey,
        ownerId,
        leaseMs,
      });
      if (leaseResult?.outcome !== 'acquired') {
        record.state = 'fetching';
        return await waitForRefresh({
          request: record.request,
          requirements: record.requirements,
          lease: leaseResult?.lease || null,
          signal: record.controller.signal,
        });
      }
      ownedLease = leaseResult.lease;
      record.lease = {
        ownerId: ownedLease.ownerId,
        fencingToken: ownedLease.fencingToken,
      };
      record.state = 'fetching';
      const result = await executeRefresh({
        request: record.request,
        requirements: record.requirements,
        requirementCount: record.requirementCount,
        lease: ownedLease,
        signal: record.controller.signal,
        lifecycle: record,
      });
      record.state = 'settled';
      return result;
    } catch (error) {
      record.state = record.controller.signal.aborted ? 'aborted' : 'settled';
      throw error;
    } finally {
      if (ownedLease) {
        await releaseLease({
          leaseKey: record.dedupeKey,
          ownerId: ownedLease.ownerId,
          fencingToken: ownedLease.fencingToken,
        });
      }
    }
  }

  function waitForRecord(record, { signal, coalesced }) {
    record.waiterCount += 1;
    record.waiterPeak = Math.max(record.waiterPeak, record.waiterCount);
    let detached = false;
    const detach = () => {
      if (detached) return;
      detached = true;
      record.waiterCount = Math.max(0, record.waiterCount - 1);
      if (record.waiterCount === 0 && !record.scheduledOwner
        && ['pending', 'fetching'].includes(record.state)) {
        record.controller.abort();
      }
    };
    let abortHandler = null;
    const cancellation = signal ? new Promise((_, reject) => {
      if (signal.aborted) {
        detach();
        reject(Object.assign(coordinatorError('evidence_refresh_cancelled', 'Evidence refresh caller cancelled'),
          record.ephemeral ? { executionSnapshot: record.executionSnapshot?.() } : {}));
        return;
      }
      abortHandler = () => {
        detach();
        reject(Object.assign(coordinatorError('evidence_refresh_cancelled', 'Evidence refresh caller cancelled'),
          record.ephemeral ? { executionSnapshot: record.executionSnapshot?.() } : {}));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }) : null;
    const awaited = cancellation ? Promise.race([record.promise, cancellation]) : record.promise;
    return awaited.then((result) => ({
      ...result,
      coalesced,
      coalescedWaiters: Math.max(0, record.waiterPeak - 1),
    })).finally(() => {
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      detach();
    });
  }

  function run({ request, ownerId, requirementCount = 1, requirements = [], signal = null, scheduledOwner = false, ephemeral = false } = {}) {
    if (!request?.dedupeKey || !ownerId) return Promise.reject(new TypeError('Refresh run requires request.dedupeKey and ownerId'));
    if (ephemeral && typeof executeEphemeral !== 'function') return Promise.reject(new TypeError('Ephemeral executor required'));
    if (ephemeral && signal?.aborted) return Promise.reject(coordinatorError('evidence_refresh_cancelled', 'Caller cancelled'));
    const active = ephemeral ? ephemeralInFlight : inFlight;
    const fingerprint = semanticFingerprint(request);
    const existing = active.get(request.dedupeKey);
    if (existing && !(ephemeral && existing.controller.signal.aborted)) {
      if (existing.semanticFingerprint !== fingerprint) {
        return Promise.reject(coordinatorError(
          'evidence_refresh_dedupe_collision',
          'The same evidence refresh key described different provider semantics'
        ));
      }
      existing.requirementCount += requirementCount;
      const existingIds = new Set(existing.requirements.map((item) => item.requirementId));
      for (const requirement of requirements) {
        if (!existingIds.has(requirement.requirementId)) existing.requirements.push(requirement);
      }
      return waitForRecord(existing, { signal, coalesced: true });
    }
    const record = {
      ephemeral,
      dedupeKey: request.dedupeKey,
      semanticFingerprint: fingerprint,
      request,
      requirements,
      requirementCount,
      controller: new AbortController(),
      waiterCount: 0,
      waiterPeak: 0,
      scheduledOwner,
      lease: null,
      state: 'pending',
      promise: null,
    };
    active.set(request.dedupeKey, record);
    record.promise = executeRecord(record, { ownerId });
    record.promise.finally(() => {
      if (active.get(record.dedupeKey) === record) active.delete(record.dedupeKey);
    }).catch(() => {});
    return waitForRecord(record, { signal, coalesced: false });
  }

  return { inFlight, run };
}

module.exports = {
  createEvidenceRefreshCoordinator,
  semanticFingerprint,
};
