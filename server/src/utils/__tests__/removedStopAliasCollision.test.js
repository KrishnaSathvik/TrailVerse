'use strict';

/**
 * Stage 13.8A §1 — removed-stop alias collision guard.
 *
 * A removed stop's aliases BLOCK prose (an active mention fails verification), so
 * an automatically derived alias must never collapse into the destination name
 * itself. "Grand Canyon Visitor Center" previously derived "grand canyon", which
 * matched every ordinary mention of the park.
 *
 * Policy (automatic derivation only):
 *   - the full canonical name is always retained,
 *   - a suffix-stripped alias is rejected when it equals a destination/park name
 *     or a destination alias,
 *   - rejected when every token appears in the destination name (no distinctive
 *     token outside it),
 *   - rejected when it shares a destination token and its only remaining tokens
 *     are generic geographic/type words ("yellowstone lake"),
 *   - explicitly curated aliases from trusted metadata are always kept.
 */

const { deriveRemovedStopAliases } = require('../proseTextNormalize');
const { buildItineraryProseManifest } = require('../itineraryProseManifest');
const { verifyProseAgainstItinerary } = require('../proseConsistencyVerifier');

const GRAND_CANYON = ['Grand Canyon National Park'];
const ZION = ['Zion National Park'];
const YELLOWSTONE = ['Yellowstone National Park'];

describe('§1 automatic derivation rejects destination-name collisions', () => {
  it('keeps the full name but never derives the bare destination name', () => {
    const aliases = deriveRemovedStopAliases({
      name: 'Grand Canyon Visitor Center',
      destinationNames: GRAND_CANYON,
    });
    expect(aliases).toContain('grand canyon visitor center');
    expect(aliases).not.toContain('grand canyon');
  });

  it('rejects a derived alias equal to a destination alias', () => {
    // "Grand Canyon Village Overlook" → "grand canyon village" is still distinctive,
    // but "Grand Canyon National Park Overlook" → "grand canyon national park" is
    // exactly the destination and must be rejected.
    const aliases = deriveRemovedStopAliases({
      name: 'Grand Canyon National Park Overlook',
      destinationNames: GRAND_CANYON,
    });
    expect(aliases).not.toContain('grand canyon national park');
    expect(aliases).not.toContain('grand canyon');
  });

  it('rejects a derived alias whose only non-destination token is a generic feature word', () => {
    const aliases = deriveRemovedStopAliases({
      name: 'Yellowstone Lake Overlook',
      destinationNames: YELLOWSTONE,
    });
    expect(aliases).toContain('yellowstone lake overlook');
    expect(aliases).not.toContain('yellowstone lake');
  });

  it('retains a distinctive suffix-stripped alias unrelated to the destination', () => {
    const aliases = deriveRemovedStopAliases({
      name: 'Canyon Overlook Trail',
      destinationNames: ZION,
    });
    expect(aliases).toEqual(['canyon overlook trail', 'canyon overlook']);
  });

  it('never derives a single generic token', () => {
    expect(deriveRemovedStopAliases({ name: 'Canyon Overlook Trail', destinationNames: ZION }))
      .not.toContain('canyon');
    expect(deriveRemovedStopAliases({ name: 'Angels Landing', destinationNames: ZION }))
      .toEqual(['angels landing']);
  });

  it('keeps explicitly curated aliases even when short or broad', () => {
    const aliases = deriveRemovedStopAliases({
      name: 'Grand Canyon Visitor Center',
      curatedAliases: ['GC Visitor Center', 'Grand Canyon'],
      destinationNames: GRAND_CANYON,
    });
    expect(aliases).toContain('gc visitor center');
    expect(aliases).toContain('grand canyon'); // curated, not automatically derived
  });

  it('rejects destination-name aliases only for automatic derivation', () => {
    const auto = deriveRemovedStopAliases({ name: 'Zion Canyon Shuttle Stop', destinationNames: ZION });
    expect(auto).not.toContain('zion canyon');
    const curated = deriveRemovedStopAliases({
      name: 'Zion Canyon Shuttle Stop', curatedAliases: ['Zion Canyon'], destinationNames: ZION,
    });
    expect(curated).toContain('zion canyon');
  });
});

describe('§1 verifier behavior with the guarded aliases', () => {
  function manifest({ removedStops = [], parkName = 'Grand Canyon National Park' } = {}) {
    return buildItineraryProseManifest({
      itinerary: {
        days: [{ id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [
          { id: 'stop-1', order: 0, type: 'trail', name: 'Mather Point', startTime: '09:00', duration: 30, difficulty: 'easy' },
        ] }],
      },
      itineraryHash: 'h',
      removedStops,
      resolvedMetadata: { parkName },
    });
  }
  const wrap = (seg) => `<!--TRAILIE_DAY:day-1--> Day 1\n<!--TRAILIE_STOP:stop-1--> ${seg}`;

  it('ordinary destination references do not trigger a removed-stop violation', () => {
    const m = manifest({ removedStops: [{ name: 'Grand Canyon Visitor Center' }] });
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Mather Point is the classic first view of the Grand Canyon.'),
      manifest: m,
    });
    expect(r.removedStopMentions).toHaveLength(0);
    expect(r.status).toBe('passed');
  });

  it('the full removed-stop name still blocks an active restoration', () => {
    const m = manifest({ removedStops: [{ name: 'Grand Canyon Visitor Center' }] });
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('After Mather Point, swing by the Grand Canyon Visitor Center for maps.'),
      manifest: m,
    });
    expect(r.removedStopMentions.length).toBeGreaterThan(0);
    expect(r.status).toBe('failed');
  });

  it('a specific distinctive suffix-stripped alias still blocks', () => {
    const m = manifest({ removedStops: [{ name: 'Canyon Overlook Trail' }], parkName: 'Zion National Park' });
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('After Mather Point, hike the Canyon Overlook for sunset.'),
      manifest: m,
    });
    expect(r.removedStopMentions).toContain('canyon overlook');
    expect(r.status).toBe('failed');
  });

  it('a curated broad alias still blocks an active mention', () => {
    const m = manifest({ removedStops: [{ name: 'Grand Canyon Visitor Center', aliases: ['Visitor Center'] }] });
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('After Mather Point, stop at the Visitor Center for maps.'),
      manifest: m,
    });
    expect(r.removedStopMentions).toContain('visitor center');
    expect(r.status).toBe('failed');
  });
});
