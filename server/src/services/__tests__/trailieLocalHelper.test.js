'use strict';
const mockResponses = jest.fn();
const mockMessages = jest.fn();
jest.mock('openai', () => jest.fn(() => ({ responses: { create: mockResponses } })));
jest.mock('@anthropic-ai/sdk', () => jest.fn(() => ({ messages: { create: mockMessages } })));
jest.mock('../../config/providerTestPolicy', () => ({ assertLiveProviderAllowed: jest.fn() }));
jest.mock('../trailieTurnLedger', () => ({ recordAuxiliaryCall: jest.fn() }));
const { trailieLiteComplete } = require('../trailieLiteLlm');
const original = { NODE_ENV: process.env.NODE_ENV, OPENAI_API_KEY: process.env.OPENAI_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  jest.clearAllMocks();
});

test('local evidence helper uses only GPT-6 Luna Responses', async () => {
  process.env.NODE_ENV = 'development'; process.env.OPENAI_API_KEY = 'synthetic';
  process.env.ANTHROPIC_API_KEY = 'synthetic';
  mockResponses.mockResolvedValue({ id: 'synthetic', model: 'gpt-6-luna', status: 'completed', output_text: 'summary', output: [] });
  expect(await trailieLiteComplete({ system: 'summarize', user: 'facts' })).toMatchObject({ provider: 'openai', model: 'gpt-6-luna', text: 'summary' });
  expect(mockResponses.mock.calls[0][0]).toMatchObject({ model: 'gpt-6-luna', reasoning: { effort: 'low' }, store: false });
  expect(mockMessages).not.toHaveBeenCalled();
});

test('production compatibility retains configured Claude helper and never constructs Responses', async () => {
  process.env.NODE_ENV = 'production'; process.env.ANTHROPIC_API_KEY = 'synthetic';
  mockMessages.mockResolvedValue({ content: [{ text: 'summary' }] });
  expect(await trailieLiteComplete({ system: 'summarize', user: 'facts' })).toMatchObject({ provider: 'claude', text: 'summary' });
  expect(mockResponses).not.toHaveBeenCalled();
});

test('failed local helper never switches providers', async () => {
  process.env.NODE_ENV = 'development'; process.env.OPENAI_API_KEY = 'synthetic';
  mockResponses.mockRejectedValue(new Error('unavailable'));
  expect(await trailieLiteComplete({ system: 'summarize', user: 'facts' })).toMatchObject({ text: null, provider: null });
  expect(mockMessages).not.toHaveBeenCalled();
});
