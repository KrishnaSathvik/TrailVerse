const {
  extractItineraryJSON,
  stripAnyItineraryJsonArtifacts,
} = require('../extractItineraryJSON');

describe('stripAnyItineraryJsonArtifacts', () => {
  test('removes complete ITINERARY_JSON block', () => {
    const input =
      'Great plan for the weekend.\n[ITINERARY_JSON]\n{"days":[]}\n[/ITINERARY_JSON]';
    expect(stripAnyItineraryJsonArtifacts(input)).toBe('Great plan for the weekend.');
  });

  test('removes truncated ITINERARY_JSON block without closing marker', () => {
    const input =
      'Here is your relaxed plan.\n[ITINERARY_JSON]\n{"days":[{"id":"day-1","dayNumber":1';
    const cleaned = stripAnyItineraryJsonArtifacts(input);
    expect(cleaned).not.toMatch(/ITINERARY_JSON/i);
    expect(cleaned).toMatch(/relaxed plan/i);
  });

  test('removes orphan closing marker', () => {
    const input = 'Plan summary only.\n[/ITINERARY_JSON]';
    expect(stripAnyItineraryJsonArtifacts(input)).toBe('Plan summary only.');
  });

  test('extractItineraryJSON returns clean content without markers when parse fails', () => {
    const input =
      'Prose intro.\n[ITINERARY_JSON]\n{not valid json\n[/ITINERARY_JSON]\nMore prose.';
    const { cleanContent, itineraryData } = extractItineraryJSON(input);
    expect(itineraryData).toBeNull();
    expect(cleanContent).not.toMatch(/ITINERARY_JSON/i);
    expect(cleanContent).toMatch(/Prose intro/);
  });
});
