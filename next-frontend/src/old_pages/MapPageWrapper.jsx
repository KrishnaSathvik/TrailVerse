import React, { useState, useEffect } from 'react';
import MapPage from './MapPage';
import MobileMapPage from './MobileMapPage';

/**
 * Wrapper component that renders different map pages based on device type
 * - Mobile devices (< 768px): MobileMapPage with all parks
 * - Desktop devices (>= 768px): MapPage with route planning features
 */
const MapPageWrapper = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Render appropriate map page based on device
  return isMobile ? <MobileMapPage /> : <MapPage />;
};

export default MapPageWrapper;

