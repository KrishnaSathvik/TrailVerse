import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

describe('cached park page response policy', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { maintenanceMode: false } }),
    }));
  });

  it('keeps canonical park pages indexable', async () => {
    const response = await proxy(new NextRequest('https://example.com/parks/yellowstone-national-park'));
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
  });

  it.each([
    '/parks/yellowstone-national-park?tab=alerts',
    '/parks/yellowstone-national-park?from=explore',
    '/parks/state/hawaii?utm_source=search',
  ])('noindexes query variants without server-rendered query metadata: %s', async (path) => {
    const response = await proxy(new NextRequest(`https://example.com${path}`));
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
  });

  it('preserves unauthenticated profile protection', async () => {
    const response = await proxy(new NextRequest('https://example.com/profile'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.com/login?redirect=%2Fprofile');
  });
});
