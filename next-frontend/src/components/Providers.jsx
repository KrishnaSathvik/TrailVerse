"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { IconContext } from '@phosphor-icons/react';
import { Analytics } from '@vercel/analytics/next';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import ScrollToTop from './common/ScrollToTop';
import NavigationProgress from './common/NavigationProgress';
import AnalyticsPageTracker from './common/AnalyticsPageTracker';
import { initGA } from '../utils/analytics';
import { applyClientCacheMigration } from '@/lib/clientCacheVersion';

export default function Providers({
  children,
  // Auth/theme hints used to come from root cookies(); that forced the whole app dynamic.
  // Defaults keep the shell cacheable; client providers hydrate real state after mount.
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
    applyClientCacheMigration();
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

          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
      </IconContext.Provider>
    </QueryClientProvider>
  );
}
