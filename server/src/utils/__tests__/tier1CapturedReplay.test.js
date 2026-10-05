'use strict';

/**
 * §K — CAPTURED ARTIFACT REPLAY.
 *
 * Real delivered plans are stripped exactly as the reduced generation contract
 * would have produced them, pushed back through binding + finalization, and
 * compared field by field against the same captured plan finalized unchanged.
 *
 * Both sides run the identical finalization, so any difference is attributable
 * to the contract reduction and nothing else.
 *
 * Offline. No providers, no network.
 */

const fs = require('fs');
const path = require('path');

const { bindGeneratedItineraryContract } = require('../generationContractBinding');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');

const ARTIFACTS = path.resolve(__dirname, '..', '..', '..', '..', 'artifacts');

/** The four plans the spec names, plus whatever else the corpus holds. */
const NAMED_PLANS = [
  ['THRO', 'trailie-latency-benchmark-2026-08-26/conversation-B/B1-theodore-roosevelt-easygoing-envelope.json'],
  ['Hawaii Volcanoes', 'trailie-gate5-quality-fit-2026-08-25/conversation-C/C1-hawaii-volcanoes-culture-scenery-envelope.json'],
  ['Great Sand Dunes', 'trailie-gate5-quality-fit-2026-08-25/conversation-A/A1-sand-dunes-medano-pass-envelope.json'],
  ['Canyonlands', 'trailie-gate4-reliability-2026-08-24/conversation-A2/A2-pairA-run2-envelope.json'],
];

/** Removed from the model contract in the default configuration. */
const TIER1_ALWAYS_STRIPPED = [
  'startTime', 'drivingTimeFromPreviousMin', 'physicalDifficulty',
  // Never model-authored in the first place — finalizeItinerary stamps it.
  'coordinateSource',
];

/** Only removed when the measurement lever is on. See COORDINATE_STOP_FIELDS. */
const COORDINATES = ['latitude', 'longitude'];

function loadPlan(relative) {
  const full = path.join(ARTIFACTS, relative);
  if (!fs.existsSync(full)) return null;
  const plan = JSON.parse(fs.readFileSync(full, 'utf8')).canonicalPlan;
  return plan?.days?.length ? plan : null;
}

function distinctParkCodes(plan) {
  return [...new Set((plan.days || [])
    .flatMap((day) => day.stops || [])
    .map((stop) => stop.parkCode)
    .filter(Boolean))];
}

/** What the model would have emitted under the reduced contract. */
function stripToGenerationContract(plan, { stripParkIdentity, stripCoordinates = false }) {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      // Server-derived day metadata is not model-authored either.
      parkCodes: undefined,
      stops: (day.stops || []).map((stop) => {
        const kept = { ...stop };
        // Only `coordinateSource: 'tool'` marks a schema-captured position. A
        // catalog- or evidence-derived one was never in the model artifact, so
        // reconstructing that artifact must drop it and let enrichment refill.
        const modelAuthoredCoordinates = stop.coordinateSource === 'tool';
        for (const field of TIER1_ALWAYS_STRIPPED) delete kept[field];
        if (stripCoordinates || !modelAuthoredCoordinates) {
          for (const field of COORDINATES) delete kept[field];
        }
        if (stripParkIdentity) {
          delete kept.parkCode;
          delete kept.parkName;
        }
        return kept;
      }),
    })),
  };
}

async function replay(plan, { stripCoordinates = false } = {}) {
  const codes = distinctParkCodes(plan);
  const singleDestination = codes.length === 1;
  const parkIdentityBinding = singleDestination
    ? {
      parkCode: codes[0],
      parkName: (plan.days.flatMap((d) => d.stops || [])
        .find((s) => s.parkCode === codes[0] && s.parkName) || {}).parkName || null,
    }
    : null;

  const stripped = stripToGenerationContract(plan, {
    stripParkIdentity: singleDestination,
    stripCoordinates,
  });
  const bound = bindGeneratedItineraryContract({ itineraryData: stripped, parkIdentityBinding });

  const [before, after] = await Promise.all([
    finalizeStructuredItinerary({ itineraryData: plan, constraints: null }),
    finalizeStructuredItinerary({ itineraryData: bound, constraints: null }),
  ]);
  return {
    before: before.itineraryData,
    after: after.itineraryData,
    singleDestination,
    parkIdentityBinding,
  };
}

function stopsOf(plan) {
  return (plan.days || []).flatMap((day) => day.stops || []);
}

/**
 * Compare every canonical stop field. The one KNOWN delta is recorded rather
 * than ignored: a captured stop that carried `physicalDifficulty` but no
 * `difficulty` cannot have that value restored, because the model no longer
 * authors it and there is nothing to project from.
 */
function diffPlans(before, after, binding) {
  const beforeStops = stopsOf(before);
  const afterStops = stopsOf(after);
  const unexpected = [];
  const projectionLosses = [];
  const identityNormalizations = [];
  const identityBroadenings = [];
  const zeroDriveNormalizations = [];
  const coordinateGains = [];
  const coordinateSubstitutions = [];
  const coordinateLosses = [];

  for (const [index, beforeStop] of beforeStops.entries()) {
    const afterStop = afterStops[index];
    if (!afterStop) {
      unexpected.push({ index, field: '<missing stop>', before: beforeStop.name, after: null });
      continue;
    }
    const fields = new Set([...Object.keys(beforeStop), ...Object.keys(afterStop)]);
    for (const field of fields) {
      const a = beforeStop[field] ?? null;
      const b = afterStop[field] ?? null;
      if (JSON.stringify(a) === JSON.stringify(b)) continue;

      // The model no longer authors `physicalDifficulty`, so a stop that
      // carried it WITHOUT `difficulty` has nothing to project from.
      if (field === 'physicalDifficulty' && !beforeStop.difficulty && beforeStop.physicalDifficulty) {
        projectionLosses.push({ index, name: beforeStop.name, was: a });
        continue;
      }
      // Server-resolved park identity is spelled ONE way. The model spelled the
      // same park two ways within a single plan; injection normalizes that.
      if (field === 'parkName' && binding && b === binding.parkName) {
        identityNormalizations.push({ index, name: beforeStop.name, from: a, to: b });
        continue;
      }
      // BROADENING. A stop nobody could attribute now carries the resolved
      // destination — e.g. a "Black Hills scenery drive" on a Mount Rushmore
      // turn. Recorded and bounded rather than waved through: `buildSectionScope`
      // reads stop park codes to scope evidence to a section.
      if ((field === 'parkCode' || field === 'parkName') && binding && a === null
        && b === binding[field]) {
        identityBroadenings.push({ index, name: beforeStop.name, field, to: b });
        continue;
      }
      // A model-emitted `0` becomes canonical `null`. Every consumer reads this
      // field through `|| 0` or `> 0`, so the two are indistinguishable — and
      // `null` is the honest value for "no verified drive".
      if (field === 'drivingTimeFromPreviousMin' && a === 0 && b === null) {
        zeroDriveNormalizations.push({ index, name: beforeStop.name });
        continue;
      }
      // A GAIN, not a loss. The captured stop carried an explicit `null`
      // latitude, which made `enrichKnownStopLocations` skip it
      // (`Number(null)` is finite). The reduced contract leaves the key absent,
      // so the known-stop catalog resolves it and the stop gets a map pin.
      if (['latitude', 'longitude', 'coordinateSource', 'locationResolutionSource'].includes(field)
        && (a === null || a === 'unknown') && b !== null && b !== 'unknown') {
        coordinateGains.push({ index, name: beforeStop.name, field, to: b });
        continue;
      }
      // Lever on: the catalog resolves the same place the model had located,
      // at slightly different precision. A substitution, not a loss.
      if (['latitude', 'longitude'].includes(field)
        && typeof a === 'number' && typeof b === 'number') {
        coordinateSubstitutions.push({ index, name: beforeStop.name, field, from: a, to: b });
        continue;
      }
      if (field === 'coordinateSource' && a === 'tool' && b === 'trailverse_catalog') {
        coordinateSubstitutions.push({ index, name: beforeStop.name, field, from: a, to: b });
        continue;
      }
      // Only reachable with the coordinate lever on: a model-supplied position
      // the known-stop catalog cannot reproduce.
      if ((field === 'latitude' || field === 'longitude' || field === 'coordinateSource')
        && a !== null && b === (field === 'coordinateSource' ? 'unknown' : null)) {
        coordinateLosses.push({ index, name: beforeStop.name, field, was: a });
        continue;
      }
      unexpected.push({ index, name: beforeStop.name, field, before: a, after: b });
    }
  }
  return {
    unexpected,
    projectionLosses,
    identityNormalizations,
    identityBroadenings,
    zeroDriveNormalizations,
    coordinateGains,
    coordinateSubstitutions,
    coordinateLosses,
    stopCount: beforeStops.length,
  };
}

const available = NAMED_PLANS.filter(([, rel]) => loadPlan(rel));
const describeIfCorpus = available.length === NAMED_PLANS.length ? describe : describe.skip;

describeIfCorpus('captured artifact replay through the reduced contract', () => {
  for (const [label, relative] of NAMED_PLANS) {
    describe(label, () => {
      let result;
      let diff;

      beforeAll(async () => {
        result = await replay(loadPlan(relative));
        diff = diffPlans(result.before, result.after, result.parkIdentityBinding);
      });

      test('the canonical artifact is otherwise identical', () => {
        expect(diff.unexpected).toEqual([]);
        expect(diff.stopCount).toBeGreaterThan(0);
      });

      test('day count and stop count are unchanged', () => {
        expect(result.after.days.length).toBe(result.before.days.length);
        expect(stopsOf(result.after).length).toBe(stopsOf(result.before).length);
      });

      test('coordinates the model supplied are preserved', () => {
        expect(stopsOf(result.after).map((s) => [s.latitude ?? null, s.longitude ?? null]))
          .toEqual(stopsOf(result.before).map((s) => [s.latitude ?? null, s.longitude ?? null]));
        expect(diff.coordinateLosses).toEqual([]);
      });

      test('park identity is restored on every stop that had it', () => {
        const beforeCodes = stopsOf(result.before).map((s) => s.parkCode ?? null);
        const afterCodes = stopsOf(result.after).map((s) => s.parkCode ?? null);
        expect(afterCodes).toEqual(beforeCodes);
      });

      test('note and why are byte-identical', () => {
        expect(stopsOf(result.after).map((s) => [s.note ?? null, s.why ?? null]))
          .toEqual(stopsOf(result.before).map((s) => [s.note ?? null, s.why ?? null]));
      });

      test('startTime stays the canonical empty string on every stop', () => {
        expect(stopsOf(result.after).every((s) => s.startTime === '')).toBe(true);
      });

      test('coordinate provenance is stamped by finalization, identically', () => {
        expect(stopsOf(result.after).map((s) => s.coordinateSource))
          .toEqual(stopsOf(result.before).map((s) => s.coordinateSource));
      });
    });
  }
});

/**
 * Corpus-wide control. Every captured plan is replayed, and the ONLY tolerated
 * difference is the recorded `physicalDifficulty` projection loss.
 */
describe('corpus-wide replay control', () => {
  const envelopes = [];
  if (fs.existsSync(ARTIFACTS)) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('-envelope.json')) envelopes.push(full);
      }
    };
    walk(ARTIFACTS);
  }

  const plans = [];
  const seen = new Set();
  for (const file of envelopes) {
    let envelope;
    try { envelope = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const plan = envelope?.canonicalPlan;
    if (!plan?.days?.length) continue;
    if (envelope.responseId && seen.has(envelope.responseId)) continue;
    if (envelope.responseId) seen.add(envelope.responseId);
    plans.push([path.relative(ARTIFACTS, file), plan]);
  }

  const maybe = plans.length ? test : test.skip;

  maybe('every captured plan replays with no unexpected canonical change', async () => {
    const failures = [];
    let stops = 0;
    let losses = 0;
    let coordinateLosses = 0;
    let coordinateGains = 0;
    let broadenings = 0;

    for (const [label, plan] of plans) {
      // eslint-disable-next-line no-await-in-loop
      const { before, after, parkIdentityBinding } = await replay(plan);
      const diff = diffPlans(before, after, parkIdentityBinding);
      stops += diff.stopCount;
      losses += diff.projectionLosses.length;
      coordinateLosses += diff.coordinateLosses.length;
      coordinateGains += diff.coordinateGains
        .filter((entry) => entry.field === 'latitude').length;
      broadenings += diff.identityBroadenings
        .filter((entry) => entry.field === 'parkCode').length;
      if (diff.unexpected.length) failures.push({ label, unexpected: diff.unexpected.slice(0, 4) });
    }

    expect({ failures, plans: plans.length }).toEqual({ failures: [], plans: plans.length });
    expect(stops).toBeGreaterThan(100);
    // Recorded, not hidden: the model no longer authors `physicalDifficulty`,
    // so a stop that carried it WITHOUT `difficulty` has nothing to project
    // from. Its only reader is the eval-capture alias.
    expect(losses).toBeLessThanOrEqual(Math.ceil(stops * 0.12));
    // With the coordinate lever off, nothing loses a position. Phase 9B.1
    // fixed the asymmetry that used to produce a "gain" here — an explicit
    // model `null` no longer skips the catalog while an absent key does not;
    // both now resolve identically, so `before` and `after` agree and there
    // is nothing left to gain.
    expect(coordinateLosses).toBe(0);
    expect(coordinateGains).toBe(0);
    // Injection attributes a handful of previously-unattributable stops to the
    // resolved destination. Bounded so a wider change cannot pass silently.
    expect(broadenings).toBeLessThanOrEqual(Math.ceil(stops * 0.03));
  }, 120000);

  /**
   * The coordinate lever, measured rather than assumed. This test does not
   * assert the loss is acceptable — it pins its size so the tradeoff stays
   * visible if anyone turns the lever on.
   */
  maybe('the coordinate lever costs positions the catalog cannot reproduce', async () => {
    let stops = 0;
    let lost = 0;
    for (const [, plan] of plans) {
      // eslint-disable-next-line no-await-in-loop
      const { before, after, parkIdentityBinding } = await replay(plan, { stripCoordinates: true });
      const diff = diffPlans(before, after, parkIdentityBinding);
      stops += diff.stopCount;
      lost += diff.coordinateLosses.filter((entry) => entry.field === 'latitude').length;
      expect(diff.unexpected).toEqual([]);
    }
    expect(stops).toBeGreaterThan(100);
    expect(lost).toBeGreaterThan(0);
    // A stop without numeric coordinates renders no map pin and no maps link.
    expect(lost / stops).toBeGreaterThan(0.05);
  }, 120000);
});
