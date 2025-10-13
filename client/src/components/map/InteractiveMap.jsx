import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, ZoomIn, ZoomOut } from '@components/icons';
import { useTheme } from '../../context/ThemeContext';
import 'leaflet/dist/leaflet.css';

// Custom marker icon
const createCustomIcon = (color = 'var(--accent-green)') => {
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
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

const MapController = ({ center, zoom }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center && zoom) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  
  return null;
};

const InteractiveMap = ({ 
  parks, 
  center = [39.8283, -98.5795], 
  zoom = 4,
  onParkClick,
  selectedPark,
  className = ""
}) => {
  const { isDark } = useTheme();
  const [mapCenter, setMapCenter] = useState(center);
  const [mapZoom, setMapZoom] = useState(zoom);

  return (
    <div className={`relative ${className}`}>
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '100%', width: '100%', borderRadius: '1rem' }}
        scrollWheelZoom={true}
      >
        <MapController center={mapCenter} zoom={mapZoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={isDark 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />
        
        {parks.map(park => (
          <Marker
            key={park.parkCode}
            position={[parseFloat(park.latitude), parseFloat(park.longitude)]}
            icon={createCustomIcon(
              selectedPark?.parkCode === park.parkCode ? '#3b82f6' : 'var(--accent-green)'
            )}
            eventHandlers={{
              click: () => onParkClick && onParkClick(park)
            }}
          >
            <Popup maxWidth={300}>
              <div className="p-2">
                <h3 className="font-bold text-base mb-2">{park.fullName}</h3>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {park.description}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <MapPin className="h-3 w-3" />
                  <span>{park.states}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
        <button
          onClick={() => setMapZoom(mapZoom + 1)}
          className="p-2 rounded-lg backdrop-blur-xl transition hover:bg-white/10"
          unselectable="on"
          draggable="false"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none'
          }}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => setMapZoom(mapZoom - 1)}
          className="p-2 rounded-lg backdrop-blur-xl transition hover:bg-white/10"
          unselectable="on"
          draggable="false"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none'
          }}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            setMapCenter(center);
            setMapZoom(4);
          }}
          className="p-2 rounded-lg backdrop-blur-xl transition hover:bg-white/10"
          unselectable="on"
          draggable="false"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none'
          }}
          title="Reset view"
        >
          <Navigation className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default InteractiveMap;
