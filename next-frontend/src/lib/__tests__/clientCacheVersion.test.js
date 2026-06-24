import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyClientCacheMigration, CLIENT_CACHE_VERSION } from '../clientCacheVersion';

describe('clientCacheVersion', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('purges legacy localStorage keys and records the new version', () => {
    localStorage.setItem('trailverse_all_parks_v4_basic', '[]');
    localStorage.setItem('npe_cache_v4_weather', '{}');
    localStorage.setItem('trailverse_auth_token', 'keep-me');

    const migrated = applyClientCacheMigration();

    expect(migrated).toBe(true);
    expect(localStorage.getItem('trailverse_client_cache_version')).toBe(CLIENT_CACHE_VERSION);
    expect(localStorage.getItem('trailverse_all_parks_v4_basic')).toBeNull();
    expect(localStorage.getItem('npe_cache_v4_weather')).toBeNull();
    expect(localStorage.getItem('trailverse_auth_token')).toBe('keep-me');
  });

  it('is a no-op when version already matches', () => {
    localStorage.setItem('trailverse_client_cache_version', CLIENT_CACHE_VERSION);
    localStorage.setItem('trailverse_all_parks_v4_basic', '[]');

    const migrated = applyClientCacheMigration();

    expect(migrated).toBe(false);
    expect(localStorage.getItem('trailverse_all_parks_v4_basic')).toBe('[]');
  });
});
