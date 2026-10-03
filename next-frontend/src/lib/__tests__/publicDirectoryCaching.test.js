import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';
import { getBlogCategoriesServer, getBlogPostsServer, getBlogPostServer } from '../blogApi';
import { fetchIntentLandingParks } from '../intentLandingApi';

describe('public directory cache policy', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  it('only confirms missing articles on 404, throwing outages and malformed responses', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(getBlogPostServer('missing')).resolves.toBeNull();
    fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(getBlogPostServer('story')).rejects.toThrow('503');
    fetch.mockRejectedValue(new Error('offline'));
    await expect(getBlogPostServer('story')).rejects.toThrow('offline');
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    await expect(getBlogPostServer('story')).rejects.toThrow('Invalid');
    const post = { slug: 'story', title: 'Story' };
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: post }) });
    await expect(getBlogPostServer('story')).resolves.toEqual(post);
  });
  it.each(['/explore', '/wildlife-national-parks', '/accessible-national-parks', '/dog-friendly-parks', '/parks-for-first-timers', '/winter-national-parks', '/parks-for-families'])('keeps %s canonical and handles query SEO without origin work', async path => {
    const clean = await proxy(new NextRequest(`https://example.com${path}`));
    expect(clean.headers.get('X-Robots-Tag')).toBeNull();
    const query = await proxy(new NextRequest(`https://example.com${path}?utm_source=test&redirect=%2Fplan-ai%3Ftab%3Dmap`));
    expect(query.headers.get('X-Robots-Tag')).toBe('noindex, follow');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps blog tag URLs noindex without removing the filter', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { maintenanceMode: false } }) });
    const request = new NextRequest('https://example.com/blog?tag=wildlife');
    expect((await proxy(request)).headers.get('X-Robots-Tag')).toBe('noindex, follow');
    expect(request.nextUrl.searchParams.get('tag')).toBe('wildlife');
  });
  it.each([getBlogCategoriesServer, getBlogPostsServer])('throws upstream errors rather than caching an empty successful blog', async api => {
    fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(api()).rejects.toThrow();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ success: false, data: [] }) });
    await expect(api()).rejects.toThrow();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [], total: 0 }) });
    await expect(api()).resolves.toMatchObject({ data: [] });
  });
  it('retains meaningful blog filter keys and hourly fetch revalidation', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [], total: 0 }) });
    await getBlogPostsServer({ tag: 'parks & wildlife', page: 2, limit: 9 });
    const [url, options] = fetch.mock.calls[0];
    expect(new URL(url, "https://example.com").searchParams.get('tag')).toBe('parks & wildlife');
    expect(new URL(url, "https://example.com").searchParams.get('page')).toBe('2');
    expect(options.next.revalidate).toBe(3600);
  });
  it('intent failure throws and retries do not switch the production route to no-store', async () => {
    const original = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    try {
      fetch.mockResolvedValue({ ok: false, status: 503 });
      await expect(fetchIntentLandingParks({ searchQuery: 'wildlife', featuredParkCodes: ['yell'] })).rejects.toThrow();
      expect(fetch.mock.calls.every(([, options]) => options.next?.revalidate === 3600 && options.cache !== 'no-store')).toBe(true);
      fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ parkCode: 'yell', fullName: 'Yellowstone' }], count: 1 }) });
      await expect(fetchIntentLandingParks({ searchQuery: 'wildlife', featuredParkCodes: ['yell'] })).resolves.toMatchObject({ totalCount: 1 });
    } finally { process.env.NODE_ENV = original; }
  });
});
