"use client";
import React, { createContext, useContext, useState, useLayoutEffect, useEffect, useRef } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { getStoredToken } from '../services/authService';
import { setThemeCookie } from '../lib/themeCookie';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

function getStoredThemePreference() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'system';
}

function readInitialResolvedTheme() {
  if (typeof document === 'undefined') return 'light';
  if (document.documentElement.classList.contains('dark')) return 'dark';
  if (document.documentElement.classList.contains('light')) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveEffectiveTheme(themePreference) {
  if (themePreference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return themePreference;
}

function applyThemeClasses(effectiveTheme) {
  const root = document.documentElement;
  if (!root.classList.contains(effectiveTheme)) {
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
  }
  root.style.colorScheme = effectiveTheme;
  const bg = effectiveTheme === 'dark' ? '#0A0E0F' : '#FEFCF9';
  root.style.backgroundColor = bg;
  if (document.body) {
    document.body.style.backgroundColor = bg;
    document.body.style.color = effectiveTheme === 'dark' ? '#FFFFFF' : '#2D2B28';
  }
}

function enableThemeTransitions() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add('theme-ready');
    });
  });
}

export const ThemeProvider = ({
  children,
  initialTheme = 'system',
  initialResolvedTheme = 'light',
}) => {
  useServerInsertedHTML(() => <script src="/theme-init.js" suppressHydrationWarning />);

  const [theme, setTheme] = useState(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState(initialResolvedTheme);
  const hasHydratedTheme = useRef(false);

  // Before paint: read localStorage once, then keep document + state in sync.
  useLayoutEffect(() => {
    let themePreference = theme;

    if (!hasHydratedTheme.current) {
      themePreference = getStoredThemePreference();
      hasHydratedTheme.current = true;
      if (themePreference !== theme) {
        setTheme(themePreference);
      }
    }

    const effectiveTheme = resolveEffectiveTheme(themePreference);
    applyThemeClasses(effectiveTheme);
    setResolvedTheme(effectiveTheme);

    try {
      localStorage.setItem('theme', themePreference);
    } catch {
      // ignore
    }

    setThemeCookie(themePreference);

    if (!document.documentElement.classList.contains('theme-ready')) {
      enableThemeTransitions();
    }
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return undefined;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (event) => {
      const newTheme = event.matches ? 'dark' : 'light';
      applyThemeClasses(newTheme);
      setResolvedTheme(newTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Setup WebSocket real-time sync for preferences
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return undefined;

    let cleanupFunction = null;

    import('../services/websocketService').then((module) => {
      const websocketService = module.default;

      websocketService.subscribeToPreferences();

      const handlePreferencesUpdated = (preferences) => {
        if (preferences.theme && preferences.theme !== theme) {
          setTheme(preferences.theme);
        }
      };

      websocketService.on('preferencesUpdated', handlePreferencesUpdated);

      cleanupFunction = () => {
        websocketService.off('preferencesUpdated', handlePreferencesUpdated);
      };
    });

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
