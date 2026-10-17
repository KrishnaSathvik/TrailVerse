const provider = require('../openaiService');
test('feed request cancellation and retry bounds reach the provider SDK', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'A fact' } }] });
  provider.__setOpenAIClientConstructorForTests(jest.fn(() => ({ chat: { completions: { create } } })));
  const options = { signal: new AbortController().signal, timeout: 30000, maxRetries: 0 };
  try {
    expect(await provider.chat([{ role: 'user', content: 'A park fact' }], 'Feed prompt', options)).toBe('A fact');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.any(Array) }), options);
  } finally {
    provider.__setOpenAIClientConstructorForTests();
    if (oldKey == null) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});
