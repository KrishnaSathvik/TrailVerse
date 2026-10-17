'use strict';

/**
 * Offline backup-candidate preparation + canonical projection tests.
 * Zero network / providers / models.
 */

const { buildEvidenceBundle } = require('../evidenceBundle');
const {
  buildBackupCandidateContext,
  formatBackupCandidatePromptBlock,
  normalizeCanonicalBackup,
  structuredBackupGroundedInEvidence,
} = require('../backupCandidateContext');
const {
  evaluateItineraryCompleteness,
  buildCompletenessRepairInstructions,
  userRequestsBackupPlan,
} = require('../itineraryCompleteness');
const { normalizePersistedPlanningState } = require('../planningState');
const { getCreateItineraryTool } = require('../itineraryToolSchema');

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
    requestId: 'exact-q2-backup-offline',
    resolutions: [{
      requirementId: 'req:activities:glac',
      status: 'satisfied_stale_safe',
      evidenceIds: candidates.map((c) => c.evidenceId),
      reasonCodes: [],
    }],
    candidates,
  });
}

describe('backupCandidateContext — Cases A–J (offline)', () => {
  test('CASE A — explicit backup + independent evidence → candidates prepared', () => {
    expect(userRequestsBackupPlan(Q2)).toBe(true);
    const ctx = buildBackupCandidateContext({
      bundle: productionShapedGlacierBundle(),
      userPrompt: Q2,
    });
    expect(ctx.required).toBe(true);
    expect(ctx.canonicalField).toBe('alternatives');
    expect(ctx.blockedDependencies).toEqual(expect.arrayContaining(['logan pass']));
    const names = ctx.candidates.map((c) => c.name.toLowerCase());
    expect(names).toEqual(expect.arrayContaining(['avalanche lake', 'trail of the cedars', 'lake mcdonald']));
    expect(names.every((n) => !n.includes('logan'))).toBe(true);
    expect(names).not.toContain('highline trail');
  });

  test('CASE B — explicit backup + no alternate evidence → fail closed, no invention', () => {
    const bundle = buildEvidenceBundle({
      requestId: 'no-alts',
      resolutions: [{
        requirementId: 'req:activities:glac',
        status: 'satisfied_fresh',
        evidenceIds: ['ev:only-logan'],
        reasonCodes: [],
      }],
      candidates: [
        glacActivity({
          id: 'ev:only-logan',
          name: 'Logan Pass Visitor Center',
          text: 'Logan Pass Visitor Center orientation.',
        }),
      ],
    });
    const ctx = buildBackupCandidateContext({ bundle, userPrompt: Q2 });
    expect(ctx.required).toBe(true);
    expect(ctx.candidates).toEqual([]);

    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Logan Pass short walk', type: 'trail', duration: 120 },
            { name: 'Invented Secret Meadows Trail', type: 'trail', duration: 90 },
          ],
        }],
        alternatives: [{ name: 'Invented Secret Meadows Trail' }],
      },
      userPrompt: Q2,
      evidenceBundle: bundle,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('CASE C — backup = check conditions → FAIL', () => {
    const bundle = productionShapedGlacierBundle();
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Highline Trail', type: 'trail', duration: 150 },
            { name: 'Lake McDonald shoreline', type: 'landmark', duration: 60 },
          ],
        }],
        alternatives: [{ name: 'Check conditions with a ranger' }],
      },
      userPrompt: Q2,
      evidenceBundle: bundle,
    });
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('CASE D — backup identical to primary → FAIL', () => {
    const bundle = productionShapedGlacierBundle();
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Avalanche Lake', type: 'trail', duration: 150 },
            { name: 'Lake McDonald shoreline', type: 'landmark', duration: 60 },
          ],
        }],
        alternatives: [{ name: 'Avalanche Lake' }],
      },
      userPrompt: Q2,
      evidenceBundle: bundle,
    });
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('CASE E — backup still depends on blocked access → FAIL', () => {
    const bundle = productionShapedGlacierBundle();
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Hidden Lake overlook', type: 'trail', duration: 120 },
            { name: 'Lake McDonald shoreline', type: 'landmark', duration: 60 },
          ],
        }],
        alternatives: [{ name: 'Highline Trail from Logan Pass' }],
      },
      userPrompt: Q2,
      evidenceBundle: bundle,
    });
    expect(result.reasonCodes).toContain('missing_backup_plan');
  });

  test('CASE F — legacy backupOptions / contingency normalize to canonical alternatives', () => {
    const raw = {
      days: [{
        day: 1,
        stops: [
          {
            name: 'Highline Trail',
            type: 'trail',
            duration: 150,
            backupOptions: [{ name: 'Avalanche Lake' }],
          },
          { name: 'Logan Pass Visitor Center area', type: 'landmark', duration: 40 },
        ],
      }],
      contingency: [{ name: 'Trail of the Cedars' }],
    };
    const normalized = normalizeCanonicalBackup(raw);
    expect(normalized.alternatives.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Avalanche Lake', 'Trail of the Cedars'])
    );

    const result = evaluateItineraryCompleteness({
      itineraryData: raw,
      userPrompt: Q2,
      evidenceBundle: productionShapedGlacierBundle(),
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('CASE G — canonical alternatives survive normalizeCanonicalBackup + completeness', () => {
    const itineraryData = {
      days: [{
        day: 1,
        stops: [
          { name: 'Highline Trail', type: 'trail', duration: 150 },
          { name: 'Lake McDonald shoreline', type: 'landmark', duration: 60 },
        ],
      }],
      alternatives: [{ name: 'Avalanche Lake' }, { name: 'Trail of the Cedars' }],
    };
    const after = normalizeCanonicalBackup(itineraryData);
    expect(after.alternatives).toHaveLength(2);
    const result = evaluateItineraryCompleteness({
      itineraryData: after,
      userPrompt: Q2,
      evidenceBundle: productionShapedGlacierBundle(),
    });
    expect(result.ok).toBe(true);
  });

  test('CASE H — no explicit contingency → backup not globally required', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Avalanche Lake', type: 'trail', duration: 150 },
            { name: 'Lake McDonald shoreline', type: 'landmark', duration: 60 },
          ],
        }],
      },
      userPrompt: 'Plan one full day in Glacier National Park.',
      evidenceBundle: productionShapedGlacierBundle(),
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, reasonCodes: [] }));
  });

  test('CASE I — blocked dependency is subordinate place; park remains parent', () => {
    const ctx = buildBackupCandidateContext({
      bundle: productionShapedGlacierBundle(),
      userPrompt: Q2,
    });
    expect(ctx.blockedDependencies).toContain('logan pass');
    expect(ctx.blockedDependencies).not.toContain('glacier');
  });

  test('CASE J — mentionedPlaces survives planningState tripScope projection', () => {
    const { ok, state } = normalizePersistedPlanningState({
      schemaVersion: 'trailie-planning-state-v1',
      tripScope: {
        type: 'single_destination',
        destinations: [{
          entityId: 'nps:park:glac',
          entityType: 'national_park',
          parkCode: 'glac',
          displayName: 'Glacier',
          order: 0,
          latitude: 48.696,
          longitude: -113.718,
          status: 'resolved',
          mentionedPlaces: [{ name: 'Logan Pass', role: 'subordinate_place', key: 'logan pass' }],
          focalPlace: false,
        }],
      },
    });
    expect(ok).toBe(true);
    expect(state.tripScope.destinations[0].mentionedPlaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringMatching(/logan pass/i) }),
      ])
    );
    expect(state.tripScope.destinations[0].focalPlace).toBe(false);
  });

  test('prompt block exposes evidence-backed independents without inventing', () => {
    const ctx = buildBackupCandidateContext({
      bundle: productionShapedGlacierBundle(),
      userPrompt: Q2,
    });
    const block = formatBackupCandidatePromptBlock(ctx);
    expect(block).toMatch(/Canonical structured field/i);
    expect(block).toMatch(/alternatives/);
    expect(block).toMatch(/Avalanche Lake/);
    expect(block).toMatch(/logan pass/i);
    expect(block).not.toMatch(/Invented/);
  });

  test('structuredBackupGroundedInEvidence rejects invented names', () => {
    const ctx = buildBackupCandidateContext({
      bundle: productionShapedGlacierBundle(),
      userPrompt: Q2,
    });
    expect(structuredBackupGroundedInEvidence(
      [{ name: 'Secret Unlisted Meadow' }],
      ctx.candidates
    )).toBe(false);
    expect(structuredBackupGroundedInEvidence(
      [{ name: 'Avalanche Lake Trail' }],
      ctx.candidates
    )).toBe(true);
  });

  test('repair instructions include blocked dependency + candidate names + alternatives field', () => {
    const ctx = buildBackupCandidateContext({
      bundle: productionShapedGlacierBundle(),
      userPrompt: Q2,
    });
    const text = buildCompletenessRepairInstructions({
      reasonCodes: ['missing_backup_plan'],
      dayDiagnostics: [],
      backupCandidateContext: ctx,
    });
    expect(text).toMatch(/alternatives/);
    expect(text).toMatch(/Logan Pass/i);
    expect(text).toMatch(/Avalanche Lake|Trail of the Cedars|Lake McDonald/);
    expect(text).toMatch(/do not invent/i);
  });

  test('create_itinerary tool requires alternatives when contingency is active', () => {
    const tool = getCreateItineraryTool({ requireAlternatives: true });
    expect(tool.input_schema.required).toEqual(expect.arrayContaining(['days', 'alternatives']));
    expect(tool.input_schema.properties.alternatives.description).toMatch(/backup|contingency/i);
  });
});
