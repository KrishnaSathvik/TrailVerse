/**
 * Step 9 Gate 10 — Demo exporter/renderer contracts stay green while frozen
 * Demo content may remain intentionally legacy until recapture.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import playback from '@/data/trailieDemoPlayback.json';
import {
  PLAYBACK_SCHEMA_VERSION,
  normalizePlaybackScenario,
  validatePlaybackScenario,
  turnHasItinerary,
} from '../trailieDemoPlaybackSchema';
import {
  assertNoInternalFields,
  sanitizePlan,
  sanitizeApprovedTurn,
} from '../trailieDemoCapture';
import { exportPublicPlan } from '../publicItineraryExport.mjs';

const require = createRequire(import.meta.url);
const sharedRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../shared');
const { DEMO_CURRENT_CONTRACT } = require(path.join(sharedRoot, 'demoCurrentContract.cjs'));
const { evaluateTripSchemaVersion, TRIP_SCHEMA_VERSION } = require(path.join(sharedRoot, 'tripSchemaVersion.cjs'));

const scenarios = playback.scenarios.map(normalizePlaybackScenario);

describe('Step 9 — Demo contract gates', () => {
  it('ships an explicit Demo currency flag (shared definition)', () => {
    expect(typeof DEMO_CURRENT_CONTRACT).toBe('boolean');
  });

  it('keeps exporter + playback renderer contracts green', () => {
    expect(playback.schemaVersion).toBe(PLAYBACK_SCHEMA_VERSION);
    for (const scenario of scenarios) {
      expect(validatePlaybackScenario(scenario)).toEqual([]);
      expect(assertNoInternalFields(scenario)).toEqual([]);
    }

    const planTurn = scenarios.flatMap((s) => s.turns).find((turn) => turnHasItinerary(turn));
    expect(planTurn).toBeTruthy();
    // Shared public export may still carry owner-facing feasibilityIssues;
    // Demo sanitizePlan strips those without inventing travel content.
    const publicPlan = exportPublicPlan(planTurn.plan);
    const demoPlan = sanitizePlan(planTurn.plan);
    expect(demoPlan).toEqual(sanitizePlan(publicPlan));
    expect(demoPlan).not.toHaveProperty('feasibilityIssues');
    expect(assertNoInternalFields(demoPlan)).toEqual([]);
    expect(JSON.stringify(playback)).not.toMatch(/feasibilityIssues/);

    const approved = sanitizeApprovedTurn({
      question: 'Demo question',
      content: 'Demo prose that is long enough for playback.',
      canonicalPlan: planTurn.plan,
      hasLiveData: true,
      hasWebSearch: false,
    });
    expect(approved.question).toBe('Demo question');
    expect(approved.prose).toContain('Demo prose');
    expect(approved.plan).toEqual(demoPlan);
  });

  it('does not silently claim frozen Demo content is current TripPlan v1', () => {
    const plans = scenarios.flatMap((s) => s.turns).map((t) => t.plan).filter((p) => p?.days?.length);
    expect(plans.length).toBeGreaterThan(0);

    const allCurrent = plans.every((plan) => (
      plan.tripSchemaVersion === TRIP_SCHEMA_VERSION
      && evaluateTripSchemaVersion(plan).ok
      && !evaluateTripSchemaVersion(plan).legacy
    ));

    if (DEMO_CURRENT_CONTRACT) {
      expect(allCurrent).toBe(true);
    } else {
      // Pending replacement: content may be legacy-readable, but must not
      // pretend the currency flag is true.
      expect(DEMO_CURRENT_CONTRACT).toBe(false);
      for (const plan of plans) {
        expect(evaluateTripSchemaVersion(plan).ok).toBe(true);
      }
    }
  });
});
