"use client";
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStoredToken } from '../services/authService';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

function readResolvedThemeFromDocument() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export const ThemeProvider = ({ children }) => {
  // Match SSR: never read document/localStorage during initial render (theme-init.js runs before React).
  const [theme, setTheme] = useState('system');
  const [resolvedTheme, setResolvedTheme] = useState('light');

  // Sync with theme-init.js + localStorage after hydration.
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved);
    }
    setResolvedTheme(readResolvedThemeFromDocument());
  }, []);

  // Apply theme to document (sync with theme-init.js; avoid redundant class churn)
  useEffect(() => {
    const root = window.document.documentElement;

    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }

    if (!root.classList.contains(effectiveTheme)) {
      root.classList.remove('light', 'dark');
      root.classList.add(effectiveTheme);
    }
    root.style.colorScheme = effectiveTheme;
    setResolvedTheme(effectiveTheme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      const newTheme = e.matches ? 'dark' : 'light';
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(newTheme);
      setResolvedTheme(newTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Setup WebSocket real-time sync for preferences
  useEffect(() => {
    // Check if user is logged in by checking localStorage token
    const token = getStoredToken();
    if (!token) return;

    // Dynamically import WebSocket service to avoid circular dependency
    let cleanupFunction = null;
    
    import('../services/websocketService').then((module) => {
      const websocketService = module.default;
      
      // Subscribe to preferences channel
      websocketService.subscribeToPreferences();

      // Handle preferences updated from another device/tab
      const handlePreferencesUpdated = (preferences) => {
        console.log('[Real-Time] Preferences updated:', preferences);
        if (preferences.theme && preferences.theme !== theme) {
          setTheme(preferences.theme);
        }
      };

      // Subscribe to WebSocket event
      websocketService.on('preferencesUpdated', handlePreferencesUpdated);

      // Store cleanup function
      cleanupFunction = () => {
        websocketService.off('preferencesUpdated', handlePreferencesUpdated);
      };
    });

    // Cleanup
    return () => {
      if (cleanupFunction) cleanupFunction();
    };
  }, [theme]);

  const value = {
    theme,
    resolvedTheme,
    setTheme,
    isDark: resolvedTheme === 'dark',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
