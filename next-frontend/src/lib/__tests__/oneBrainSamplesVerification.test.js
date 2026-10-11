/**
 * Step 9 Gate 9 — verify all ten public Samples against the current contract.
 * Do not regenerate. Fixture-only; no providers.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import samples from '@/data/public-itineraries/index.json';
import { exportPublicPlan, projectPublicPlan } from '../publicItineraryExport.mjs';
import { assertNoInternalFields } from '../trailieDemoCapture';
import { buildTripMapModel } from '../itineraryMapStops';
import { verifiedTransferLabel } from '../tripPresentation';

const require = createRequire(import.meta.url);
const { evaluateTripSchemaVersion } = require(path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../shared/tripSchemaVersion.cjs',
));

const EXPECTED_SLUGS = [
  'yellowstone-3-day',
  'glacier-5-day',
  'utah-mighty-5-7-day',
  'alaska-10-day',
  'yosemite-3-day',
  'grand-canyon-page-4-day',
  'olympic-4-day',
  'big-bend-weekend',
  'washington-parks-7-day',
  'acadia-fall-weekend',
];

describe('Step 9 — public Samples verification', () => {
  it('ships exactly the ten reviewed Samples', () => {
    expect(samples.map((sample) => sample.slug)).toEqual(EXPECTED_SLUGS);
  });

  it.each(samples.map((sample) => [sample.slug, sample]))(
    '%s remains readable, private-safe, and export-stable',
    (_slug, sample) => {
      expect(sample.plan?.days?.length).toBeGreaterThan(0);
      expect(evaluateTripSchemaVersion(sample.plan).ok).toBe(true);

      const before = JSON.stringify(sample.plan);
      const exported = exportPublicPlan(sample.plan);
      expect(JSON.stringify(sample.plan)).toBe(before);
      expect(exported).toEqual(projectPublicPlan(sample.plan));
      expect(assertNoInternalFields(exported)).toEqual([]);
      expect(JSON.stringify(exported)).not.toMatch(
        /responseId|itineraryHash|userId|costUsd|inputTokens|leaseToken|providerRequest/,
      );

      // Day structure / overnight / destinations survive the current exporter.
      expect(exported.days.map((day) => day.dayStructure)).toEqual(
        sample.plan.days.map((day) => day.dayStructure),
      );
      expect(exported.days.map((day) => day.overnightLocation)).toEqual(
        sample.plan.days.map((day) => day.overnightLocation),
      );
      expect(exported.destinations).toEqual(sample.plan.destinations);
      expect(exportPublicPlan(exported)).toEqual(exported);

      // Map / route meaning is preserved for grounded stops.
      const mapBefore = buildTripMapModel(sample.plan);
      const mapAfter = buildTripMapModel(exported);
      expect(mapAfter.days.map((d) => d.stops.map((s) => [s.id, s.mapped, s.latitude, s.longitude])))
        .toEqual(mapBefore.days.map((d) => d.stops.map((s) => [s.id, s.mapped, s.latitude, s.longitude])));

      for (let i = 0; i < sample.plan.days.length; i += 1) {
        const edges = sample.plan.days[i].travelEdges || [];
        for (let j = 0; j < edges.length; j += 1) {
          expect(verifiedTransferLabel(exported.days[i].travelEdges[j]))
            .toBe(verifiedTransferLabel(edges[j]));
        }
      }
    },
  );
});
