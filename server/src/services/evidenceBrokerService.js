'use strict';

const { createHmac, randomUUID } = require('crypto');
const { getEvidencePolicy } = require('../config/evidencePolicies');
const { assertPublicEvidenceWrite } = require('../utils/evidencePrivacy');
const { buildEvidenceBundle } = require('../utils/evidenceBundle');
const { evaluateRequirementCoverage } = require('./evidenceCoverageEvaluator');
const { createEvidenceRefreshCoordinator, semanticFingerprint } = require('./evidenceRefreshCoordinator');
const { queryEvidenceForRequirement, upsertEvidenceVersion } = require('./evidenceStoreService');
const { resolveEvidenceRefreshHashSecret } = require('../config/trailieEvidenceRefreshSecret');

// Providers may explicitly report zero physical requests (e.g. missing key).
// Legacy adapters without accounting still count as one provider attempt.
function physicalAttempts(value) {
  return Number.isInteger(value) && value >= 0 ? value : 1;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function brokerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const STORAGE_FIELDS = new Set([
  '_id', '__v', 'evidenceId', 'evidenceIds', 'logicalKey', 'canonicalKey',
  'supersession', 'supersedesEvidenceId', 'supersededByEvidenceId',
  'retention', 'isCurrent', 'schemaVersion', 'corroboratingEvidenceIds', 'conflictingEvidenceIds',
]);

function storageFreeOutput(value) {
  if (Array.isArray(value)) return value.map(storageFreeOutput);
  if (value instanceof Date) return new Date(value);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([key]) => !STORAGE_FIELDS.has(key))
      .map(([key, item]) => [key, storageFreeOutput(item)])
  );
  return value;
}

function boundedReason(code) {
  return typeof code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(code)
    ? code : 'provider_unavailable';
}

function publicRefreshHash(request, secret) {
  if (!secret) throw brokerError('evidence_refresh_hash_secret_missing', 'Evidence refresh hashing secret is required');
  assertPublicEvidenceWrite({
    item: { privacyScope: 'public', publicCanonicalRequest: request?.publicCanonicalRequest },
    sourceRequest: {
      privacyScope: 'public', provider: request?.provider || 'unknown', operation: request?.operation || 'unknown',
    },
  });
  return createHmac('sha256', secret)
    .update(JSON.stringify(stable(request.publicCanonicalRequest)))
    .digest('hex');
}

function validateRequirements(requirements) {
  if (!Array.isArray(requirements)) throw new TypeError('Evidence requirements must be an array');
  const contracts = new Map();
  for (const requirement of requirements) {
    if (!requirement?.requirementId) throw new TypeError('Every evidence requirement needs a requirementId');
    const contract = JSON.stringify(stable(requirement));
    const previous = contracts.get(requirement.requirementId);
    if (previous && previous !== contract) {
      throw brokerError(
        'evidence_requirement_identity_conflict',
        'The same evidence requirement ID described different contracts'
      );
    }
    contracts.set(requirement.requirementId, contract);
  }
}

/**
 * Bounded, machine-safe classification of why one candidate was rejected.
 *
 * `error.code` alone was not enough: a Mongoose ValidationError carries none, so
 * a schema mismatch that discarded 100% of web candidates reported an EMPTY
 * reason list behind the generic `provider_response_invalid`. These codes name
 * the failing path and validator without echoing documents or stack traces.
 */
function classifyCandidateRejection(error) {
  const codes = new Set();
  if (!error) return codes;
  if (error.code) codes.add(String(error.code).slice(0, 64));
  if (error.name && error.name !== 'Error') codes.add(String(error.name).slice(0, 64));
  for (const field of Object.keys(error.errors || {}).slice(0, 6)) {
    codes.add(`path:${String(field).slice(0, 48)}`);
    const nested = error.errors[field];
    // Mongoose nests the real cause (e.g. a strict-mode unknown field) under `reason`.
    const reasonName = nested?.reason?.name || nested?.name;
    if (reasonName) codes.add(`validator:${String(reasonName).slice(0, 48)}`);
    const unknownField = String(nested?.reason?.message || '').match(/Field `([^`]+)` is not in schema/);
    if (unknownField) codes.add(`strict_unknown_field:${unknownField[1].slice(0, 48)}`);
  }
  return codes;
}

function materializeCandidate(candidate, { now }) {
  const policy = getEvidencePolicy(candidate.topic);
  const observedAt = new Date(candidate.observedAt || candidate.observation?.observedAt || now);
  if (Number.isNaN(observedAt.getTime())) {
    throw brokerError('provider_response_invalid', 'Normalized evidence has an invalid observation time');
  }
  const fetchedAt = new Date(now);
  const expiresAt = new Date(observedAt.getTime() + (policy.freshSeconds * 1000));
  const staleUntil = new Date(expiresAt.getTime() + (policy.maxStaleSeconds * 1000));
  const evidence = {
    schemaVersion: 1,
    entityId: candidate.entityId,
    topic: candidate.topic,
    evidenceType: candidate.evidenceType,
    claim: candidate.claim,
    scope: candidate.scope,
    source: candidate.source,
    observation: {
      ...(candidate.observation || {}), observedAt, fetchedAt, expiresAt, staleUntil,
      retrievalMode: candidate.observation?.retrievalMode || 'live',
    },
    quality: {
      authorityClass: candidate.quality?.authorityClass || candidate.source?.sourceClass,
      freshnessStatus: 'fresh', scopeMatch: 'exact', corroboratingEvidenceIds: [],
      conflictingEvidenceIds: [], conflictStatus: 'none', ...(candidate.quality || {}),
    },
    provenance: {
      extractionMethod: 'structured_adapter', extractorVersion: 'evidence-provider-v1',
      rawPayloadHash: null, contentHash: 'pending', ...(candidate.provenance || {}),
    },
    retention: {
      class: policy.freshnessClass === 'stable' ? 'public_stable_1y' : 'public_dynamic_90d',
      licenseClass: 'government_public', storeClaimText: true, deleteAfter: null,
      ...(candidate.retention || {}),
    },
    ...(candidate.absenceProof ? { absenceProof: candidate.absenceProof } : {}),
    isCurrent: true,
  };
  return evidence;
}

function absenceCandidates(fetched, request, requirements) {
  const completeness = fetched?.completeness;
  if (completeness?.isComplete !== true) return [];
  // A complete fetch proves absence either wholesale (the feed is empty) or per
  // topic (the feed is non-empty but contains nothing about that subject). The
  // second case is the common one for safety questions: a park usually has
  // alerts, and usually none of them are about fire.
  const wholeFeedEmpty = completeness.emptyMeans === 'proves_absent';
  const emptyTopics = new Set(completeness.emptyTopics || []);
  if (!wholeFeedEmpty && emptyTopics.size === 0) return [];
  const topicSet = new Set(completeness.topics || []);
  const observedAt = completeness.scope?.observedAt || fetched?.metadata?.observedAt;
  return requirements.flatMap((requirement) => {
    if (requirement.absenceSemantics !== 'proves_absent' || !topicSet.has(requirement.topic)) return [];
    if (!wholeFeedEmpty && !emptyTopics.has(requirement.topic)) return [];
    if (completeness.scope?.entityId !== requirement.entity?.entityId) return [];
    const entityId = requirement.entity.entityId;
    return [{
      entityId,
      topic: requirement.topic,
      evidenceType: requirement.evidenceTypes[0],
      claim: {
        identity: `absence:${requirement.topic}`,
        text: null,
        normalizedValue: false,
        unit: null,
        status: null,
        subjectId: entityId,
        objectId: null,
        qualifiers: [],
        polarity: 'negative',
      },
      scope: {
        geographicEntityIds: [entityId], validFrom: null, validThrough: null,
        audience: 'public', locale: 'en-US',
      },
      source: {
        provider: request.provider, sourceClass: 'official_owner',
        sourceId: `${request.provider}:${request.operation}:${request.parameters.parkCode}`,
        url: null, title: null, publishedAt: null, sourceUpdatedAt: null,
      },
      observedAt,
      quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
      provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'evidence-provider-v1' },
      absenceProof: {
        providerDeclaredComplete: true,
        completenessScope: `${requirement.topic}_for_entity`,
        observedAt,
        ruleCode: 'authoritative_complete_empty_result',
      },
    }];
  });
}

function unsupportedResolution(requirement) {
  return {
    requirementId: requirement.requirementId,
    status: 'unsupported',
    evidenceIds: [],
    reasonCodes: ['provider_not_configured'],
    candidateSummary: {
      examined: 0, usable: 0, expired: 0, wrongScope: 0, wrongTopic: 0, wrongType: 0,
      insufficientAuthority: 0, conflicted: 0, privacyRejected: 0,
    },
    refresh: { needed: false, refreshKeyHash: null, outcome: 'not_needed', reasonCode: 'provider_not_configured' },
    cacheStatus: 'not_applicable', maxEvidenceAgeMs: null, authorityClasses: [],
    providersUsed: [], conflictStatus: 'none', latencyMs: null, selectedEvidence: [],
  };
}

function createEvidenceBroker({
  providers = [],
  queryEvidence = (requirement) => queryEvidenceForRequirement({ requirement }),
  persistCandidate = (args) => upsertEvidenceVersion(args),
  acquireLease,
  releaseLease,
  waitForRefresh = async () => ({ outcome: 'coalesced_store_update' }),
  recordRefreshEvent = async () => {},
  refreshHashSecret = resolveEvidenceRefreshHashSecret(),
  now = () => new Date(),
  leaseMs = 30000,
  reserveRefreshBudget = async () => ({ allowed: true }),
} = {}) {
  if (typeof acquireLease !== 'function' || typeof releaseLease !== 'function') {
    throw new TypeError('Evidence broker requires fenced lease acquisition and release functions');
  }
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));

  async function executeRefresh({ request, requirements, requirementCount, lease, signal, lifecycle, ephemeral = false }) {
    const provider = providerById.get(request.provider);
    const refreshKeyHash = ephemeral ? semanticFingerprint(request) : publicRefreshHash(request, refreshHashSecret);
    const startedAt = now();
    let providerAttemptCount = 0;
    let normalizedCandidateCount = 0;
    let persistedCandidateCount = 0;
    let invalidCandidateCount = 0;
    let privacyCandidateCount = 0;
    let retryCount = 0;
    const rejectedByTopic = {};
    const invalidReasonCodes = new Set();
    let outcome = 'failed';
    let reasonCode = null;
    const ephemeralResult = {};
    // A cancelled waiter returns promptly, with execution accounting known at
    // detachment. The terminal refresh event records the final physical totals.
    if (ephemeral && lifecycle) lifecycle.executionSnapshot = () => ({
      providerAttemptCount, retryCount,
      latencyMs: Math.max(0, new Date(now()) - new Date(startedAt)),
    });
    const checkCancellation = () => {
      if (ephemeral && signal?.aborted) throw brokerError('evidence_refresh_cancelled', 'Caller cancelled');
    };
    try {
      let fetched;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        checkCancellation();
        const reservation = await reserveRefreshBudget({ phase: 'before_dispatch', request, attempt });
        if (reservation?.allowed === false) {
          throw brokerError('provider_budget_exhausted', 'Evidence provider dispatch budget exhausted');
        }
        checkCancellation();
        try {
          if (ephemeral) providerAttemptCount += 1;
          fetched = await provider.fetch(request, { signal });
          providerAttemptCount += physicalAttempts(fetched?.providerAttempts) - (ephemeral ? 1 : 0);
          break;
        } catch (error) {
          providerAttemptCount += physicalAttempts(error?.providerAttempts) - (ephemeral ? 1 : 0);
          const classified = provider.classifyError?.(error) || {};
          if (attempt === 0 && classified.retryable === true && !signal?.aborted) {
            retryCount += 1;
            continue;
          }
          throw Object.assign(error, { brokerReasonCode: classified.code || error.code });
        }
      }
      checkCancellation();
      const normalized = await provider.normalize(fetched?.raw, request, fetched?.metadata || {});
      if (!Array.isArray(normalized)) throw brokerError('provider_response_invalid', 'Provider normalization must return an array');
      checkCancellation();
      if (ephemeral) {
        normalizedCandidateCount = normalized.length;
        Object.assign(ephemeralResult, {
          status: normalized.length ? 'fulfilled' : 'no_result',
          normalizedCandidates: storageFreeOutput(normalized),
          observedAt: fetched?.metadata?.observedAt || new Date(now()).toISOString(),
          metadata: storageFreeOutput(fetched?.metadata || {}),
          completeness: storageFreeOutput(fetched?.completeness || null),
          reasonCode: null,
        });
        outcome = 'succeeded';
        return ephemeralResult;
      }
      // Absence is per topic, not per fetch. One alerts call can return real
      // trail closures AND prove there is no fire notice; gating absence on an
      // entirely empty normalization could only ever express the second when
      // the first did not exist.
      const proven = absenceCandidates(fetched, request, requirements)
        .filter((item) => !normalized.some((candidate) => candidate.topic === item.topic));
      const candidates = [...normalized, ...proven];
      normalizedCandidateCount = candidates.length;
      if (lifecycle) lifecycle.state = 'persisting';
      for (const rawCandidate of candidates) {
        try {
          const candidate = materializeCandidate(rawCandidate, { now: now() });
          const sourceRequest = {
            privacyScope: 'public', provider: request.provider, operation: request.operation,
            publicCanonicalRequest: request.publicCanonicalRequest,
          };
          assertPublicEvidenceWrite({ item: { privacyScope: 'public', ...candidate }, sourceRequest });
          await persistCandidate({ candidate, sourceRequest, lease, now: now() });
          persistedCandidateCount += 1;
        } catch (error) {
          if (error?.code === 'stale_evidence_refresh_lease') throw error;
          if (error?.code === 'shared_evidence_private_data') {
            privacyCandidateCount += 1;
            reasonCode = 'candidate_privacy_rejected';
            if (rawCandidate?.topic) {
              rejectedByTopic[rawCandidate.topic] = rejectedByTopic[rawCandidate.topic] || { invalid: 0, privacy: 0 };
              rejectedByTopic[rawCandidate.topic].privacy += 1;
            }
          } else {
            invalidCandidateCount += 1;
            reasonCode = 'provider_response_invalid';
            // The underlying code is what makes a rejection actionable. Collapsing
            // every cause into `provider_response_invalid` hid a missing topic
            // freshness policy that was discarding 100% of candidates from every
            // provider. Bounded, non-traveler-facing, no payload echoed.
            for (const code of classifyCandidateRejection(error)) invalidReasonCodes.add(code);
            if (rawCandidate?.topic) {
              rejectedByTopic[rawCandidate.topic] = rejectedByTopic[rawCandidate.topic] || { invalid: 0, privacy: 0 };
              rejectedByTopic[rawCandidate.topic].invalid += 1;
            }
          }
        }
      }
      outcome = 'succeeded';
      return {
        outcome, refreshKeyHash, providerAttemptCount, persistedCandidateCount,
        normalizedCandidateCount, absenceProven: candidates.some((item) => item.absenceProof),
        rejectedByTopic,
        ...(invalidReasonCodes.size > 0 ? { invalidReasonCodes: [...invalidReasonCodes].sort() } : {}),
      };
    } catch (error) {
      const classified = provider?.classifyError?.(error) || {};
      reasonCode = error?.brokerReasonCode || classified.code || error?.code || 'provider_unavailable';
      if (ephemeral) {
        const internalReason = ['provider_budget_exhausted', 'provider_response_invalid', 'evidence_refresh_cancelled']
          .includes(error?.code) ? error.code : null;
        reasonCode = signal?.aborted ? 'evidence_refresh_cancelled'
          : boundedReason(error?.brokerReasonCode || internalReason || classified.code || error?.code);
      }
      if (reasonCode === 'provider_cancelled' || reasonCode === 'evidence_refresh_cancelled') outcome = 'cancelled';
      if (ephemeral) {
        Object.assign(ephemeralResult, {
          status: outcome === 'cancelled' ? 'cancelled' : 'failed',
          normalizedCandidates: [], observedAt: null, metadata: {}, completeness: null, reasonCode,
        });
        return ephemeralResult;
      }
      throw Object.assign(error, { brokerReasonCode: reasonCode });
    } finally {
      const completedAt = now();
      const cost = provider?.estimateCost?.(request) || { costStatus: 'unknown', costUsd: null };
      const event = {
        refreshEventId: `${ephemeral ? 'ephemeral' : 'refresh'}:${randomUUID()}`,
        refreshKeyHash,
        provider: request.provider,
        operation: request.operation,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        requirementCount: Math.max(requirementCount, Number(lifecycle?.requirementCount || 0)),
        coalescedRequirements: Math.max(0, Math.max(requirementCount, Number(lifecycle?.requirementCount || 0)) - 1),
        coalescedWaiters: Math.max(0, Number(lifecycle?.waiterPeak || 1) - 1),
        waiterPeak: Math.max(1, Number(lifecycle?.waiterPeak || 1)),
        leaseOutcome: ephemeral ? 'not_applicable' : 'acquired',
        providerAttemptCount,
        retryCount,
        normalizedCandidateCount,
        persistedCandidateCount,
        rejectedCandidateCounts: { invalid: invalidCandidateCount, privacy: privacyCandidateCount },
        // The recorded event is the observable surface, so the underlying causes
        // belong here too: a bare `provider_response_invalid` with persisted: 0
        // is indistinguishable from a dozen different defects.
        ...(invalidReasonCodes.size > 0 ? { invalidReasonCodes: [...invalidReasonCodes].sort() } : {}),
        outcome,
        reasonCode,
        latencyMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
        costStatus: cost.costStatus === 'known' ? 'known' : 'unknown',
        costUsd: cost.costStatus === 'known' ? Number(cost.costUsd) : null,
      };
      if (ephemeral) Object.assign(ephemeralResult, {
        providerAttemptCount, retryCount, latencyMs: event.latencyMs,
        cost: { costStatus: event.costStatus, costUsd: event.costUsd },
      });
      try { await recordRefreshEvent(event); } catch { /* telemetry cannot invalidate persisted evidence */ }
    }
  }

  const coordinator = createEvidenceRefreshCoordinator({
    acquireLease, releaseLease, executeRefresh, waitForRefresh, leaseMs,
    executeEphemeral: (args) => executeRefresh({ ...args, ephemeral: true }),
  });

  /**
   * Storage-free provider execution. Ownership is opaque and bound AFTER
   * coalescing; candidates/metadata are copied independently for each waiter.
   * Cancellation detaches one waiter; the last waiter aborts the shared fetch.
   */
  async function dispatchEphemeral({ requirement, requestId, signal = null, ownership = null } = {}) {
    validateRequirements([requirement]);
    if (!requestId) throw new TypeError('Ephemeral dispatch requires requestId');
    const startedAt = now();
    let request = null;
    const empty = {
      normalizedCandidates: [], observedAt: null, metadata: {}, completeness: null,
      providerAttemptCount: 0, retryCount: 0, latencyMs: 0,
      cost: { costStatus: 'unknown', costUsd: null }, coalesced: false,
    };
    const bind = (result) => ({
      ephemeral: true,
      provider: request?.provider || null, operation: request?.operation || null,
      dedupeKey: request?.dedupeKey || null,
      semanticFingerprint: request ? semanticFingerprint(request) : null,
      ...structuredClone(result), ownership,
    });
    try {
      if (signal?.aborted) throw brokerError('evidence_refresh_cancelled', 'Caller cancelled');
      const provider = [
        ...(requirement.preferredProviders || []), ...(requirement.allowedFallbackProviders || []),
      ].map((id) => providerById.get(id)).find((candidate) => candidate?.supports?.(requirement));
      if (!provider) return bind({ ...empty, status: 'unsupported', reasonCode: 'provider_not_configured' });
      request = provider.buildRequest(requirement, { requestId, now: startedAt });
      const result = await coordinator.run({
        request, ownerId: requestId, signal, ephemeral: true,
      });
      // Covers aborts during normalization/telemetry, including providers ignoring signal.
      if (signal?.aborted) return bind({
        ...result, status: 'cancelled', normalizedCandidates: [], reasonCode: 'evidence_refresh_cancelled',
      });
      return bind(result);
    } catch (error) {
      const reasonCode = signal?.aborted ? 'evidence_refresh_cancelled' : boundedReason(error?.code);
      return bind({
        ...empty, ...(error?.executionSnapshot || {}),
        status: reasonCode === 'evidence_refresh_cancelled' ? 'cancelled' : 'failed',
        reasonCode, latencyMs: Math.max(0, new Date(now()) - new Date(startedAt)),
      });
    }
  }

  async function resolveEvidence({
    requirements, requestId, signal = null,
    // Per-CALL, because the broker is a shared singleton: the turn that is
    // waiting supplies its own timeline.
    beginSpan: turnBeginSpan = null,
  } = {}) {
    const beginSpan = typeof turnBeginSpan === 'function' ? turnBeginSpan : () => () => {};
    validateRequirements(requirements);
    if (!requestId) throw new TypeError('Evidence resolution requires requestId');
    const at = now();
    // CACHE LOOKUP. Fanned out across requirements, so wall clock and
    // accumulated work diverge here: 14 reads costing 300ms of wall clock are
    // parallel, 4,200ms would be serial. The timeline keeps both.
    const initial = await Promise.all(requirements.map(async (requirement) => {
      // §A — the span says WHICH requirement it was for. Topic slugs only.
      const endLookup = beginSpan('evidence_cache_lookup', { requirement: requirement.topic });
      try {
        const candidates = await queryEvidence(requirement, { now: at });
        return evaluateRequirementCoverage(requirement, candidates, { now: at });
      } finally {
        endLookup();
      }
    }));

    const final = [...initial];
    const groups = new Map();
    for (let index = 0; index < requirements.length; index += 1) {
      const requirement = requirements[index];
      if (initial[index].status === 'satisfied_fresh') continue;
      const providerOrder = [
        ...(requirement.preferredProviders || []), ...(requirement.allowedFallbackProviders || []),
      ];
      const provider = providerOrder
        .map((providerId) => providerById.get(providerId))
        .find((candidate) => candidate?.ephemeralOnly !== true && candidate?.supports?.(requirement));
      if (!provider) {
        if (!['satisfied_stale_safe', 'satisfied_partial'].includes(initial[index].status)) {
          final[index] = unsupportedResolution(requirement);
        }
        continue;
      }
      const request = provider.buildRequest(requirement, { requestId, now: at });
      const fingerprint = semanticFingerprint(request);
      const existing = groups.get(request.dedupeKey);
      if (existing && existing.fingerprint !== fingerprint) {
        throw brokerError('evidence_refresh_dedupe_collision', 'A refresh key described different physical requests');
      }
      const group = existing || { request, fingerprint, entries: [] };
      group.entries.push({ index, requirement });
      groups.set(request.dedupeKey, group);
    }

    const runGroup = async (group, { background = false } = {}) => {
      const hash = publicRefreshHash(group.request, refreshHashSecret);
      // The span describes the GROUP this one call actually fetched. Labelling it
      // with a single requirement named an arbitrary member and misattributed
      // the others — the live 2026-08-27 `nps|alerts|thro` call served three.
      const endRefresh = beginSpan(
        background ? 'evidence_provider_refresh_background' : 'evidence_provider_refresh',
        {
          provider: group.request?.provider,
          groupKey: group.request?.dedupeKey,
          // R3 — a multi-page follow shares its base requirement's topic, so the
          // topic alone made the official_pages wave's fetches indistinguishable.
          // Carry the follow ordinal into the bounded slug.
          requirements: group.entries.map((entry) => {
            const topic = entry.requirement?.topic;
            if (!topic) return null;
            const follow = (String(entry.requirement?.requirementId || '').match(/:follow(\d+)$/) || [])[1];
            return follow ? `${topic}_follow${follow}` : topic;
          }).filter(Boolean),
          blocking: !background,
        }
      );
      try {
        const reservation = await reserveRefreshBudget({ phase: 'before_lease', request: group.request, attempt: 0 });
        if (reservation?.allowed === false) {
          throw brokerError('provider_budget_exhausted', 'Evidence refresh budget exhausted');
        }
        const refreshResult = await coordinator.run({
          request: group.request,
          ownerId: `broker:${requestId}:${randomUUID()}`,
          requirementCount: group.entries.length,
          requirements: group.entries.map((entry) => entry.requirement),
          signal: background ? null : signal,
          scheduledOwner: background,
        });
        for (const entry of group.entries) {
          if (initial[entry.index].status === 'satisfied_stale_safe') continue;
          const candidates = await queryEvidence(entry.requirement, { now: now() });
          const evaluated = evaluateRequirementCoverage(entry.requirement, candidates, { now: now() });
          if (evaluated.status === 'missing' && refreshResult.normalizedCandidateCount === 0
            && refreshResult.absenceProven !== true) {
            evaluated.reasonCodes = [...new Set([...evaluated.reasonCodes, 'absence_not_proven'])].sort();
          }
          const rejected = refreshResult.rejectedByTopic?.[entry.requirement.topic];
          if (rejected) {
            evaluated.candidateSummary.privacyRejected += rejected.privacy || 0;
            if (rejected.privacy) evaluated.reasonCodes = [...new Set([...evaluated.reasonCodes, 'candidate_privacy_rejected'])].sort();
            if (rejected.invalid) evaluated.reasonCodes = [...new Set([...evaluated.reasonCodes, 'provider_response_invalid'])].sort();
          }
          evaluated.refresh = {
            needed: true, refreshKeyHash: hash,
            outcome: refreshResult.coalesced ? 'coalesced' : 'succeeded', reasonCode: null,
          };
          evaluated.cacheStatus = refreshResult.coalesced ? 'coalesced' : 'refreshed';
          // Proves the semantic-cache path end to end: the pre-refresh pass
          // rejected stored normalizedValue on contract version, so what is
          // being read now was produced by the current producer.
          if (evaluated.normalizationContract) {
            const before = initial[entry.index].normalizationContract;
            const expected = evaluated.normalizationContract.expectedVersion;
            evaluated.normalizationContract = {
              ...evaluated.normalizationContract,
              supersededVersions: (before?.observedVersions || [])
                .filter((version) => version !== expected).sort(),
              renormalized: (before?.mismatchedCandidates || 0) > 0,
            };
          }
          final[entry.index] = evaluated;
        }
      } catch (error) {
        for (const entry of group.entries) {
          if (initial[entry.index].status === 'satisfied_stale_safe') continue;
          const candidates = await queryEvidence(entry.requirement, { now: now() });
          const evaluated = evaluateRequirementCoverage(entry.requirement, candidates, { now: now() });
          const reasonCode = error.brokerReasonCode || error.code || 'provider_unavailable';
          if (reasonCode === 'evidence_refresh_cancelled' || reasonCode === 'provider_cancelled') {
            evaluated.status = 'cancelled';
            evaluated.cacheStatus = 'not_applicable';
          }
          evaluated.reasonCodes = [...new Set([...evaluated.reasonCodes, reasonCode])].sort();
          evaluated.refresh = {
            needed: true, refreshKeyHash: hash,
            outcome: evaluated.status === 'cancelled' ? 'cancelled' : 'failed', reasonCode,
          };
          final[entry.index] = evaluated;
        }
      } finally {
        endRefresh();
      }
    };

    const blocking = [];
    for (const group of groups.values()) {
      const hash = publicRefreshHash(group.request, refreshHashSecret);
      for (const entry of group.entries) {
        if (initial[entry.index].status === 'satisfied_stale_safe') {
          final[entry.index].refresh = {
            needed: true, refreshKeyHash: hash, outcome: 'started', reasonCode: null,
          };
        }
      }
      const staleOnly = group.entries.every((entry) => initial[entry.index].status === 'satisfied_stale_safe');
      if (staleOnly) {
        runGroup(group, { background: true }).catch(() => {});
      } else {
        blocking.push(runGroup(group));
      }
    }
    await Promise.all(blocking);

    const selected = final.flatMap((resolution) => resolution.selectedEvidence || []);
    const unique = [...new Map(selected.map((item) => [item.evidenceId, item])).values()];
    return buildEvidenceBundle({ requestId, createdAt: at, resolutions: final, candidates: unique });
  }

  return { resolveEvidence, dispatchEphemeral };
}

module.exports = {
  createEvidenceBroker,
  materializeCandidate,
  publicRefreshHash,
  validateRequirements,
  absenceCandidates,
};
