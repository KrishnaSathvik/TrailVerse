'use strict';

/**
 * Stage 13.1 — conservative overnight-location conflict detection.
 */

const { buildItineraryProseManifest } = require('../itineraryProseManifest');
const { verifyProseAgainstItinerary } = require('../proseConsistencyVerifier');

function manifest() {
  return buildItineraryProseManifest({
    itinerary: {
      days: [
        { id: 'day-1', dayNumber: 1, label: 'Day 1 — Zion', overnightLocation: 'Springdale, UT', stops: [
          { id: 'stop-1', order: 0, type: 'trail', name: 'The Narrows', note: 'river hike', startTime: '08:00', duration: 240 },
        ] },
        { id: 'day-2', dayNumber: 2, label: 'Day 2 — Bryce', overnightLocation: 'Bryce, UT', stops: [
          { id: 'stop-2', order: 0, type: 'trail', name: 'Navajo Loop', note: 'hoodoos', startTime: '09:00', duration: 180 },
        ] },
      ],
    },
    itineraryHash: 'h',
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
  });
}

const markers = '<!--TRAILIE_DAY:day-1--> Day 1\n<!--TRAILIE_STOP:stop-1--> The Narrows.\n<!--TRAILIE_DAY:day-2--> Day 2\n<!--TRAILIE_STOP:stop-2--> Navajo Loop.';

function verify(extra) {
  return verifyProseAgainstItinerary({ proseWithMarkers: `${markers}\n${extra}`, manifest: manifest() });
}

describe('overnight-location consistency', () => {
  it('flags an overnight location that conflicts with the itinerary', () => {
    const v = verify('You will spend the night in Las Vegas, far from the parks.');
    expect(v.issueCodes).toContain('conflicting_overnight');
    expect(v.status).toBe('failed');
  });

  it('passes the correct overnight location (alias/token match tolerant)', () => {
    const v = verify('Spend the night in Springdale before heading to Bryce.');
    expect(v.issueCodes).not.toContain('conflicting_overnight');
  });

  it('does not treat a drive-through as an overnight claim', () => {
    const v = verify('You will drive through Las Vegas on the way to the parks.');
    expect(v.issueCodes).not.toContain('conflicting_overnight');
  });

  it('does not flag generic lodging advice without a named conflicting place', () => {
    const v = verify('Book lodging close to the park entrance well in advance.');
    expect(v.issueCodes).not.toContain('conflicting_overnight');
  });

  it('does not run overnight detection when the itinerary defines no overnight ground truth', () => {
    const m = buildItineraryProseManifest({
      itinerary: { days: [{ id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [{ id: 'stop-1', order: 0, type: 'trail', name: 'The Narrows', note: 'x', startTime: '08:00', duration: 120 }] }] },
      itineraryHash: 'h', resolvedMetadata: {},
    });
    const v = verifyProseAgainstItinerary({
      proseWithMarkers: '<!--TRAILIE_DAY:day-1--> Day 1\n<!--TRAILIE_STOP:stop-1--> The Narrows.\nSpend the night in Las Vegas.',
      manifest: m,
    });
    expect(v.issueCodes).not.toContain('conflicting_overnight');
  });
});
