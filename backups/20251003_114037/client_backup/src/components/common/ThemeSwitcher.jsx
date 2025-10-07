import React, { useState } from 'react';
import { Sun, Moon, Monitor, ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const ThemeSwitcher = ({ showLabel = false, compact = false }) => {
  const { theme, setTheme } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const themes = [
    { id: 'light', label: 'Light', icon: Sun, description: 'Bright and clear' },
    { id: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { id: 'system', label: 'System', icon: Monitor, description: 'Use system setting' }
  ];

  const currentTheme = themes.find(t => t.id === theme);
  const CurrentIcon = currentTheme?.icon || Monitor;

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-3 py-2 rounded-full transition"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
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
            
            <div className="absolute right-0 mt-2 w-64 rounded-2xl shadow-xl z-20 p-2 backdrop-blur-xl"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
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
                        ? 'bg-forest-500/20'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                        isActive
                          ? 'bg-forest-500/20 text-forest-500'
                          : 'bg-white/5 text-gray-400'
                      }`}>
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
                      <Check className="h-4 w-4 text-forest-500" />
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

  return (
    <div className="grid grid-cols-3 gap-3">
      {themes.map((themeOption) => {
        const Icon = themeOption.icon;
        return (
          <button
            key={themeOption.id}
            onClick={() => setTheme(themeOption.id)}
            className={`p-4 rounded-xl text-center font-medium transition ${
              theme === themeOption.id
                ? 'ring-2 ring-purple-500'
                : 'hover:bg-white/5'
            }`}
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
          >
            <Icon className="h-6 w-6 mx-auto mb-2" />
            {showLabel && <div className="text-sm">{themeOption.label}</div>}
          </button>
        );
      })}
    </div>
  );
};

export default ThemeSwitcher;
