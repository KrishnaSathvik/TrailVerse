import { describe, expect, it } from 'vitest';
import { parkToSlug, slugToParkCode, findCorrectSlug, resolveParkIdentifier } from '../parkSlug';
import { resolveChatPayload } from '../sse';

describe('parkSlug', () => {
  it('converts full name to slug', () => {
    expect(parkToSlug('Yellowstone National Park')).toBe('yellowstone-national-park');
    expect(parkToSlug('Denali National Park & Preserve')).toBe(
      'denali-national-park-and-preserve',
    );
  });

  it('resolves slug to park code', () => {
    expect(slugToParkCode('yellowstone-national-park')).toBe('yell');
    expect(slugToParkCode('yosemite-national-park')).toBe('yose');
  });

  it('corrects slugs missing "and"', () => {
    expect(findCorrectSlug('denali-national-park-preserve')).toBe(
      'denali-national-park-and-preserve',
    );
  });

  it('resolves 4-char codes and slugs', () => {
    expect(resolveParkIdentifier('yell')).toEqual({ parkCode: 'yell', slug: null });
    expect(resolveParkIdentifier('yellowstone-national-park')).toEqual({
      parkCode: 'yell',
      slug: 'yellowstone-national-park',
    });
  });
});

describe('resolveChatPayload', () => {
  it('peels system message when no explicit systemPrompt', () => {
    const result = resolveChatPayload(
      [
        { role: 'system', content: 'You are Trailie' },
        { role: 'user', content: 'Plan Zion' },
      ],
      undefined,
    );
    expect(result.systemPrompt).toBe('You are Trailie');
    expect(result.messages).toEqual([{ role: 'user', content: 'Plan Zion' }]);
  });

  it('prefers explicit systemPrompt', () => {
    const result = resolveChatPayload(
      [{ role: 'system', content: 'ignored' }, { role: 'user', content: 'hi' }],
      'explicit',
    );
    expect(result.systemPrompt).toBe('explicit');
    expect(result.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
