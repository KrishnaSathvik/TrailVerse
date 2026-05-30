'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Loader2, MapPin } from '@components/icons';
import {
  getCampgroundMarkerColors,
  getPlaceMarkerColors,
  getParkMapStyle,
  getParkMarkerColors,
  isNationalParkDesignation,
  parkMarkerColorExpression,
  PARK_MAP_DARK_LOADING_BG,
  PARK_MAP_LOADING_BG,
  PARK_MARKER,
} from '@/lib/parkMapBasemap';
import MapCanvasControls from './MapCanvasControls';

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_ZOOM = 4;
const PARKS_SOURCE = 'trailverse-parks';
const PARKS_LAYER = 'trailverse-park-dots';
const PARKS_LAYER_SELECTED = 'trailverse-park-dots-selected';
const PLACES_SOURCE = 'trailverse-places';
const PLACES_LAYER = 'trailverse-place-dots';
const PLACES_LAYER_SELECTED = 'trailverse-place-dots-selected';
const PLACE_MIN_ZOOM = 6;
const CAMPGROUNDS_SOURCE = 'trailverse-campgrounds';
const CAMPGROUNDS_LAYER = 'trailverse-campground-dots';
const CAMPGROUNDS_LAYER_SELECTED = 'trailverse-campground-dots-selected';
const CAMPGROUND_MIN_ZOOM = 5;

function layerInsertBeforeParks(map) {
  return map.getLayer(PARKS_LAYER) ? PARKS_LAYER : undefined;
}

function parksToGeoJson(parks, selectedPark) {
  const features = (parks || [])
    .filter((park) => park.latitude && park.longitude)
    .map((park) => {
      const lat = Number.parseFloat(park.latitude);
      const lng = Number.parseFloat(park.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          parkCode: park.parkCode,
          fullName: park.fullName,
          designation: park.designation || '',
          isNationalPark: isNationalParkDesignation(park.designation) ? 1 : 0,
          isSelected: selectedPark?.parkCode === park.parkCode ? 1 : 0,
        },
      };
    })
    .filter(Boolean);

  return { type: 'FeatureCollection', features };
}

function placesToGeoJson(places, selectedPlace) {
  const features = (places || [])
    .map((place) => {
      const lat = Number.parseFloat(place.latitude);
      const lng = Number.parseFloat(place.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          id: place.id,
          title: place.title,
          parkCode: place.parkCode,
          parkName: place.parkName || '',
          isSelected: selectedPlace?.id === place.id ? 1 : 0,
        },
      };
    })
    .filter(Boolean);

  return { type: 'FeatureCollection', features };
}

function campgroundsToGeoJson(campgrounds, selectedCampground) {
  const features = (campgrounds || [])
    .map((campground) => {
      const lat = Number.parseFloat(campground.latitude);
      const lng = Number.parseFloat(campground.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          id: campground.id,
          name: campground.name,
          parkCode: campground.parkCode,
          parkName: campground.parkName || '',
          isSelected: selectedCampground?.id === campground.id ? 1 : 0,
        },
      };
    })
    .filter(Boolean);

  return { type: 'FeatureCollection', features };
}

export default function MapCanvas({
  parks,
  places = [],
  showPlaces = true,
  campgrounds = [],
  showCampgrounds = true,
  selectedPark,
  selectedPlace,
  selectedCampground,
  mapCenter,
  mapZoom,
  onSelectPark,
  onSelectPlace,
  onSelectCampground,
  onViewportChange,
  isDark,
  fullBleed = false,
  className = '',
}) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const skipSyncRef = useRef(false);
  const skipInitialThemeRef = useRef(true);
  const parksRef = useRef(parks);
  const placesRef = useRef(places);
  const campgroundsRef = useRef(campgrounds);
  const selectedParkRef = useRef(selectedPark);
  const selectedPlaceRef = useRef(selectedPlace);
  const selectedCampgroundRef = useRef(selectedCampground);
  const showPlacesRef = useRef(showPlaces);
  const showCampgroundsRef = useRef(showCampgrounds);
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectParkRef = useRef(onSelectPark);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onSelectCampgroundRef = useRef(onSelectCampground);
  const isDarkRef = useRef(isDark);
  const [mapError, setMapError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
    onSelectParkRef.current = onSelectPark;
    onSelectPlaceRef.current = onSelectPlace;
    parksRef.current = parks;
    placesRef.current = places;
    campgroundsRef.current = campgrounds;
    selectedParkRef.current = selectedPark;
    selectedPlaceRef.current = selectedPlace;
    selectedCampgroundRef.current = selectedCampground;
    showPlacesRef.current = showPlaces;
    showCampgroundsRef.current = showCampgrounds;
    isDarkRef.current = isDark;
  });

  const setPlaceVisibility = useCallback((map, visible) => {
    const visibility = visible ? 'visible' : 'none';
    if (map.getLayer(PLACES_LAYER)) {
      map.setLayoutProperty(PLACES_LAYER, 'visibility', visibility);
    }
    if (map.getLayer(PLACES_LAYER_SELECTED)) {
      map.setLayoutProperty(PLACES_LAYER_SELECTED, 'visibility', visibility);
    }
  }, []);

  const syncPlaceLayer = useCallback((map, placeList, selection, darkMode, visible) => {
    const colors = getPlaceMarkerColors(darkMode);
    const geojson = placesToGeoJson(placeList, selection);
    const source = map.getSource(PLACES_SOURCE);

    if (source) {
      source.setData(geojson);
      if (map.getLayer(PLACES_LAYER)) {
        map.setPaintProperty(PLACES_LAYER, 'circle-color', colors.default);
      }
      if (map.getLayer(PLACES_LAYER_SELECTED)) {
        map.setPaintProperty(PLACES_LAYER_SELECTED, 'circle-color', colors.selected);
      }
      setPlaceVisibility(map, visible);
      return;
    }

    map.addSource(PLACES_SOURCE, { type: 'geojson', data: geojson });
    const insertBelowParks = layerInsertBeforeParks(map);

    map.addLayer({
      id: PLACES_LAYER,
      type: 'circle',
      source: PLACES_SOURCE,
      minzoom: PLACE_MIN_ZOOM,
      filter: ['==', ['get', 'isSelected'], 0],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6, 2.5,
          8, 3,
          11, 4,
          14, 5,
        ],
        'circle-color': colors.default,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
        'circle-opacity': 0.88,
      },
    }, insertBelowParks);

    map.addLayer({
      id: PLACES_LAYER_SELECTED,
      type: 'circle',
      source: PLACES_SOURCE,
      minzoom: PLACE_MIN_ZOOM,
      filter: ['==', ['get', 'isSelected'], 1],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6, 4,
          8, 5,
          11, 7,
          14, 9,
        ],
        'circle-color': colors.selected,
        'circle-stroke-color': colors.ring,
        'circle-stroke-width': 2.5,
        'circle-opacity': 1,
      },
    }, insertBelowParks);

    setPlaceVisibility(map, visible);

    map.on('mouseenter', PLACES_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', PLACES_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('mouseenter', PLACES_LAYER_SELECTED, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', PLACES_LAYER_SELECTED, () => {
      map.getCanvas().style.cursor = '';
    });

    const handlePlaceClick = (event) => {
      const feature = event.features?.[0];
      if (!feature?.properties?.id) return;
      const place = placeList.find((item) => item.id === feature.properties.id);
      if (place) onSelectPlaceRef.current?.(place);
    };

    map.on('click', PLACES_LAYER, handlePlaceClick);
    map.on('click', PLACES_LAYER_SELECTED, handlePlaceClick);
  }, [setPlaceVisibility]);

  const setCampgroundVisibility = useCallback((map, visible) => {
    const visibility = visible ? 'visible' : 'none';
    if (map.getLayer(CAMPGROUNDS_LAYER)) {
      map.setLayoutProperty(CAMPGROUNDS_LAYER, 'visibility', visibility);
    }
    if (map.getLayer(CAMPGROUNDS_LAYER_SELECTED)) {
      map.setLayoutProperty(CAMPGROUNDS_LAYER_SELECTED, 'visibility', visibility);
    }
  }, []);

  const syncCampgroundLayer = useCallback((map, campgroundList, selection, darkMode, visible) => {
    const colors = getCampgroundMarkerColors(darkMode);
    const geojson = campgroundsToGeoJson(campgroundList, selection);
    const source = map.getSource(CAMPGROUNDS_SOURCE);

    if (source) {
      source.setData(geojson);
      if (map.getLayer(CAMPGROUNDS_LAYER)) {
        map.setPaintProperty(CAMPGROUNDS_LAYER, 'circle-color', colors.default);
      }
      if (map.getLayer(CAMPGROUNDS_LAYER_SELECTED)) {
        map.setPaintProperty(CAMPGROUNDS_LAYER_SELECTED, 'circle-color', colors.selected);
      }
      setCampgroundVisibility(map, visible);
      return;
    }

    map.addSource(CAMPGROUNDS_SOURCE, { type: 'geojson', data: geojson });

    const insertBelowParks = layerInsertBeforeParks(map);

    map.addLayer({
      id: CAMPGROUNDS_LAYER,
      type: 'circle',
      source: CAMPGROUNDS_SOURCE,
      minzoom: CAMPGROUND_MIN_ZOOM,
      filter: ['==', ['get', 'isSelected'], 0],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5, 3,
          8, 4,
          12, 5,
          14, 6,
        ],
        'circle-color': colors.default,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
        'circle-opacity': 0.9,
      },
    }, insertBelowParks);

    map.addLayer({
      id: CAMPGROUNDS_LAYER_SELECTED,
      type: 'circle',
      source: CAMPGROUNDS_SOURCE,
      minzoom: CAMPGROUND_MIN_ZOOM,
      filter: ['==', ['get', 'isSelected'], 1],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5, 5,
          8, 7,
          12, 9,
          14, 10,
        ],
        'circle-color': colors.selected,
        'circle-stroke-color': colors.ring,
        'circle-stroke-width': 2.5,
        'circle-opacity': 1,
      },
    }, insertBelowParks);

    setCampgroundVisibility(map, visible);

    map.on('mouseenter', CAMPGROUNDS_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CAMPGROUNDS_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('mouseenter', CAMPGROUNDS_LAYER_SELECTED, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CAMPGROUNDS_LAYER_SELECTED, () => {
      map.getCanvas().style.cursor = '';
    });

    const handleCampgroundClick = (event) => {
      const feature = event.features?.[0];
      if (!feature?.properties?.id) return;
      const campground = campgroundList.find((item) => item.id === feature.properties.id);
      if (campground) onSelectCampgroundRef.current?.(campground);
    };

    map.on('click', CAMPGROUNDS_LAYER, handleCampgroundClick);
    map.on('click', CAMPGROUNDS_LAYER_SELECTED, handleCampgroundClick);
  }, [setCampgroundVisibility]);

  const syncParkLayer = useCallback((map, parkList, selection, darkMode) => {
    const source = map.getSource(PARKS_SOURCE);
    const geojson = parksToGeoJson(parkList, selection);
    const colors = getParkMarkerColors(darkMode);
    const colorExpr = parkMarkerColorExpression(colors);
    if (source) {
      source.setData(geojson);
      if (map.getLayer(PARKS_LAYER)) {
        map.setPaintProperty(PARKS_LAYER, 'circle-color', colorExpr);
      }
      if (map.getLayer(PARKS_LAYER_SELECTED)) {
        map.setPaintProperty(PARKS_LAYER_SELECTED, 'circle-color', colorExpr);
      }
      return;
    }

    map.addSource(PARKS_SOURCE, { type: 'geojson', data: geojson });

    map.addLayer({
      id: PARKS_LAYER,
      type: 'circle',
      source: PARKS_SOURCE,
      filter: ['==', ['get', 'isSelected'], 0],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3,
          ['case', ['==', ['to-number', ['get', 'isNationalPark']], 1], 5, 4],
          6,
          ['case', ['==', ['to-number', ['get', 'isNationalPark']], 1], 7, 5],
          10,
          ['case', ['==', ['to-number', ['get', 'isNationalPark']], 1], 8, 6],
          14,
          ['case', ['==', ['to-number', ['get', 'isNationalPark']], 1], 10, 8],
        ],
        'circle-color': colorExpr,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.92,
      },
    });

    map.addLayer({
      id: PARKS_LAYER_SELECTED,
      type: 'circle',
      source: PARKS_SOURCE,
      filter: ['==', ['get', 'isSelected'], 1],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3, 7,
          6, 10,
          10, 12,
          14, 14,
        ],
        'circle-color': colorExpr,
        'circle-stroke-color': PARK_MARKER.selectedRing,
        'circle-stroke-width': 3,
        'circle-opacity': 1,
      },
    });

    map.on('mouseenter', PARKS_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', PARKS_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('mouseenter', PARKS_LAYER_SELECTED, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', PARKS_LAYER_SELECTED, () => {
      map.getCanvas().style.cursor = '';
    });

    const handleParkClick = (event) => {
      const feature = event.features?.[0];
      if (!feature?.properties?.parkCode) return;
      const park = parkList.find((item) => item.parkCode === feature.properties.parkCode);
      if (park) onSelectParkRef.current?.(park);
    };

    map.on('click', PARKS_LAYER, handleParkClick);
    map.on('click', PARKS_LAYER_SELECTED, handleParkClick);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      try {
        if (!mapNodeRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
          container: mapNodeRef.current,
          style: getParkMapStyle(isDarkRef.current),
          center: [mapCenter?.lng ?? DEFAULT_CENTER.lng, mapCenter?.lat ?? DEFAULT_CENTER.lat],
          zoom: typeof mapZoom === 'number' ? mapZoom : DEFAULT_ZOOM,
          minZoom: 2,
          maxZoom: 16,
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
        });

        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          'bottom-right'
        );
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'imperial' }), 'bottom-left');

        map.on('load', () => {
          if (!isMounted) return;
          syncPlaceLayer(
            map,
            placesRef.current,
            selectedPlaceRef.current,
            isDarkRef.current,
            showPlacesRef.current
          );
          syncCampgroundLayer(
            map,
            campgroundsRef.current,
            selectedCampgroundRef.current,
            isDarkRef.current,
            showCampgroundsRef.current
          );
          syncParkLayer(map, parksRef.current, selectedParkRef.current, isDarkRef.current);
          setIsLoading(false);
        });

        map.on('error', (event) => {
          if (event?.error?.message) {
            console.error('MapLibre error:', event.error.message);
          }
        });

        map.on('moveend', () => {
          if (!mapRef.current) return;
          const center = map.getCenter();
          skipSyncRef.current = true;
          onViewportChangeRef.current?.({
            center: { lat: center.lat, lng: center.lng },
            zoom: map.getZoom(),
          });
        });

        mapRef.current = map;
      } catch (error) {
        console.error('Failed to initialize map:', error);
        if (isMounted) {
          setMapError(error.message || 'Failed to load map');
          setIsLoading(false);
        }
      }
    };

    initializeMap();

    return () => {
      isMounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  useEffect(() => {
    if (skipInitialThemeRef.current) {
      skipInitialThemeRef.current = false;
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    setIsLoading(true);
    map.setStyle(getParkMapStyle(isDark));
    map.once('styledata', () => {
      syncPlaceLayer(
        map,
        placesRef.current,
        selectedPlaceRef.current,
        isDark,
        showPlacesRef.current
      );
      syncCampgroundLayer(
        map,
        campgroundsRef.current,
        selectedCampgroundRef.current,
        isDark,
        showCampgroundsRef.current
      );
      syncParkLayer(map, parksRef.current, selectedParkRef.current, isDark);
      setIsLoading(false);
    });
  }, [isDark, syncPlaceLayer, syncCampgroundLayer, syncParkLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }

    const current = map.getCenter();
    const shouldMove =
      Math.abs(current.lat - mapCenter.lat) > 0.0001 ||
      Math.abs(current.lng - mapCenter.lng) > 0.0001;

    if (shouldMove) {
      map.easeTo({
        center: [mapCenter.lng, mapCenter.lat],
        zoom: typeof mapZoom === 'number' ? mapZoom : map.getZoom(),
        duration: 600,
      });
    } else if (typeof mapZoom === 'number' && Math.abs(map.getZoom() - mapZoom) > 0.01) {
      map.easeTo({ zoom: mapZoom, duration: 400 });
    }
  }, [mapCenter, mapZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncParkLayer(map, parks, selectedPark, isDark);
  }, [parks, selectedPark, isDark, syncParkLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncPlaceLayer(map, places, selectedPlace, isDark, showPlaces);
  }, [places, selectedPlace, isDark, showPlaces, syncPlaceLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncCampgroundLayer(map, campgrounds, selectedCampground, isDark, showCampgrounds);
  }, [campgrounds, selectedCampground, isDark, showCampgrounds, syncCampgroundLayer]);

  const handleZoomIn = () => mapRef.current?.zoomIn({ duration: 250 });
  const handleZoomOut = () => mapRef.current?.zoomOut({ duration: 250 });
  const handleResetView = () => {
    onViewportChangeRef.current?.({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    mapRef.current?.easeTo({
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      duration: 700,
    });
  };

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${fullBleed ? '' : 'rounded-[28px] border'} ${className}`}
      style={{
        borderColor: fullBleed ? 'transparent' : 'var(--border)',
        backgroundColor: isDark ? PARK_MAP_DARK_LOADING_BG : PARK_MAP_LOADING_BG,
      }}
    >
      <div ref={mapNodeRef} className="h-full w-full [&_.maplibregl-ctrl-scale]:!rounded-md [&_.maplibregl-ctrl-scale]:!border [&_.maplibregl-ctrl-scale]:!shadow-sm" />

      {!isLoading && !mapError && (
        <MapCanvasControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          isDark={isDark}
        />
      )}

      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: isDark ? PARK_MAP_DARK_LOADING_BG : PARK_MAP_LOADING_BG }}
        >
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-emerald-700" />
            <p style={{ color: 'var(--text-secondary)' }}>Loading map...</p>
          </div>
        </div>
      )}

      {mapError && (
        <div
          className="absolute inset-x-4 top-4 rounded-2xl border px-4 py-3 shadow-lg"
          style={{
            borderColor: 'color-mix(in srgb, var(--error-red) 35%, var(--border) 65%)',
            backgroundColor: 'var(--surface)',
            color: 'var(--text-primary)',
          }}
        >
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-red-500" />
            <div>
              <p className="font-medium">Map unavailable</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{mapError}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
