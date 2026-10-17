import { afterEach, describe, expect, it, vi } from 'vitest';
import { getParkDetails, getParkDetailsBySlug } from '../parkApi';

vi.mock('@/lib/apiBase', () => ({ getApiBaseUrl: () => 'https://example.com/api' }));

afterEach(() => vi.unstubAllGlobals());

describe('park ISR failures', () => {
  it('rejects unknown park codes and slugs before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await getParkDetails('xxxx')).toBeNull();
    expect(await getParkDetailsBySlug('not-a-real-park')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503])('throws on HTTP %s so ISR retains its previous page', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
    await expect(getParkDetails('yell')).rejects.toThrow(String(status));
  });

  it('throws on network errors instead of generating a false 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    await expect(getParkDetails('yell')).rejects.toThrow('network unavailable');
  });

  it('returns a genuine 404 as missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getParkDetails('yell')).toBeNull();
  });
});
