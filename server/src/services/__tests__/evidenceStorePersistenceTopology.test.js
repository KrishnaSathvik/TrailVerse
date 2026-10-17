'use strict';

/**
 * PHASE 4O — THE REGRESSION THAT WOULD HAVE CAUGHT PHASE 4K.
 *
 * Every existing evidence-store suite injects a fake `EvidenceModel` and a fake
 * `startSession`, so the real transaction path has never run against the
 * ephemeral mongod the suite actually boots. That gap let a standalone store
 * silently discard 100% of candidates for two whole phases, reported upward as
 * `missing ["provider_response_invalid"]` and read by a human as "the
 * environment has no evidence".
 *
 * This suite does the opposite of the others: real models, real session, real
 * transaction, real producer-shaped evidence.
 */

const mongoose = require('mongoose');

const { assertTransactionalMongo, probeTransactionSupport, startTransactionalMongo } = require('../../../tests/support/transactionalMongo');
const { upsertEvidenceVersion, getCurrentEvidence } = require('../evidenceStoreService');
const { acquireEvidenceRefreshLease } = require('../evidenceRefreshLeaseService');
const TrailieEvidence = require('../../models/TrailieEvidence');
const TrailieEvidenceRefreshLease = require('../../models/TrailieEvidenceRefreshLease');

const FIXTURE = require('../../utils/__tests__/fixtures/grandTetonPlaceEvidence.json');

/** A real persisted evidence document, minus the keys the store derives. */
function candidateFromFixture(name) {
  const item = FIXTURE.evidence.find((e) => e?.claim?.normalizedValue?.name === name);
  if (!item) throw new Error(`fixture has no ${name}`);
  const {
    _id: _ignoredId, evidenceId: _ignoredEvidenceId, logicalKey: _ignoredLogical,
    canonicalKey: _ignoredCanonical, createdAt: _ignoredCreated, updatedAt: _ignoredUpdated,
    __v: _ignoredVersion, ...candidate
  } = item;
  return candidate;
}

describe('the shared standalone test mongod cannot persist evidence, and says so', () => {
  it('refuses a transaction — the exact Phase 4K failure', async () => {
    const verdict = await probeTransactionSupport(mongoose.connection);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/replica set|Transaction numbers/i);
  });

  it('fails the fixture immediately instead of reporting missing evidence', async () => {
    await expect(assertTransactionalMongo(mongoose.connection)).rejects.toThrow(/MongoMemoryReplSet/);
    await expect(assertTransactionalMongo(mongoose.connection)).rejects.toThrow(/provider_response_invalid/);
  });
});

/**
 * The replica-set half boots a second mongod. Inside a 16-worker parallel run
 * that starves everything else — the full suite went from ~170s to ~700s and
 * unrelated suites began timing out — so it is OPT-IN:
 *
 *     TRAILIE_TRANSACTIONAL_MONGO=1 npx jest evidenceStorePersistenceTopology
 *     npm run test:evidence-persistence
 *
 * The guard above is what protects a fixture from silently concluding "there is
 * no evidence", and it runs unconditionally on every suite. This half is the
 * end-to-end proof that real producer output reaches the store, and it is run
 * deliberately rather than on every commit.
 */
const describeTransactional = process.env.TRAILIE_TRANSACTIONAL_MONGO === '1' ? describe : describe.skip;

describeTransactional('on a replica set, real producer output actually lands in the store', () => {
  let harness;
  let EvidenceModel;
  let LeaseModel;

  beforeAll(async () => {
    harness = await startTransactionalMongo({ dbName: 'phase4o-persistence' });
    EvidenceModel = harness.modelFrom(TrailieEvidence);
    LeaseModel = harness.modelFrom(TrailieEvidenceRefreshLease);
  }, 120000);

  afterAll(async () => {
    if (harness) await harness.stop();
  });

  const lease = async (leaseKey) => {
    const acquired = await acquireEvidenceRefreshLease({
      LeaseModel, leaseKey, ownerId: 'phase4o', leaseMs: 30000, now: new Date(),
    });
    expect(acquired.outcome).toBe('acquired');
    return acquired.lease;
  };

  it('persists a real NPS activity candidate through the transactional path', async () => {
    const candidate = candidateFromFixture('Taggart Lake');
    const result = await upsertEvidenceVersion({
      EvidenceModel,
      LeaseModel,
      startSession: () => harness.connection.startSession(),
      candidate,
      sourceRequest: {
        privacyScope: 'public', provider: 'nps', operation: 'named_activities',
        publicCanonicalRequest: { parkCode: 'grte' },
      },
      lease: await lease('phase4o:nps:named_activities:grte'),
      now: new Date(),
    });
    expect(result.outcome).toBe('created');

    const stored = await getCurrentEvidence({ EvidenceModel, logicalKey: result.evidence.logicalKey });
    expect(stored).toBeTruthy();
    // The half Phase 4L could not test against the record: the operational-fact
    // producer's output survives the round trip into the store.
    expect(stored.claim.normalizedValue.name).toBe('Taggart Lake');
    expect(stored.claim.normalizedValue.activityTypes).toEqual(expect.arrayContaining(['hiking']));
  });

  it('keeps a restricted place\'s operational facts intact through persistence', async () => {
    const candidate = candidateFromFixture('Grassy Lake Road');
    const result = await upsertEvidenceVersion({
      EvidenceModel,
      LeaseModel,
      startSession: () => harness.connection.startSession(),
      candidate,
      sourceRequest: {
        privacyScope: 'public', provider: 'nps', operation: 'named_activities',
        publicCanonicalRequest: { parkCode: 'grte' },
      },
      lease: await lease('phase4o:nps:named_activities:grte:2'),
      now: new Date(),
    });
    const stored = await getCurrentEvidence({ EvidenceModel, logicalKey: result.evidence.logicalKey });
    const facts = stored.claim.normalizedValue.operationalFacts || [];
    expect(facts.map((f) => f.type)).toContain('vehicle_restriction');
  });
});
