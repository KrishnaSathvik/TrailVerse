'use strict';

const {
  STRUCTURED_STATUS,
  normalizeToolCalls,
  generateStructuredItinerary,
} = require('../structuredItineraryGenerator');
const { CREATE_ITINERARY_TOOL } = require('../../utils/itineraryToolSchema');

const validItinerary = {
  days: [
    { id: 'd1', dayNumber: 1, label: 'Day 1', stops: [{ id: 's1', order: 0, type: 'trail', name: 'Rim', note: 'n', startTime: '08:00', duration: 120 }] },
  ],
};

describe('normalizeToolCalls', () => {
  it('accepts exactly one valid create_itinerary call', () => {
    const r = normalizeToolCalls({ toolCalls: [{ name: 'create_itinerary', input: validItinerary, id: 't1' }] });
    expect(r.status).toBe(STRUCTURED_STATUS.COMPLETE);
    expect(r.itineraryData).toEqual(validItinerary);
    expect(r.toolCallId).toBe('t1');
  });

  it('missing tool call → missing_tool', () => {
    expect(normalizeToolCalls({ toolCalls: [] }).status).toBe(STRUCTURED_STATUS.MISSING_TOOL);
  });

  it('unknown tool → rejected (malformed_tool, unknown_tool)', () => {
    const r = normalizeToolCalls({ toolCalls: [{ name: 'delete_everything', input: {} }] });
    expect(r.status).toBe(STRUCTURED_STATUS.MALFORMED_TOOL);
    expect(r.validationErrors).toContain('unknown_tool');
  });

  it('malformed itinerary shape → malformed_tool', () => {
    const r = normalizeToolCalls({ toolCalls: [{ name: 'create_itinerary', input: { days: [] } }] });
    expect(r.status).toBe(STRUCTURED_STATUS.MALFORMED_TOOL);
  });

  it('retains the authoritative path when an existing shape field has the wrong type', () => {
    const r = normalizeToolCalls({
      toolCalls: [{
        name: 'create_itinerary',
        id: 'bad-stops',
        input: { days: [{ dayNumber: 1, stops: 'two stops' }] },
      }],
    });

    expect(r).toMatchObject({
      status: STRUCTURED_STATUS.MALFORMED_TOOL,
      toolCallId: 'bad-stops',
      validationErrors: ['invalid_itinerary_shape'],
      validationIssues: [{
        code: 'invalid_type',
        path: 'days.0.stops',
        message: 'Expected an array',
      }],
    });
  });

  it('retains the authoritative path when an existing required shape field is missing', () => {
    const r = normalizeToolCalls({
      toolCalls: [{
        name: 'create_itinerary',
        id: 'missing-stops',
        input: { days: [{ dayNumber: 1 }] },
      }],
    });

    expect(r.validationIssues).toEqual([{
      code: 'missing_required_field',
      path: 'days.0.stops',
      message: 'Required field is missing',
    }]);
  });

  it('unparseable OpenAI-style arguments → malformed_tool', () => {
    const r = normalizeToolCalls({ toolCalls: [{ name: 'create_itinerary', rawArgs: '{ not json' }] });
    expect(r.status).toBe(STRUCTURED_STATUS.MALFORMED_TOOL);
  });

  it('truncated stop reason with incomplete args → truncated', () => {
    const r = normalizeToolCalls({
      toolCalls: [{ name: 'create_itinerary', input: { days: 'incomplete' } }],
      stopReason: 'max_tokens',
    });
    expect(r.status).toBe(STRUCTURED_STATUS.TRUNCATED);
  });

  it('no tool before truncation → truncated', () => {
    const r = normalizeToolCalls({ toolCalls: [], stopReason: 'length' });
    expect(r.status).toBe(STRUCTURED_STATUS.TRUNCATED);
  });

  it('identical duplicate calls deduplicate → complete', () => {
    const r = normalizeToolCalls({
      toolCalls: [
        { name: 'create_itinerary', input: validItinerary, id: 'a' },
        { name: 'create_itinerary', input: JSON.parse(JSON.stringify(validItinerary)), id: 'b' },
      ],
    });
    expect(r.status).toBe(STRUCTURED_STATUS.COMPLETE);
  });

  it('conflicting distinct calls → ambiguous rejection', () => {
    const other = JSON.parse(JSON.stringify(validItinerary));
    other.days[0].stops[0].name = 'Different';
    const r = normalizeToolCalls({
      toolCalls: [
        { name: 'create_itinerary', input: validItinerary },
        { name: 'create_itinerary', input: other },
      ],
    });
    expect(r.status).toBe(STRUCTURED_STATUS.MALFORMED_TOOL);
    expect(r.validationErrors).toContain('ambiguous_tool_calls');
  });

  it('oversized payload → malformed_tool', () => {
    const r = normalizeToolCalls({
      toolCalls: [{ name: 'create_itinerary', input: validItinerary }],
      maxBytes: 5,
    });
    expect(r.validationErrors).toContain('tool_payload_too_large');
  });
});

describe('generateStructuredItinerary (adapters)', () => {
  it('Anthropic path returns complete with a forced tool call', async () => {
    const anthropic = {
      messages: {
        create: jest.fn(async () => ({
          content: [{ type: 'tool_use', name: 'create_itinerary', input: validItinerary, id: 'tool_1' }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 20 },
        })),
      },
    };
    const r = await generateStructuredItinerary({
      provider: 'claude', model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'plan' }],
      systemPrompt: 'sys', toolSchema: CREATE_ITINERARY_TOOL, anthropic,
    });
    expect(r.status).toBe(STRUCTURED_STATUS.COMPLETE);
    expect(r.itineraryData).toEqual(validItinerary);
    // Tool choice was forced.
    const call = anthropic.messages.create.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'create_itinerary' });
  });

  it('OpenAI path parses stringified function arguments', async () => {
    const openai = {
      chat: { completions: { create: jest.fn(async () => ({
        choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'c1', function: { name: 'create_itinerary', arguments: JSON.stringify(validItinerary) } }] } }],
        usage: { prompt_tokens: 5, completion_tokens: 9 },
      })) } },
    };
    const r = await generateStructuredItinerary({
      provider: 'openai', model: 'gpt-5.4-mini', messages: [{ role: 'user', content: 'plan' }],
      systemPrompt: 'sys', toolSchema: CREATE_ITINERARY_TOOL, openai,
    });
    expect(r.status).toBe(STRUCTURED_STATUS.COMPLETE);
    expect(r.itineraryData.days).toHaveLength(1);
  });

  it('provider error → provider_error (never throws)', async () => {
    const anthropic = { messages: { create: jest.fn(async () => { throw new Error('boom'); }) } };
    const r = await generateStructuredItinerary({
      provider: 'claude', model: 'm', messages: [], systemPrompt: 's', toolSchema: CREATE_ITINERARY_TOOL, anthropic,
    });
    expect(r.status).toBe(STRUCTURED_STATUS.PROVIDER_ERROR);
  });

  it('no client → unsupported', async () => {
    const r = await generateStructuredItinerary({ provider: 'claude', model: 'm', messages: [], systemPrompt: 's', toolSchema: CREATE_ITINERARY_TOOL });
    expect(r.status).toBe(STRUCTURED_STATUS.UNSUPPORTED);
  });
});
