import React, { useState } from 'react';
import { Sun, Moon, Monitor, ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const ThemeSwitcher = ({ showLabel = false, compact = false }) => {
  const { theme, setTheme, isDark } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const themes = [
    { id: 'light', label: 'Light', icon: Sun, description: 'Bright and clear' },
    { id: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { id: 'system', label: 'System', icon: Monitor, description: 'Use system setting' }
  ];

  const currentTheme = themes.find(t => t.id === theme);
  const CurrentIcon = currentTheme?.icon || Monitor;

  // Compact switch-based theme toggler
  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="theme-switcher-toggle flex items-center gap-2 px-3 py-2 rounded-full"
          style={{
            color: 'var(--text-primary)'
          }}
          aria-label="Toggle theme"
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="text-sm font-medium hidden sm:inline">
            {currentTheme?.label}
          </span>
          <ChevronDown className={`h-3 w-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
        </button>

        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowMenu(false)}
            />
            
            <div className="theme-switcher-container absolute right-0 mt-2 w-64 rounded-2xl shadow-xl z-20 p-2"
            >
              <div className="px-3 py-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Theme
                </p>
              </div>

              {themes.map((themeOption) => {
                const Icon = themeOption.icon;
                const isActive = theme === themeOption.id;

                return (
                  <button
                    key={themeOption.id}
                    onClick={() => {
                      setTheme(themeOption.id);
                      setShowMenu(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition ${
                      isActive
                        ? ''
                        : 'hover:bg-white/5'
                    }`}
                    style={{
                      backgroundColor: isActive ? 'var(--accent-green-light)' : 'transparent'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="h-9 w-9 rounded-lg flex items-center justify-center"
                        style={{
                          backgroundColor: isActive ? 'var(--accent-green-light)' : 'var(--surface-hover)',
                          color: isActive ? 'var(--accent-green)' : 'var(--text-tertiary)'
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {themeOption.label}
                        </p>
                        <p className="text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {themeOption.description}
                        </p>
                      </div>
                    </div>
                    {isActive && (
                      <Check className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // New compact switch version - replaces the dropdown for better UX
  const switchCompact = () => {
    const toggleTheme = () => {
      if (theme === 'light') {
        setTheme('dark');
      } else if (theme === 'dark') {
        setTheme('system');
      } else {
        setTheme('light');
      }
    };

    return (
      <button
        onClick={toggleTheme}
        className="theme-switcher-toggle flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200 hover:scale-105"
        style={{
          color: 'var(--text-primary)'
        }}
        aria-label={`Current theme: ${currentTheme?.label}. Click to cycle themes.`}
        title={`Current: ${currentTheme?.label}. Click to cycle through Light → Dark → System`}
      >
        <CurrentIcon className="h-4 w-4" />
        <span className="text-sm font-medium hidden sm:inline">
          {currentTheme?.label}
        </span>
      </button>
    );
  };

  // Alternative: Simple light/dark toggle (most common use case)
  // const simpleToggle = () => {
  //   return (
  //     <button
  //       onClick={() => setTheme(isDark ? 'light' : 'dark')}
  //       className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:ring-offset-2"
  //       style={{
  //         backgroundColor: isDark ? 'var(--forest-500)' : '#e5e7eb'
  //       }}
  //       aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
  //       title={`Current: ${isDark ? 'Dark' : 'Light'} mode. Click to switch.`}
  //     >
  //       <span
  //         className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
  //           isDark ? 'translate-x-7' : 'translate-x-1'
  //         }`}
  //       />
  //       <div className="absolute inset-0 flex items-center justify-between px-1.5">
  //         <Sun className={`h-3.5 w-3.5 ${!isDark ? 'text-yellow-500' : 'text-gray-400'}`} />
  //         <Moon className={`h-3.5 w-3.5 ${isDark ? 'text-blue-300' : 'text-gray-400'}`} />
  //       </div>
  //     </button>
  //   );
  // };

  // Enhanced toggle with system option (long press or right-click)
  const enhancedToggle = () => {
    const handleClick = (e) => {
      if (e.type === 'contextmenu' || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        setTheme('system');
      } else {
        setTheme(isDark ? 'light' : 'dark');
      }
    };

    // const getThemeIndicator = () => {
    //   if (theme === 'system') return '🖥️'; // System icon
    //   return isDark ? '🌙' : '☀️'; // Current theme
    // };

    return (
      <button
        onClick={handleClick}
        onContextMenu={handleClick}
        className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{
          backgroundColor: isDark ? 'var(--accent-green)' : '#e5e7eb',
          border: '1px solid var(--border)',
          focusRingColor: 'var(--accent-green)'
        }}
        aria-label={`Current theme: ${theme}. Click to toggle, right-click for system.`}
        title={`Current: ${theme} mode. Click to toggle, right-click (or Cmd/Ctrl+click) for system mode.`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
            isDark ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
        <div className="absolute inset-0 flex items-center justify-between px-1.5">
          <Sun className={`h-3.5 w-3.5 ${!isDark ? 'text-yellow-500' : 'text-gray-400'}`} />
          <Moon className={`h-3.5 w-3.5 ${isDark ? 'text-blue-300' : 'text-gray-400'}`} />
        </div>
        {theme === 'system' && (
          <div 
            className="absolute -top-1 -right-1 h-3 w-3 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-green)' }}
          >
            <span className="text-xs">🖥️</span>
          </div>
        )}
      </button>
    );
  };

  // For non-compact mode, show the full grid or switch options
  if (showLabel) {
    // Show enhanced toggle switch with system option
    return enhancedToggle();
  }

  // Default: show the cycle button for compact mode
  return switchCompact();
};

export default ThemeSwitcher;
