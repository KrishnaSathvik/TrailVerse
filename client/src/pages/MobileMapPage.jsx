import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MapPin, Star, ArrowRight, Loader2, X, Search } from '@components/icons';
import { useAllParks } from '../hooks/useParks';
import { useParkRatings } from '../hooks/useParkRatings';
import OptimizedImage from '../components/common/OptimizedImage';
import Header from '../components/common/Header';
import cacheService from '../services/cacheService';
import { useTheme } from '../context/ThemeContext';

const MobileMapPage = () => {
  const navigate = useNavigate();
  const { data: allParksData, isLoading: parksLoading } = useAllParks();
  const allParks = allParksData?.data;
  const { data: parkRatings } = useParkRatings();
  const { isDark } = useTheme();
  
  // Debug parks loading (remove in production)
  console.log('Parks loading state:', { parksLoading, allParks: allParks?.length });
  
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [selectedPark, setSelectedPark] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [mapElementReady, setMapElementReady] = useState(false);
  
  // Caching state
  const [mapStateRestored, setMapStateRestored] = useState(false);
  const [savedMapCenter, setSavedMapCenter] = useState({ lat: 39.8283, lng: -98.5795 });
  const [savedMapZoom, setSavedMapZoom] = useState(4);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  // Callback ref to detect when map element is ready
  const mapRefCallback = useCallback((node) => {
    if (node) {
      mapRef.current = node;
      setMapElementReady(true);
      console.log('Map element is ready:', node);
    }
  }, []);

  // Get rating for a park
  const getParkRating = useCallback((parkCode) => {
    if (!parkRatings || !Array.isArray(parkRatings)) return null;
    const rating = parkRatings.find(r => r.parkCode === parkCode);
    return rating ? {
      averageRating: rating.averageRating,
      totalReviews: rating.totalReviews
    } : null;
  }, [parkRatings]);

  // Cache restoration function
  const restoreMapState = useCallback(() => {
    try {
      const cacheKey = 'mobileMapState';
      const cachedState = cacheService.get(cacheKey);
      
      if (cachedState) {
        console.log('Restoring mobile map state from cache:', cachedState);
        
        if (cachedState.mapCenter && cachedState.mapZoom) {
          setSavedMapCenter(cachedState.mapCenter);
          setSavedMapZoom(cachedState.mapZoom);
        }
        
        if (cachedState.selectedPark) {
          setSelectedPark(cachedState.selectedPark);
        }
      }
    } catch (error) {
      console.error('Error restoring mobile map state:', error);
    } finally {
      setMapStateRestored(true);
    }
  }, []);

  // Cache saving function
  const saveMapState = useCallback(() => {
    try {
      const cacheKey = 'mobileMapState';
      const stateToSave = {
        mapCenter: savedMapCenter,
        mapZoom: savedMapZoom,
        selectedPark: selectedPark,
        timestamp: Date.now()
      };
      
      cacheService.set(cacheKey, stateToSave, 1000 * 60 * 60 * 24); // 24 hours TTL
      console.log('Saved mobile map state to cache:', stateToSave);
    } catch (error) {
      console.error('Error saving mobile map state:', error);
    }
  }, [savedMapCenter, savedMapZoom, selectedPark]);

  // Clear cache function
  const clearMapCache = useCallback(() => {
    try {
      const cacheKey = 'mobileMapState';
      cacheService.remove(cacheKey);
      console.log('Cleared mobile map cache');
      
      // Reset to default state
      setSavedMapCenter({ lat: 39.8283, lng: -98.5795 });
      setSavedMapZoom(4);
      setSelectedPark(null);
    } catch (error) {
      console.error('Error clearing mobile map cache:', error);
    }
  }, []);

  // Restore map state on component mount
  useEffect(() => {
    restoreMapState();
  }, [restoreMapState]);

  // Save map state when it changes
  useEffect(() => {
    if (mapStateRestored) {
      saveMapState();
    }
  }, [mapStateRestored, saveMapState]);

  // Cleanup function to save state when component unmounts
  useEffect(() => {
    return () => {
      if (mapStateRestored) {
        saveMapState();
      }
    };
  }, [mapStateRestored, saveMapState]);

  // Search functionality
  const searchParks = useCallback((query) => {
    if (!allParks || !query.trim()) {
      setSearchSuggestions([]);
      setSearchResults([]);
      return;
    }

    const queryLower = query.toLowerCase().trim();
    
    // Search through park names, states, and designations
    const matches = allParks.filter(park => {
      const fullName = park.fullName?.toLowerCase() || '';
      const states = park.states?.toLowerCase() || '';
      const designation = park.designation?.toLowerCase() || '';
      const parkCode = park.parkCode?.toLowerCase() || '';
      
      return fullName.includes(queryLower) || 
             states.includes(queryLower) || 
             designation.includes(queryLower) ||
             parkCode.includes(queryLower);
    });

    // Sort by relevance (exact matches first, then partial matches)
    const sortedMatches = matches.sort((a, b) => {
      const aName = a.fullName?.toLowerCase() || '';
      const bName = b.fullName?.toLowerCase() || '';
      
      // Exact match gets highest priority
      if (aName === queryLower) return -1;
      if (bName === queryLower) return 1;
      
      // Starts with query gets second priority
      if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1;
      if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1;
      
      // Alphabetical order for remaining matches
      return aName.localeCompare(bName);
    });

    setSearchSuggestions(sortedMatches.slice(0, 8)); // Limit to 8 suggestions
    setSearchResults(sortedMatches);
  }, [allParks]);

  // Handle search input
  const handleSearchInput = useCallback((e) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSuggestions(value.length > 0);
    
    if (value.length > 0) {
      searchParks(value);
    } else {
      setSearchSuggestions([]);
      setSearchResults([]);
    }
  }, [searchParks]);

  // Handle suggestion click
  const handleSuggestionClick = useCallback((park) => {
    setSearchQuery(park.fullName);
    setShowSuggestions(false);
    setSelectedPark(null); // Clear any selected park first
    
    // Center map on the selected park
    if (mapInstanceRef.current && park.latitude && park.longitude) {
      const parkLocation = {
        lat: parseFloat(park.latitude),
        lng: parseFloat(park.longitude)
      };
      
      mapInstanceRef.current.setCenter(parkLocation);
      mapInstanceRef.current.setZoom(12);
      
      // Update cached center and zoom
      setSavedMapCenter(parkLocation);
      setSavedMapZoom(12);
      
      // Show park info
      setSelectedPark(park);
    }
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchSuggestions([]);
    setSearchResults([]);
    setShowSuggestions(false);
  }, []);

  // Initialize Google Maps when map element is ready and cache is restored
  useEffect(() => {
    console.log('Map init effect triggered:', { 
      mapLoaded, 
      mapError, 
      mapElementReady, 
      mapStateRestored,
      mapRef: !!mapRef.current 
    });
    
    const initializeMap = async () => {
      try {
        // Check if map ref is ready and cache is restored
        if (!mapRef.current || !mapElementReady || !mapStateRestored) {
          console.log('Map ref not ready or cache not restored yet, will retry...');
          return;
        }

        // Load Google Maps API
        const { loadMaps } = await import('../lib/loadMaps');
        const apiKey = import.meta.env.VITE_GMAPS_WEB_KEY;
        
        if (!apiKey) {
          console.error('Google Maps API key not found');
          setMapError('Google Maps API key not configured');
          return;
        }
        
        await loadMaps(apiKey, ['places']);
        
        if (!window.google?.maps) {
          throw new Error('Google Maps failed to load');
        }
        
        const maps = window.google.maps;
        
        // Use cached center and zoom if available, otherwise use defaults
        const center = savedMapCenter || { lat: 39.8283, lng: -98.5795 };
        const zoom = savedMapZoom || 4;

        mapInstanceRef.current = new maps.Map(mapRef.current, {
          center: center,
          zoom: zoom,
          mapTypeId: maps.MapTypeId.TERRAIN,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
          styles: isDark ? [
            // Dark mode styles
            { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
            {
              featureType: 'administrative.locality',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#d1d5db' }]
            },
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.park',
              elementType: 'geometry',
              stylers: [{ color: '#263c3f' }]
            },
            {
              featureType: 'poi.park',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#6b9a76' }]
            },
            {
              featureType: 'road',
              elementType: 'geometry',
              stylers: [{ color: '#2c2c2c' }]
            },
            {
              featureType: 'road',
              elementType: 'geometry.stroke',
              stylers: [{ color: '#212a37' }]
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry',
              stylers: [{ color: '#3c3c3c' }]
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry.stroke',
              stylers: [{ color: '#1f2835' }]
            },
            {
              featureType: 'transit',
              elementType: 'geometry',
              stylers: [{ color: '#2f3948' }]
            },
            {
              featureType: 'water',
              elementType: 'geometry',
              stylers: [{ color: '#0f1419' }]
            },
            {
              featureType: 'water',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#4b5563' }]
            }
          ] : [
            // Light mode styles
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            }
          ]
        });

        // Add event listeners to track map center and zoom changes
        maps.event.addListener(mapInstanceRef.current, 'center_changed', () => {
          const center = mapInstanceRef.current.getCenter();
          if (center) {
            setSavedMapCenter({
              lat: center.lat(),
              lng: center.lng()
            });
          }
        });

        maps.event.addListener(mapInstanceRef.current, 'zoom_changed', () => {
          const zoom = mapInstanceRef.current.getZoom();
          setSavedMapZoom(zoom);
        });

        setMapLoaded(true);
        console.log('Mobile map initialized successfully');
      } catch (error) {
        console.error('Error loading map:', error);
        setMapError('Failed to load map. Please check your internet connection.');
      }
    };

    // Initialize map when element is ready
    if (mapElementReady && !mapLoaded && !mapError) {
      initializeMap();
    }
  }, [mapElementReady, mapLoaded, mapError, mapStateRestored, savedMapCenter, savedMapZoom]); // Run when mapElementReady changes or cache is restored

  // Handle park selection with caching
  const handleParkSelection = useCallback((park) => {
    setSelectedPark(park);
    
    // Update map center to the selected park
    if (mapInstanceRef.current && park.latitude && park.longitude) {
      const parkLocation = {
        lat: parseFloat(park.latitude),
        lng: parseFloat(park.longitude)
      };
      
      mapInstanceRef.current.setCenter(parkLocation);
      mapInstanceRef.current.setZoom(10); // Zoom in when park is selected
      
      // Update cached center and zoom
      setSavedMapCenter(parkLocation);
      setSavedMapZoom(10);
    }
  }, []);

  // Add park markers when map is loaded and parks data is available
  useEffect(() => {
    console.log('Marker effect triggered:', { mapLoaded, allParks: allParks?.length, mapInstance: !!mapInstanceRef.current });
    
    if (!mapLoaded || !allParks || !mapInstanceRef.current) return;

    console.log('Adding markers for', allParks.length, 'parks');

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Filter parks that have valid coordinates
    const parksWithCoordinates = allParks.filter(park => 
      park.latitude && 
      park.longitude && 
      !isNaN(parseFloat(park.latitude)) && 
      !isNaN(parseFloat(park.longitude))
    );

    console.log('Parks with valid coordinates:', parksWithCoordinates.length);

    // Add markers for each park
    parksWithCoordinates.forEach(park => {
      const lat = parseFloat(park.latitude);
      const lng = parseFloat(park.longitude);

      if (!isFinite(lat) || !isFinite(lng)) return;

      const marker = new window.google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        title: park.fullName,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: park.designation === 'National Park' ? '#10b981' : '#3b82f6',
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      // Add click listener to show park info
      marker.addListener('click', () => {
        handleParkSelection(park);
      });

      markersRef.current.push(marker);
    });

    console.log('Added', markersRef.current.length, 'markers to map');
  }, [mapLoaded, allParks, handleParkSelection]);

  // Close park info card
  const closeParkInfo = () => {
    setSelectedPark(null);
  };

  // Navigate to park details
  const viewParkDetails = (parkCode) => {
    navigate(`/parks/${parkCode}`, { 
      state: { fromMobileMap: true } 
    });
  };

  if (parksLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <Helmet>
          <title>Map - Trailverse</title>
        </Helmet>
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-green-600 animate-spin mx-auto mb-4" />
          <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading parks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Helmet>
        <title>Explore Parks Map - Trailverse</title>
        <meta name="description" content="Explore all National Parks on an interactive map" />
      </Helmet>

      {/* Header */}
      <Header />

      {/* Search Bar */}
      <div className={`relative px-4 py-3 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            placeholder="Search parks..."
            className={`w-full pl-10 pr-10 py-3 rounded-lg border transition-colors ${
              isDark 
                ? 'bg-gray-900 text-white border-gray-600 placeholder-gray-400 focus:border-blue-500' 
                : 'bg-gray-50 text-gray-900 border-gray-300 placeholder-gray-500 focus:border-blue-500'
            } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-opacity-20 ${
                isDark ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-200'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search Suggestions */}
        {showSuggestions && searchSuggestions.length > 0 && (
          <div className={`absolute top-full left-4 right-4 mt-1 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto ${
            isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
          }`}>
            {searchSuggestions.map((park, index) => (
              <button
                key={`${park.parkCode}-${index}`}
                onClick={() => handleSuggestionClick(park)}
                className={`w-full px-4 py-3 text-left border-b last:border-b-0 hover:bg-opacity-50 transition-colors ${
                  isDark 
                    ? 'text-white border-gray-700 hover:bg-gray-700' 
                    : 'text-gray-900 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <MapPin className={`h-4 w-4 flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {park.fullName}
                    </p>
                    <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {park.states} • {park.designation}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Container */}
      <div className="relative flex-1 w-full overflow-hidden" style={{ height: 'calc(100vh - 64px - 80px)' }}>
        <div ref={mapRefCallback} className="w-full h-full" />
        
        {/* Map Loading Overlay */}
        {!mapLoaded && !mapError && (
          <div className={`absolute inset-0 flex items-center justify-center z-10 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-green-600 animate-spin mx-auto mb-4" />
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading map...</p>
            </div>
          </div>
        )}

      {/* Error Message */}
      {mapError && (
        <div className={`absolute top-4 left-4 right-4 rounded-lg p-4 shadow-lg z-10 ${
          isDark 
            ? 'bg-red-900/90 border border-red-700 text-red-200' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <p className="text-sm">{mapError}</p>
        </div>
      )}

      {/* Loading Overlay */}
      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-20">
          <div className="text-center">
            <Loader2 className="h-12 w-12 text-green-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading map...</p>
          </div>
        </div>
      )}

      {/* Park Info Card - Bottom Sheet Style */}
      {selectedPark && (
        <div className={`absolute bottom-0 left-0 right-0 rounded-t-3xl shadow-2xl z-30 animate-slide-up ${
          isDark ? 'bg-gray-800' : 'bg-white'
        }`}>
          {/* Handle Bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className={`w-12 h-1 rounded-full ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
          </div>

          {/* Close Button */}
          <button
            onClick={closeParkInfo}
            className={`absolute top-4 right-4 p-2 rounded-full transition ${
              isDark 
                ? 'bg-gray-700 hover:bg-gray-600' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <X className={`h-5 w-5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
          </button>

          {/* Park Content */}
          <div className="px-4 pb-6 max-h-[70vh] overflow-y-auto">
            {/* Park Image */}
            {selectedPark.images && selectedPark.images.length > 0 && (
              <div className="mb-4 -mx-4">
                <OptimizedImage
                  src={selectedPark.images[0].url}
                  alt={selectedPark.images[0].altText || selectedPark.fullName}
                  className="w-full h-48 object-cover"
                  loading="eager"
                />
              </div>
            )}

            {/* Park Info */}
            <div className="space-y-3">
              {/* Designation Badge */}
              <div className="inline-block">
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                  isDark 
                    ? 'bg-green-900/50 text-green-300' 
                    : 'bg-green-100 text-green-800'
                }`}>
                  {selectedPark.designation}
                </span>
              </div>

              {/* Park Name */}
              <h2 className={`text-2xl font-bold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {selectedPark.fullName}
              </h2>

              {/* Location */}
              <div className={`flex items-center gap-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{selectedPark.states}</span>
              </div>

              {/* Rating */}
              {(() => {
                const rating = getParkRating(selectedPark.parkCode);
                if (rating && rating.totalReviews > 0) {
                  return (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {rating.averageRating.toFixed(1)}
                        </span>
                      </div>
                      <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        ({rating.totalReviews} {rating.totalReviews === 1 ? 'review' : 'reviews'})
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Description */}
              <p className={`text-sm leading-relaxed line-clamp-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                {selectedPark.description}
              </p>

              {/* View Details Button */}
              <button
                onClick={() => viewParkDetails(selectedPark.parkCode)}
                className="w-full mt-4 bg-green-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                View Details
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Legend - Top Right */}
      <div className={`absolute top-4 right-4 rounded-lg shadow-lg p-3 z-10 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full bg-green-500 border-2 ${isDark ? 'border-gray-800' : 'border-white'}`} />
            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>National Park</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full bg-blue-500 border-2 ${isDark ? 'border-gray-800' : 'border-white'}`} />
            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>Other Sites</span>
          </div>
        </div>
      </div>

      {/* Parks Count - Top Left */}
        {allParks && (
          <div className={`absolute top-4 left-4 rounded-lg shadow-lg px-4 py-2 z-10 ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {allParks.filter(p => p.latitude && p.longitude).length} Parks
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileMapPage;

