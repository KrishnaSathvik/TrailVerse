import { describe, expect, it } from 'vitest';
import {
  EXPLORE_INDEX_STALE_MS,
  STATIC_EXPLORE_TAB_STALE_MS,
  getParkTabGcTimeMs,
  getParkTabStaleTimeMs,
} from '../parkTabCachePolicy';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('parkTabCachePolicy', () => {
  it('uses 7-day staleTime for static catalog tabs', () => {
    expect(getParkTabStaleTimeMs('places')).toBe(STATIC_EXPLORE_TAB_STALE_MS);
    expect(getParkTabStaleTimeMs('activities')).toBe(SEVEN_DAYS_MS);
    expect(EXPLORE_INDEX_STALE_MS).toBe(STATIC_EXPLORE_TAB_STALE_MS);
  });

  it('uses short staleTime only for transit', () => {
    expect(getParkTabStaleTimeMs('transit')).toBe(15 * 60 * 1000);
    expect(getParkTabStaleTimeMs('parking')).toBe(STATIC_EXPLORE_TAB_STALE_MS);
    expect(getParkTabStaleTimeMs('webcams')).toBe(STATIC_EXPLORE_TAB_STALE_MS);
  });

  it('uses shorter gcTime for live tabs', () => {
    expect(getParkTabGcTimeMs('transit')).toBeLessThan(getParkTabGcTimeMs('places'));
  });
});
