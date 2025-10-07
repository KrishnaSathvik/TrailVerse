import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  MapPin, Search, X, Filter, Layers, Navigation,
  Maximize2, Minimize2, List, Map as MapIcon, Info,
  Star, Calendar, DollarSign, Compass
} from 'lucide-react';
import Header from '../components/common/Header';
import { useParks } from '../hooks/useParks';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom marker icon
const createCustomIcon = (color = '#22c55e') => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg style="transform: rotate(45deg); width: 16px; height: 16px;" viewBox="0 0 24 24" fill="white">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

// Map controller component
const MapController = ({ center, zoom }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center && zoom) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  
  return null;
};

const MapPage = () => {
  const { data: allParks, isLoading } = useParks();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPark, setSelectedPark] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [mapStyle, setMapStyle] = useState('street'); // 'street', 'satellite', 'terrain'
  const [filters, setFilters] = useState({
    states: [],
    activities: []
  });
  const [mapCenter, setMapCenter] = useState([39.8283, -98.5795]); // Center of USA
  const [mapZoom, setMapZoom] = useState(4);
  const mapRef = useRef(null);

  // Get unique states
  const uniqueStates = useMemo(() => {
    if (!allParks) return [];
    const states = new Set();
    allParks.forEach(park => {
      park.states.split(',').forEach(state => states.add(state.trim()));
    });
    return Array.from(states).sort();
  }, [allParks]);

  const popularActivities = [
    'Hiking', 'Camping', 'Wildlife Watching', 'Photography', 
    'Fishing', 'Boating', 'Biking', 'Climbing'
  ];

  // Filter parks
  const filteredParks = useMemo(() => {
    if (!allParks) return [];
    
    return allParks.filter(park => {
      // Must have coordinates
      if (!park.latitude || !park.longitude) return false;

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!park.fullName.toLowerCase().includes(search) &&
            !park.states.toLowerCase().includes(search)) {
          return false;
        }
      }

      // States filter
      if (filters.states.length > 0) {
        if (!filters.states.some(state => park.states.includes(state))) {
          return false;
        }
      }

      // Activities filter
      if (filters.activities.length > 0) {
        if (!filters.activities.some(activity =>
          park.activities?.some(a => a.name === activity)
        )) {
          return false;
        }
      }

      return true;
    });
  }, [allParks, searchTerm, filters]);

  const toggleStateFilter = (state) => {
    setFilters(prev => ({
      ...prev,
      states: prev.states.includes(state)
        ? prev.states.filter(s => s !== state)
        : [...prev.states, state]
    }));
  };

  const toggleActivityFilter = (activity) => {
    setFilters(prev => ({
      ...prev,
      activities: prev.activities.includes(activity)
        ? prev.activities.filter(a => a !== activity)
        : [...prev.activities, activity]
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      states: [],
      activities: []
    });
    setSearchTerm('');
  };

  const handleParkClick = (park) => {
    setSelectedPark(park);
    setMapCenter([parseFloat(park.latitude), parseFloat(park.longitude)]);
    setMapZoom(10);
  };

  const activeFiltersCount = filters.states.length + filters.activities.length;

  // Map tile layers
  const tileLayerUrls = {
    street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
  };

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Map Header */}
      <div className="border-b backdrop-blur-xl sticky top-16 z-20"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="mt-2 flex items-center gap-3">
                <h1 className="text-2xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Interactive Map
                </h1>
                <span className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {filteredParks.length} parks
                </span>
              </div>
            </div>

            {/* Map Controls */}
            <div className="flex items-center gap-2">
              {/* Map Style Selector */}
              <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                {[
                  { id: 'street', label: 'Street', icon: MapIcon },
                  { id: 'satellite', label: 'Satellite', icon: Layers },
                  { id: 'terrain', label: 'Terrain', icon: Compass }
                ].map((style) => {
                  const Icon = style.icon;
                  return (
                    <button
                      key={style.id}
                      onClick={() => setMapStyle(style.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                        mapStyle === style.id ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <Icon className="h-3 w-3" />
                      <span className="hidden md:inline">{style.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Toggle Sidebar */}
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2.5 rounded-xl transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
                title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
              >
                {showSidebar ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside className={`${
          showSidebar ? 'w-full sm:w-96' : 'w-0'
        } transition-all duration-300 overflow-hidden border-r`}
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border)'
          }}
        >
          <div className="h-full flex flex-col">
            {/* Search */}
            <div className="p-4 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: 'var(--text-tertiary)' }}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search parks..."
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/5 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Filter Button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-forest-500 text-white">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Filters Panel */}
              {showFilters && (
                <div className="mt-3 p-4 rounded-xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Filters
                    </h4>
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="text-xs font-medium text-forest-400 hover:text-forest-300"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {/* States */}
                  <div className="mb-4">
                    <h5 className="text-xs font-semibold mb-2 uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      States
                    </h5>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {uniqueStates.slice(0, 10).map(state => (
                        <label key={state} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filters.states.includes(state)}
                            onChange={() => toggleStateFilter(state)}
                            className="rounded w-3 h-3 text-forest-500 focus:ring-forest-500/50"
                            style={{ borderColor: 'var(--border)' }}
                          />
                          <span style={{ color: 'var(--text-secondary)' }}>{state}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Activities */}
                  <div>
                    <h5 className="text-xs font-semibold mb-2 uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Activities
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {popularActivities.map(activity => (
                        <button
                          key={activity}
                          onClick={() => toggleActivityFilter(activity)}
                          className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                            filters.activities.includes(activity)
                              ? 'bg-forest-500 text-white'
                              : 'ring-1 hover:bg-white/5'
                          }`}
                          style={
                            !filters.activities.includes(activity)
                              ? {
                                  backgroundColor: 'var(--surface-hover)',
                                  borderColor: 'var(--border)',
                                  color: 'var(--text-secondary)'
                                }
                              : {}
                          }
                        >
                          {activity}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Parks List */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="text-center py-12">
                  <MapPin className="h-8 w-8 animate-pulse mx-auto mb-2"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Loading parks...
                  </p>
                </div>
              ) : filteredParks.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 mx-auto mb-2"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <p className="text-sm font-semibold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    No parks found
                  </p>
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-forest-400 hover:text-forest-300"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredParks.map(park => (
                    <button
                      key={park.parkCode}
                      onClick={() => handleParkClick(park)}
                      className={`w-full text-left p-3 rounded-xl transition ${
                        selectedPark?.parkCode === park.parkCode
                          ? 'ring-2 ring-forest-500'
                          : 'hover:bg-white/5'
                      }`}
                      style={{
                        backgroundColor: selectedPark?.parkCode === park.parkCode
                          ? 'var(--surface-active)'
                          : 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <h3 className="font-semibold text-sm mb-1 line-clamp-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {park.fullName}
                      </h3>
                      <div className="flex items-center gap-2 text-xs"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <MapPin className="h-3 w-3" />
                        <span>{park.states}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Map Container */}
        <div className="flex-1 relative">
          <MapContainer
            ref={mapRef}
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
          >
            <MapController center={mapCenter} zoom={mapZoom} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url={tileLayerUrls[mapStyle]}
            />
            
            {filteredParks.map(park => (
              <Marker
                key={park.parkCode}
                position={[parseFloat(park.latitude), parseFloat(park.longitude)]}
                icon={createCustomIcon(
                  selectedPark?.parkCode === park.parkCode ? '#3b82f6' : '#22c55e'
                )}
                eventHandlers={{
                  click: () => handleParkClick(park)
                }}
              >
                <Popup maxWidth={300}>
                  <div className="p-2">
                    <h3 className="font-bold text-base mb-2">{park.fullName}</h3>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {park.description}
                    </p>
                    <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />
                      <span>{park.states}</span>
                    </div>
                    <Link
                      to={`/parks/${park.parkCode}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-forest-500 hover:text-forest-600"
                    >
                      View Details
                      <Info className="h-3 w-3" />
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map Legend */}
          <div className="absolute bottom-4 left-4 rounded-xl p-3 backdrop-blur-xl"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Legend
            </h4>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <div className="w-3 h-3 rounded-full bg-forest-500" />
                <span>National Park</span>
              </div>
              <div className="flex items-center gap-2 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>Selected</span>
              </div>
            </div>
          </div>

          {/* Zoom Controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <button
              onClick={() => setMapZoom(mapZoom + 1)}
              className="p-2 rounded-lg backdrop-blur-xl transition hover:bg-white/10"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <span className="text-lg font-bold">+</span>
            </button>
            <button
              onClick={() => setMapZoom(mapZoom - 1)}
              className="p-2 rounded-lg backdrop-blur-xl transition hover:bg-white/10"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <span className="text-lg font-bold">−</span>
            </button>
            <button
              onClick={() => {
                setMapCenter([39.8283, -98.5795]);
                setMapZoom(4);
                setSelectedPark(null);
              }}
              className="p-2 rounded-lg backdrop-blur-xl transition hover:bg-white/10"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              title="Reset view"
            >
              <Navigation className="h-4 w-4" />
            </button>
          </div>

          {/* Selected Park Info Card */}
          {selectedPark && (
            <div className="absolute bottom-4 right-4 w-80 rounded-2xl p-4 backdrop-blur-xl"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-lg line-clamp-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {selectedPark.fullName}
                </h3>
                <button
                  onClick={() => setSelectedPark(null)}
                  className="p-1 rounded-lg hover:bg-white/5 transition"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-sm mb-4 line-clamp-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                {selectedPark.description}
              </p>

              <div className="flex items-center gap-2 mb-4 text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <MapPin className="h-4 w-4" />
                <span>{selectedPark.states}</span>
              </div>

              <Link
                to={`/parks/${selectedPark.parkCode}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-forest-500 hover:bg-forest-600 text-white text-sm font-semibold transition w-full justify-center"
              >
                View Details
                <Info className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapPage;
