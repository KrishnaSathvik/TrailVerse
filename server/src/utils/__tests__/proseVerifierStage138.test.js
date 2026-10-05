'use strict';

/**
 * Stage 13.8 §4/§5/§6 — verifier regressions from the live-run captured drafts:
 *   §4 forbidden [ITINERARY_JSON] artifact blocks
 *   §5 removed-stop alias no longer over-matches generic "canyon"
 *   §6 approach-walk / timing-offset durations are not activity-duration conflicts
 */

const { buildItineraryProseManifest } = require('../itineraryProseManifest');
const { verifyProseAgainstItinerary } = require('../proseConsistencyVerifier');
const { deriveAliases } = require('../proseTextNormalize');

function manifest({ stop = {}, removedStops = [] } = {}) {
  return buildItineraryProseManifest({
    itinerary: {
      days: [
        { id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [
          { id: 'stop-1', order: 0, type: 'trail', name: 'Mather Point',
            startTime: '09:00', duration: 30, difficulty: 'easy', ...stop },
        ] },
      ],
    },
    itineraryHash: 'h',
    removedStops,
    resolvedMetadata: { parkName: 'Grand Canyon National Park' },
  });
}
const wrap = (seg) => `<!--TRAILIE_DAY:day-1--> Day 1\n<!--TRAILIE_STOP:stop-1--> ${seg}`;

describe('§4 forbidden itinerary artifact', () => {
  it('blocks a complete [ITINERARY_JSON] block appended to otherwise-valid prose', () => {
    const prose = `${wrap('A quick stop at Mather Point.')}\n\n[ITINERARY_JSON]\n{"days":[]}\n[/ITINERARY_JSON]`;
    const r = verifyProseAgainstItinerary({ proseWithMarkers: prose, manifest: manifest() });
    expect(r.issueCodes).toContain('forbidden_itinerary_artifact');
    expect(r.forbiddenItineraryArtifacts).toContain('complete_block');
    expect(r.status).toBe('failed');
  });

  it('blocks an orphan/bare label too, and does not accept just because the prose above looks correct', () => {
    const prose = `${wrap('Mather Point is a great first view.')}\n\nITINERARY_JSON:`;
    const r = verifyProseAgainstItinerary({ proseWithMarkers: prose, manifest: manifest() });
    expect(r.issueCodes).toContain('forbidden_itinerary_artifact');
    expect(r.status).toBe('failed');
  });

  it('does not fire on clean prose', () => {
    const r = verifyProseAgainstItinerary({ proseWithMarkers: wrap('Mather Point is an easy first stop.'), manifest: manifest() });
    expect(r.issueCodes).not.toContain('forbidden_itinerary_artifact');
    expect(r.status).toBe('passed');
  });
});

describe('§5 removed-stop alias no longer over-matches', () => {
  it('derives specific aliases, never the generic single token "canyon"', () => {
    expect(deriveAliases('Canyon Overlook Trail')).toEqual(['canyon overlook trail', 'canyon overlook']);
    expect(deriveAliases('Canyon Overlook Trail')).not.toContain('canyon');
    expect(deriveAliases('Angels Landing')).toEqual(['angels landing']);
  });

  it('ordinary use of "canyon" does not read as a restored removed stop', () => {
    const m = manifest({ removedStops: [{ name: 'Canyon Overlook Trail' }] });
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Mather Point looks out over the canyon — one of the best views in the park.'),
      manifest: m,
    });
    expect(r.removedStopMentions).toHaveLength(0);
    expect(r.status).toBe('passed');
  });

  it('an active recommendation of the full removed stop still blocks', () => {
    const m = manifest({ removedStops: [{ name: 'Canyon Overlook Trail' }] });
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('After Mather Point, head over to the Canyon Overlook Trail for sunset.'),
      manifest: m,
    });
    expect(r.removedStopMentions.length).toBeGreaterThan(0);
    expect(r.status).toBe('failed');
  });

  it('a historical explanation of the removed stop remains allowed', () => {
    const m = manifest({ removedStops: [{ name: 'Canyon Overlook Trail' }] });
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Mather Point is your first view. Note: the Canyon Overlook Trail was removed because it was closed.'),
      manifest: m,
    });
    expect(r.removedStopMentions).toHaveLength(0);
    expect(r.status).toBe('passed');
  });
});

describe('§6 approach-walk and timing-offset durations (from captured drafts)', () => {
  it('"a 5-minute walk from the visitor center" is not an activity-duration conflict', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('A 5-minute walk from the visitor center (9:00 AM) — your first canyon view.'),
      manifest: manifest({ stop: { duration: 30 } }),
    });
    expect(r.conflictingDurations).toHaveLength(0);
    expect(r.status).toBe('passed');
  });

  it('"plan to arrive 30 minutes before sunset" is not an activity-duration conflict', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Plan your ride and arrive 30 minutes before sunset for the best light.'),
      manifest: manifest({ stop: { duration: 90 } }),
    });
    expect(r.conflictingDurations).toHaveLength(0);
    expect(r.status).toBe('passed');
  });

  it('a genuine activity-duration mismatch still blocks', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Spend 3 hours at this overlook soaking it in.'),
      manifest: manifest({ stop: { duration: 30 } }),
    });
    expect(r.conflictingDurations.length).toBeGreaterThan(0);
    expect(r.status).toBe('failed');
  });
});
