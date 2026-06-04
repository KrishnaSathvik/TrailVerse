const { summarizeWebResultsForTrailie } = require('../webSearchSummarizer');

describe('webSearchSummarizer', () => {
  test('returns null without results', async () => {
    await expect(
      summarizeWebResultsForTrailie({ userMessage: 'test', parkName: null, category: 'planning', results: [] })
    ).resolves.toBeNull();
  });
});
