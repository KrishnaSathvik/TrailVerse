'use strict';

const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');

describe('canonical duplicate detection on the live finalization path', () => {
  test('Pa\'rus Trail and Pa\'rus Trail riverside exhibits fail completeness as one experience', () => {
    const itineraryData = {
      intro: 'A relaxed Zion day on the valley floor.',
      days: [{
        id: 'day-1',
        dayNumber: 1,
        label: 'Day 1',
        stops: [
          {
            id: 's1', order: 1, type: 'trail', name: "Pa'rus Trail",
            note: 'Paved river walk', startTime: '', duration: 90,
          },
          {
            id: 's2', order: 2, type: 'trail', name: "Pa'rus Trail riverside exhibits",
            note: 'Same paved walk with signs', startTime: '', duration: 45,
          },
        ],
      }],
    };
    const completeness = evaluateItineraryCompleteness({
      itineraryData,
      userPrompt: 'Build a relaxed no-exposure day in Zion.',
    });
    expect(completeness.ok).toBe(false);
    expect(completeness.reasonCodes).toContain('duplicate_base_experience');
  });

  test('finalizeStructuredItinerary keeps unknown-exposure trails as conflicts instead of silently deleting them', async () => {
    const finalized = await finalizeStructuredItinerary({
      itineraryData: {
        intro: 'A cautious day.',
        days: [{
          id: 'day-1',
          dayNumber: 1,
          label: 'Day 1',
          stops: [{
            id: 's1', order: 1, type: 'trail', name: 'Unknown Ridge',
            note: 'A hike', startTime: '', duration: 120, exposureLevel: null,
          }],
        }],
      },
      constraints: { preferences: { avoidExposure: true } },
    });
    expect(finalized.itineraryData.days[0].stops.some((stop) => stop.name === 'Unknown Ridge')).toBe(true);
    expect(finalized.operationalConflicts.some((conflict) => conflict.reasonCode === 'constraint_eligibility_unknown')).toBe(true);
  });
});
