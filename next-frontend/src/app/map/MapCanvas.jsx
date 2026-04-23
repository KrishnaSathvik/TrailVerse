'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from '@components/icons';
import { loadMaps } from '@/lib/loadMaps';

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };

const darkMapStyles = [
  // Base
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#c9d1d9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },

  // Administrative boundaries
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b5563' }, { weight: 1.5 }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#374151' }, { weight: 0.8 }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Landscape
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'landscape.natural.terrain', elementType: 'geometry', stylers: [{ color: '#1e2a3a' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#16213e' }] },

  // Water
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a6fa5' }] },

  // Roads
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2d3a4a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#3b4d63' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#242e3e' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#1e2738' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Parks & green spaces
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#13301a' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4ade80' }] },

  // Hide other POIs
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },

  // Transit
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export default function MapCanvas({
  parks,
  selectedPark,
  mapCenter,
  mapZoom,
  onSelectPark,
  onViewportChange,
  isDark,
  fullBleed = false,
  className = '',
}) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const listenersRef = useRef([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      try {
        const apiKey = process.env.NEXT_PUBLIC_GMAPS_WEB_KEY;

        if (!apiKey) {
          throw new Error('Google Maps API key not configured');
        }

        await loadMaps(apiKey);

        if (!isMounted || !mapNodeRef.current || mapRef.current) {
          return;
        }

        mapRef.current = new window.google.maps.Map(mapNodeRef.current, {
          center: mapCenter || DEFAULT_CENTER,
          zoom: typeof mapZoom === 'number' ? mapZoom : 4,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          styles: isDark ? darkMapStyles : undefined,
        });

        listenersRef.current.push(
          mapRef.current.addListener('idle', () => {
            if (!mapRef.current) return;

            const center = mapRef.current.getCenter();
            onViewportChange?.({
              center: center ? { lat: center.lat(), lng: center.lng() } : DEFAULT_CENTER,
              zoom: mapRef.current.getZoom(),
            });
          })
        );

        if (isMounted) {
          setIsLoading(false);
        }
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
      listenersRef.current.forEach((listener) => listener?.remove?.());
      listenersRef.current = [];
    };
  }, [isDark, mapCenter, mapZoom, onViewportChange]);

  useEffect(() => {
    if (!mapRef.current) return;

    mapRef.current.setOptions({
      styles: isDark ? darkMapStyles : undefined,
    });
  }, [isDark]);

  useEffect(() => {
    if (!mapRef.current) return;

    const currentCenter = mapRef.current.getCenter();
    const currentZoom = mapRef.current.getZoom();
    const shouldMoveCenter = !currentCenter ||
      Math.abs(currentCenter.lat() - mapCenter.lat) > 0.0001 ||
      Math.abs(currentCenter.lng() - mapCenter.lng) > 0.0001;

    if (shouldMoveCenter) {
      mapRef.current.setCenter(mapCenter);
    }

    if (typeof mapZoom === 'number' && currentZoom !== mapZoom) {
      mapRef.current.setZoom(mapZoom);
    }
  }, [mapCenter, mapZoom]);

  useEffect(() => {
    if (!mapRef.current || !parks?.length) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    parks
      .filter((park) => park.latitude && park.longitude)
      .forEach((park) => {
        const lat = Number.parseFloat(park.latitude);
        const lng = Number.parseFloat(park.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const isSelected = selectedPark?.parkCode === park.parkCode;

        // When a park is selected, only show the selected marker
        if (selectedPark && !isSelected) return;

        const marker = new window.google.maps.Marker({
          position: { lat, lng },
          map: mapRef.current,
          title: park.fullName,
          zIndex: isSelected ? 10 : 1,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: isSelected ? 13 : 9,
            fillColor: park.designation === 'National Park' ? '#15803d' : '#2563eb',
            fillOpacity: isSelected ? 1 : 0.9,
            strokeColor: '#ffffff',
            strokeWeight: isSelected ? 3 : 2,
          },
        });

        marker.addListener('click', () => onSelectPark?.(park));
        markersRef.current.push(marker);
      });

    return () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [onSelectPark, parks, selectedPark]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${fullBleed ? '' : 'rounded-[28px] border'} ${className}`}
      style={{
        borderColor: fullBleed ? 'transparent' : 'var(--border)',
        backgroundColor: 'var(--surface)'
      }}
    >
      <div ref={mapNodeRef} className="h-full w-full" />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-emerald-600" />
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
            color: 'var(--text-primary)'
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
