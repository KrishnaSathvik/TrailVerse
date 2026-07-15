import { describe, expect, it } from 'vitest';
import {
  BLOG_CATEGORY_SLUGS,
  mapBlogNavCategories,
} from '@/lib/blogCategories';

describe('mapBlogNavCategories', () => {
  it('maps API rows with labels and counts', () => {
    expect(
      mapBlogNavCategories([
        { _id: 'national-parks', count: 12, label: 'National Parks' },
        { _id: 'Astrophotography', count: 8 },
      ])
    ).toEqual([
      { id: 'national-parks', label: 'National Parks', count: 12 },
      { id: 'astrophotography', label: 'Astrophotography', count: 8 },
    ]);
  });

  it('falls back to the static catalog when API data is empty', () => {
    const fallback = mapBlogNavCategories([]);
    expect(fallback.map((c) => c.id)).toEqual(BLOG_CATEGORY_SLUGS);
    expect(fallback[0]).toMatchObject({
      id: 'trip-planning',
      label: 'Trip Planning',
    });
  });

  it('falls back when API data is missing', () => {
    expect(mapBlogNavCategories(undefined).length).toBe(BLOG_CATEGORY_SLUGS.length);
    expect(mapBlogNavCategories(null).length).toBe(BLOG_CATEGORY_SLUGS.length);
  });
});
