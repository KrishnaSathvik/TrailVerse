import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Navigation, Utensils, Bed, Fuel, X, Loader2, ExternalLink } from '@components/icons';
import { googlePlacesService as gps } from '../../services/googlePlacesService';

const EmbeddedParkMap = ({ park, className = '' }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState({});
  const [loadingCategory, setLoadingCategory] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);

  // Categories for nearby services
  const categories = [
    { id: 'restaurant', label: 'Restaurants', icon: Utensils, color: '#10b981' },
    { id: 'lodging', label: 'Lodging', icon: Bed, color: '#3b82f6' },
    { id: 'gas_station', label: 'Gas Stations', icon: Fuel, color: '#f59e0b' }
  ];

  // Initialize map
  useEffect(() => {
    if (!park?.latitude || !park?.longitude) return;

    const initializeMap = async () => {
      try {
        // Load Google Maps API
        const { loadMaps } = await import('../../lib/loadMaps');
        const apiKey = import.meta.env.VITE_GMAPS_WEB_KEY;
        
        if (!apiKey) {
          console.error('Google Maps API key is missing!');
          setMapError('API key not configured');
          return;
        }

        await loadMaps(apiKey, ['places']);
        
        if (!window.google?.maps) {
          console.error('Google Maps not loaded');
          setMapError('Failed to load Google Maps');
          return;
        }

        const maps = window.google.maps;
        
        if (!mapRef.current) return;

        // Create map instance
        mapInstanceRef.current = new maps.Map(mapRef.current, {
          center: { lat: parseFloat(park.latitude), lng: parseFloat(park.longitude) },
          zoom: 12,
          mapTypeId: maps.MapTypeId.TERRAIN,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: true,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            }
          ]
        });

        // Add park marker
        const parkMarker = new maps.Marker({
          position: { lat: parseFloat(park.latitude), lng: parseFloat(park.longitude) },
          map: mapInstanceRef.current,
          title: park.fullName,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#059669',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }
        });

        // Add park info window
        infoWindowRef.current = new maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">${park.fullName}</h3>
              <p style="margin: 0; font-size: 12px; color: #666;">${park.states}</p>
            </div>
          `
        });

        parkMarker.addListener('click', () => {
          infoWindowRef.current.open(mapInstanceRef.current, parkMarker);
        });

        setMapLoaded(true);
      } catch (error) {
        console.error('Error loading map:', error);
        setMapError('Failed to load map');
      }
    };

    initializeMap();

    return () => {
      // Cleanup
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }
    };
  }, [park]);

  // Load nearby places
  const loadNearbyPlaces = useCallback(async (category) => {
    if (!park?.latitude || !park?.longitude) return;

    setLoadingCategory(category);
    
    try {
      const places = await gps.getNearby(
        parseFloat(park.latitude),
        parseFloat(park.longitude),
        category,
        15000 // 15km radius
      );

      setNearbyPlaces(prev => ({
        ...prev,
        [category]: places
      }));

      // Add markers to map
      if (mapInstanceRef.current && places.length > 0) {
        const maps = window.google.maps;
        
        // Clear existing category markers
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        const categoryConfig = categories.find(c => c.id === category);
        
        places.slice(0, 10).forEach(place => {
          if (place.geometry?.location) {
            const marker = new maps.Marker({
              position: place.geometry.location,
              map: mapInstanceRef.current,
              title: place.name,
              icon: {
                path: maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: categoryConfig.color,
                fillOpacity: 0.8,
                strokeColor: '#ffffff',
                strokeWeight: 1
              }
            });

            const infoWindow = new maps.InfoWindow({
              content: `
                <div style="padding: 8px; max-width: 200px;">
                  <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">${place.name}</h4>
                  <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${place.vicinity || ''}</p>
                  ${place.rating ? `<p style="margin: 0; font-size: 12px; color: #059669;">⭐ ${place.rating}/5</p>` : ''}
                </div>
              `
            });

            marker.addListener('click', () => {
              if (infoWindowRef.current) {
                infoWindowRef.current.close();
              }
              infoWindow.open(mapInstanceRef.current, marker);
            });

            markersRef.current.push(marker);
          }
        });
      }
    } catch (error) {
      console.error(`Error loading nearby ${category}:`, error);
    } finally {
      setLoadingCategory(null);
    }
  }, [park, categories]);

  // Handle category button click
  const handleCategoryClick = (categoryId) => {
    if (activeCategory === categoryId) {
      // Deselect category
      setActiveCategory(null);
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
    } else {
      // Select new category
      setActiveCategory(categoryId);
      if (!nearbyPlaces[categoryId]) {
        loadNearbyPlaces(categoryId);
      } else {
        // Re-add existing markers
        loadNearbyPlaces(categoryId);
      }
    }
  };

  // Get directions
  const handleGetDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(park.fullName)}`;
    window.open(url, '_blank');
  };

  if (!park?.latitude || !park?.longitude) {
    return (
      <div className={`rounded-2xl p-4 backdrop-blur ${className}`}
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Location
          </h3>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Location data not available
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl backdrop-blur ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {/* Header */}
      <div className="p-4 pb-3" style={{ borderBottomWidth: '1px', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Interactive Map
            </h3>
          </div>
          <button
            onClick={handleGetDirections}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition hover:scale-105"
            style={{
              backgroundColor: 'var(--surface-hover)',
              color: 'var(--text-primary)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <Navigation className="h-4 w-4" />
            <span className="hidden sm:inline">Directions</span>
          </button>
        </div>

        {/* Category Buttons - Improved Layout */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {categories.map(category => {
            const Icon = category.icon;
            const isLoading = loadingCategory === category.id;
            const isActive = activeCategory === category.id;
            const count = nearbyPlaces[category.id]?.length || 0;

            return (
              <button
                key={category.id}
                onClick={() => handleCategoryClick(category.id)}
                disabled={isLoading}
                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg text-xs font-medium transition disabled:opacity-50 hover:scale-105 min-h-[60px]"
                style={{
                  backgroundColor: isActive ? category.color : 'var(--surface-hover)',
                  color: isActive ? '#ffffff' : 'var(--text-primary)',
                  borderWidth: '1px',
                  borderColor: isActive ? category.color : 'var(--border)'
                }}
              >
                <div className="flex items-center gap-1.5">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  <span className="truncate">{category.label}</span>
                </div>
                {count > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--border)',
                        color: isActive ? '#ffffff' : 'var(--text-secondary)'
                      }}
                    >
                      {count}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Map Container */}
      <div className="relative">
        {mapError ? (
          <div className="flex flex-col items-center justify-center p-4" style={{ height: '320px', minHeight: '280px' }}>
            <div className="text-center">
              <MapPin className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                {mapError}
              </p>
              <button
                onClick={handleGetDirections}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--text-primary)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Open in Google Maps
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={mapRef}
            className="w-full"
            style={{ height: '320px', minHeight: '280px' }}
          />
        )}
        
        {!mapLoaded && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" style={{ color: 'var(--text-primary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Loading map...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Nearby Places List */}
      {activeCategory && nearbyPlaces[activeCategory] && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="p-4 pb-3">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {React.createElement(categories.find(c => c.id === activeCategory)?.icon, { className: "h-4 w-4" })}
              Nearby {categories.find(c => c.id === activeCategory)?.label}
              <span className="text-xs px-2 py-1 rounded-full font-normal"
                style={{ 
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--text-secondary)'
                }}
              >
                {nearbyPlaces[activeCategory].length} found
              </span>
            </h4>
          </div>
          <div className="max-h-40 overflow-y-auto px-4 pb-4">
            <div className="space-y-2">
              {nearbyPlaces[activeCategory].slice(0, 6).map((place, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-xl hover:scale-[1.02] transition-all cursor-pointer"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                  onClick={() => {
                    if (place.place_id) {
                      window.open(`https://www.google.com/maps/place/?q=place_id:${place.place_id}`, '_blank');
                    }
                  }}
                >
                  <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                    style={{ backgroundColor: categories.find(c => c.id === activeCategory)?.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <h5 className="text-sm font-semibold truncate mb-1" style={{ color: 'var(--text-primary)' }}>
                      {place.name}
                    </h5>
                    <p className="text-xs truncate mb-2" style={{ color: 'var(--text-secondary)' }}>
                      {place.vicinity}
                    </p>
                    {place.rating && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                            ⭐ {place.rating}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            ({place.user_ratings_total || 0})
                          </span>
                        </div>
                        {place.price_level && (
                          <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ 
                              backgroundColor: 'var(--border)',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            {'$'.repeat(place.price_level)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ExternalLink className="h-4 w-4 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                </div>
              ))}
            </div>
            {nearbyPlaces[activeCategory].length > 6 && (
              <div className="text-center mt-3">
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Showing 6 of {nearbyPlaces[activeCategory].length} places
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmbeddedParkMap;
