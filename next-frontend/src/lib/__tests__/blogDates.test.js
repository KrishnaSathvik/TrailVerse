import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  blogDateModified,
  blogDateModifiedIso,
  blogSitemapEntries,
  latestBlogDateModified,
} from '../blogDates';

const BASE = 'https://www.nationalparksexplorerusa.com';
const PUBLISHED = '2026-06-01T15:00:00.000Z';
const POLLUTED_UPDATED_AT = '2026-10-26T08:00:00.000Z';

describe('blogDateModified', () => {
  it('uses contentUpdatedAt when it is at/after publication', () => {
    expect(
      blogDateModified({ publishedAt: PUBLISHED, contentUpdatedAt: '2026-07-04T12:00:00.000Z' }).toISOString()
    ).toBe('2026-07-04T12:00:00.000Z');
  });

  it('falls back to publishedAt and never uses view-polluted updatedAt', () => {
    expect(
      blogDateModified({ publishedAt: PUBLISHED, updatedAt: POLLUTED_UPDATED_AT, contentUpdatedAt: null }).toISOString()
    ).toBe(PUBLISHED);
    expect(blogDateModified({ publishedAt: PUBLISHED, updatedAt: POLLUTED_UPDATED_AT }).toISOString()).toBe(PUBLISHED);
  });

  it('ignores invalid or pre-publication contentUpdatedAt', () => {
    expect(blogDateModified({ publishedAt: PUBLISHED, contentUpdatedAt: 'garbage' }).toISOString()).toBe(PUBLISHED);
    expect(blogDateModified({ publishedAt: PUBLISHED, contentUpdatedAt: '2026-01-01' }).toISOString()).toBe(PUBLISHED);
    expect(blogDateModified(null)).toBeNull();
    expect(blogDateModifiedIso({})).toBeUndefined();
  });
});

describe('blog sitemap entries', () => {
  const posts = [
    { slug: 'edited', publishedAt: PUBLISHED, contentUpdatedAt: '2026-07-04T12:00:00.000Z', updatedAt: POLLUTED_UPDATED_AT },
    { slug: 'untouched', publishedAt: '2026-05-10T12:00:00.000Z', updatedAt: POLLUTED_UPDATED_AT },
    { slug: 'undated', updatedAt: POLLUTED_UPDATED_AT },
    { title: 'no slug' },
  ];

  it('derives lastModified from contentUpdatedAt || publishedAt and omits it when unknown', () => {
    const entries = blogSitemapEntries(posts, BASE);
    expect(entries.map((e) => e.url)).toEqual([
      `${BASE}/blog/edited`,
      `${BASE}/blog/untouched`,
      `${BASE}/blog/undated`,
    ]);
    expect(entries[0].lastModified.toISOString()).toBe('2026-07-04T12:00:00.000Z');
    expect(entries[1].lastModified.toISOString()).toBe('2026-05-10T12:00:00.000Z');
    expect(entries[2]).not.toHaveProperty('lastModified');
  });

  it('uses the newest editorial date for the /blog hub', () => {
    expect(latestBlogDateModified(posts).toISOString()).toBe('2026-07-04T12:00:00.000Z');
    expect(latestBlogDateModified([])).toBeNull();
    expect(latestBlogDateModified(undefined)).toBeNull();
  });
});

describe('sitemap()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/lib/parkApi', () => ({ getAllParkSlugs: vi.fn().mockResolvedValue([]) }));
  });

  it('has no request-time lastModified for hubs and dates /blog by its newest post', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { slug: 'edited', publishedAt: PUBLISHED, contentUpdatedAt: '2026-07-04T12:00:00.000Z', updatedAt: POLLUTED_UPDATED_AT },
          { slug: 'untouched', publishedAt: '2026-05-10T12:00:00.000Z', updatedAt: POLLUTED_UPDATED_AT },
        ],
      }),
    }));
    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();
    const byUrl = new Map(entries.map((e) => [e.url, e]));

    for (const path of ['', '/events', '/explore', '/where-next', '/discover', '/discover/activities',
      '/discover/topics', '/discover/types', '/discover/states']) {
      expect(byUrl.get(`${BASE}${path}`)).toBeDefined();
      expect(byUrl.get(`${BASE}${path}`)).not.toHaveProperty('lastModified');
    }
    expect(byUrl.get(`${BASE}/blog`).lastModified.toISOString()).toBe('2026-07-04T12:00:00.000Z');
    expect(byUrl.get(`${BASE}/blog/edited`).lastModified.toISOString()).toBe('2026-07-04T12:00:00.000Z');
    expect(byUrl.get(`${BASE}/blog/untouched`).lastModified.toISOString()).toBe('2026-05-10T12:00:00.000Z');
    for (const entry of entries) {
      if (entry.lastModified) expect(new Date(entry.lastModified).toISOString()).not.toBe(POLLUTED_UPDATED_AT);
    }
    vi.unstubAllGlobals();
  });

  it('omits /blog lastModified when posts cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();
    expect(entries.find((e) => e.url === `${BASE}/blog`)).not.toHaveProperty('lastModified');
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('blog post JSON-LD', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function renderJsonLd(post) {
    vi.doMock('@/lib/blogApi', () => ({ getBlogPostServer: vi.fn().mockResolvedValue(post) }));
    vi.doMock('../../app/blog/[slug]/BlogPostClient', () => ({ default: () => null }));
    const { default: BlogPostPage } = await import('../../app/blog/[slug]/page.jsx');
    const tree = await BlogPostPage({ params: Promise.resolve({ slug: post.slug }) });
    const script = tree.props.children.find(
      (child) => child && child.props?.type === 'application/ld+json'
    );
    return JSON.parse(script.props.dangerouslySetInnerHTML.__html);
  }

  const basePost = {
    slug: 'glacier-guide',
    title: 'Glacier guide',
    excerpt: 'Excerpt',
    content: 'Body text',
    publishedAt: PUBLISHED,
    updatedAt: POLLUTED_UPDATED_AT,
  };

  it('dateModified falls back to publishedAt (not updatedAt) for unedited posts', async () => {
    const ld = await renderJsonLd({ ...basePost, contentUpdatedAt: null });
    expect(ld.datePublished).toBe(PUBLISHED);
    expect(ld.dateModified).toBe(PUBLISHED);
  });

  it('dateModified uses contentUpdatedAt after an editorial edit', async () => {
    const ld = await renderJsonLd({ ...basePost, contentUpdatedAt: '2026-07-04T12:00:00.000Z' });
    expect(ld.datePublished).toBe(PUBLISHED);
    expect(ld.dateModified).toBe('2026-07-04T12:00:00.000Z');
  });
});
