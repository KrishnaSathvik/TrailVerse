'use strict';

const { buildItineraryProseManifest } = require('../itineraryProseManifest');
const { parseAlignmentMarkers, stripAlignmentMarkers } = require('../proseAlignmentMarkers');
const { verifyProseAgainstItinerary } = require('../proseConsistencyVerifier');
const { renderDeterministicItineraryResponse } = require('../deterministicItineraryRenderer');

function frozenItinerary() {
  return {
    days: [
      { id: 'day-1', dayNumber: 1, label: 'Day 1 — Zion Canyon', date: null, stops: [
        { id: 'stop-1', order: 0, type: 'landmark', name: 'Tunnel View', note: 'overlook', startTime: '08:00', duration: 45, difficulty: null },
        { id: 'stop-2', order: 1, type: 'trail', name: 'Emerald Pools', note: 'waterfalls', startTime: '10:00', duration: 120, difficulty: 'moderate', drivingTimeFromPreviousMin: 15 },
      ] },
      { id: 'day-2', dayNumber: 2, label: 'Day 2 — East Zion', date: null, stops: [
        { id: 'stop-3', order: 0, type: 'trail', name: 'Canyon Overlook', note: 'short hike', startTime: '09:00', duration: 60, difficulty: 'easy' },
      ] },
    ],
  };
}

const manifest = () => buildItineraryProseManifest({
  itinerary: frozenItinerary(),
  itineraryHash: 'hash-abc',
  removedStops: [{ name: 'Angels Landing' }],
  feasibilityIssues: [{ id: 'f1', type: 'excessive_driving', severity: 'warning', message: 'Long driving day 2' }],
  resolvedMetadata: { parkName: 'Zion National Park' },
});

const goodProse = `<!--TRAILIE_INTRO--> Here's your two-day Zion plan.
<!--TRAILIE_DAY:day-1--> ## Day 1 — Zion Canyon
<!--TRAILIE_STOP:stop-1--> Start at Tunnel View for the classic overlook.
<!--TRAILIE_STOP:stop-2--> Then hike Emerald Pools, a moderate 2-hour walk.
<!--TRAILIE_DAY:day-2--> ## Day 2 — East Zion
<!--TRAILIE_STOP:stop-3--> Finish with Canyon Overlook, an easy hour.`;

describe('buildItineraryProseManifest', () => {
  it('is deterministic (byte-equal for the same itinerary)', () => {
    expect(JSON.stringify(manifest())).toBe(JSON.stringify(manifest()));
  });
  it('is tied to the itinerary hash and carries removed-stop aliases', () => {
    const m = manifest();
    expect(m.itineraryHash).toBe('hash-abc');
    expect(m.removedStopAliases).toContain('angels landing');
    expect(m.trip.totalDays).toBe(2);
  });
  it('does not leak pre-correction stops (only final stops appear)', () => {
    const m = manifest();
    const ids = m.days.flatMap((d) => d.stops.map((s) => s.stopId));
    expect(ids).toEqual(['stop-1', 'stop-2', 'stop-3']);
  });
});

describe('alignment markers', () => {
  it('parses day/stop grouping and strips fully', () => {
    const parsed = parseAlignmentMarkers(goodProse);
    expect(parsed.malformed).toBe(false);
    expect(parsed.days.map((d) => d.dayId)).toEqual(['day-1', 'day-2']);
    expect(parsed.days[0].stops.map((s) => s.stopId)).toEqual(['stop-1', 'stop-2']);
    expect(stripAlignmentMarkers(goodProse)).not.toMatch(/TRAILIE_/);
  });
  it('flags a stop before any day marker', () => {
    const bad = '<!--TRAILIE_STOP:stop-1--> orphan';
    expect(parseAlignmentMarkers(bad).malformedReasons).toContain('stop_before_day');
  });
  it('flags text before the first marker without an intro', () => {
    const bad = 'Preamble text\n<!--TRAILIE_DAY:day-1--> hi';
    expect(parseAlignmentMarkers(bad).malformedReasons).toContain('text_before_first_marker');
  });
});

describe('verifyProseAgainstItinerary', () => {
  it('passes matching prose', () => {
    const r = verifyProseAgainstItinerary({ proseWithMarkers: goodProse, manifest: manifest() });
    expect(r.status).toBe('passed');
    expect(r.sanitizedProse).not.toMatch(/TRAILIE_/);
  });

  it('fails a missing day', () => {
    const prose = goodProse.replace(/<!--TRAILIE_DAY:day-2-->[\s\S]*/, '');
    const r = verifyProseAgainstItinerary({ proseWithMarkers: prose, manifest: manifest() });
    expect(r.status).toBe('failed');
    expect(r.missingDayIds).toContain('day-2');
  });

  it('fails a missing critical stop', () => {
    const prose = goodProse.replace(/<!--TRAILIE_STOP:stop-2-->[^<]*/, '');
    const r = verifyProseAgainstItinerary({ proseWithMarkers: prose, manifest: manifest() });
    expect(r.missingStopIds).toContain('stop-2');
    expect(r.status).toBe('failed');
  });

  it('fails an unknown stop marker', () => {
    const unknown = goodProse.replace('<!--TRAILIE_STOP:stop-3-->', '<!--TRAILIE_STOP:stop-999-->');
    expect(verifyProseAgainstItinerary({ proseWithMarkers: unknown, manifest: manifest() }).unknownStopIds).toContain('stop-999');
  });

  it('mentioning the same stop id twice under the SAME day marker is a real duplicate', () => {
    const dup = goodProse + '\n<!--TRAILIE_STOP:stop-3--> repeat';
    expect(verifyProseAgainstItinerary({ proseWithMarkers: dup, manifest: manifest() }).duplicateStopIds).toContain('stop-3');
  });

  // Phase 9C.1D.1: day-scoped identity. `stop-1` belongs only to day-1 here,
  // so re-mentioning it under day-2's marker is a wrongDayAssignment, not a
  // duplicate — the two mentions are not "the same claim twice", one of them
  // is simply attributed to the wrong day.
  it('re-mentioning another day\'s stop id under this day\'s marker is a wrong-day assignment, not a duplicate', () => {
    const misattributed = goodProse + '\n<!--TRAILIE_STOP:stop-1--> repeat';
    const r = verifyProseAgainstItinerary({ proseWithMarkers: misattributed, manifest: manifest() });
    expect(r.wrongDayAssignments).toEqual(
      expect.arrayContaining([expect.objectContaining({ stopId: 'stop-1', underDay: 'day-2', expectedDay: 'day-1' })])
    );
    expect(r.duplicateStopIds).not.toContain('stop-1');
    expect(r.status).toBe('failed');
  });

  it('fails wrong day assignment and wrong order', () => {
    const wrong = `<!--TRAILIE_DAY:day-1--> d1
<!--TRAILIE_STOP:stop-2--> out of order
<!--TRAILIE_STOP:stop-1--> first
<!--TRAILIE_DAY:day-2--> d2
<!--TRAILIE_STOP:stop-3--> ok`;
    const r = verifyProseAgainstItinerary({ proseWithMarkers: wrong, manifest: manifest() });
    expect(r.orderViolations.length).toBeGreaterThan(0);
  });

  it('fails a removed-stop recommendation but allows a historical explanation', () => {
    const rec = goodProse + '\n<!--TRAILIE_STOP:stop-3--> also do Angels Landing in the afternoon.';
    // (dup stop-3 + removed mention) — removed mention present:
    const recResult = verifyProseAgainstItinerary({
      proseWithMarkers: goodProse.replace('an easy hour.', 'an easy hour. Then head to Angels Landing for sunset.'),
      manifest: manifest(),
    });
    expect(recResult.removedStopMentions).toContain('angels landing');
    expect(recResult.status).toBe('failed');

    const historical = verifyProseAgainstItinerary({
      proseWithMarkers: goodProse.replace('an easy hour.', 'an easy hour. Note: Angels Landing was removed because the permit was unavailable.'),
      manifest: manifest(),
    });
    expect(historical.removedStopMentions).toHaveLength(0);
    expect(historical.status).toBe('passed');
  });

  it('fails a conflicting difficulty claim', () => {
    const conflict = goodProse.replace('a moderate 2-hour walk', 'a strenuous 2-hour walk');
    const r = verifyProseAgainstItinerary({ proseWithMarkers: conflict, manifest: manifest() });
    expect(r.conflictingDifficulty.length).toBeGreaterThan(0);
    expect(r.status).toBe('failed');
  });

  it('does not false-positive on generic safety advice', () => {
    const advice = goodProse.replace('an easy hour.', 'an easy hour. Bring water, arrive early, and check current conditions.');
    expect(verifyProseAgainstItinerary({ proseWithMarkers: advice, manifest: manifest() }).status).toBe('passed');
  });

  it('flags a strong unsupported additive instruction', () => {
    const added = goodProse.replace('an easy hour.', 'an easy hour. Also visit Bryce Canyon while nearby.');
    const r = verifyProseAgainstItinerary({ proseWithMarkers: added, manifest: manifest() });
    expect(r.unsupportedPlanActions.length).toBeGreaterThan(0);
    expect(r.status).toBe('failed');
  });

  it('passes concise prose (no false failure for brevity)', () => {
    const concise = `<!--TRAILIE_DAY:day-1-->
<!--TRAILIE_STOP:stop-1--> Tunnel View.
<!--TRAILIE_STOP:stop-2--> Emerald Pools.
<!--TRAILIE_DAY:day-2-->
<!--TRAILIE_STOP:stop-3--> Canyon Overlook.`;
    expect(verifyProseAgainstItinerary({ proseWithMarkers: concise, manifest: manifest() }).status).toBe('passed');
  });
});

describe('renderDeterministicItineraryResponse', () => {
  it('renders frozen fields only and lists final warnings once; no markers', () => {
    const out = renderDeterministicItineraryResponse({
      itinerary: frozenItinerary(),
      feasibilityIssues: [{ severity: 'warning', message: 'Long driving day 2' }],
      resolvedMetadata: { parkName: 'Zion National Park' },
    });
    expect(out).toMatch(/Tunnel View/);
    expect(out).toMatch(/Things to double-check/);
    expect(out).not.toMatch(/TRAILIE_/);
    expect(out).not.toMatch(/Angels Landing/); // removed stop never listed
  });
});
