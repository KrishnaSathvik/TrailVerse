'use strict';

/**
 * Stage 13.7 §5/§6 — the long-itinerary marker contract.
 *
 * The Phase B prompt must present ONE compact marker skeleton (every marker
 * exactly once, in order), stay within the configured input budget even for a
 * seven-day plan, and the single retry must name the exact missing/misplaced IDs.
 */

const { buildVerifiedProsePrompt, buildProseRetryHint } = require('../proseFromItineraryPrompt');
const { buildItineraryProseManifest } = require('../../utils/itineraryProseManifest');
const { verifyProseAgainstItinerary } = require('../../utils/proseConsistencyVerifier');
const { getProseConsistencyConfig } = require('../../config/proseConsistencyConfig');

function sevenDayItinerary() {
  const days = [];
  for (let d = 1; d <= 7; d += 1) {
    const stops = [];
    for (let s = 1; s <= 5; s += 1) {
      stops.push({
        id: `stop-${d}-${s}`, order: s - 1, type: 'trail',
        name: `Day ${d} Stop ${s} Trailhead Overlook`, startTime: '09:00',
        duration: 60, difficulty: 'moderate',
      });
    }
    days.push({ id: `day-${d}`, dayNumber: d, label: `Day ${d}`, stops });
  }
  return { days };
}

const manifest = () => buildItineraryProseManifest({
  itinerary: sevenDayItinerary(), itineraryHash: 'h7',
  resolvedMetadata: { parkName: 'Grand Canyon National Park' },
});

/** Emit a fully-marked, concise draft for every day/stop in the manifest. */
function fullDraft(m, { dropDayId = null, dropStopId = null } = {}) {
  const parts = ['<!--TRAILIE_INTRO--> Here is your week.'];
  for (const d of m.days) {
    if (d.dayId === dropDayId) continue;
    parts.push(`<!--TRAILIE_DAY:${d.dayId}--> ${d.title}`);
    for (const s of d.stops) {
      if (s.stopId === dropStopId) continue;
      parts.push(`<!--TRAILIE_STOP:${s.stopId}--> Visit ${s.canonicalName}.`);
    }
  }
  return parts.join('\n');
}

describe('buildVerifiedProsePrompt — compact marker skeleton', () => {
  const prompt = buildVerifiedProsePrompt({ manifest: manifest() });

  it('contains every day and stop marker exactly once', () => {
    const m = manifest();
    for (const d of m.days) {
      const dayHits = prompt.match(new RegExp(`TRAILIE_DAY:${d.dayId}\\b`, 'g')) || [];
      expect(dayHits).toHaveLength(1);
      for (const s of d.stops) {
        const stopHits = prompt.match(new RegExp(`TRAILIE_STOP:${s.stopId}\\b`, 'g')) || [];
        expect(stopHits).toHaveLength(1);
      }
    }
  });

  it('presents the skeleton once (no duplicated rule blocks)', () => {
    const headers = prompt.match(/Marker skeleton —/g) || [];
    expect(headers).toHaveLength(1);
    const rulesBlocks = prompt.match(/\nRULES:\n/g) || [];
    expect(rulesBlocks).toHaveLength(1);
  });

  it('stays within the configured Phase B input token budget for a 7-day plan', () => {
    const budget = getProseConsistencyConfig().phaseBInputTokenBudget;
    const estimatedTokens = Math.ceil(prompt.length / 4);
    expect(estimatedTokens).toBeLessThan(budget);
  });
});

describe('marker coverage — full passes, drops fail', () => {
  it('a complete seven-day marked draft passes', () => {
    const m = manifest();
    const r = verifyProseAgainstItinerary({ proseWithMarkers: fullDraft(m), manifest: m });
    expect(r.status).toBe('passed');
    expect(r.missingDayIds).toHaveLength(0);
    expect(r.missingStopIds).toHaveLength(0);
  });

  it('missing one day fails with that exact day id', () => {
    const m = manifest();
    const r = verifyProseAgainstItinerary({ proseWithMarkers: fullDraft(m, { dropDayId: 'day-4' }), manifest: m });
    expect(r.status).toBe('failed');
    expect(r.missingDayIds).toEqual(['day-4']);
    // dropping the day also drops its stops
    expect(r.missingStopIds).toEqual(expect.arrayContaining(['stop-4-1']));
  });

  it('missing one stop fails with that exact stop id', () => {
    const m = manifest();
    const r = verifyProseAgainstItinerary({ proseWithMarkers: fullDraft(m, { dropStopId: 'stop-3-2' }), manifest: m });
    expect(r.status).toBe('failed');
    expect(r.missingStopIds).toEqual(['stop-3-2']);
  });
});

describe('buildProseRetryHint — compact, exact correction list', () => {
  it('names the exact missing/misplaced/duplicate ids and hard conflicts', () => {
    const hint = buildProseRetryHint({
      missingDayIds: ['day-4'],
      missingStopIds: ['stop-3-2'],
      misplacedStopIds: ['stop-2-1'],
      duplicateIds: ['stop-1-1'],
      hardConflictCodes: ['conflicting_difficulty'],
    });
    expect(hint).toMatch(/day-4/);
    expect(hint).toMatch(/stop-3-2/);
    expect(hint).toMatch(/stop-2-1/);
    expect(hint).toMatch(/stop-1-1/);
    expect(hint).toMatch(/conflicting_difficulty/);
    // Compact: it does not restate the whole manifest.
    expect(hint).not.toMatch(/Trailhead Overlook/);
    expect(hint.length).toBeLessThan(600);
  });

  it('falls back to a single generic instruction when no ids are supplied', () => {
    const hint = buildProseRetryHint({});
    expect(hint).toMatch(/every day and stop marker exactly once/i);
  });
});
