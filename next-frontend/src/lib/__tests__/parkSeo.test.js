import { describe, expect, it } from 'vitest';
import { buildParkMetaDescription, buildParkPageTitle } from '../parkSeo';

describe('buildParkPageTitle', () => {
  it('promises crowd calendar only when month-by-month data exists', () => {
    const yell = {
      fullName: 'Yellowstone National Park',
      parkCode: 'yell',
    };
    const stat = {
      fullName: 'Statue of Liberty National Monument',
      parkCode: 'stli',
    };

    expect(buildParkPageTitle(yell)).toBe(
      'Yellowstone National Park: Alerts, Crowd Calendar, Map & Trailie | TrailVerse'
    );
    expect(buildParkPageTitle(stat)).toBe(
      'Statue of Liberty National Monument: Alerts, Map, Weather & Trailie Planner | TrailVerse'
    );
  });
});

describe('buildParkMetaDescription', () => {
  it('omits crowd calendar from Tier A copy when data is unavailable', () => {
    const tierAWithoutCrowd = {
      fullName: 'Wrangell-St Elias National Park & Preserve',
      parkCode: 'no-crowd-data',
      states: 'AK',
    };

    const description = buildParkMetaDescription(
      tierAWithoutCrowd,
      'wrangell-st-elias-national-park-and-preserve'
    );

    expect(description).toContain('live NPS alerts, maps, weather, and Trailie trip planning');
    expect(description).not.toContain('crowd calendar');
  });
});
