import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TripMapSheet from '@/components/trip-map/TripMapSheet';
import { buildTripMapModel } from '@/lib/itineraryMapStops';
import {
  MAPS_RUNTIME_TRAVELER_MESSAGE,
  reportMapsRuntimeFailure,
  resetMapsRuntimeStatusForTests,
} from '@/lib/mapsRuntimeStatus';

const { mapProps } = vi.hoisted(() => ({ mapProps: [] }));

vi.mock('@/components/itinerary/ItineraryMapView', () => ({
  default: function MockItineraryMapView(props) {
    mapProps.push(props);
    return <div data-testid="itinerary-map" />;
  },
}));

vi.mock('@/utils/analytics', () => ({
  trackCustomEvent: vi.fn(),
}));

describe('TripMapSheet Trailie wiring', () => {
  afterEach(() => {
    cleanup();
    mapProps.length = 0;
    resetMapsRuntimeStatusForTests();
  });

  it('opens the shared map in abstract-edges mode', () => {
    const plan = {
      parkName: 'Zion National Park',
      days: [{
        id: 'zion-day-1',
        dayNumber: 1,
        stops: [{
          id: 'canyon-overlook',
          name: 'Canyon Overlook',
          type: 'viewpoint',
          latitude: 37.2132,
          longitude: -112.9401,
          coordinateSource: 'trailverse_catalog',
        }],
      }],
    };
    const mapModel = buildTripMapModel(plan);

    render(
      <TripMapSheet
        open
        plan={plan}
        mapModel={mapModel}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('itinerary-map')).toBeInTheDocument();
    expect(mapProps[0].pathMode).toBe('abstract-edges');
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day 1' })).toBeInTheDocument();
    expect(screen.queryByTestId('trip-map-runtime-unavailable')).not.toBeInTheDocument();
  });

  it('covers a Google Maps auth failure instead of leaving an unexplained broken canvas', () => {
    reportMapsRuntimeFailure('gm_auth_failure');
    const plan = {
      parkName: 'Valley of Fire State Park',
      days: [{
        id: 'vof-day-1',
        dayNumber: 1,
        stops: [{
          id: 'elephant-rock',
          name: 'Elephant Rock',
          type: 'viewpoint',
          latitude: 36.4401,
          longitude: -114.5134,
          coordinateSource: 'trailverse_catalog',
        }],
      }],
    };

    render(
      <TripMapSheet
        open
        plan={plan}
        mapModel={buildTripMapModel(plan)}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('trip-map-runtime-unavailable')).toHaveTextContent(MAPS_RUNTIME_TRAVELER_MESSAGE);
    expect(screen.getByTestId('trip-map-runtime-unavailable').textContent).not.toMatch(/AIza|key=/i);
    expect(mapProps[0].pathMode).toBe('abstract-edges');
  });
});

describe('TripMapSheet mobile packing — Phase 10C', () => {
  afterEach(() => {
    cleanup();
    mapProps.length = 0;
    resetMapsRuntimeStatusForTests();
  });

  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: String(query).includes('max-width: 639px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  const yellowstonePlan = {
    parkName: 'Yellowstone National Park',
    days: [{
      id: 'yell-day-1',
      dayNumber: 1,
      stops: [{
        id: 'old-faithful',
        name: 'Old Faithful Geyser',
        type: 'geothermal',
        why: 'The classic eruption basin, kept as the named stop rather than a vague loop.',
        latitude: 44.4605,
        longitude: -110.8285,
        coordinateSource: 'trailverse_catalog',
      }],
    }],
  };

  it('keeps a non-wrapping title row with a 44px close control', () => {
    const mapModel = buildTripMapModel(yellowstonePlan);
    render(
      <TripMapSheet open plan={yellowstonePlan} mapModel={mapModel} onClose={() => {}} />,
    );

    const header = screen.getByTestId('trip-map-header');
    expect(header.className).toMatch(/flex-nowrap/);
    expect(header.className).not.toMatch(/flex-wrap/);
    expect(screen.getByRole('heading', { name: /Trip map · Yellowstone National Park/ })).toHaveClass('truncate');
    const close = screen.getByTestId('trip-map-close');
    expect(close).toHaveClass('h-11', 'w-11', 'shrink-0');
    expect(mapProps[0].pathMode).toBe('abstract-edges');
    expect(mapProps[0].isMobile).toBe(false);
  });

  it('shows a bounded StopPreviewCard and preview-aware Trailie map props', () => {
    const mapModel = buildTripMapModel(yellowstonePlan);
    render(
      <TripMapSheet
        open
        plan={yellowstonePlan}
        mapModel={mapModel}
        initialFocusStopId="old-faithful"
        onClose={() => {}}
        onViewInItinerary={() => {}}
      />,
    );

    const preview = screen.getByTestId('stop-preview-card');
    expect(preview.className).toMatch(/max-h-\[11\.5rem\]/);
    expect(preview.className).toMatch(/right-14/);
    expect(preview.className).toMatch(/min-w-0/);
    expect(screen.getByRole('button', { name: /View in itinerary/i })).toBeInTheDocument();
    const latest = mapProps.at(-1);
    expect(latest.isMobile).toBe(false);
    expect(latest.pathMode).toBe('abstract-edges');
    expect(latest.controlsPlacement).toBe('top-right');
    expect(latest.fitPadding).toMatchObject({ top: 48, right: 56, left: 24 });
    expect(latest.fitPadding.bottom).toBeGreaterThanOrEqual(80);
  });
});
