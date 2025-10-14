import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Get initial theme from localStorage or default to 'system'
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState('dark');

  // Apply theme to document
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove previous theme classes
    root.classList.remove('light', 'dark');
    
    let effectiveTheme = theme;
    
    // If system, detect OS preference
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches 
        ? 'dark' 
        : 'light';
      effectiveTheme = systemTheme;
    }
    
    // Apply theme
    root.classList.add(effectiveTheme);
    setResolvedTheme(effectiveTheme);
    
    // Save to localStorage
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
    const token = localStorage.getItem('token');
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
