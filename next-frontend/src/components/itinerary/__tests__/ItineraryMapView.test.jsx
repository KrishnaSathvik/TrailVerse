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
      travelEdges: [transfer('canyon-overlook', 'parus-trail', { modeIntent: 'drive', status: Number.isFinite(minutes) ? 'verified' : 'unverified', travelMode: 'driving', durationSeconds: Number.isFinite(minutes) ? minutes * 60 : null, source: { evidenceId: 'route', provider: 'google_maps' } })],
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

  it('chat preview preserves canonical pins without map navigation controls or directions calls', async () => {
    const model = buildTripMapModel(zionPlan(15));
    render(<ItineraryMapView days={model.days} pathMode={ITINERARY_MAP_PATH_MODE.NONE} preview />);
    await waitFor(() => expect(maps.pinMarkers()).toHaveLength(2));
    expect(maps.mapInstances[0].opts).toMatchObject({ gestureHandling: 'none', keyboardShortcuts: false, zoomControl: false, fullscreenControl: false });
    expect(maps.directionsInstances).toHaveLength(0);
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

  it.each([[18, '18 min by road'], [149, '2 hr 29 min by road'], [180, '3 hr by road']])('renders a verified %i-minute map transfer as %s', async (minutes, label) => {
    const model = buildTripMapModel(zionPlan(minutes));
    expect(model.days[0].transferEdges[0].minutes).toBe(minutes);
    render(
      <ItineraryMapView
        days={model.days}
        pathMode="abstract-edges"
        activeDayId={model.days[0].id}
      />,
    );

    await waitFor(() => {
      expect(maps.edgeLabels()).toHaveLength(1);
    });
    expect(maps.edgeLabels()[0].content.textContent).toBe(label);
    expect(maps.polylineCalls).toHaveLength(1);
    expect(maps.directionsInstances).toHaveLength(0);
  });

  it('uses stop order only in All and every selected day', async () => {
    const plan = zionPlan(18);
    plan.days = [1, 2, 3, 4, 5].map(n => ({ ...plan.days[0], id: `day-${n}`, dayNumber: n }));
    const model = buildTripMapModel(plan);
    const { rerender } = render(<ItineraryMapView days={model.days} pathMode="abstract-edges" />);
    await waitFor(() => expect(maps.pinMarkers()).toHaveLength(10));
    expect(maps.pinMarkers().map(m => m.content.textContent)).toEqual(['1','2','1','2','1','2','1','2','1','2']);
    expect(maps.pinMarkers()[8].title).toBe('Day 5 · Stop 1 · Canyon Overlook');
    expect(maps.edgeLabels()).toHaveLength(0);
    expect(maps.polylineCalls[0].icons[0].icon.strokeOpacity).toBeLessThan(0.5);
    for (const day of model.days) {
      maps.markerCalls.length = 0;
      rerender(<ItineraryMapView days={model.days} activeDayId={day.id} pathMode="abstract-edges" />);
      expect(maps.pinMarkers().map(m => m.content.textContent)).toEqual(['1', '2']);
      expect(maps.edgeLabels()).toHaveLength(1);
    }
  });

  it('clusters overlapping UI anchors and makes each original stop selectable', async () => {
    const instances = [];
    const OriginalMarker = window.google.maps.marker.AdvancedMarkerElement;
    window.google.maps.marker.AdvancedMarkerElement = function(opts) {
      const marker = new OriginalMarker(opts);
      marker.handlers = {};
      marker.addListener = (name, fn) => { marker.handlers[name] = fn; };
      instances.push(marker);
      return marker;
    };
    const OriginalMap = window.google.maps.Map;
    window.google.maps.Map = function(...args) {
      const map = new OriginalMap(...args);
      map.getProjection = () => ({ fromLatLngToPoint: p => ({ x: p.lng, y: p.lat }) });
      map.getZoom = () => 0;
      return map;
    };
    window.google.maps.LatLng = function(lat, lng) { this.lat = lat; this.lng = lng; };
    const onMarkerClick = vi.fn();
    const model = buildTripMapModel(zionPlan(18));
    render(<ItineraryMapView days={model.days} pathMode="abstract-edges" onMarkerClick={onMarkerClick} />);
    await waitFor(() => expect(instances).toHaveLength(3));
    const [first, second, cluster] = instances;
    expect(cluster.content.textContent).toBe('2 stops');
    expect(first.position).toEqual({ lat: 37.2132, lng: -112.9401 });
    expect(second.position).toEqual({ lat: 37.2002, lng: -112.9869 });
    expect(first.map).toBeNull();
    cluster.handlers.click();
    const info = window.google.maps.InfoWindow.mock.instances[0];
    const list = info.setContent.mock.calls.at(-1)[0];
    expect(list.querySelectorAll('button')).toHaveLength(2);
    list.querySelectorAll('button')[1].click();
    expect(onMarkerClick).toHaveBeenCalledWith('parus-trail', 'zion-day-1');
    expect(second.zIndex).toBe(1000);
    expect(second.map).not.toBeNull();
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
