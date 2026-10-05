const mockCreate = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'A fact' } }] });
jest.mock('openai', () => jest.fn(() => ({ chat: { completions: { create: mockCreate } } })));
const provider = require('../openaiService');
test('feed request cancellation and retry bounds reach the production provider SDK', async () => {
  const options = { signal: new AbortController().signal, timeout: 30000, maxRetries: 0 };
  expect(await provider.chat([{ role: 'user', content: 'A park fact' }], 'Feed prompt', options)).toBe('A fact');
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.any(Array) }), options);
});
