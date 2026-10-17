import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GoogleMapsLoader from '@/components/maps/GoogleMapsLoader';
import {
  getMapsRuntimeStatus,
  resetMapsRuntimeStatusForTests,
} from '@/lib/mapsRuntimeStatus';

vi.mock('next/script', () => ({
  default: function Script(props) {
    return <div data-testid="gmaps-script" data-src={props.src} />;
  },
}));

describe('GoogleMapsLoader', () => {
  afterEach(() => {
    cleanup();
    resetMapsRuntimeStatusForTests();
    vi.unstubAllEnvs();
  });

  it('loads the Maps JS script when browser key and Map ID are present', () => {
    vi.stubEnv('NEXT_PUBLIC_GMAPS_WEB_KEY', 'AIzaSyTestBrowserKeyForMapsLoader');
    vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', 'test-map-id');
    render(<GoogleMapsLoader />);
    const script = screen.getByTestId('gmaps-script');
    expect(script.getAttribute('data-src')).toContain('maps.googleapis.com/maps/api/js');
    expect(getMapsRuntimeStatus().ok).toBeNull();
    expect(JSON.stringify(getMapsRuntimeStatus())).not.toMatch(/AIza|test-map-id|TRAILVERSE_ITINERARY/i);
  });

  it('reports missing Map ID without falling back to TRAILVERSE_ITINERARY', () => {
    vi.stubEnv('NEXT_PUBLIC_GMAPS_WEB_KEY', 'AIzaSyTestBrowserKeyForMapsLoader');
    vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', '');
    render(<GoogleMapsLoader />);
    expect(screen.getByTestId('gmaps-script')).toBeInTheDocument();
    expect(getMapsRuntimeStatus()).toMatchObject({
      ok: false,
      code: 'missing_map_id',
    });
    expect(JSON.stringify(getMapsRuntimeStatus())).not.toMatch(/TRAILVERSE_ITINERARY|AIza/i);
  });
});
