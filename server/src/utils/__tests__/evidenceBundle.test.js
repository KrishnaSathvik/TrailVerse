'use strict';

const { buildEvidenceBundle } = require('../evidenceBundle');

const evidence = (id, observedAt) => ({
  evidenceId: id,
  entityId: 'nps:park:yose',
  topic: 'fees',
  evidenceType: 'fact',
  claim: { identity: id, normalizedValue: 35 },
  scope: { geographicEntityIds: ['nps:park:yose'], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
  source: { provider: 'nps', sourceClass: 'official_owner', sourceId: id },
  observation: { observedAt: new Date(observedAt), fetchedAt: new Date(observedAt), expiresAt: new Date(observedAt), staleUntil: new Date(observedAt), retrievalMode: 'live' },
  quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
  provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'nps-v1', contentHash: id },
  retention: { class: 'public_dynamic_90d', licenseClass: 'government_public', deleteAfter: null },
});

describe('WP5A immutable EvidenceBundle', () => {
  test('keeps input resolution order and selected evidence in lexical ID order', () => {
    const bundle = buildEvidenceBundle({
      requestId: 'request-bundle',
      createdAt: new Date('2026-08-09T12:00:00.000Z'),
      resolutions: [
        { requirementId: 'req-2', status: 'satisfied_fresh', evidenceIds: ['ev:z'], reasonCodes: [] },
        { requirementId: 'req-1', status: 'satisfied_fresh', evidenceIds: ['ev:a'], reasonCodes: [] },
      ],
      candidates: [
        evidence('ev:z', '2026-08-09T11:00:00.000Z'),
        evidence('ev:rejected', '2026-08-09T10:00:00.000Z'),
        evidence('ev:a', '2026-08-09T09:00:00.000Z'),
      ],
    });
    expect(bundle.resolutions.map((item) => item.requirementId)).toEqual(['req-2', 'req-1']);
    expect(bundle.evidence.map((item) => item.evidenceId)).toEqual(['ev:a', 'ev:z']);
    expect(JSON.stringify(bundle)).not.toContain('ev:rejected');
    const referenced = new Set(bundle.resolutions.flatMap((item) => item.evidenceIds));
    expect(bundle.evidence.every((item) => referenced.has(item.evidenceId))).toBe(true);
  });

  test('converts dates/documents to plain primitives and recursively freezes the result', () => {
    const doc = evidence('ev:a', '2026-08-09T09:00:00.000Z');
    doc.toObject = () => ({ ...doc, toObject: undefined });
    const bundle = buildEvidenceBundle({
      requestId: 'request-plain', createdAt: new Date('2026-08-09T12:00:00.000Z'),
      resolutions: [{ requirementId: 'req-1', status: 'satisfied_fresh', evidenceIds: ['ev:a'], reasonCodes: [] }],
      candidates: [doc],
    });
    expect(bundle.createdAt).toBe('2026-08-09T12:00:00.000Z');
    expect(bundle.evidence[0].observation.observedAt).toBe('2026-08-09T09:00:00.000Z');
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.evidence[0].claim)).toBe(true);
    expect(() => { bundle.evidence[0].claim.normalizedValue = 99; }).toThrow(TypeError);
  });

  test('rejects dangling IDs and duplicate evidence records', () => {
    const base = {
      requestId: 'request-integrity', createdAt: new Date(),
      resolutions: [{ requirementId: 'req-1', status: 'satisfied_fresh', evidenceIds: ['ev:a'], reasonCodes: [] }],
    };
    expect(() => buildEvidenceBundle({ ...base, candidates: [] })).toThrow('bundle_dangling_evidence_id');
    expect(() => buildEvidenceBundle({ ...base, candidates: [evidence('ev:a', '2026-08-09T09:00:00Z'), evidence('ev:a', '2026-08-09T09:00:00Z')] }))
      .toThrow('bundle_duplicate_evidence_id');
  });

  test('summarizes final statuses without embedding selected evidence in resolutions', () => {
    const bundle = buildEvidenceBundle({
      requestId: 'request-summary', createdAt: new Date(),
      candidates: [evidence('ev:fresh', '2026-08-09T09:00:00Z')],
      resolutions: [
        { requirementId: 'req-fresh', status: 'satisfied_fresh', evidenceIds: ['ev:fresh'], reasonCodes: [] },
        { requirementId: 'req-missing', status: 'missing', evidenceIds: [], reasonCodes: ['provider_timeout'], selectedEvidence: [{ private: true }] },
      ],
    });
    expect(bundle.summary).toMatchObject({ requirementCount: 2, satisfiedFresh: 1, missing: 1 });
    expect(bundle.resolutions[1].selectedEvidence).toBeUndefined();
  });
});
