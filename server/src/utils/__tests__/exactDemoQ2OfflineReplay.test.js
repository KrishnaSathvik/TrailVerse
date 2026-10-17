'use strict';

/**
 * Exact Demo Q2 offline replay — identity + completeness with production-shaped evidence.
 * Zero network / providers / models.
 */

const { resolveDestinationsFromMessage } = require('../genericDestinationResolver');
const { buildTripScopeFromMessage } = require('../roadTripContract');
const {
  evaluateItineraryCompleteness,
  buildCompletenessRepairInstructions,
  userRequestsBackupPlan,
} = require('../itineraryCompleteness');
const {
  buildBackupCandidateContext,
  normalizeCanonicalBackup,
} = require('../backupCandidateContext');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const { parseConstraints } = require('../constraintEngine');
const { toPlannerEntities } = require('../genericDestinationResolver');
const { buildEvidenceBundle } = require('../evidenceBundle');
const { normalizePersistedPlanningState } = require('../planningState');

const Q2 =
  "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?";

function glacActivity({ id, name, text, activityTypes = ['hike', 'trail'] }) {
  return {
    evidenceId: id,
    topic: 'activities',
    evidenceType: 'fact',
    schemaVersion: 1,
    claim: {
      identity: `thingstodo:${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      text: text || name,
      normalizedValue: {
        name,
        category: 'thingstodo',
        activityTypes,
        difficulty: 'moderate',
        exposureLevel: 'moderate',
        currentStatus: 'unknown',
      },
      qualifiers: ['named_activity_candidate', 'static_suitability_only', 'source_ingestion_complete'],
    },
    scope: { geographicEntityIds: ['nps:park:glac'], validFrom: null, validThrough: null, audience: 'public' },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: id },
    observation: {
      observedAt: '2026-08-01T00:00:00.000Z',
      fetchedAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-12-01T00:00:00.000Z',
      staleUntil: '2027-03-01T00:00:00.000Z',
    },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: {
      extractionMethod: 'structured_adapter',
      extractorVersion: 'nps-activities-v8',
      contentHash: id,
    },
    retention: { storeClaimText: true },
    isCurrent: true,
  };
}

function productionShapedGlacierBundle() {
  const candidates = [
    glacActivity({
      id: 'ev:glac-logan',
      name: 'Logan Pass',
      text: 'Logan Pass: alpine starting point for Highline and Hidden Lake.',
    }),
    glacActivity({
      id: 'ev:glac-highline',
      name: 'Highline Trail',
      text: 'Highline Trail: dramatic cliffside path starting at Logan Pass.',
    }),
    glacActivity({
      id: 'ev:glac-avalanche',
      name: 'Avalanche Lake',
      text: 'Avalanche Lake: forested hike from the Trail of the Cedars area.',
      activityTypes: ['hike', 'lake'],
    }),
    glacActivity({
      id: 'ev:glac-cedars',
      name: 'Trail of the Cedars',
      text: 'Trail of the Cedars: accessible boardwalk near Lake McDonald.',
      activityTypes: ['walk', 'boardwalk'],
    }),
    glacActivity({
      id: 'ev:glac-mcdonald',
      name: 'Lake McDonald',
      text: 'Lake McDonald: shoreline views on the west side of Glacier.',
      activityTypes: ['viewpoint', 'lake'],
    }),
  ];
  return buildEvidenceBundle({
    requestId: 'exact-demo-q2-offline-bundle',
    resolutions: [{
      requirementId: 'req:activities:glac',
      status: 'satisfied_stale_safe',
      evidenceIds: candidates.map((c) => c.evidenceId),
      reasonCodes: [],
    }],
    candidates,
  });
}

describe('exact demo Q2 offline replay', () => {
  test('normalized destination keeps Glacier primary with Logan Pass subordinate', () => {
    const destinations = resolveDestinationsFromMessage(Q2);
    const tripScope = buildTripScopeFromMessage(Q2);

    expect(destinations[0]).toEqual(expect.objectContaining({
      parkCode: 'glac',
      entityId: 'nps:park:glac',
    }));
    expect(destinations[0].displayName).toMatch(/^Glacier(\s+National\s+Park)?$/i);
    expect(destinations[0].displayName).not.toMatch(/logan pass/i);
    expect(destinations[0].mentionedPlaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringMatching(/logan pass/i) }),
      ])
    );

    expect(tripScope.destinations[0].parkCode).toBe('glac');
    expect(tripScope.destinations[0].displayName).toMatch(/^Glacier(\s+National\s+Park)?$/i);
    expect(tripScope.destinations[0].displayName).not.toMatch(/logan pass/i);
    expect(tripScope.destinations[0].mentionedPlaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringMatching(/logan pass/i) }),
      ])
    );

    const persisted = normalizePersistedPlanningState({
      schemaVersion: 'trailie-planning-state-v1',
      tripScope,
    });
    expect(persisted.ok).toBe(true);
    expect(persisted.state.tripScope.destinations[0].mentionedPlaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringMatching(/logan pass/i) }),
      ])
    );
  });

  test('evidence planner asks for contingency alternate activities on Glacier entity', () => {
    const destinations = resolveDestinationsFromMessage(Q2);
    const constraints = parseConstraints({ formData: {} }, Q2);
    const entities = toPlannerEntities(destinations, { includeUnresolvedCoords: true });
    const plan = planEvidenceRequirements({
      turnId: 'exact-demo-q2-offline',
      intent: {
        primaryIntent: 'simple_itinerary',
        depth: 'planning',
        verticals: ['itinerary', 'transport'],
        version: 'trailie-intent-v2.0.0',
        source: 'deterministic',
      },
      userPrompt: Q2,
      constraints,
      resolvedEntities: entities,
      tripScope: buildTripScopeFromMessage(Q2),
      now: '2026-08-12T12:00:00Z',
    });

    const requirements = Array.isArray(plan) ? plan : (plan.requirements || []);
    const activityReqs = requirements.filter((r) => r.topic === 'activities');
    expect(activityReqs.length).toBeGreaterThan(0);
    const reasons = activityReqs.flatMap((r) => r.reasonCodes || r.reasons || []);
    expect(reasons.join(' ')).toMatch(/contingency_alternate_activities/);
    expect(activityReqs.some((r) => /nps:park:glac/i.test(String(
      r.entityId || r.entity?.entityId || r.scope?.entityId || ''
    )))).toBe(true);
  });

  test('production-shaped evidence yields independent backup candidates (not Logan Pass)', () => {
    const bundle = productionShapedGlacierBundle();
    const ctx = buildBackupCandidateContext({ bundle, userPrompt: Q2 });
    expect(ctx.required).toBe(true);
    expect(ctx.canonicalField).toBe('alternatives');
    expect(ctx.candidates.map((c) => c.name.toLowerCase())).toEqual(
      expect.arrayContaining(['avalanche lake', 'trail of the cedars', 'lake mcdonald'])
    );
    expect(ctx.candidates.every((c) => !/logan/i.test(c.name))).toBe(true);
  });

  test('representative one-day plan with independent backup passes completeness', () => {
    expect(userRequestsBackupPlan(Q2)).toBe(true);
    const bundle = productionShapedGlacierBundle();

    const itineraryData = {
      days: [{
        day: 1,
        label: 'Day 1 — Glacier priorities',
        stops: [
          {
            name: 'Highline Trail to Haystack Butte overlook',
            type: 'trail',
            duration: 150,
            note: 'Primary scenic hike near Logan Pass when access works.',
            alternatives: [
              { name: 'Avalanche Lake Trail from the Going-to-the-Sun corridor' },
            ],
          },
          {
            name: 'Logan Pass Visitor Center area',
            type: 'landmark',
            duration: 45,
            note: 'Short orientation if the pass is open.',
          },
          {
            name: 'Lake McDonald shoreline sunset viewpoint',
            type: 'landmark',
            duration: 60,
          },
        ],
      }],
      alternatives: [
        { name: 'Avalanche Lake' },
        { name: 'Trail of the Cedars' },
      ],
    };

    const result = evaluateItineraryCompleteness({
      itineraryData,
      userPrompt: Q2,
      constraints: parseConstraints({ formData: {} }, Q2),
      evidenceBundle: bundle,
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('logistics-only / vague fallback still fails', () => {
    const bundle = productionShapedGlacierBundle();
    const vague = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Highline Trail', type: 'trail', duration: 150 },
            { name: 'Lake McDonald shoreline', type: 'landmark', duration: 60 },
          ],
        }],
        alternatives: [{ name: 'Check conditions and ask a ranger' }],
      },
      userPrompt: Q2,
      evidenceBundle: bundle,
    });
    expect(vague.reasonCodes).toContain('missing_backup_plan');

    const thin = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Park entrance conditions check', type: 'visitor_center', duration: 30 },
            { name: 'Parking transition and lunch', duration: 90 },
          ],
        }],
      },
      userPrompt: Q2,
      evidenceBundle: bundle,
    });
    expect(thin.ok).toBe(false);
    expect(thin.reasonCodes).toContain('missing_experience_anchor');
  });

  test('legacy contingency field normalizes into canonical alternatives for Q2', () => {
    const bundle = productionShapedGlacierBundle();
    const raw = {
      days: [{
        day: 1,
        stops: [
          { name: 'Highline Trail', type: 'trail', duration: 150 },
          { name: 'Lake McDonald shoreline', type: 'landmark', duration: 60 },
        ],
      }],
      contingency: [{ name: 'Avalanche Lake' }],
    };
    const normalized = normalizeCanonicalBackup(raw);
    expect(normalized.alternatives[0].name).toMatch(/avalanche lake/i);
    const result = evaluateItineraryCompleteness({
      itineraryData: raw,
      userPrompt: Q2,
      evidenceBundle: bundle,
    });
    expect(result.ok).toBe(true);
  });

  test('live-capture-shaped alternatives with Logan Pass narration PASS independence', () => {
    const bundle = productionShapedGlacierBundle();
    // Names chosen live were evidence-shaped NPS thingstodo titles; ground via bundle add-ons.
    const liveNamesBundle = (() => {
      const extra = [
        {
          evidenceId: 'ev:glac-goose',
          topic: 'activities',
          evidenceType: 'fact',
          schemaVersion: 1,
          claim: {
            identity: 'thingstodo:wild-goose-island',
            text: 'Wild Goose Island: Ice Age Glaciers viewpoint.',
            normalizedValue: {
              name: 'Wild Goose Island: Ice Age Glaciers',
              category: 'thingstodo',
              activityTypes: ['viewpoint'],
              difficulty: 'easy',
              exposureLevel: 'low',
              currentStatus: 'unknown',
            },
            qualifiers: ['named_activity_candidate', 'static_suitability_only', 'source_ingestion_complete'],
          },
          scope: { geographicEntityIds: ['nps:park:glac'], validFrom: null, validThrough: null, audience: 'public' },
          source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'ev:glac-goose' },
          observation: {
            observedAt: '2026-08-01T00:00:00.000Z',
            fetchedAt: '2026-08-01T00:00:00.000Z',
            expiresAt: '2026-12-01T00:00:00.000Z',
            staleUntil: '2027-03-01T00:00:00.000Z',
          },
          quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
          provenance: {
            extractionMethod: 'structured_adapter',
            extractorVersion: 'nps-activities-v8',
            contentHash: 'ev:glac-goose',
          },
          retention: { storeClaimText: true },
          isCurrent: true,
        },
        {
          evidenceId: 'ev:glac-many',
          topic: 'activities',
          evidenceType: 'fact',
          schemaVersion: 1,
          claim: {
            identity: 'thingstodo:lakeshore-many-glacier',
            text: 'Lakeshore View of Many Glacier Hotel.',
            normalizedValue: {
              name: 'Lakeshore View of Many Glacier Hotel',
              category: 'thingstodo',
              activityTypes: ['viewpoint'],
              difficulty: 'easy',
              exposureLevel: 'low',
              currentStatus: 'unknown',
            },
            qualifiers: ['named_activity_candidate', 'static_suitability_only', 'source_ingestion_complete'],
          },
          scope: { geographicEntityIds: ['nps:park:glac'], validFrom: null, validThrough: null, audience: 'public' },
          source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'ev:glac-many' },
          observation: {
            observedAt: '2026-08-01T00:00:00.000Z',
            fetchedAt: '2026-08-01T00:00:00.000Z',
            expiresAt: '2026-12-01T00:00:00.000Z',
            staleUntil: '2027-03-01T00:00:00.000Z',
          },
          quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
          provenance: {
            extractionMethod: 'structured_adapter',
            extractorVersion: 'nps-activities-v8',
            contentHash: 'ev:glac-many',
          },
          retention: { storeClaimText: true },
          isCurrent: true,
        },
      ];
      const base = productionShapedGlacierBundle();
      return buildEvidenceBundle({
        requestId: 'exact-demo-q2-live-capture-shape',
        resolutions: [{
          requirementId: 'req:activities:glac',
          status: 'satisfied_stale_safe',
          evidenceIds: [...base.evidence.map((e) => e.evidenceId), ...extra.map((e) => e.evidenceId)],
          reasonCodes: [],
        }],
        candidates: [...base.evidence, ...extra],
      });
    })();

    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            {
              name: 'Logan Pass — bighorn sheep viewing',
              type: 'landmark',
              duration: 60,
              note: 'Priority if Logan Pass access and parking work.',
            },
            {
              name: 'Glacier birdwatching and wildlife watching',
              type: 'custom',
              duration: 120,
              note: 'Unhurried wildlife observation in the park.',
            },
          ],
        }],
        alternatives: [
          {
            name: 'Lakeshore View of Many Glacier Hotel',
            note: 'Make this the primary independent contingency rather than waiting for Logan Pass.',
            when: 'If Logan Pass access or parking does not work out',
          },
          {
            name: 'Wild Goose Island: Ice Age Glaciers',
            note: 'Alternate scenic priority that does not rely on Logan Pass parking.',
            when: 'If Logan Pass access or parking does not work out',
          },
        ],
      },
      userPrompt: Q2,
      evidenceBundle: liveNamesBundle,
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('repair text for both Q2 failure codes is deterministic and actionable', () => {
    const ctx = buildBackupCandidateContext({
      bundle: productionShapedGlacierBundle(),
      userPrompt: Q2,
    });
    const text = buildCompletenessRepairInstructions({
      reasonCodes: ['missing_experience_anchor', 'missing_backup_plan'],
      dayDiagnostics: [{ dayIndex: 0, dayNumber: 1, codes: ['missing_experience_anchor'] }],
      backupCandidateContext: ctx,
    });
    expect(text).toMatch(/missing_experience_anchor/);
    expect(text).toMatch(/missing_backup_plan/);
    expect(text).toMatch(/EvidenceBundle/);
    expect(text).toMatch(/alternatives/);
    expect(text).toMatch(/access|parking|primary/i);
    expect(text).toMatch(/Avalanche Lake|Trail of the Cedars|Lake McDonald/);
  });
});
