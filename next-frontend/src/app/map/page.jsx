'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const MapContent = dynamic(() => import('./MapContent'), { ssr: false });
const MobileMapContent = dynamic(() => import('./MobileMapContent'), { ssr: false });

export default function MapPage() {
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    setMounted(true);

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading map...</p>
        </div>
      </div>
    );
  }

  return isMobile ? <MobileMapContent /> : <MapContent />;
}
