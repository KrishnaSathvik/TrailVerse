import { describe, expect, it } from 'vitest';
import {
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

describe('filterVisibleExploreTabs with explore index', () => {
  it('hides empty explore tabs after index is ready', () => {
    const tabs = filterVisibleExploreTabs(ALL_TABS, {
      exploreIndexReady: true,
      exploreIndex: { places: 2, activities: 0, tours: 0 },
    });

    expect(tabs.map((t) => t.id)).toEqual(['overview', 'places', 'reviews']);
  });

  it('keeps requested tab visible before index is ready', () => {
    const tabs = filterVisibleExploreTabs(ALL_TABS, {
      requestedTab: 'tours',
      exploreIndexReady: false,
      exploreIndex: null,
    });

    expect(tabs.map((t) => t.id)).toContain('tours');
  });

  it('shows tab when loaded cache has data even if index count is zero', () => {
    const tabs = filterVisibleExploreTabs(ALL_TABS, {
      exploreIndexReady: true,
      exploreIndex: { places: 0, activities: 0, tours: 0 },
      exploreReady: true,
      exploreCache: { places: [{ id: '1' }], activities: [], tours: [] },
    });

    expect(tabs.map((t) => t.id)).toEqual(['overview', 'places', 'reviews']);
  });
});
