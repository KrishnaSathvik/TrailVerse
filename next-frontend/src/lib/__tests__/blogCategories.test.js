import { describe, expect, it } from 'vitest';
import {
  BLOG_CATEGORY_SLUGS,
  blogCategoryLabel,
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

describe('blogCategoryLabel', () => {
  it('maps canonical slugs to catalog names', () => {
    expect(blogCategoryLabel('trip-planning')).toBe('Trip Planning');
    expect(blogCategoryLabel('gear-packing')).toBe('Gear & Packing');
    expect(blogCategoryLabel('seasonal')).toBe('Seasonal Guides');
  });

  it('maps legacy display labels through the catalog', () => {
    expect(blogCategoryLabel('Travel Tips')).toBe('Trip Planning');
    expect(blogCategoryLabel('Photography')).toBe('Astrophotography');
  });

  it('humanizes unknown slugs instead of rendering them raw', () => {
    expect(blogCategoryLabel('night-sky-events')).toBe('Night Sky Events');
    expect(blogCategoryLabel('road_trips')).toBe('Road Trips');
  });

  it('keeps unknown display labels as written', () => {
    expect(blogCategoryLabel('Ranger Stories')).toBe('Ranger Stories');
  });

  it('falls back to Park Guides when empty', () => {
    expect(blogCategoryLabel('')).toBe('Park Guides');
    expect(blogCategoryLabel(undefined)).toBe('Park Guides');
  });
});
