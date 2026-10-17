'use strict';

/**
 * Phase 9C.1D.1 — proseConsistencyVerifier day-scoped stop identity.
 *
 * `manifestStopById`/`manifestStopDay` used to be flat plan-global Maps keyed
 * only by bare `stopId`. Since `fastItineraryPlannerService` mints ids as
 * `stop-${order}` reset per day, day 2's `stop-1` silently overwrote day 1's
 * `stop-1` in these maps — the exact composite-key collision the
 * `geoResolutionArtifact` module already avoids via a day+stopId key. This
 * suite pins the day-scoped fix.
 */

const { buildItineraryProseManifest } = require('../itineraryProseManifest');
const { verifyProseAgainstItinerary } = require('../proseConsistencyVerifier');

function twoDayManifest({ day1Extra = {}, day2Extra = {} } = {}) {
  return buildItineraryProseManifest({
    itinerary: {
      days: [
        { id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [
          { id: 'stop-1', order: 0, type: 'trail', name: 'Mather Point', duration: 30, ...day1Extra },
        ] },
        { id: 'day-2', dayNumber: 2, label: 'Day 2', stops: [
          { id: 'stop-1', order: 0, type: 'trail', name: 'Yavapai Point', duration: 30, ...day2Extra },
        ] },
      ],
    },
    itineraryHash: 'h',
    resolvedMetadata: { parkName: 'Grand Canyon National Park' },
  });
}

const dayBlock = (dayId, label, stopId, seg) =>
  `<!--TRAILIE_DAY:${dayId}--> ${label}\n<!--TRAILIE_STOP:${stopId}--> ${seg}`;

describe('same stopId reused across two different days', () => {
  it('is NOT a collision when each day correctly references its own stop', () => {
    const manifest = twoDayManifest();
    const prose = [
      dayBlock('day-1', 'Day 1', 'stop-1', 'Start at Mather Point for the classic overlook.'),
      dayBlock('day-2', 'Day 2', 'stop-1', 'Start at Yavapai Point for a different angle.'),
    ].join('\n\n');

    const r = verifyProseAgainstItinerary({ proseWithMarkers: prose, manifest });

    expect(r.unknownStopIds).toHaveLength(0);
    expect(r.duplicateStopIds).toHaveLength(0);
    expect(r.wrongDayAssignments).toHaveLength(0);
    expect(r.missingStopIds).toHaveLength(0);
    expect(r.status).toBe('passed');
  });

  it('flags the day whose stop-1 was never mentioned as missing, not both', () => {
    const manifest = twoDayManifest();
    const prose = dayBlock('day-1', 'Day 1', 'stop-1', 'Start at Mather Point for the classic overlook.');

    const r = verifyProseAgainstItinerary({ proseWithMarkers: prose, manifest });

    expect(r.missingStopIds).toHaveLength(1);
    expect(r.missingDayIds).toContain('day-2');
    expect(r.status).toBe('failed');
  });

  it('mentioning stop-1 twice under the SAME day is still a real duplicate', () => {
    const manifest = twoDayManifest();
    const prose = [
      dayBlock('day-1', 'Day 1', 'stop-1', 'Start at Mather Point.'),
      `<!--TRAILIE_STOP:stop-1--> Mather Point again, still day 1.`,
      dayBlock('day-2', 'Day 2', 'stop-1', 'Start at Yavapai Point.'),
    ].join('\n\n');

    const r = verifyProseAgainstItinerary({ proseWithMarkers: prose, manifest });

    expect(r.duplicateStopIds).toContain('stop-1');
    expect(r.status).toBe('failed');
  });
});

describe('a stop id that exists under only ONE day is still caught if misattributed', () => {
  it('reports wrongDayAssignment, not a false pass, when a day-unique id is placed under the wrong day marker', () => {
    const manifest = buildItineraryProseManifest({
      itinerary: {
        days: [
          { id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [
            { id: 'stop-1', order: 0, type: 'trail', name: 'Mather Point', duration: 30 },
            { id: 'stop-2', order: 1, type: 'trail', name: 'Yaki Point', duration: 30 },
          ] },
          { id: 'day-2', dayNumber: 2, label: 'Day 2', stops: [
            { id: 'stop-1', order: 0, type: 'trail', name: 'Yavapai Point', duration: 30 },
          ] },
        ],
      },
      itineraryHash: 'h',
      resolvedMetadata: { parkName: 'Grand Canyon National Park' },
    });

    // 'stop-2' only exists under day-1, but the prose puts it under day-2.
    const prose = [
      dayBlock('day-1', 'Day 1', 'stop-1', 'Start at Mather Point.'),
      dayBlock('day-2', 'Day 2', 'stop-2', 'Then Yaki Point.'),
    ].join('\n\n');

    const r = verifyProseAgainstItinerary({ proseWithMarkers: prose, manifest });

    expect(r.wrongDayAssignments).toEqual(
      expect.arrayContaining([expect.objectContaining({ stopId: 'stop-2', underDay: 'day-2', expectedDay: 'day-1' })])
    );
    expect(r.status).toBe('failed');
  });
});
