import { describe, expect, it } from 'vitest';
import {
  exploreTabHasData,
  exploreTabHasDataFromIndex,
  filterVisibleExploreTabs,
} from '../parkExploreTabs';

const ALL_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'places', label: 'What to See' },
  { id: 'activities', label: 'Things to Do' },
  { id: 'tours', label: 'Tours' },
  { id: 'reviews', label: 'Reviews' },
];

describe('exploreTabHasDataFromIndex', () => {
  it('returns true when count is positive', () => {
    expect(exploreTabHasDataFromIndex('places', { places: 3 })).toBe(true);
    expect(exploreTabHasDataFromIndex('places', { places: 0 })).toBe(false);
  });
});

describe('exploreTabHasData', () => {
  it('reads lazy tab payloads from explore cache', () => {
    expect(
      exploreTabHasData('places', { places: [{ id: '1' }], activities: [] }),
    ).toBe(true);
    expect(
      exploreTabHasData('activities', { places: [{ id: '1' }], activities: [] }),
    ).toBe(false);
  });
});

describe('filterVisibleExploreTabs', () => {
  it('always returns the full tab catalog (tabs are never hidden)', () => {
    expect(filterVisibleExploreTabs(ALL_TABS).map((t) => t.id)).toEqual([
      'overview',
      'places',
      'activities',
      'tours',
      'reviews',
    ]);
  });

  it('ignores explore-index and cache when deciding visibility', () => {
    const tabs = filterVisibleExploreTabs(ALL_TABS, {
      exploreIndexReady: true,
      exploreIndex: { places: 0, activities: 0, tours: 0 },
      exploreReady: true,
      exploreCache: { places: [], activities: [], tours: [] },
    });

    expect(tabs.map((t) => t.id)).toEqual([
      'overview',
      'places',
      'activities',
      'tours',
      'reviews',
    ]);
  });
});
