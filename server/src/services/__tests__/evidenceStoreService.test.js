'use strict';

const {
  upsertEvidenceVersion,
  getCurrentEvidence,
  queryEvidenceForRequirement,
  queryCurrentOfficialPlaceFacts,
} = require('../evidenceStoreService');

const T0 = new Date('2026-08-09T12:00:00.000Z');

const candidate = (value = 'closed', fetchedAt = T0) => ({
  entityId: 'nps:park:yose',
  topic: 'alerts_closures',
  evidenceType: 'live_state',
  claim: {
    identity: 'tioga-road-vehicle-status',
    text: `Tioga Road is ${value} to vehicles.`,
    normalizedValue: value,
    status: value,
    subjectId: 'nps:road:tioga',
    qualifiers: [],
  },
  scope: { geographicEntityIds: ['nps:park:yose'], audience: 'public', locale: 'en-US' },
  source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'alert-1' },
  observation: {
    observedAt: fetchedAt,
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + 15 * 60000),
    staleUntil: new Date(fetchedAt.getTime() + 45 * 60000),
    retrievalMode: 'live',
  },
  quality: { authorityClass: 'official_owner', freshnessStatus: 'fresh' },
  provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'nps-v1' },
  retention: { class: 'public_dynamic_90d', licenseClass: 'government_public', deleteAfter: null },
});

function makeHarness() {
  const docs = [];
  const lease = {
    leaseKey: 'req:yose:alerts', ownerId: 'worker:a', fencingToken: 10,
    status: 'active', expiresAt: new Date(T0.getTime() + 60000),
  };
  let tail = Promise.resolve();
  const matches = (doc, filter) => Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && '$gt' in expected) return doc[key] > expected.$gt;
    return doc[key] === expected;
  });
  const EvidenceModel = {
    writes: 0,
    async findOne(filter) { return docs.find((doc) => matches(doc, filter)) || null; },
    async updateOne(filter, update) {
      const doc = docs.find((entry) => matches(entry, filter));
      if (!doc) return { modifiedCount: 0 };
      Object.assign(doc, update.$set || {});
      this.writes += 1;
      return { modifiedCount: 1 };
    },
    async create(items) {
      const doc = { ...items[0], _id: `mongo-${docs.length + 1}` };
      if (docs.some((entry) => entry.canonicalKey === doc.canonicalKey)) {
        const error = new Error('duplicate canonical key'); error.code = 11000; throw error;
      }
      if (docs.some((entry) => entry.logicalKey === doc.logicalKey && entry.isCurrent && doc.isCurrent)) {
        const error = new Error('duplicate current logical key'); error.code = 11000; throw error;
      }
      docs.push(doc);
      this.writes += 1;
      return [doc];
    },
  };
  const LeaseModel = { async findOne(filter) { return matches(lease, filter) ? lease : null; } };
  const startSession = async () => ({
    async withTransaction(work) {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await work(); } finally { release(); }
    },
    async endSession() {},
  });
  return { docs, lease, EvidenceModel, LeaseModel, startSession };
}

const writeArgs = (harness, value = 'closed', fetchedAt = T0) => ({
  EvidenceModel: harness.EvidenceModel,
  LeaseModel: harness.LeaseModel,
  startSession: harness.startSession,
  candidate: candidate(value, fetchedAt),
  sourceRequest: { privacyScope: 'public', provider: 'nps' },
  lease: { leaseKey: harness.lease.leaseKey, ownerId: harness.lease.ownerId, fencingToken: harness.lease.fencingToken },
  now: T0,
});

describe('WP3 canonical evidence store', () => {
  test('rejects private data before opening a transaction or writing', async () => {
    const harness = makeHarness();
    const startSession = jest.fn(harness.startSession);
    await expect(upsertEvidenceVersion({
      ...writeArgs(harness), startSession,
      candidate: { ...candidate(), claim: { ...candidate().claim, qualifiers: [{ sessionId: 'private' }] } },
    })).rejects.toMatchObject({ code: 'shared_evidence_private_data' });
    expect(startSession).not.toHaveBeenCalled();
    expect(harness.EvidenceModel.writes).toBe(0);
  });

  test('requires a live matching owner and fencing token', async () => {
    const harness = makeHarness();
    await expect(upsertEvidenceVersion({
      ...writeArgs(harness), lease: { ...writeArgs(harness).lease, fencingToken: 9 },
    })).rejects.toMatchObject({ code: 'stale_evidence_refresh_lease' });
    expect(harness.docs).toHaveLength(0);
  });

  test('same-content upsert is idempotent and refreshes observation only', async () => {
    const harness = makeHarness();
    const first = await upsertEvidenceVersion(writeArgs(harness));
    const later = new Date(T0.getTime() + 30000);
    const second = await upsertEvidenceVersion({ ...writeArgs(harness, 'closed', later), now: later });

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('idempotent');
    expect(harness.docs).toHaveLength(1);
    expect(harness.docs[0].observation.fetchedAt).toEqual(later);
  });

  test('changed evidence creates an immutable superseding version', async () => {
    const harness = makeHarness();
    const first = await upsertEvidenceVersion(writeArgs(harness, 'closed'));
    const second = await upsertEvidenceVersion(writeArgs(harness, 'open'));

    expect(harness.docs).toHaveLength(2);
    expect(harness.docs[0].isCurrent).toBe(false);
    expect(harness.docs[1]).toMatchObject({ isCurrent: true, supersedesEvidenceId: first.evidence.evidenceId });
    expect(second.evidence.evidenceId).not.toBe(first.evidence.evidenceId);
  });

  test('concurrent changed writes preserve exactly one active version', async () => {
    const harness = makeHarness();
    await upsertEvidenceVersion(writeArgs(harness, 'closed'));
    await Promise.all([
      upsertEvidenceVersion(writeArgs(harness, 'open')),
      upsertEvidenceVersion(writeArgs(harness, 'restricted')),
    ]);

    expect(harness.docs.filter((doc) => doc.isCurrent)).toHaveLength(1);
    expect(harness.docs).toHaveLength(3);
  });

  test('reads only the current logical version', async () => {
    const harness = makeHarness();
    const created = await upsertEvidenceVersion(writeArgs(harness));
    await expect(getCurrentEvidence({ EvidenceModel: harness.EvidenceModel, logicalKey: created.evidence.logicalKey }))
      .resolves.toMatchObject({ evidenceId: created.evidence.evidenceId, isCurrent: true });
  });

  test('requirement lookup returns every current claim for entity/topic without inventing a store key', async () => {
    const find = jest.fn(() => ({
      lean: jest.fn().mockResolvedValue([
        { evidenceId: 'ev:fee-a', entityId: 'nps:park:yose', topic: 'fees' },
        { evidenceId: 'ev:fee-b', entityId: 'nps:park:yose', topic: 'fees' },
      ]),
    }));
    const requirement = {
      entity: { entityId: 'nps:park:yose' },
      topic: 'fees',
      minimumAuthorityClass: 'official_owner',
    };

    await expect(queryEvidenceForRequirement({ EvidenceModel: { find }, requirement }))
      .resolves.toHaveLength(2);
    expect(find).toHaveBeenCalledWith({
      entityId: 'nps:park:yose', topic: 'fees', isCurrent: true,
    });
  });

  test('unresolved destinations are a miss, not a throw', async () => {
    const find = jest.fn();
    await expect(queryEvidenceForRequirement({
      EvidenceModel: { find },
      requirement: { entity: { entityId: null }, topic: 'destination_identity' },
    })).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  test('official-place lookup is exact names only and does not scan the store empty-handed', async () => {
    const find = jest.fn();
    await expect(queryCurrentOfficialPlaceFacts({ EvidenceModel: { find }, names: [] }))
      .resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();

    const lean = jest.fn(async () => [{ claim: { normalizedValue: { name: 'Arrigetch Peaks Traverse' } } }]);
    find.mockReturnValue({ lean });
    await expect(queryCurrentOfficialPlaceFacts({
      EvidenceModel: { find },
      names: ['Arrigetch Peaks Traverse'],
    })).resolves.toHaveLength(1);
    expect(find).toHaveBeenCalledWith({
      isCurrent: true,
      evidenceType: 'fact',
      'source.provider': { $in: ['nps', 'curated_experience'] },
      'claim.normalizedValue.name': { $in: ['Arrigetch Peaks Traverse'] },
    });
  });
});
