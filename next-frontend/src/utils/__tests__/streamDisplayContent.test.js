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

  test('removes itinerary blocks case-insensitively', () => {
    const input = 'Plan\n[itinerary_json]{"days":[]}\n[/itinerary_json]\nDone';
    expect(stripItineraryJsonForDisplay(input)).toBe('Plan\n\nDone');
  });

  test('hides in-progress block with mixed case tag', () => {
    const input = 'Plan\n[Itinerary_Json]{"days":[';
    expect(stripItineraryJsonForDisplay(input)).toBe('Plan');
  });

  test('hides unresolvable citation tokens from streamed assistant content', () => {
    const input = 'Choose **Yosemite**. \uE200cite\uE202turn0\uE201';
    expect(stripItineraryJsonForDisplay(input)).toBe('Choose **Yosemite**.');
  });

  test('leaves ordinary cite punctuation and markdown attribution alone', () => {
    const input = 'Do not cite turn0 as a source. [NPS](https://www.nps.gov/glac/index.htm)';
    expect(stripItineraryJsonForDisplay(input)).toBe(input);
  });
});
