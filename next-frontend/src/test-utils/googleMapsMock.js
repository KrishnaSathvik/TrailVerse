import { vi } from 'vitest';

export function installGoogleMapsMock() {
  const polylineCalls = [];
  const markerCalls = [];
  const directionsInstances = [];
  const geocoderInstances = [];
  const placesAutocompleteInstances = [];
  const placesServiceInstances = [];

  function Polyline(opts) {
    polylineCalls.push(opts);
    this.opts = opts;
    this.setMap = vi.fn();
  }

  function DirectionsService() {
    const instance = { route: vi.fn() };
    directionsInstances.push(instance);
    this.route = instance.route;
  }

  function Geocoder() {
    geocoderInstances.push(this);
    this.geocode = vi.fn();
  }

  const mapInstances = [];
  function Map(el, opts) {
    this.el = el;
    this.opts = opts || {};
    this.fitBounds = vi.fn();
    this.panTo = vi.fn();
    this.panBy = vi.fn();
    this.setOptions = vi.fn((next) => {
      this.opts = { ...this.opts, ...next };
    });
    mapInstances.push(this);
  }

  function AdvancedMarkerElement(opts) {
    markerCalls.push(opts);
    this.opts = opts;
    this.map = opts?.map ?? null;
    this.position = opts?.position;
    this.title = opts?.title;
    this.content = opts?.content;
    this.addListener = vi.fn();
  }

  function AutocompleteService() {
    placesAutocompleteInstances.push(this);
    this.getPlacePredictions = vi.fn();
  }

  function PlacesService() {
    placesServiceInstances.push(this);
    this.getDetails = vi.fn();
  }

  window.google = {
    maps: {
      Map: vi.fn(Map),
      ControlPosition: {
        RIGHT_TOP: 'RIGHT_TOP',
        RIGHT_BOTTOM: 'RIGHT_BOTTOM',
        TOP_RIGHT: 'TOP_RIGHT',
      },
      LatLngBounds: vi.fn(function LatLngBounds() {
        this.extend = vi.fn();
      }),
      InfoWindow: vi.fn(function InfoWindow() {
        this.setContent = vi.fn();
        this.open = vi.fn();
      }),
      Polyline,
      DirectionsService,
      Geocoder,
      TravelMode: { DRIVING: 'DRIVING' },
      SymbolPath: { FORWARD_CLOSED_ARROW: 2 },
      marker: { AdvancedMarkerElement },
      places: {
        AutocompleteService,
        PlacesService,
        AutocompleteSessionToken: vi.fn(),
      },
    },
  };

  return {
    polylineCalls,
    markerCalls,
    directionsInstances,
    geocoderInstances,
    placesAutocompleteInstances,
    placesServiceInstances,
    mapInstances,
    pinMarkers: () => markerCalls.filter((call) => call?.content?.getAttribute?.('data-itinerary-edge-label') !== 'true'),
    edgeLabels: () => markerCalls.filter((call) => call?.content?.getAttribute?.('data-itinerary-edge-label') === 'true'),
  };
}

export function uninstallGoogleMapsMock() {
  delete window.google;
}
