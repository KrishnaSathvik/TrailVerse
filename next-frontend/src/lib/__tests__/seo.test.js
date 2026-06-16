import { describe, expect, it } from 'vitest';
import {
  canonicalPageMetadata,
  hasQueryParams,
  siteCanonical,
} from '../seo';

describe('seo helpers', () => {
  it('builds absolute canonical URLs', () => {
    expect(siteCanonical('/explore')).toBe(
      'https://www.nationalparksexplorerusa.com/explore'
    );
  });

  it('detects non-empty query params', () => {
    expect(hasQueryParams({ state: 'DC' })).toBe(true);
    expect(hasQueryParams({})).toBe(false);
    expect(hasQueryParams({ q: '' })).toBe(false);
  });

  it('noindexes parameterized views but keeps canonical clean', () => {
    const meta = canonicalPageMetadata('/explore', { state: 'DC' });
    expect(meta.alternates.canonical).toBe(
      'https://www.nationalparksexplorerusa.com/explore'
    );
    expect(meta.robots).toEqual({
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    });
  });

  it('indexes clean canonical paths without query params', () => {
    const meta = canonicalPageMetadata('/explore', {});
    expect(meta.alternates.canonical).toContain('/explore');
    expect(meta.robots).toBeUndefined();
  });
});
