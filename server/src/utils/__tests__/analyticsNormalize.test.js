const { hoistAnalyticsFields, normalizeClientEvent } = require('../analyticsNormalize');

describe('normalizeClientEvent identity', () => {
  test('attaches logged-in userId and userType', () => {
    const doc = normalizeClientEvent(
      {
        eventType: 'ai_chat',
        eventCategory: 'engagement',
        metadata: { path: '/plan-ai' },
        timestamp: '2026-08-27T12:00:00.000Z',
      },
      {
        sessionId: 'sess-1',
        userId: '507f1f77bcf86cd799439011',
        browserId: 'browser-1',
        userAgent: 'Mozilla/5.0 Chrome/120',
        ipAddress: '1.1.1.1',
      }
    );

    expect(doc.userId).toBe('507f1f77bcf86cd799439011');
    expect(doc.userType).toBe('authenticated');
    expect(doc.browserId).toBe('browser-1');
    expect(doc.isBot).toBe(false);
    expect(doc.pageUrl).toBe('/plan-ai');
  });

  test('marks crawler traffic as bot', () => {
    const doc = normalizeClientEvent(
      { eventType: 'page_view', eventCategory: 'content', metadata: { page: '/guides' } },
      { sessionId: 'bot-sess', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }
    );
    expect(doc.isBot).toBe(true);
    expect(doc.metadata.botName).toBe('googlebot');
  });
});
