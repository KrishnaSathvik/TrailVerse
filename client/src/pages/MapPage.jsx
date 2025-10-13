import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ArrowLeft, MapPin, Utensils, Bed, Fuel, 
  Search, X, Loader2, ExternalLink, Route, Clock, 
  ChevronRight, Star, DollarSign, Phone,
  Heart, Calendar, ChevronDown, ChevronUp, Info
} from '@components/icons';
import Header from '../components/common/Header';
import SEO from '../components/common/SEO';
import { useToast } from '../context/ToastContext';
import { googlePlacesService as gps } from '../services/googlePlacesService';
import { useTheme } from '../context/ThemeContext';

const MapPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isDark } = useTheme();
  
  // Get park data from navigation state
  const parkData = location.state?.park;
  
  // Refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const infoWindowRef = useRef(null);
  
  // State declarations
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState({});
  const [loadingCategory, setLoadingCategory] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [showSidebar, setShowSidebar] = useState(!!parkData); // Show sidebar if coming from park details
  const [sidebarContent, setSidebarContent] = useState(parkData ? 'park' : 'search'); // 'search', 'park', 'place'
  const [routeInfo, setRouteInfo] = useState(null);
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [savedMapCenter, setSavedMapCenter] = useState(null);
  const [savedMapZoom, setSavedMapZoom] = useState(null);
  const [localStorageRestored, setLocalStorageRestored] = useState(false);
  
  // Route planning state
  const [routeWaypoints, setRouteWaypoints] = useState([]);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);

  // Save search state to localStorage with proper photo handling
  useEffect(() => {
    if (selectedPlace || searchResults.length > 0) {
      // Helper function to extract photo data properly
      const extractPhotoData = (photos) => {
        if (!photos || !Array.isArray(photos)) return [];
        
        return photos.map(photo => {
          console.log('Extracting photo data:', photo);
          
          // Try to get the actual photo URL from getUrl method
          let photoUrl = null;
          if (typeof photo.getUrl === 'function') {
            try {
              photoUrl = photo.getUrl({ maxWidth: 400 });
              console.log('Extracted photo URL:', photoUrl);
    } catch (error) {
              console.error('Error calling getUrl:', error);
            }
          }
          
          return {
            url: photoUrl || photo.url, // Save the actual URL
            height: photo.height,
            width: photo.width,
            // Try to extract photo_reference as backup
            photo_reference: photo.photo_reference || photo.photoReference || 
                           (photoUrl && photoUrl.match(/photo_reference=([^&]+)/)?.[1])
          };
        }).filter(photo => photo.url); // Only keep photos with valid URLs
      };
      
      // Helper function to extract coordinates from Google Maps objects
      const extractCoordinates = (place) => {
        if (!place) return null;
        
        let lat, lng;
        
        // Try different ways to extract coordinates
        if (place.lat && place.lng) {
          lat = typeof place.lat === 'function' ? place.lat() : place.lat;
          lng = typeof place.lng === 'function' ? place.lng() : place.lng;
        } else if (place.geometry?.location) {
          const location = place.geometry.location;
          lat = typeof location.lat === 'function' ? location.lat() : location.lat;
          lng = typeof location.lng === 'function' ? location.lng() : location.lng;
        } else if (place.latitude && place.longitude) {
          lat = place.latitude;
          lng = place.longitude;
        }
        
        // Convert to numbers if they're strings
        lat = typeof lat === 'string' ? parseFloat(lat) : lat;
        lng = typeof lng === 'string' ? parseFloat(lng) : lng;
        
        return { lat, lng };
      };
      
      const serializableState = {
        selectedPlace: selectedPlace ? {
          ...selectedPlace,
          photos: extractPhotoData(selectedPlace.photos),
          // Extract and save coordinates as plain numbers
          lat: extractCoordinates(selectedPlace)?.lat,
          lng: extractCoordinates(selectedPlace)?.lng
        } : null,
        searchResults: searchResults.map(result => ({
          ...result,
          photos: extractPhotoData(result.photos),
          // Extract and save coordinates as plain numbers
          lat: extractCoordinates(result)?.lat,
          lng: extractCoordinates(result)?.lng
        })),
        searchQuery,
        showSidebar,
        sidebarContent,
        mapCenter: savedMapCenter,
        mapZoom: savedMapZoom
      };
      
      console.log('Saving state with photos and map position:', serializableState);
      localStorage.setItem('mapSearchState', JSON.stringify(serializableState));
    }
  }, [selectedPlace, searchResults, searchQuery, showSidebar, sidebarContent, savedMapCenter, savedMapZoom]);

  // Restore search state from localStorage on page load
  useEffect(() => {
    if (!parkData) {
      const savedState = localStorage.getItem('mapSearchState');
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          if (parsed.selectedPlace || parsed.searchResults?.length > 0) {
            // Helper function to reconstruct photos with saved URLs
            const reconstructPhotos = (photos) => {
              if (!photos || !Array.isArray(photos)) return [];
              
              return photos.map(photo => {
                console.log('Reconstructing photo:', photo);
                
                if (!photo.url) {
                  console.warn('No photo URL found for photo:', photo);
                  return null;
                }
                
                return {
                  ...photo,
                  // Use the saved URL directly
                  getUrl: (options = {}) => {
                    console.log('Using saved photo URL:', photo.url);
                    return photo.url;
                  }
                };
              }).filter(photo => photo !== null);
            };
            
            // Restore state with reconstructed photos
            const restoredSelectedPlace = parsed.selectedPlace ? {
              ...parsed.selectedPlace,
              photos: reconstructPhotos(parsed.selectedPlace.photos)
            } : null;
            
            const restoredSearchResults = parsed.searchResults?.map(result => ({
              ...result,
              photos: reconstructPhotos(result.photos)
            })) || [];
            
            setSelectedPlace(restoredSelectedPlace);
            setSearchResults(restoredSearchResults);
            setSearchQuery(parsed.searchQuery || '');
            setShowSidebar(parsed.showSidebar || false);
            setSidebarContent(parsed.sidebarContent || 'search');
            
            // Restore map position
            if (parsed.mapCenter && parsed.mapZoom) {
              setSavedMapCenter(parsed.mapCenter);
              setSavedMapZoom(parsed.mapZoom);
              console.log('Restored map position:', parsed.mapCenter, 'zoom:', parsed.mapZoom);
            }
            
            console.log('Restored search state from localStorage with photos and map position:', {
              selectedPlacePhotos: restoredSelectedPlace?.photos?.length || 0,
              searchResultsPhotos: restoredSearchResults.reduce((total, result) => total + (result.photos?.length || 0), 0),
              mapCenter: parsed.mapCenter,
              mapZoom: parsed.mapZoom
            });
          }
        } catch (error) {
          console.error('Error parsing saved search state:', error);
          localStorage.removeItem('mapSearchState');
        }
      }
      
      // Mark localStorage restoration as complete
      setLocalStorageRestored(true);
    }
  }, [parkData]);


  // Add marker for selected place when restored from localStorage (only when not coming from park data)
  useEffect(() => {
    // Only run this effect when restoring from localStorage, not when clicking markers during normal usage
    if (mapInstanceRef.current && selectedPlace && !parkData && mapLoaded && localStorageRestored) {
      console.log('Marker useEffect triggered:', {
        mapReady: !!mapInstanceRef.current,
        selectedPlace: selectedPlace.name,
        mapLoaded,
        parkData: !!parkData
      });
      
      // Only clear existing markers if this is a restoration from localStorage
      // (not when clicking on markers during normal usage)
      if (localStorageRestored && !parkData) {
        console.log('Clearing markers for localStorage restoration');
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];
      }
      
      // Add marker for the selected place - handle different coordinate formats
      let lat, lng;
      
      // Try different ways to extract coordinates
      if (selectedPlace.lat && selectedPlace.lng) {
        lat = typeof selectedPlace.lat === 'function' ? selectedPlace.lat() : selectedPlace.lat;
        lng = typeof selectedPlace.lng === 'function' ? selectedPlace.lng() : selectedPlace.lng;
      } else if (selectedPlace.geometry?.location) {
        const location = selectedPlace.geometry.location;
        lat = typeof location.lat === 'function' ? location.lat() : location.lat;
        lng = typeof location.lng === 'function' ? location.lng() : location.lng;
      } else if (selectedPlace.latitude && selectedPlace.longitude) {
        lat = selectedPlace.latitude;
        lng = selectedPlace.longitude;
      }
      
      // Convert to numbers if they're strings
      lat = typeof lat === 'string' ? parseFloat(lat) : lat;
      lng = typeof lng === 'string' ? parseFloat(lng) : lng;
      
      console.log('Marker coordinates:', { lat, lng, type: typeof lat, selectedPlace });
      
      if (lat && lng && typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        console.log('Adding marker for restored selected place:', selectedPlace.name, 'at:', { lat, lng });
        
        const marker = new window.google.maps.Marker({
          position: { lat, lng },
          map: mapInstanceRef.current,
          title: selectedPlace.name,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 8
          }
        });
        
        markersRef.current.push(marker);
        console.log('Marker added successfully, total markers:', markersRef.current.length);
      } else {
        console.error('Invalid coordinates for marker:', { lat, lng, selectedPlace });
      }
    } else {
      console.log('Marker useEffect conditions not met:', {
        mapReady: !!mapInstanceRef.current,
        selectedPlace: !!selectedPlace,
        parkData: !!parkData,
        mapLoaded
      });
    }
  }, [localStorageRestored]); // Only depend on localStorageRestored, not selectedPlace

  // Categories for nearby services
  const categories = [
    { id: 'restaurant', label: 'Restaurants', icon: Utensils, color: '#10b981' },
    { id: 'lodging', label: 'Hotels', icon: Bed, color: '#3b82f6' },
    { id: 'gas_station', label: 'Gas', icon: Fuel, color: '#f59e0b' },
    { id: 'tourist_attraction', label: 'Things to Do', icon: Calendar, color: '#8b5cf6' },
    { id: 'routes', label: 'Routes', icon: Route, color: '#9B59B6' }
  ];

  // Initialize map - wait for localStorage restoration if coming from direct access
  useEffect(() => {
    // If not coming from park data, wait for localStorage to be restored
    if (!parkData && !localStorageRestored) {
          return;
        }

    const initializeMap = async () => {
      try {
        // Load Google Maps API
        const { loadMaps } = await import('../lib/loadMaps');
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

        // Set default center (US center) or use park location
        // Use saved map position if available, otherwise use park data or default
        const defaultCenter = savedMapCenter || 
          (parkData?.latitude && parkData?.longitude 
            ? { lat: parseFloat(parkData.latitude), lng: parseFloat(parkData.longitude) }
            : { lat: 39.8283, lng: -98.5795 });
        const defaultZoom = savedMapZoom || (parkData ? 12 : 4);

        // Create map instance
        mapInstanceRef.current = new maps.Map(mapRef.current, {
          center: defaultCenter,
          zoom: defaultZoom,
          mapTypeId: maps.MapTypeId.TERRAIN,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: true,
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

        // Initialize directions service
        directionsServiceRef.current = new maps.DirectionsService();
        directionsRendererRef.current = new maps.DirectionsRenderer({
          draggable: true,
          suppressMarkers: false
        });

        // Add park marker if park data exists
        if (parkData?.latitude && parkData?.longitude) {
          const parkMarker = new maps.Marker({
            position: { lat: parseFloat(parkData.latitude), lng: parseFloat(parkData.longitude) },
            map: mapInstanceRef.current,
            title: parkData.fullName,
                icon: {
                path: maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#059669',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3
              }
          });

          // Add park info window
          infoWindowRef.current = new maps.InfoWindow({
            content: `
              <div style="padding: 12px; max-width: 250px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1f2937;">${parkData.fullName}</h3>
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">${parkData.states}</p>
                <p style="margin: 0; font-size: 12px; color: #9ca3af;">${parkData.description.substring(0, 100)}...</p>
                   </div>
            `
          });

          parkMarker.addListener('click', () => {
            infoWindowRef.current.open(mapInstanceRef.current, parkMarker);
            setSidebarContent('park');
            setShowSidebar(true);
          });

          // Set route destination to park
          setRouteTo(parkData.fullName);
        }

        // Add map click listener to show park info when clicking on empty map areas
        mapInstanceRef.current.addListener('click', (event) => {
          console.log('Map clicked at:', event.latLng);
              
              // Close any existing info window
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
          
          // If we have park data, show park info in sidebar
          if (parkData) {
            setSidebarContent('park');
            setShowSidebar(true);
            setSelectedPlace(null);
          }
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
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
    };
  }, [parkData, localStorageRestored]);

  // Search for places
  const handleSearch = useCallback(async (query) => {
    if (!query.trim() || !mapInstanceRef.current) return;

            setIsSearching(true);
            try {
      // Use Google Places API for search
      const service = new window.google.maps.places.PlacesService(mapInstanceRef.current);
      
      const request = {
        query: query,
        fields: ['place_id', 'name', 'geometry', 'formatted_address', 'rating', 'user_ratings_total', 'photos', 'price_level', 'opening_hours']
      };

      service.textSearch(request, (results, status) => {
        setIsSearching(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          setSearchResults(results.slice(0, 20));
          setSidebarContent('search');
          setShowSidebar(true);
          
          // Clear existing search markers
          markersRef.current.forEach(marker => marker.setMap(null));
          markersRef.current = [];

          // Add markers for search results
          results.slice(0, 20).forEach((place, index) => {
            if (place.geometry?.location) {
              const marker = new window.google.maps.Marker({
                position: place.geometry.location,
                map: mapInstanceRef.current,
                title: place.name,
                icon: {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#8b5cf6',
                  fillOpacity: 0.8,
                  strokeColor: '#ffffff',
                  strokeWeight: 2
                }
              });

              const infoWindow = new window.google.maps.InfoWindow({
                content: `
                  <div style="padding: 8px; max-width: 200px;">
                    <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">${place.name}</h4>
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${place.formatted_address}</p>
                    ${place.rating ? `<p style="margin: 0; font-size: 12px; color: #059669;">⭐ ${place.rating}/5</p>` : ''}
                            </div>
                `
              });

              marker.addListener('click', () => {
                console.log('Marker clicked:', place.name);
              
              // Close any existing info window
                if (infoWindowRef.current) {
                  infoWindowRef.current.close();
                }
                
                // Update sidebar with place details (NO popup on map)
                setSelectedPlace(place);
                setSidebarContent('place');
                setShowSidebar(true);
                
                console.log('Updated sidebar with place:', place.name);
              });

              markersRef.current.push(marker);
            }
          });
          } else {
          setSearchResults([]);
        }
      });
    } catch (error) {
      console.error('Search error:', error);
      setIsSearching(false);
    }
  }, []);

  // Handle map search (from map search bar) - centers map on first result
  const handleMapSearch = useCallback(async () => {
    if (!searchQuery.trim() || !mapInstanceRef.current) return;

            setIsSearching(true);
            try {
      // Use Google Places API for search
      const service = new window.google.maps.places.PlacesService(mapInstanceRef.current);
      
      const request = {
        query: searchQuery,
        fields: ['place_id', 'name', 'geometry', 'formatted_address', 'rating', 'user_ratings_total', 'photos', 'price_level', 'opening_hours', 'website', 'formatted_phone_number', 'types', 'vicinity', 'reviews']
      };

      service.textSearch(request, (results, status) => {
        setIsSearching(false);
        
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          // Take the first result and center the map on it
          const firstResult = results[0];
          
          if (firstResult.geometry?.location) {
            const location = firstResult.geometry.location;
            const lat = location.lat();
            const lng = location.lng();
            
            // Validate coordinates before setting map center
            if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              console.log('Centering map on:', firstResult.name, 'at:', lat, lng);
              
              // Center map on the searched location with a zoomed out view to show the pin
              mapInstanceRef.current.setCenter(location);
              mapInstanceRef.current.setZoom(12);
              
              // Save map position for persistence
              setSavedMapCenter({ lat, lng });
              setSavedMapZoom(12);
            } else {
              console.error('Invalid coordinates for:', firstResult.name, 'lat:', lat, 'lng:', lng);
              return;
            }
            
            // Clear existing markers
            markersRef.current.forEach(marker => marker.setMap(null));
            markersRef.current = [];
            
            // Add marker for the searched place
            const marker = new window.google.maps.Marker({
              position: location,
              map: mapInstanceRef.current,
              title: firstResult.name,
                 icon: {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: '#ef4444',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 3
                }
            });

            markersRef.current.push(marker);
            
            // Always show place info card directly (like Google Maps)
            console.log('Fetching full details for:', firstResult.name);
            const detailsService = new window.google.maps.places.PlacesService(mapInstanceRef.current);
            const detailsRequest = {
              placeId: firstResult.place_id,
              fields: ['place_id', 'name', 'geometry', 'formatted_address', 'rating', 'user_ratings_total', 'photos', 'price_level', 'opening_hours', 'website', 'formatted_phone_number', 'types', 'vicinity', 'reviews']
            };
            
              detailsService.getDetails(detailsRequest, (place, status) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
                  console.log('Place details received:', place);
                  console.log('Photos available:', place.photos);
                  console.log('Photos array length:', place.photos?.length || 0);
                  console.log('Full place object keys:', Object.keys(place));
                  if (place.photos && place.photos.length > 0) {
                    console.log('First photo object:', place.photos[0]);
                    console.log('First photo keys:', Object.keys(place.photos[0]));
                  }
                  setSelectedPlace(place);
                  setSidebarContent('place');
                  setShowSidebar(true);
                  setActiveCategory(null);
                  console.log('Showing place info card for:', place.name);
                } else {
                // Fallback to basic result if details fail
                console.log('Details fetch failed, using basic result');
                setSelectedPlace(firstResult);
                setSidebarContent('place');
                setShowSidebar(true);
                setActiveCategory(null);
              }
            });
            
            console.log('Map successfully centered on:', firstResult.name, 'at coordinates:', location.lat(), location.lng());
          } else {
            console.error('No geometry.location found for:', firstResult.name);
          }
        } else {
          console.log('No results found for:', searchQuery);
        }
      });
    } catch (error) {
      console.error('Map search error:', error);
                    setIsSearching(false);
                  }
  }, [searchQuery]);

  // Handle search suggestions (autocomplete)
  const handleSearchSuggestions = useCallback(async (query) => {
    if (!query.trim() || query.length < 2 || !mapInstanceRef.current) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const service = new window.google.maps.places.AutocompleteService();
      const request = {
        input: query,
        types: ['geocode', 'establishment']
      };

      service.getPlacePredictions(request, (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSearchSuggestions(predictions.slice(0, 5)); // Limit to 5 suggestions
          setShowSuggestions(true);
        } else {
          setSearchSuggestions([]);
          setShowSuggestions(false);
        }
      });
    } catch (error) {
      console.error('Suggestions error:', error);
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  // Load nearby places by category
  const loadNearbyPlaces = useCallback(async (category) => {
    if (!mapInstanceRef.current) {
      console.error('Map instance not available');
      return;
    }

    setLoadingCategory(category);
    console.log('Loading nearby places for category:', category);
    
    try {
      const center = mapInstanceRef.current.getCenter();
      console.log('Map center:', { lat: center.lat(), lng: center.lng() });
      
      // For "Things to Do", make it park-specific if we have park data
      let searchCategory = category;
      if (category === 'tourist_attraction' && parkData) {
        // For park-specific attractions, we'll use a text search with the park name
        // This will be handled differently in the API call
        searchCategory = 'tourist_attraction_park_specific';
      }
      
      const places = await gps.getNearby(
        center.lat(),
        center.lng(),
        searchCategory,
        50000, // 31 miles radius (50km) - larger radius to get more options for top 10
        parkData?.fullName // Pass park name for park-specific searches
      );

      console.log(`Loaded ${places.length} places for category ${category}:`, places);

      setNearbyPlaces(prev => ({
        ...prev,
        [category]: places
      }));

      // Only change sidebar content if we're not in route mode
      if (activeCategory !== 'routes') {
        setSidebarContent('search');
      }
      setShowSidebar(true);

      // Add markers to map
      if (places.length > 0) {
        const maps = window.google.maps;
        
        // Clear existing category markers
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        const categoryConfig = categories.find(c => c.id === category);
        
        places.slice(0, 10).forEach(place => {
          // Handle both backend API format and Google Places API format
          const lat = place.lat || place.geometry?.location?.lat;
          const lng = place.lng || place.geometry?.location?.lng;
          
          if (lat && lng) {
            console.log(`Adding marker for ${place.name} at:`, { lat, lng });
            
            const marker = new maps.Marker({
              position: { lat, lng },
              map: mapInstanceRef.current,
              title: place.name,
              icon: {
                path: maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: categoryConfig.color,
                fillOpacity: 0.9,
                strokeColor: '#ffffff',
                strokeWeight: 3
              }
            });

            const infoWindow = new maps.InfoWindow({
              content: `
                <div style="padding: 12px; max-width: 250px;">
                  <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1f2937;">${place.name}</h4>
                  <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">${place.address || place.vicinity || ''}</p>
                  ${place.rating ? `<p style="margin: 0; font-size: 14px; color: #059669;">⭐ ${place.rating}/5 (${place.user_ratings_total || 0})</p>` : ''}
                      </div>
              `
            });

            marker.addListener('click', () => {
              console.log('Nearby marker clicked:', place.name);
                
                // Close any existing info window
              if (infoWindowRef.current) {
                infoWindowRef.current.close();
              }
              
              // Check if we're in route mode
              if (activeCategory === 'routes') {
                // In route mode - show minimal place card with just name and add to route
                setSelectedPlace(place);
                setSidebarContent('route-place');
                setShowSidebar(true);
                    } else {
                // Normal mode - show full place details
                setSelectedPlace(place);
                setSidebarContent('place');
                setShowSidebar(true);
              }
              
              console.log('Updated sidebar with nearby place:', place.name);
            });

            markersRef.current.push(marker);
                    } else {
            console.warn(`Place ${place.name} has no coordinates:`, place);
          }
        });
        
        console.log(`Added ${markersRef.current.length} markers to map`);
        
        // Auto-zoom to show all places
        if (markersRef.current.length > 0) {
          const bounds = new window.google.maps.LatLngBounds();
          
          // Extend bounds to include all markers
          markersRef.current.forEach(marker => {
              bounds.extend(marker.getPosition());
            });
          
          // Also include the current map center to ensure context
          const currentCenter = mapInstanceRef.current.getCenter();
          bounds.extend(currentCenter);
          
          // Fit the map to show all markers with some padding
          mapInstanceRef.current.fitBounds(bounds);
          
          // Set a minimum zoom level to prevent zooming out too far
          const listener = window.google.maps.event.addListener(mapInstanceRef.current, 'idle', () => {
            if (mapInstanceRef.current.getZoom() > 15) {
              mapInstanceRef.current.setZoom(15);
            }
            window.google.maps.event.removeListener(listener);
          });
          
          console.log('Map bounds adjusted to show all places');
        }
      }
                } catch (error) {
      console.error(`Error loading nearby ${category}:`, error);
    } finally {
      setLoadingCategory(null);
    }
  }, [categories]);

  // Route planning functions
  const addWaypoint = useCallback((place) => {
    setRouteWaypoints(prev => [...prev, {
      id: Date.now(),
      name: place.name,
      address: place.formatted_address || place.vicinity,
      lat: place.lat || place.geometry?.location?.lat,
      lng: place.lng || place.geometry?.location?.lng
    }]);
    
    // Show success toast
    showToast(`${place.name} added to route!`, 'success', 3000);
  }, [showToast]);

  const removeWaypoint = useCallback((id) => {
    const waypoint = routeWaypoints.find(wp => wp.id === id);
    setRouteWaypoints(prev => prev.filter(wp => wp.id !== id));
    
    if (waypoint) {
      showToast(`${waypoint.name} removed from route`, 'info', 2000);
    }
  }, [routeWaypoints, showToast]);

  // Drag and drop functions
  const handleDragStart = useCallback((e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
    e.target.style.opacity = '0.5';
  }, []);

  const handleDragEnd = useCallback((e) => {
    e.target.style.opacity = '1';
    setDraggedItem(null);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    
    if (draggedItem === null || draggedItem === dropIndex) {
      return;
    }

    const newWaypoints = [...routeWaypoints];
    const draggedWaypoint = newWaypoints[draggedItem];
    
    // Remove dragged item from original position
    newWaypoints.splice(draggedItem, 1);
    
    // Insert dragged item at new position
    newWaypoints.splice(dropIndex, 0, draggedWaypoint);
    
    setRouteWaypoints(newWaypoints);
    showToast('Route order updated!', 'success', 2000);
    
    // Auto-recalculate route if it was already calculated
    if (routeInfo && newWaypoints.length >= 2) {
      // Update routeWaypoints state first, then trigger recalculation
      setTimeout(() => {
        calculateRouteWithWaypoints(newWaypoints);
      }, 100);
    }
  }, [draggedItem, routeWaypoints, routeInfo, showToast]);

  const calculateRouteWithWaypoints = useCallback(async (waypointsToUse = routeWaypoints) => {
    if (waypointsToUse.length < 2) {
      return;
    }

    if (!mapInstanceRef.current) return;

    try {
      const directionsService = new window.google.maps.DirectionsService();
      
      // Clear existing route
      if (directionsRenderer) {
        directionsRenderer.setMap(null);
      }

      const newDirectionsRenderer = new window.google.maps.DirectionsRenderer({
        draggable: false,
        suppressMarkers: false,
              polylineOptions: {
          strokeColor: '#9B59B6',
                strokeWeight: 4,
                strokeOpacity: 0.8
              }
            });

      newDirectionsRenderer.setMap(mapInstanceRef.current);
      setDirectionsRenderer(newDirectionsRenderer);

      const waypoints = waypointsToUse.slice(1, -1).map(wp => ({
        location: { lat: wp.lat, lng: wp.lng },
      stopover: true
    }));

    const request = {
        origin: { lat: waypointsToUse[0].lat, lng: waypointsToUse[0].lng },
        destination: { lat: waypointsToUse[waypointsToUse.length - 1].lat, lng: waypointsToUse[waypointsToUse.length - 1].lng },
        waypoints: waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL
      };

      directionsService.route(request, (result, status) => {
        if (status === 'OK') {
          newDirectionsRenderer.setDirections(result);
          
          const route = result.routes[0];
          
          setRouteInfo({
            distance: route.legs.reduce((total, leg) => total + leg.distance.value, 0),
            duration: route.legs.reduce((total, leg) => total + leg.duration.value, 0),
            legs: route.legs
          });
          
          console.log('Route recalculated successfully');
      } else {
          console.error('Directions request failed:', status);
        }
      });
    } catch (error) {
      console.error('Error calculating route:', error);
    }
  }, [routeWaypoints, directionsRenderer]);

  const calculateRoute = useCallback(async () => {
    if (routeWaypoints.length < 2) {
      alert('Please add at least 2 waypoints to calculate a route');
      return;
    }

    await calculateRouteWithWaypoints(routeWaypoints);
    showToast('Route calculated successfully!', 'success', 3000);
  }, [routeWaypoints, calculateRouteWithWaypoints, showToast]);

  // Handle category button click
  const handleCategoryClick = (categoryId) => {
    console.log('Category button clicked:', categoryId);
    console.log('Current active category:', activeCategory);
    console.log('Current nearby places:', nearbyPlaces);
    console.log('Is in route mode?', activeCategory === 'routes');
    
    if (categoryId === 'routes') {
      // Handle routes category specially
      setActiveCategory('routes');
      setSidebarContent('routes');
      setShowSidebar(true);
    } else if (activeCategory === 'routes' && categoryId !== 'routes') {
      // When in route mode, clicking other categories should show pins and keep route sidebar open
      console.log('In route mode - loading category pins:', categoryId);
      setActiveCategory(categoryId);
      setSearchQuery(''); // Clear search when selecting category
      setSearchResults([]);
      // Keep the route sidebar open - don't change sidebarContent
      
      if (!nearbyPlaces[categoryId]) {
        console.log('Loading new places for category:', categoryId);
        loadNearbyPlaces(categoryId);
      } else {
        console.log('Re-adding existing markers for category:', categoryId);
        loadNearbyPlaces(categoryId);
      }
    } else if (activeCategory === categoryId) {
      // Deselect category
      console.log('Deselecting category');
      setActiveCategory(null);
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      setShowSidebar(false);
    } else {
      // Select new category
      console.log('Selecting new category:', categoryId);
      setActiveCategory(categoryId);
      setSearchQuery(''); // Clear search when selecting category
      setSearchResults([]);
      
      if (!nearbyPlaces[categoryId]) {
        console.log('Loading new places for category:', categoryId);
        loadNearbyPlaces(categoryId);
              } else {
        console.log('Re-adding existing markers for category:', categoryId);
        // Re-add existing markers
        loadNearbyPlaces(categoryId);
      }
    }
  };


  // Clear route
  const clearRoute = () => {
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
    }
    setRouteInfo(null);
    setShowRoutePanel(false);
  };

  // Handle search submission
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      handleSearch(searchQuery);
      setActiveCategory(null); // Clear category when searching
    }
  };

  // Get current results to display
  const getCurrentResults = () => {
    if (activeCategory && nearbyPlaces[activeCategory]) {
      return nearbyPlaces[activeCategory];
    }
    return searchResults;
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title={parkData ? `${parkData.fullName} - Interactive Map` : "Interactive Map - Find Nearby Places & Routes"}
        description={parkData ? `Explore ${parkData.fullName} and find nearby restaurants, lodging, gas stations, and routes.` : "Find nearby places, restaurants, gas stations, and plan routes with our interactive map."}
        keywords="interactive map, nearby places, restaurants, gas stations, lodging, directions, route planning"
        url="https://www.nationalparksexplorerusa.com/map"
        type="website"
      />
      
        <Header />

      {/* Main Container */}
      <div className="flex h-screen">
        {/* Sidebar */}
        {showSidebar && (
          <div className={`w-96 shadow-lg flex-shrink-0 flex flex-col ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            {/* Sidebar Header */}
            <div className={`p-4 border-b ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            }`}>
                <div className="flex items-center justify-end mb-4">
                    <button
                    onClick={() => {
                      setShowSidebar(false);
                      setSidebarContent('search');
                      setSelectedPlace(null);
                      setActiveCategory(null);
                      setNearbyPlaces({});
                      setSearchResults([]);
                      setSearchQuery('');
                      // Clear saved state when manually closing
                      setSavedMapCenter(null);
                      setSavedMapZoom(null);
                      localStorage.removeItem('mapSearchState');
                    }}
                    className={`transition ${
                      isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <X className="h-5 w-5" />
                    </button>
                  </div>
                  
                  </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Park Details */}
              {sidebarContent === 'park' && parkData && (
                <div className="p-4">
                  {/* Park Photos */}
                  {parkData.images && parkData.images.length > 0 && (
                    <div className="mb-4">
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {parkData.images.slice(0, 4).map((image, index) => (
                          <img
                            key={index}
                            src={image.url}
                            alt={`${parkData.fullName} photo ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                        ))}
              </div>
          </div>
                )}
                
                  <div className="mb-4">
                    <h1 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>{parkData.fullName}</h1>
                    <div className={`flex items-center gap-2 text-sm mb-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span>National Park</span>
                      <span>•</span>
                      <span>{parkData.states}</span>
                          </div>
                    <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{parkData.description}</p>
                </div>

                  {/* Quick Access to Nearby Services */}
                  <div className="mb-4">
                    <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>Nearby Services</h3>
                    <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => handleCategoryClick('restaurant')}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-green-500 hover:bg-green-50 transition"
                    >
                        <Utensils className="h-6 w-6 text-green-500" />
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Restaurants</span>
                    </button>
                      <button
                        onClick={() => handleCategoryClick('lodging')}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition"
                      >
                        <Bed className="h-6 w-6 text-blue-500" />
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Hotels</span>
                      </button>
                      <button
                        onClick={() => handleCategoryClick('gas_station')}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-orange-500 hover:bg-orange-50 transition"
                      >
                        <Fuel className="h-6 w-6 text-orange-500" />
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Gas</span>
                      </button>
                <button
                        onClick={() => handleCategoryClick('tourist_attraction')}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition"
                >
                        <Calendar className="h-6 w-6 text-purple-500" />
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Things to Do</span>
                      </button>
                    </div>
              </div>
              
              
                  {/* Address */}
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-start gap-3">
                      <MapPin className={`h-5 w-5 mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                      <div>
                        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Address</p>
                        <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          {parkData.addresses?.[0]?.line1}<br />
                          {parkData.addresses?.[0]?.city}, {parkData.addresses?.[0]?.stateCode} {parkData.addresses?.[0]?.postalCode}
                        </p>
                </div>
                </div>
              </div>
            </div>
          )}
          
              {/* Minimal Place Card for Route Mode */}
              {sidebarContent === 'route-place' && selectedPlace && (
                <div className="p-4">
                  <div className={`border rounded-lg p-4 shadow-sm ${
                    isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                        <Route className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{selectedPlace.name}</h3>
                        <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{selectedPlace.formatted_address || selectedPlace.vicinity}</p>
                      </div>
              </div>
              
                      <button
                      onClick={() => {
                        addWaypoint(selectedPlace);
                        // Keep route sidebar open and show the route planning interface
                        setSidebarContent('routes');
                      }}
                      className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 font-medium"
                    >
                      <Route className="h-5 w-5" />
                      Add to Route
                      </button>
                </div>
                    </div>
                  )}

              {/* Place Details */}
              {sidebarContent === 'place' && selectedPlace && (
                <div className={`p-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {/* Photos Section */}
                  {(() => {
                    // Check if we have valid photos
                    const validPhotos = selectedPlace.photos?.filter(photo => {
                      console.log('Checking photo:', photo);
                      console.log('Photo has url:', !!photo.url);
                      console.log('Photo has photo_reference:', !!photo.photo_reference);
                      console.log('Photo has getUrl method:', typeof photo.getUrl === 'function');
                      
                      return photo.url || photo.photo_reference || (typeof photo.getUrl === 'function');
                    }) || [];
                    
                    if (validPhotos.length > 0) {
                      return (
                        <div className="mb-4">
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {validPhotos.slice(0, 4).map((photo, index) => {
                              // Construct photo URL properly
                              let photoUrl = null;
                              
                              console.log('Processing photo:', photo);
                              
                              if (typeof photo.getUrl === 'function') {
                                // Use the getUrl method if available (Google Places API standard)
                                try {
                                  photoUrl = photo.getUrl({ maxWidth: 400 });
                                  console.log('Using getUrl method, result:', photoUrl);
                                } catch (error) {
                                  console.error('Error calling getUrl:', error);
                                  // Fallback to manual construction
                                  if (photo.photo_reference) {
                                    photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${import.meta.env.VITE_GMAPS_WEB_KEY}`;
                                  }
                                }
                              } else if (photo.url) {
                                photoUrl = photo.url;
                                console.log('Using direct URL:', photoUrl);
                              } else if (photo.photo_reference) {
                                photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${import.meta.env.VITE_GMAPS_WEB_KEY}`;
                                console.log('Using photo_reference, result:', photoUrl);
                              }
                              
                              console.log(`Photo ${index + 1}:`, { 
                                hasUrl: !!photo.url, 
                                hasReference: !!photo.photo_reference, 
                                finalUrl: photoUrl 
                              });
                              
                              if (!photoUrl) {
                                console.log('No valid photo URL found for photo:', photo);
                                return null;
                              }
                              
                              return (
                                <img
                                  key={index}
                                  src={photoUrl}
                                  alt={`${selectedPlace.name} photo ${index + 1}`}
                                  className="w-full h-24 object-cover rounded-lg"
                              onError={(e) => {
                                    console.log('Photo failed to load:', photoUrl);
                                e.target.style.display = 'none';
                                  }}
                                  onLoad={() => {
                                    console.log('Photo loaded successfully:', photoUrl);
                              }}
                            />
                              );
                            })}
                            </div>
                              </div>
                      );
                    } else {
                      // Show a placeholder when no photos are available
                      return (
                        <div className="mb-4">
                          <div className="bg-gray-100 rounded-lg p-8 text-center">
                            <div className="text-gray-400 mb-2">
                              📷
                          </div>
                            <p className="text-sm text-gray-500">
                              No photos available for this location
                            </p>
                          </div>
                        </div>
                      );
                    }
                  })()}
                        
                  <div className="mb-4">
                    <h1 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>{selectedPlace.name}</h1>
                    <div className={`flex items-center gap-2 text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {selectedPlace.rating && (
                        <>
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{selectedPlace.rating}</span>
                          <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>({selectedPlace.user_ratings_total || 0})</span>
                        </>
                      )}
                      {selectedPlace.price_level && (
                        <>
                          <span>•</span>
                          <span className="font-medium">{'$'.repeat(selectedPlace.price_level)}</span>
                        </>
                      )}
                      {/* Show park type badge */}
                      {(selectedPlace.name.toLowerCase().includes('national park') || 
                        selectedPlace.types?.includes('park')) && (
                        <>
                          <span>•</span>
                          <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                            National Park
                          </span>
                        </>
                      )}
                    </div>
                    <p className={`text-sm mb-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {selectedPlace.address || selectedPlace.vicinity || selectedPlace.formatted_address}
                    </p>
                    
                  </div>
                          

                  {/* Additional Info */}
                  <div className="space-y-4">
                    {/* Hours */}
                    {selectedPlace.opening_hours && (
                      <div className="border-t border-gray-200 pt-4">
                        <div className="flex items-start gap-3">
                          <Clock className={`h-5 w-5 mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                          <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Hours</p>
                            <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                              {selectedPlace.opening_hours.isOpen?.() ? 'Open now' : 
                               selectedPlace.opening_hours.open_now ? 'Open now' : 'Closed'}
                            </p>
                            {selectedPlace.opening_hours.weekday_text && (
                              <div className="mt-2 space-y-1">
                                {selectedPlace.opening_hours.weekday_text.slice(0, 3).map((day, index) => (
                                  <p key={index} className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{day}</p>
                                ))}
                      </div>
                            )}
                                </div>
                                </div>
                            </div>
                          )}
                          
                    {/* Phone */}
                    {(selectedPlace.formatted_phone_number || selectedPlace.phone_number) && (
                      <div className="border-t border-gray-200 pt-4">
                        <div className="flex items-start gap-3">
                          <Phone className={`h-5 w-5 mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                          <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Phone</p>
                            <a 
                              href={`tel:${selectedPlace.formatted_phone_number || selectedPlace.phone_number}`}
                              className={`text-sm ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                            >
                              {selectedPlace.formatted_phone_number || selectedPlace.phone_number}
                            </a>
              </div>
                      </div>
            </div>
          )}

                    {/* Website */}
                    {selectedPlace.website && (
                      <div className="border-t border-gray-200 pt-4">
                        <div className="flex items-start gap-3">
                          <ExternalLink className={`h-5 w-5 mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                          <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Website</p>
                            <a 
                              href={selectedPlace.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-sm ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                            >
                              Visit website
                            </a>
              </div>
                              </div>
                            </div>
                          )}
                          
                    {/* Types/Categories */}
                    {selectedPlace.types && (
                      <div className="border-t border-gray-200 pt-4">
                        <div className="flex items-start gap-3">
                          <Info className={`h-5 w-5 mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                          <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Category</p>
                            <div className="flex flex-wrap gap-1">
                              {selectedPlace.types.slice(0, 3).map((type, index) => (
                                <span key={index} className={`text-xs px-2 py-1 rounded-full ${
                                  isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                              ))}
                      </div>
                                </div>
                                </div>
                            </div>
              )}

                    {/* Reviews Section */}
                    {selectedPlace.reviews && selectedPlace.reviews.length > 0 && (
                      <div className={`border-t pt-4 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                        <div className="flex items-start gap-3">
                          <Star className={`h-5 w-5 mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                          <div className="flex-1">
                            <p className={`text-sm font-medium mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>Featured Review</p>
                            {(() => {
                              const review = selectedPlace.reviews[0]; // Show only the first review
                              return (
                                <div className={`rounded-lg p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                      {review.author_name?.charAt(0) || 'A'}
                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{review.author_name || 'Anonymous'}</span>
                                        <div className="flex items-center">
                                          {[...Array(5)].map((_, i) => (
                                            <Star 
                                              key={i} 
                                              className={`h-3 w-3 ${i < (review.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} 
                                            />
                                          ))}
                                        </div>
                                      </div>
                                      <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{review.relative_time_description}</span>
                                    </div>
              </div>

                                  {/* Full Review Text */}
                                  <p className={`text-sm mb-3 leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{review.text}</p>
                                  
                                </div>
                              );
                            })()}
                                </div>
                              </div>
                            </div>
                          )}
                          
                    {/* Add to Route Button */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                        onClick={() => addWaypoint(selectedPlace)}
                        className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Route className="h-4 w-4" />
                        Add to Route
                            </button>
                          </div>
                        </div>
              </div>
                  )}

              {/* Routes Planning */}
              {sidebarContent === 'routes' && (
                <div className="p-4">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">Plan Your Route</h2>
                    <p className="text-sm text-gray-600">Add places to create a custom route with directions</p>
                    {routeWaypoints.length > 1 && (
                      <p className="text-xs text-gray-500 mt-1">💡 Drag places to reorder your route</p>
              )}
            </div>

                  {/* Waypoints List */}
                  <div className="space-y-3 mb-4">
                    {routeWaypoints.map((waypoint, index) => (
                      <div 
                        key={waypoint.id} 
                        className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-move transition-all ${
                          draggedItem === index ? 'opacity-50 scale-95' : 'hover:bg-gray-100'
                        }`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, index)}
                      >
                        {/* Drag Handle */}
                        <div className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-medium cursor-grab active:cursor-grabbing">
                          {String.fromCharCode(65 + index)}
                        </div>
                        
                        {/* Drag Icon */}
                        <div className="flex-shrink-0 text-gray-400 cursor-grab active:cursor-grabbing">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                  </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{waypoint.name}</p>
                          <p className="text-xs text-gray-500 truncate">{waypoint.address}</p>
                        </div>
                        
                  <button
                          onClick={() => removeWaypoint(waypoint.id)}
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500"
                  >
                          <X className="h-4 w-4" />
                  </button>
              </div>
                    ))}
            </div>

                  {/* Add Place Instructions */}
                  {routeWaypoints.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Route className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Search for places and click "Add to Route" to start planning</p>
              </div>
                )}
                
                  {/* Route Actions */}
                  {routeWaypoints.length >= 2 && (
                    <div className="space-y-3">
                    <button
                        onClick={calculateRoute}
                        className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                        <Route className="h-4 w-4" />
                        Show Directions
                  </button>
                      
                      {routeInfo && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-green-800 font-medium">Total Distance:</span>
                            <span className="text-green-700">{Math.round(routeInfo.distance / 1609.34 * 10) / 10} miles</span>
              </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-green-800 font-medium">Total Time:</span>
                            <span className="text-green-700">{Math.round(routeInfo.duration / 60)} minutes</span>
            </div>
              </div>
                      )}
                    </div>
                  )}

                  {/* Clear Route */}
                  {routeWaypoints.length > 0 && (
                    <button
                      onClick={() => {
                        setRouteWaypoints([]);
                        setRouteInfo(null);
                        if (directionsRenderer) {
                          directionsRenderer.setMap(null);
                        }
                        showToast('Route cleared', 'info', 2000);
                      }}
                      className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Clear Route
                    </button>
                  )}
            </div>
          )}

              {/* Search Results */}
              {sidebarContent === 'search' && (
                <div className={`p-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {activeCategory ? `Top ${getCurrentResults().length} ${categories.find(c => c.id === activeCategory)?.label}` : 'Results'}
                    </h2>
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {getCurrentResults().length} {getCurrentResults().length === 1 ? 'place' : 'places'} found
                    </span>
                </div>

                  <div className="space-y-1">
                    {getCurrentResults().map((place, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-3 cursor-pointer transition border-l-2 border-transparent hover:border-blue-500 ${
                          isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          console.log('Sidebar item clicked:', place.name);
                          
                          // Close any existing info window
                          if (infoWindowRef.current) {
                            infoWindowRef.current.close();
                          }
                          
                          setSelectedPlace(place);
                          setSidebarContent('place');
                          
                          const lat = place.lat || place.geometry?.location?.lat;
                          const lng = place.lng || place.geometry?.location?.lng;
                          if (lat && lng) {
                            mapInstanceRef.current.setCenter({ lat, lng });
                            mapInstanceRef.current.setZoom(12);
                            
                            // Just center the map on the place (no info popup)
                          }
                          
                          console.log('Updated sidebar and map for place:', place.name);
                        }}
                      >
                        {/* Icon */}
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          {activeCategory ? React.createElement(categories.find(c => c.id === activeCategory)?.icon, { 
                            className: "h-4 w-4",
                            style: { color: categories.find(c => c.id === activeCategory)?.color }
                          }) : <MapPin className="h-4 w-4 text-gray-500" />}
              </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {place.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            {place.rating && (
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                  {place.rating}
                        </span>
                                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                  ({place.user_ratings_total || 0})
                                </span>
            </div>
          )}
                            {place.price_level && (
                              <span className="text-xs text-gray-500">
                                {'$'.repeat(place.price_level)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Arrow */}
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      </div>
                    ))}
                        </div>
                        </div>
          )}
                      </div>
                    </div>
        )}

        {/* Map Container */}
        <div className="flex-1 relative">
          {/* Map Search Bar - Always visible */}
          <div className="absolute top-4 left-4 right-4 z-10">
            <div className="flex justify-center mb-4">
              <div className="relative w-full max-w-md">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                <input
                  type="text"
                  placeholder="Search for any place..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleSearchSuggestions(e.target.value);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setShowSuggestions(false);
                      handleMapSearch();
                    }
                  }}
                  onFocus={() => {
                    if (searchSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    // Delay hiding suggestions to allow clicking on them
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur shadow-lg transition-colors ${
                    isDark 
                      ? 'bg-gray-900/90 text-white border-gray-600 placeholder-gray-400' 
                      : 'bg-white/90 text-gray-900 border-gray-200 placeholder-gray-500'
                  }`}
                />
                {searchQuery && (
                    <button
                    type="button"
                      onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setSelectedPlace(null);
                      setSearchSuggestions([]);
                      setShowSuggestions(false);
                      // Close sidebar when clearing search
                      setShowSidebar(false);
                      setSidebarContent('search');
                      setActiveCategory(null);
                      setNearbyPlaces({});
                      // Clear saved state
                      setSavedMapCenter(null);
                      setSavedMapZoom(null);
                      localStorage.removeItem('mapSearchState');
                      // Clear markers from map
                      markersRef.current.forEach(marker => marker.setMap(null));
                      markersRef.current = [];
                    }}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
                      isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <X className="h-4 w-4" />
                    </button>
                )}

                {/* Search Suggestions Dropdown */}
                {showSuggestions && searchSuggestions.length > 0 && (
                  <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl shadow-lg border z-20 max-h-60 overflow-y-auto ${
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}>
                    {searchSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSearchQuery(suggestion.description);
                          setShowSuggestions(false);
                          // Use the suggestion's place_id to get exact location
                          if (suggestion.place_id) {
                            const service = new window.google.maps.places.PlacesService(mapInstanceRef.current);
                            const request = {
                              placeId: suggestion.place_id,
                              fields: ['place_id', 'name', 'geometry', 'formatted_address', 'rating', 'user_ratings_total', 'photos', 'opening_hours', 'website', 'formatted_phone_number', 'types', 'vicinity', 'price_level', 'reviews']
                            };
                            
                            service.getDetails(request, (place, status) => {
                              if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
                                console.log('Suggestion place details received:', place);
                                console.log('Suggestion photos available:', place.photos);
                                console.log('Suggestion photos array length:', place.photos?.length || 0);
                                if (place.photos && place.photos.length > 0) {
                                  console.log('First photo object:', place.photos[0]);
                                  console.log('First photo keys:', Object.keys(place.photos[0]));
                                }
                                const location = place.geometry.location;
                                const lat = location.lat();
                                const lng = location.lng();
                                
                                // Validate coordinates before setting map center
                                if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                  mapInstanceRef.current.setCenter(location);
                                  mapInstanceRef.current.setZoom(12);
                                  
                                  // Save map position for persistence
                                  setSavedMapCenter({ lat, lng });
                                  setSavedMapZoom(12);
                                } else {
                                  console.error('Invalid coordinates for suggestion:', place.name, 'lat:', lat, 'lng:', lng);
                                  return;
                                }
                                
                                // Clear existing markers
                                markersRef.current.forEach(marker => marker.setMap(null));
                                markersRef.current = [];
                                
                                // Add marker
                                const marker = new window.google.maps.Marker({
                                  position: place.geometry.location,
                                  map: mapInstanceRef.current,
                                  title: place.name,
                                  icon: {
                                    path: window.google.maps.SymbolPath.CIRCLE,
                                    scale: 10,
                                    fillColor: '#ef4444',
                                    fillOpacity: 1,
                                    strokeColor: '#ffffff',
                                    strokeWeight: 3
                                  }
                                });
                                markersRef.current.push(marker);
                                
                                // Always show place info card directly (like Google Maps)
                                setSelectedPlace(place);
                                setSidebarContent('place');
                                setShowSidebar(true);
                                setActiveCategory(null);
                                console.log('Showing place info card for suggestion:', place.name);
                                
                                console.log('Map centered on suggestion:', place.name, 'at:', place.geometry.location.lat(), place.geometry.location.lng());
                              }
                            });
                          } else {
                            // Fallback to regular search
                            setTimeout(() => handleMapSearch(), 100);
                          }
                        }}
                        className={`w-full px-4 py-3 text-left border-b last:border-b-0 transition-colors ${
                          isDark 
                            ? 'text-white border-gray-700 hover:bg-gray-700' 
                            : 'text-gray-900 border-gray-100 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className={`h-4 w-4 flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                          <div>
                            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {suggestion.structured_formatting?.main_text || suggestion.description.split(',')[0]}
                            </p>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {suggestion.structured_formatting?.secondary_text || suggestion.description}
                            </p>
                  </div>
                </div>
                      </button>
                    ))}
              </div>
            )}
              </div>
          </div>

            {/* Category Buttons - Show when sidebar is open */}
            {showSidebar && (
              <div className="flex justify-center gap-3">
                {categories.map(category => {
                  const Icon = category.icon;
                  const isLoading = loadingCategory === category.id;
                  const isActive = activeCategory === category.id;
                      
                      return (
                        <button
                      key={category.id}
                      onClick={() => handleCategoryClick(category.id)}
                      onBlur={(e) => e.target.blur()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition hover:scale-105"
                          style={{ 
                        backgroundColor: isLoading 
                          ? (isDark ? '#374151' : '#f3f4f6') 
                          : (isActive ? category.color : (isDark ? '#4b5563' : '#ffffff')),
                        color: isLoading 
                          ? (isDark ? '#e5e7eb' : '#374151') 
                          : (isActive ? '#ffffff' : (isDark ? '#f9fafb' : '#1f2937')),
                        borderWidth: '2px',
                        borderColor: isLoading 
                          ? (isDark ? '#6b7280' : '#9ca3af') 
                          : (isActive ? category.color : (isDark ? '#6b7280' : '#d1d5db')),
                        borderStyle: routeWaypoints.length > 0 && activeCategory === 'routes' && category.id !== 'routes' ? 'dashed' : 'solid',
                        boxShadow: isDark ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.15)'
                          }}
                        >
                          {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" style={{ color: isDark ? '#e5e7eb' : '#374151' }} />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                      <span>{category.label}</span>
                        </button>
                  );
                })}
            </div>
          )}
          </div>

          {/* Map */}
          {mapError ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <MapPin className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Map Unavailable
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {mapError}
                </p>
                  <button
                  onClick={() => navigate('/explore')}
                  className="px-6 py-3 rounded-xl bg-forest-500 hover:bg-forest-600 text-white font-semibold transition"
                >
                  Back to Explore
                </button>
                </div>
                        </div>
          ) : (
            <div
              ref={mapRef}
              className="h-full w-full"
            />
          )}
          
          {!mapLoaded && !mapError && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: 'var(--text-primary)' }} />
                <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                  Loading interactive map...
                </p>
                    </div>
                </div>
          )}

          {/* Route Planning Panel */}
          {showRoutePanel && (
            <div className="absolute top-4 right-4 z-10 bg-white rounded-xl shadow-lg border border-gray-200 p-4 w-80">
              <div className="flex items-center gap-2 mb-3">
                <Route className="h-5 w-5 text-blue-500" />
                <h3 className="font-semibold text-gray-900">Route Info</h3>
                      <button
                  onClick={clearRoute}
                  className="ml-auto text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                  </button>
              </div>

              {routeInfo && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">
                      {routeInfo.duration}
                                </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-700">
                      {routeInfo.distance}
                        </span>
                      </div>
                </div>
                )}
            </div>
          )}
              </div>
            </div>
                              </div>
  );
};

export default MapPage;