'use strict';

const mongoose = require('mongoose');
const TrailieEvidence = require('../models/TrailieEvidence');
const TrailieEvidenceRefreshLease = require('../models/TrailieEvidenceRefreshLease');
const { buildEvidenceKeys } = require('../utils/evidenceKey');
const { assertPublicEvidenceWrite } = require('../utils/evidencePrivacy');
const { verifyEvidenceRefreshLease } = require('./evidenceRefreshLeaseService');

function evidenceWriteError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function getCurrentEvidence({ EvidenceModel = TrailieEvidence, logicalKey, session = null } = {}) {
  if (!logicalKey) throw new TypeError('logicalKey is required');
  return EvidenceModel.findOne({ logicalKey, isCurrent: true }, null, session ? { session } : undefined);
}

async function queryEvidenceForRequirement({
  EvidenceModel = TrailieEvidence,
  requirement,
} = {}) {
  const entityId = requirement?.entity?.entityId;
  const topic = requirement?.topic;
  if (!topic) throw new TypeError('Requirement evidence lookup requires topic');
  // Unresolved destinations are a valid planner output. Treat them as a miss
  // instead of throwing — the evidence gate then reports unmet coverage.
  if (!entityId) return [];
  const query = EvidenceModel.find({ entityId, topic, isCurrent: true });
  return typeof query.lean === 'function' ? query.lean() : query;
}

async function upsertEvidenceVersion({
  EvidenceModel = TrailieEvidence,
  LeaseModel = TrailieEvidenceRefreshLease,
  startSession = () => mongoose.startSession(),
  candidate,
  sourceRequest,
  lease,
  now = new Date(),
} = {}) {
  const publicItem = { privacyScope: 'public', ...(candidate || {}) };
  assertPublicEvidenceWrite({ item: publicItem, sourceRequest });
  if (!lease?.leaseKey || !lease?.ownerId || !Number.isInteger(lease?.fencingToken)) {
    throw evidenceWriteError('stale_evidence_refresh_lease', 'A fenced evidence refresh lease is required');
  }

  const keys = buildEvidenceKeys(candidate);
  const version = {
    ...candidate,
    evidenceId: keys.evidenceId,
    logicalKey: keys.logicalKey,
    canonicalKey: keys.canonicalKey,
    provenance: { ...(candidate.provenance || {}), contentHash: keys.contentHash },
    isCurrent: true,
  };

  const session = await startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      await verifyEvidenceRefreshLease({ LeaseModel, ...lease, now, session });
      const current = await getCurrentEvidence({ EvidenceModel, logicalKey: keys.logicalKey, session });

      if (current?.canonicalKey === keys.canonicalKey) {
        await EvidenceModel.updateOne(
          { evidenceId: current.evidenceId, isCurrent: true },
          {
            $set: {
              claim: version.claim,
              observation: version.observation,
              quality: version.quality,
              source: version.source,
              retention: version.retention,
              provenance: version.provenance,
            },
          },
          { session, runValidators: true }
        );
        const refreshed = await EvidenceModel.findOne(
          { evidenceId: current.evidenceId, isCurrent: true },
          null,
          { session }
        );
        result = {
          outcome: 'idempotent',
          evidence: refreshed,
        };
        return;
      }

      if (current) {
        const retired = await EvidenceModel.updateOne(
          { evidenceId: current.evidenceId, logicalKey: keys.logicalKey, isCurrent: true },
          { $set: { isCurrent: false } },
          { session }
        );
        if (retired.modifiedCount !== 1) {
          throw evidenceWriteError('evidence_version_race', 'Current evidence changed during supersession');
        }
        version.supersedesEvidenceId = current.evidenceId;
      } else {
        version.supersedesEvidenceId = null;
      }

      const [created] = await EvidenceModel.create([version], { session });
      result = { outcome: 'created', evidence: created };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function queryCurrentOfficialPlaceFacts({
  EvidenceModel = TrailieEvidence,
  names = [],
} = {}) {
  const wanted = [...new Set((names || []).map((name) => String(name || '').trim()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const query = {
    isCurrent: true,
    evidenceType: 'fact',
    'source.provider': { $in: ['nps', 'curated_experience'] },
    'claim.normalizedValue.name': { $in: wanted },
  };
  const found = EvidenceModel.find(query);
  return typeof found.lean === 'function' ? found.lean() : found;
}

module.exports = {
  getCurrentEvidence,
  queryEvidenceForRequirement,
  queryCurrentOfficialPlaceFacts,
  upsertEvidenceVersion,
};
