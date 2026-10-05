import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ItineraryMapView, { ITINERARY_MAP_PATH_MODE } from '@/components/itinerary/ItineraryMapView';
import { buildTripMapModel } from '@/lib/itineraryMapStops';
import { reportMapsRuntimeFailure, resetMapsRuntimeStatusForTests } from '@/lib/mapsRuntimeStatus';
import { installGoogleMapsMock, uninstallGoogleMapsMock } from '@/test-utils/googleMapsMock';

const CATALOG = 'trailverse_catalog';
const pin = (id, name, type, lat, lng, extra = {}) => ({
  id, name, type, latitude: lat, longitude: lng, coordinateSource: CATALOG, ...extra,
});
const transfer = (sourceStopId, targetStopId, extra = {}) => ({
  sourceStopId, targetStopId, relationship: 'transfer', ...extra,
});

function zionPlan(minutes) {
  return {
    days: [{
      id: 'zion-day-1',
      dayNumber: 1,
      travelEdges: [transfer('canyon-overlook', 'parus-trail', { modeIntent: 'drive' })],
      stops: [
        pin('canyon-overlook', 'Canyon Overlook', 'viewpoint', 37.2132, -112.9401),
        pin('parus-trail', "Pa'rus Trail", 'trail', 37.2002, -112.9869, {
          drivingTimeFromPreviousMin: minutes,
        }),
      ],
    }],
  };
}

describe('ItineraryMapView path modes', () => {
  let maps;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', 'test-map-id');
    maps = installGoogleMapsMock();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('network is forbidden in itinerary map tests');
    });
  });

  afterEach(() => {
    cleanup();
    uninstallGoogleMapsMock();
    resetMapsRuntimeStatusForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('Trailie abstract-edges: no Directions/Places/Geocoder and no adjacency polyline', async () => {
    const model = buildTripMapModel({
      days: [{
        id: 'd1',
        dayNumber: 1,
        stops: [
          pin('a', 'A', 'trail', 37.1, -112.9),
          pin('b', 'B', 'trail', 37.2, -112.8),
        ],
      }],
    });

    render(
      <ItineraryMapView
        days={model.days}
        pathMode={ITINERARY_MAP_PATH_MODE.ABSTRACT_EDGES}
      />,
    );

    await waitFor(() => {
      expect(maps.pinMarkers()).toHaveLength(2);
    });
    expect(maps.directionsInstances).toHaveLength(0);
    expect(maps.geocoderInstances).toHaveLength(0);
    expect(maps.placesAutocompleteInstances).toHaveLength(0);
    expect(maps.placesServiceInstances).toHaveLength(0);
    expect(maps.polylineCalls).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('Zion unverified drive: one abstract dash, no minutes, no Directions', async () => {
    const model = buildTripMapModel(zionPlan(null));
    render(
      <ItineraryMapView
        days={model.days}
        pathMode="abstract-edges"
      />,
    );

    await waitFor(() => {
      expect(maps.polylineCalls).toHaveLength(1);
    });
    expect(maps.polylineCalls[0].path).toHaveLength(2);
    expect(maps.polylineCalls[0].geodesic).toBe(false);
    expect(maps.edgeLabels()).toHaveLength(0);
    expect(maps.directionsInstances).toHaveLength(0);
  });

  it('synthetic verified Zion: same dash plus N min drive label', async () => {
    const model = buildTripMapModel(zionPlan(18));
    render(
      <ItineraryMapView
        days={model.days}
        pathMode="abstract-edges"
      />,
    );

    await waitFor(() => {
      expect(maps.edgeLabels()).toHaveLength(1);
    });
    expect(maps.edgeLabels()[0].content.textContent).toBe('18 min drive');
    expect(maps.polylineCalls).toHaveLength(1);
    expect(maps.directionsInstances).toHaveLength(0);
  });

  it('Yosemite group: four pins, only the outgoing abstract connector', async () => {
    const model = buildTripMapModel({
      days: [{
        id: 'yose-day-1',
        dayNumber: 1,
        activityGroups: [{ id: 'mist-trail', stopIds: ['mist', 'footbridge', 'vernal'] }],
        travelEdges: [
          transfer('mist', 'vernal'),
          transfer('vernal', 'glacier-point'),
        ],
        stops: [
          pin('mist', 'Mist Trail', 'trail', 37.7329, -119.5583),
          pin('footbridge', 'Vernal Fall Footbridge', 'landmark', 37.7262, -119.5444),
          pin('vernal', 'Vernal Fall', 'viewpoint', 37.7274, -119.5436),
          pin('glacier-point', 'Glacier Point', 'viewpoint', 37.7307, -119.5733),
        ],
      }],
    });

    render(
      <ItineraryMapView days={model.days} pathMode="abstract-edges" />,
    );

    await waitFor(() => {
      expect(maps.pinMarkers()).toHaveLength(4);
    });
    expect(maps.polylineCalls).toHaveLength(1);
    expect(maps.polylineCalls[0].path).toEqual([
      { lat: 37.7274, lng: -119.5436 },
      { lat: 37.7307, lng: -119.5733 },
    ]);
    expect(maps.directionsInstances).toHaveLength(0);
  });

  it('none mode draws pins and never instantiates DirectionsService', async () => {
    const model = buildTripMapModel(zionPlan(18));
    render(
      <ItineraryMapView days={model.days} pathMode={ITINERARY_MAP_PATH_MODE.NONE} />,
    );
    await waitFor(() => {
      expect(maps.pinMarkers()).toHaveLength(2);
    });
    expect(maps.polylineCalls).toHaveLength(0);
    expect(maps.edgeLabels()).toHaveLength(0);
    expect(maps.directionsInstances).toHaveLength(0);
  });

  it('default pathMode keeps PlanWorkspace Directions behavior', async () => {
    render(
      <ItineraryMapView
        days={[{
          id: 'd1',
          stops: [
            { id: 'a', name: 'A', latitude: 37.1, longitude: -112.9 },
            { id: 'b', name: 'B', latitude: 37.2, longitude: -112.8 },
          ],
        }]}
      />,
    );

    await waitFor(() => {
      expect(maps.directionsInstances).toHaveLength(1);
    });
    expect(maps.directionsInstances[0].route).toHaveBeenCalled();
  });

  it('All vs day filter only draws that day\'s abstract edges', async () => {
    const model = buildTripMapModel({
      days: [
        {
          id: 'day-1',
          dayNumber: 1,
          travelEdges: [transfer('a', 'b')],
          stops: [
            pin('a', 'A', 'trail', 37.1, -112.9),
            pin('b', 'B', 'trail', 37.2, -112.8),
          ],
        },
        {
          id: 'day-2',
          dayNumber: 2,
          travelEdges: [transfer('c', 'd')],
          stops: [
            pin('c', 'C', 'trail', 44.1, -110.9),
            pin('d', 'D', 'trail', 44.2, -110.8),
          ],
        },
      ],
    });

    const { rerender } = render(
      <ItineraryMapView days={model.days} pathMode="abstract-edges" activeDayId="all" />,
    );
    await waitFor(() => {
      expect(maps.polylineCalls).toHaveLength(2);
    });

    maps.polylineCalls.length = 0;
    rerender(
      <ItineraryMapView days={model.days} pathMode="abstract-edges" activeDayId="day-2" />,
    );
    await waitFor(() => {
      expect(maps.polylineCalls).toHaveLength(1);
    });
    expect(maps.polylineCalls[0].path).toEqual([
      { lat: 44.1, lng: -110.9 },
      { lat: 44.2, lng: -110.8 },
    ]);
    expect(maps.directionsInstances).toHaveLength(0);
  });
});

describe('ItineraryMapView Trailie phone presentation — Phase 10C', () => {
  let maps;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', 'test-map-id');
    maps = installGoogleMapsMock();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('network is forbidden in itinerary map tests');
    });
  });

  afterEach(() => {
    cleanup();
    uninstallGoogleMapsMock();
    resetMapsRuntimeStatusForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('applies preview padding and top-right controls without Directions', async () => {
    const model = buildTripMapModel(zionPlan(18));
    render(
      <ItineraryMapView
        days={model.days}
        pathMode="abstract-edges"
        selectedStopId="canyon-overlook"
        fitPadding={{ top: 48, right: 56, bottom: 164, left: 24 }}
        controlsPlacement="top-right"
      />,
    );

    await waitFor(() => {
      expect(maps.mapInstances).toHaveLength(1);
    });
    const map = maps.mapInstances[0];
    expect(map.opts.mapId).toBe('test-map-id');
    expect(map.opts.mapId).not.toBe('TRAILVERSE_ITINERARY');
    await waitFor(() => {
      expect(map.panTo).toHaveBeenCalled();
    });
    expect(map.panBy).toHaveBeenCalledWith(0, 84);
    expect(map.opts.zoomControlOptions.position).toBe('RIGHT_TOP');
    expect(map.opts.fullscreenControlOptions.position).toBe('RIGHT_TOP');
    expect(maps.directionsInstances).toHaveLength(0);
    expect(maps.geocoderInstances).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps default camera padding when PlanWorkspace omits Trailie props', async () => {
    render(
      <ItineraryMapView
        days={[{
          id: 'd1',
          stops: [
            { id: 'a', name: 'A', latitude: 37.1, longitude: -112.9 },
            { id: 'b', name: 'B', latitude: 37.2, longitude: -112.8 },
          ],
        }]}
      />,
    );

    await waitFor(() => {
      expect(maps.mapInstances).toHaveLength(1);
    });
    const map = maps.mapInstances[0];
    expect(map.opts.zoomControlOptions).toBeUndefined();
    expect(map.fitBounds).toHaveBeenCalled();
    const padding = map.fitBounds.mock.calls.at(-1)?.[1];
    expect(padding).toEqual({ top: 80, right: 40, bottom: 80, left: 40 });
    expect(maps.directionsInstances).toHaveLength(1);
  });

  it('does not construct a Google Map after a browser Maps auth failure', async () => {
    reportMapsRuntimeFailure('gm_auth_failure');
    const model = buildTripMapModel({
      days: [{
        id: 'd1',
        dayNumber: 1,
        stops: [
          pin('a', 'A', 'trail', 37.1, -112.9),
          pin('b', 'B', 'trail', 37.2, -112.8),
        ],
      }],
    });

    render(
      <ItineraryMapView
        days={model.days}
        pathMode={ITINERARY_MAP_PATH_MODE.ABSTRACT_EDGES}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(maps.mapInstances).toHaveLength(0);
    expect(maps.directionsInstances).toHaveLength(0);
    expect(screen.getByTestId('itinerary-map-runtime-blocked')).toBeInTheDocument();
  });

  it('does not construct a Google Map or fall back to TRAILVERSE_ITINERARY when Map ID is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', '');
    const model = buildTripMapModel({
      days: [{
        id: 'd1',
        dayNumber: 1,
        stops: [
          pin('a', 'A', 'trail', 37.1, -112.9),
          pin('b', 'B', 'trail', 37.2, -112.8),
        ],
      }],
    });

    render(
      <ItineraryMapView
        days={model.days}
        pathMode={ITINERARY_MAP_PATH_MODE.ABSTRACT_EDGES}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(maps.mapInstances).toHaveLength(0);
    expect(maps.directionsInstances).toHaveLength(0);
    expect(screen.getByTestId('itinerary-map-runtime-blocked')).toBeInTheDocument();
  });
});
