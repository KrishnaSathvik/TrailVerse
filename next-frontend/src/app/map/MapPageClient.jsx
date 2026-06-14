'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

import LoadingSpinner from '@/components/common/LoadingSpinner';

const MapContent = dynamic(() => import('./MapContent'), { ssr: false });
const MobileMapContent = dynamic(() => import('./MobileMapContent'), { ssr: false });

export default function MapPageClient() {
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
        <LoadingSpinner size="lg" text="Loading map…" />
      </div>
    );
  }

  return isMobile ? <MobileMapContent /> : <MapContent />;
}
