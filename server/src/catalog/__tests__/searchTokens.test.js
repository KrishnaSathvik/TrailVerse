const { haystackMatchesToken } = require('../searchTokens');

describe('haystackMatchesToken', () => {
  test('matches exact acadia word', () => {
    const haystack = 'acadia national park maine coast';
    expect(haystackMatchesToken(haystack, 'acadia')).toBe(true);
  });

  test('does not match acadia inside acadian', () => {
    const haystack = 'saint croix acadian cultural site';
    expect(haystackMatchesToken(haystack, 'acadia')).toBe(false);
  });

  test('allows short prefix tokens for typing', () => {
    const haystack = 'grand teton national park';
    expect(haystackMatchesToken(haystack, 'grand')).toBe(true);
  });
});
