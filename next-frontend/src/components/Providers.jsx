"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { IconContext } from '@phosphor-icons/react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import ScrollToTop from './common/ScrollToTop';
import NavigationProgress from './common/NavigationProgress';
import AnalyticsPageTracker from './common/AnalyticsPageTracker';
import { initGA } from '../utils/analytics';

export default function Providers({
  children,
  initialAuthHint = false,
  initialTheme = 'system',
  initialResolvedTheme = 'light',
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
      },
    },
  }));

  useEffect(() => {
    initGA();
    // Register the serwist service worker for offline/PWA support (production only)
    if ("serviceWorker" in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" });
    } else if ("serviceWorker" in navigator) {
      // Unregister stale service workers in development
      navigator.serviceWorker.getRegistrations().then(regs =>
        regs.forEach(r => r.unregister())
      );
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <IconContext.Provider value={{ size: 20, weight: 'regular' }}>
      <ThemeProvider initialTheme={initialTheme} initialResolvedTheme={initialResolvedTheme}>
        <ToastProvider>
          <AuthProvider initialAuthHint={initialAuthHint}>
            {children}
            <Suspense fallback={null}>
              <NavigationProgress />
            </Suspense>
            <AnalyticsPageTracker />
            <ScrollToTop />
            <Analytics />
            <SpeedInsights />

          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
      </IconContext.Provider>
    </QueryClientProvider>
  );
}
