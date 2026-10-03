const { classifyBot, humanTrafficFilter } = require('../botClassifier');

describe('classifyBot', () => {
  test('flags known crawlers', () => {
    expect(classifyBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toEqual({
      isBot: true,
      botName: 'googlebot',
    });
    expect(classifyBot('AhrefsBot/7.0')).toMatchObject({ isBot: true });
  });

  test('leaves normal browsers as human', () => {
    expect(classifyBot(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0'
    )).toEqual({ isBot: false, botName: null });
  });

  test('humanTrafficFilter keeps missing isBot (legacy rows)', () => {
    expect(humanTrafficFilter({ eventType: 'page_view' })).toEqual({
      isBot: { $ne: true },
      eventType: 'page_view',
    });
  });
});
