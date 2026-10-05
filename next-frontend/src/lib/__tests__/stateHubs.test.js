import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getStateHub, STATE_MAP } from '../stateHubs';

vi.mock('@/lib/apiBase', () => ({
  getApiBaseUrl: () => 'http://localhost:5001/api',
}));

describe('state hubs', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves valid slugs and rejects unknown ones', () => {
    expect(getStateHub('utah')).toEqual({ name: 'Utah', code: 'UT' });
    expect(getStateHub('California')).toEqual({ name: 'California', code: 'CA' });
    expect(getStateHub('narnia')).toBeNull();
    expect(getStateHub('constructor')).toBeNull();
    expect(getStateHub('__proto__')).toBeNull();
    expect(Object.keys(STATE_MAP).length).toBeGreaterThan(50);
  });

  it('treats a failed parks fetch as an error, not an empty state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const { fetchParksForState } = await import('../stateHubs');
    const result = await fetchParksForState('UT');
    expect(result).toEqual({ ok: false, parks: [] });
  });

  it('treats a non-OK parks response as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const { fetchParksForState } = await import('../stateHubs');
    const result = await fetchParksForState('UT');
    expect(result.ok).toBe(false);
    expect(result.parks).toEqual([]);
  });

  it('rejects malformed successful responses instead of caching an empty directory', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const { fetchParksForState } = await import('../stateHubs');
    expect(await fetchParksForState('HI')).toEqual({ ok: false, parks: [] });
  });

  it('returns parks for a successful state query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { parkCode: 'zion', fullName: 'Zion National Park', states: 'UT' },
        { parkCode: 'hale', fullName: 'Haleakala National Park', states: 'HI' },
        { parkCode: 'dino', fullName: 'Dinosaur National Monument', states: 'CO, UT' },
      ] }),
    }));
    const { fetchParksForState } = await import('../stateHubs');
    const result = await fetchParksForState('UT');
    expect(result.ok).toBe(true);
    expect(result.parks.map(park => park.parkCode)).toEqual(['zion', 'dino']);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/parks?all=true&fields='),
      expect.any(Object)
    );
  });
});
