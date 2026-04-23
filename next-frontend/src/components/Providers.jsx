"use client";

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import ScrollToTop from './common/ScrollToTop';
import PWAInstallButton from './common/PWAInstallButton';
import { initGA } from '../utils/analytics';

export default function Providers({ children }) {
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
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            {children}
            <ScrollToTop />
            <PWAInstallButton />
            <Analytics />
            <SpeedInsights />

          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
