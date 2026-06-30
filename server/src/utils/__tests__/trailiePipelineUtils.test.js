const { extractItineraryFromResponse } = require('../claudeResponseParser');
const { isValidToolItinerary } = require('../itineraryToolSchema');
const { formatCorrectionNotice } = require('../trailiePipelineUtils');

describe('claudeResponseParser', () => {
  test('prefers create_itinerary tool input over legacy JSON', () => {
    const toolItinerary = {
      days: [{ id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [] }],
    };
    const content = 'Plan prose\n[ITINERARY_JSON]{"days":[]}\n[/ITINERARY_JSON]';

    const result = extractItineraryFromResponse({ content, toolItinerary });
    expect(result.extractionSource).toBe('tool_use');
    expect(result.itineraryData.days[0].id).toBe('day-1');
    expect(result.cleanContent).not.toContain('ITINERARY_JSON');
  });

  test('falls back to legacy JSON when no tool itinerary', () => {
    const content =
      'Plan prose\n[ITINERARY_JSON]\n{"days":[{"id":"d1","dayNumber":1,"label":"Day 1","stops":[]}]}\n[/ITINERARY_JSON]';
    const result = extractItineraryFromResponse({ content });
    expect(result.extractionSource).toBe('itinerary_json');
    expect(result.itineraryData.days).toHaveLength(1);
  });
});

describe('itineraryToolSchema', () => {
  test('isValidToolItinerary rejects empty days', () => {
    expect(isValidToolItinerary({ days: [] })).toBe(false);
    expect(isValidToolItinerary(null)).toBe(false);
  });
});

describe('trailiePipelineUtils', () => {
  test('formatCorrectionNotice lists top corrections', () => {
    const notice = formatCorrectionNotice(['Removed strenuous hike', 'Shortened Day 2']);
    expect(notice).toContain('Trailie adjusted');
    expect(notice).toContain('Removed strenuous hike');
  });

  test('formatCorrectionNotice returns empty for no corrections', () => {
    expect(formatCorrectionNotice([])).toBe('');
  });
});
