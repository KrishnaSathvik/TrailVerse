import { describe, expect, it } from 'vitest';
import { isNavPathActive } from '@/lib/headerNavActive';

const ITEMS = ['/home', '/explore', '/map', '/plan-ai', '/blog', '/events', '/compare', '/discover', '/chat-history', '/profile'];
const activeFor = (pathname) => ITEMS.filter((item) => isNavPathActive(item, pathname));

describe('isNavPathActive', () => {
  it.each([
    ['/explore', ['/explore']],
    ['/parks/yellowstone-national-park', ['/explore']],
    ['/parks/yell/activity/abc', ['/explore']],
    ['/parks/state/utah', ['/explore']],
    ['/blog', ['/blog']],
    ['/blog/category/trip-planning', ['/blog']],
    ['/blog/some-post-slug', ['/blog']],
    ['/discover', ['/discover']],
    ['/discover/activities/hiking', ['/discover']],
    ['/plan-ai', ['/plan-ai']],
    ['/plan-ai/abc123', ['/plan-ai']],
    ['/compare', ['/compare']],
    ['/compare/zion-vs-bryce', ['/compare']],
    ['/events', ['/events']],
    ['/map/', ['/map']],
    ['/chat-history/xyz', ['/chat-history']],
  ])('%s -> %j', (pathname, expected) => {
    expect(activeFor(pathname)).toEqual(expected);
  });

  it.each(['/', '/about', '/faq', '/features', '/where-next', '/guides', '/guides/first-trip', '/itineraries/zion-3-day', '/privacy', '/terms', '/testimonials', '/chatgpt', '/mcp', '/mapping', '/parks-for-families', '/blogroll'])(
    'leaves nothing active on %s',
    (pathname) => {
      expect(activeFor(pathname)).toEqual([]);
    }
  );
});
