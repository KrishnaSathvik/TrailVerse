import { describe, expect, it, beforeEach } from 'vitest';
import {
  AVATAR_PICKER_COUNT,
  clearAvatarCache,
  generateAvatarCollection,
  generateRandomAvatar,
  generateTravelAvatar,
} from '../avatarGenerator';

describe('avatarGenerator', () => {
  beforeEach(() => {
    clearAvatarCache();
  });

  it('travel avatar URLs omit unsupported rotate/scale params', () => {
    const url = generateTravelAvatar('test-user');
    expect(url).toContain('api.dicebear.com/9.x/');
    expect(url).not.toContain('rotate');
    expect(url).not.toContain('scale');
  });

  it('generateTravelAvatar is stable for the same seed', () => {
    const a = generateTravelAvatar('user@example.com');
    const b = generateTravelAvatar('user@example.com');
    expect(a).toBe(b);
  });

  it('generateAvatarCollection returns unique urls and stable until cache clear', () => {
    const first = generateAvatarCollection('user@example.com', AVATAR_PICKER_COUNT);
    const second = generateAvatarCollection('user@example.com', AVATAR_PICKER_COUNT);
    expect(first).toHaveLength(AVATAR_PICKER_COUNT);
    expect(new Set(first.map((item) => item.url)).size).toBe(AVATAR_PICKER_COUNT);
    expect(second.map((item) => item.url)).toEqual(first.map((item) => item.url));

    clearAvatarCache();
    const third = generateAvatarCollection('user@example.com', AVATAR_PICKER_COUNT);
    expect(third.map((item) => item.url)).not.toEqual(first.map((item) => item.url));
  });

  it('generateAvatarCollection uses distinct styles across the picker grid', () => {
    const collection = generateAvatarCollection('picker@test.com', AVATAR_PICKER_COUNT);
    const styles = collection.map((item) => item.style).filter((style) => style !== 'random');
    expect(new Set(styles).size).toBeGreaterThanOrEqual(Math.min(8, AVATAR_PICKER_COUNT));
  });

  it('generateRandomAvatar differs across calls', () => {
    const a = generateRandomAvatar('guest-1');
    const b = generateRandomAvatar('guest-1');
    expect(a).not.toBe(b);
  });

  it('picker collection only uses profile-friendly styles', () => {
    const collection = generateAvatarCollection('picker@test.com', AVATAR_PICKER_COUNT);
    const blocked = ['identicon', 'shapes', 'thumbs', 'icons', 'initials'];
    for (const item of collection) {
      expect(blocked.some((style) => item.url.includes(`/${style}/`))).toBe(false);
    }
  });
});
