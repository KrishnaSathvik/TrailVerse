import { stripItineraryJsonForDisplay } from '../streamDisplayContent';

describe('stripItineraryJsonForDisplay', () => {
  test('removes a complete itinerary block', () => {
    const input = 'Day 1 plan\n[ITINERARY_JSON]{"days":[]}\n[/ITINERARY_JSON]\nEnjoy!';
    expect(stripItineraryJsonForDisplay(input)).toBe('Day 1 plan\n\nEnjoy!');
  });

  test('hides an in-progress itinerary block at end of stream', () => {
    const input = 'Day 1 plan\n[ITINERARY_JSON]{"days":[';
    expect(stripItineraryJsonForDisplay(input)).toBe('Day 1 plan');
  });

  test('returns plain text unchanged', () => {
    expect(stripItineraryJsonForDisplay('Hello Yellowstone')).toBe('Hello Yellowstone');
  });
});
