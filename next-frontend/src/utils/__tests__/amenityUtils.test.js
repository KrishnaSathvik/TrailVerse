import {
  buildAmenityTabs,
  filterFacilitiesByTab,
  getFacilityExcerpt,
} from '../amenityUtils';

describe('amenityUtils', () => {
  const sample = [
    { name: 'Restroom', placeName: 'A' },
    { name: 'Restroom', placeName: 'B' },
    { name: 'Trailhead', placeName: 'C' },
    { name: 'ATM/Cash Machine', placeName: 'D' },
  ];

  it('builds All tab plus type tabs', () => {
    const { tabs } = buildAmenityTabs(sample, 2);
    expect(tabs[0]).toEqual({ id: 'All', name: 'All', count: 4 });
    expect(tabs.some((t) => t.id === 'Restroom' && t.count === 2)).toBe(true);
  });

  it('filters by amenity type', () => {
    const { topNames } = buildAmenityTabs(sample, 2);
    const filtered = filterFacilitiesByTab(sample, 'Restroom', topNames);
    expect(filtered).toHaveLength(2);
  });

  it('strips html from excerpts', () => {
    const excerpt = getFacilityExcerpt({ description: '<p>Hello <b>world</b></p>' });
    expect(excerpt).toContain('Hello');
    expect(excerpt).toContain('world');
  });
});
