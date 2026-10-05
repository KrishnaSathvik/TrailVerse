const { extractItineraryFromResponse } = require('../claudeResponseParser');
const { isValidToolItinerary } = require('../itineraryToolSchema');
const { callClaudeWithFallback, formatCorrectionNotice, buildPlanDocument } = require('../trailiePipelineUtils');

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

  test('renders spoken intro from tool-only response when text is empty', () => {
    const toolItinerary = {
      intro: 'For a relaxed weekend, I’d keep Valley of Fire simple after the Vegas drive.',
      days: [
        {
          id: 'day-1',
          dayNumber: 1,
          label: 'Day 1 — Valley of Fire',
          stops: [{ id: 's1', order: 0, type: 'trail', name: 'Fire Wave', note: 'Easy loop' }],
        },
      ],
    };
    const result = extractItineraryFromResponse({ content: '', toolItinerary });
    expect(result.cleanContent).toBe(toolItinerary.intro);
    expect(result.cleanContent).not.toMatch(/At a glance/i);
  });
});

describe('itineraryToolSchema', () => {
  test('isValidToolItinerary rejects empty days', () => {
    expect(isValidToolItinerary({ days: [] })).toBe(false);
    expect(isValidToolItinerary(null)).toBe(false);
  });
});

describe('trailiePipelineUtils', () => {
  test('callClaudeWithFallback preserves cache token categories for cost accounting', async () => {
    const anthropic = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'answer' }],
          usage: {
            input_tokens: 1000,
            output_tokens: 100,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 500,
          },
        }),
      },
    };
    const result = await callClaudeWithFallback({
      anthropic,
      modelsToTry: ['claude-sonnet-5'],
      maxTokens: 200,
      system: 'private',
      messages: [{ role: 'user', content: 'private' }],
    });
    expect(result.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 100,
      cacheCreationInputTokens: 200,
      cacheReadInputTokens: 500,
    });
  });

  test('formatCorrectionNotice lists top corrections', () => {
    const notice = formatCorrectionNotice(['Removed strenuous hike', 'Shortened Day 2']);
    expect(notice).toContain('Trailie adjusted');
    expect(notice).toContain('Removed strenuous hike');
  });

  test('formatCorrectionNotice returns empty for no corrections', () => {
    expect(formatCorrectionNotice([])).toBe('');
  });
});

describe('buildPlanDocument — canonical identity embedding (Stage 8)', () => {
  const itineraryData = { days: [{ id: 'day-1', stops: [] }] };

  test('embeds responseId/version/hashes so the plan carries its own identity', () => {
    const plan = buildPlanDocument({
      itineraryData,
      parkName: 'Zion',
      parkCode: 'zion',
      identity: {
        responseId: 'resp-A',
        responseVersion: 2,
        contentHash: 'chash',
        itineraryHash: 'ihash',
      },
    });
    expect(plan.responseId).toBe('resp-A');
    expect(plan.responseVersion).toBe(2);
    expect(plan.contentHash).toBe('chash');
    expect(plan.itineraryHash).toBe('ihash');
    expect(plan.days).toEqual(itineraryData.days);
  });

  test('is unchanged when no identity is supplied (legacy callers)', () => {
    const plan = buildPlanDocument({ itineraryData, parkName: 'Zion' });
    expect(plan.responseId).toBeUndefined();
    expect(plan.type).toBe('itinerary');
  });
});
