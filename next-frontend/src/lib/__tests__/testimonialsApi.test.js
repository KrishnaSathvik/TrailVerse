import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApprovedTestimonialsServer } from '../testimonialsApi';

vi.mock('../apiBase', () => ({ getApiBaseUrl: () => 'http://localhost/api' }));
afterEach(() => vi.unstubAllGlobals());

describe('approved stories server fetch', () => {
  it('requests approved records and excludes unapproved data defensively', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [
      { _id: 'approved', approved: true, content: 'Test record' },
      { _id: 'pending', approved: false, content: 'Pending record' },
    ] }) });
    vi.stubGlobal('fetch', fetch);
    const result = await getApprovedTestimonialsServer({ limit: 41 });
    expect(fetch.mock.calls[0][0]).toContain('approved=true&limit=41');
    expect(result.data.map(story => story._id)).toEqual(['approved']);
    expect(result.error).toBe(false);
  });
  it('distinguishes a truthful empty collection from an unavailable service', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) }));
    expect(await getApprovedTestimonialsServer()).toMatchObject({ data: [], error: false });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await getApprovedTestimonialsServer()).toMatchObject({ data: [], error: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
    expect(await getApprovedTestimonialsServer()).toMatchObject({ data: [], error: true });
  });
  it('does not mistake a malformed response for an empty collection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }));
    expect(await getApprovedTestimonialsServer()).toMatchObject({ error: true });
  });
});
