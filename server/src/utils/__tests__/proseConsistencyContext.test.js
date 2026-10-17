'use strict';

/**
 * Stage 13.7 §6 — direct regression tests for CONTEXT-AWARE difficulty and
 * duration verification. These lock in the fixed false-positive behavior:
 * generic advice that merely contains a difficulty word or a time expression is
 * no longer read as an activity claim, while a genuine activity claim still is.
 */

const {
  detectActivityDifficulty,
  detectActivityDuration,
} = require('../proseTextNormalize');
const { buildItineraryProseManifest } = require('../itineraryProseManifest');
const { verifyProseAgainstItinerary } = require('../proseConsistencyVerifier');

// --- Unit level: the detectors in isolation -------------------------------

describe('detectActivityDifficulty (Stage 13.7)', () => {
  it('reads a term that modifies an activity noun as an activity difficulty', () => {
    expect(detectActivityDifficulty('This is a challenging hike.').difficulty).toBe('strenuous');
    expect(detectActivityDifficulty('Expect a difficult climb.').difficulty).toBe('strenuous');
    expect(detectActivityDifficulty('The trail is strenuous.').difficulty).toBe('strenuous');
    expect(detectActivityDifficulty('This walk is easy.').difficulty).toBe('easy');
    expect(detectActivityDifficulty('The route is moderately difficult.').difficulty).toBe('strenuous');
    expect(detectActivityDifficulty('a moderate 2-hour walk').difficulty).toBe('moderate');
  });

  it('does NOT read non-activity difficulty as an activity claim (ambiguous only)', () => {
    for (const s of [
      'Permits can be difficult to obtain.',
      'Parking is hard to find.',
      'It may be challenging to arrive before sunrise.',
      'Reservations are tough to secure.',
      'The shuttle system can be difficult to understand.',
    ]) {
      const r = detectActivityDifficulty(s);
      expect(r.difficulty).toBeNull();
      expect(r.ambiguous).toBe(true);
    }
  });

  it('does not raise ambiguity for a bare easy/moderate mention', () => {
    expect(detectActivityDifficulty('The overlook is easy to reach by car.').ambiguous).toBe(false);
  });
});

describe('detectActivityDuration (Stage 13.7)', () => {
  it('reads genuine activity-duration constructions', () => {
    expect(detectActivityDuration('Spend 4 hours at this stop.').minutes).toBe(240);
    expect(detectActivityDuration('spend 240 minutes here').minutes).toBe(240);
    expect(detectActivityDuration('Allow about 90 minutes for this.').minutes).toBe(90);
    expect(detectActivityDuration('The hike takes 3 hours.').minutes).toBe(180);
    expect(detectActivityDuration('a 2-hour hike').minutes).toBe(120);
  });

  it('ignores non-activity time expressions (never an activity duration)', () => {
    for (const s of [
      'The shuttle arrives every 15 minutes.',
      'Arrive 30 minutes early.',
      'The drive is 45 minutes.',
      'Wait 10 minutes for the next bus.',
      'The permit window opens in 2 hours.',
    ]) {
      expect(detectActivityDuration(s).minutes).toBeNull();
      expect(detectActivityDuration(s).ambiguous).toBe(false);
    }
  });

  it('flags a genuinely unclassifiable numeric phrase as ambiguous (non-blocking)', () => {
    const r = detectActivityDuration("It's about 2 hours from the nearest town.");
    expect(r.minutes).toBeNull();
    expect(r.ambiguous).toBe(true);
  });
});

// --- Verifier level: conflicts vs. non-blocking telemetry -----------------

function makeManifest(stopOverrides = {}) {
  return buildItineraryProseManifest({
    itinerary: {
      days: [
        { id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [
          { id: 'stop-1', order: 0, type: 'trail', name: 'Emerald Pools',
            startTime: '10:00', duration: 120, difficulty: 'moderate', ...stopOverrides },
        ] },
      ],
    },
    itineraryHash: 'h',
    resolvedMetadata: { parkName: 'Zion National Park' },
  });
}

const wrap = (seg) => `<!--TRAILIE_DAY:day-1--> Day 1\n<!--TRAILIE_STOP:stop-1--> ${seg}`;

describe('verifier difficulty: context-aware conflict vs. telemetry', () => {
  it('flags a real activity-difficulty conflict', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('This is a strenuous hike.'), manifest: makeManifest(),
    });
    expect(r.conflictingDifficulty.length).toBeGreaterThan(0);
    expect(r.status).toBe('failed');
  });

  it('flags "difficult climb" as a real conflict for an easy stop', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Expect a difficult climb.'), manifest: makeManifest({ difficulty: 'easy' }),
    });
    expect(r.conflictingDifficulty.length).toBeGreaterThan(0);
    expect(r.status).toBe('failed');
  });

  it('does not flag "permits are difficult to obtain" (non-blocking telemetry)', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Note that permits can be difficult to obtain.'), manifest: makeManifest(),
    });
    expect(r.conflictingDifficulty).toHaveLength(0);
    expect(r.status).toBe('passed');
    expect(r.issueCodes).toContain('ambiguous_difficulty_context');
  });

  it('does not flag "parking is hard to find"', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Parking is hard to find here.'), manifest: makeManifest(),
    });
    expect(r.conflictingDifficulty).toHaveLength(0);
    expect(r.status).toBe('passed');
  });
});

describe('verifier duration: context-aware conflict vs. telemetry', () => {
  it('accepts a matching activity duration (240 min ~ 4 hours wording)', () => {
    // stop duration 240
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Spend 4 hours at this stop.'), manifest: makeManifest({ duration: 240 }),
    });
    expect(r.conflictingDurations).toHaveLength(0);
    expect(r.status).toBe('passed');
  });

  it('flags a genuine activity-duration conflict', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('The hike takes 3 hours.'), manifest: makeManifest({ duration: 30 }),
    });
    expect(r.conflictingDurations.length).toBeGreaterThan(0);
    expect(r.status).toBe('failed');
  });

  it('ignores "shuttle every 15 minutes" as an activity duration', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('The shuttle runs every 15 minutes.'), manifest: makeManifest({ duration: 120 }),
    });
    expect(r.conflictingDurations).toHaveLength(0);
    expect(r.status).toBe('passed');
  });

  it('ignores "arrive 30 minutes early" and a drive duration', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap('Arrive 30 minutes early; the drive is 45 minutes.'), manifest: makeManifest({ duration: 120 }),
    });
    expect(r.conflictingDurations).toHaveLength(0);
    expect(r.status).toBe('passed');
  });

  it('records ambiguous duration context as non-blocking', () => {
    const r = verifyProseAgainstItinerary({
      proseWithMarkers: wrap("It's about 2 hours from the nearest town."), manifest: makeManifest({ duration: 120 }),
    });
    expect(r.conflictingDurations).toHaveLength(0);
    expect(r.status).toBe('passed');
    expect(r.issueCodes).toContain('ambiguous_duration_context');
  });
});
