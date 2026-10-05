import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAPS_RUNTIME_TRAVELER_MESSAGE,
  getGmapsMapId,
  getMapsRuntimeStatus,
  installMapsRuntimeGuard,
  reportMapsRuntimeFailure,
  resetMapsRuntimeStatusForTests,
  subscribeMapsRuntimeStatus,
} from '../mapsRuntimeStatus';

describe('mapsRuntimeStatus', () => {
  afterEach(() => {
    resetMapsRuntimeStatusForTests();
    delete window.gm_authFailure;
    vi.unstubAllEnvs();
  });

  it('starts unknown and never includes the browser key', () => {
    const status = getMapsRuntimeStatus();
    expect(status.ok).toBeNull();
    expect(JSON.stringify(status)).not.toMatch(/AIza|gmaps|GOOGLE_MAPS|WEB_KEY/i);
    expect(MAPS_RUNTIME_TRAVELER_MESSAGE).not.toMatch(/AIza|key=/i);
  });

  it('records Google auth failure without exposing configuration secrets', () => {
    installMapsRuntimeGuard();
    expect(typeof window.gm_authFailure).toBe('function');
    window.gm_authFailure();
    const status = getMapsRuntimeStatus();
    expect(status.ok).toBe(false);
    expect(status.code).toBe('gm_auth_failure');
    expect(status.travelerMessage).toBe(MAPS_RUNTIME_TRAVELER_MESSAGE);
    expect(JSON.stringify(status)).not.toMatch(/AIza/);
  });

  it('records a loader error the same way', () => {
    reportMapsRuntimeFailure('script_load_error');
    expect(getMapsRuntimeStatus()).toMatchObject({
      ok: false,
      code: 'script_load_error',
      travelerMessage: MAPS_RUNTIME_TRAVELER_MESSAGE,
    });
  });

  it('installs gm_authFailure only once', () => {
    installMapsRuntimeGuard();
    const first = window.gm_authFailure;
    installMapsRuntimeGuard();
    expect(window.gm_authFailure).toBe(first);
  });

  it('notifies subscribers on auth failure without exposing the key', () => {
    const seen = [];
    const unsubscribe = subscribeMapsRuntimeStatus((next) => seen.push(next));
    reportMapsRuntimeFailure('gm_auth_failure');
    unsubscribe();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ ok: false, code: 'gm_auth_failure' });
    expect(JSON.stringify(seen[0])).not.toMatch(/AIza|key=/i);
  });

  it('reads NEXT_PUBLIC_GMAPS_MAP_ID without falling back to a placeholder name', () => {
    vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', '  test-map-id  ');
    expect(getGmapsMapId()).toBe('test-map-id');
    vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', '');
    expect(getGmapsMapId()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', '   ');
    expect(getGmapsMapId()).toBeNull();
    expect(getGmapsMapId()).not.toBe('TRAILVERSE_ITINERARY');
    reportMapsRuntimeFailure('missing_map_id');
    expect(JSON.stringify(getMapsRuntimeStatus())).not.toMatch(/test-map-id|TRAILVERSE_ITINERARY/i);
  });
});
