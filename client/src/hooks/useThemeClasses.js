import { useTheme } from '../context/ThemeContext';

export const useThemeClasses = () => {
  const { isDark } = useTheme();

  return {
    bg: {
      primary: isDark ? 'bg-dark-bg' : 'bg-light-bg',
      secondary: isDark ? 'bg-dark-bg-light' : 'bg-light-bg-light',
      tertiary: isDark ? 'bg-dark-bg-lighter' : 'bg-light-bg-lighter',
    },
    text: {
      primary: isDark ? 'text-dark-text' : 'text-light-text',
      secondary: isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary',
      tertiary: isDark ? 'text-dark-text-tertiary' : 'text-light-text-tertiary',
    },
    surface: isDark ? 'bg-white/5' : 'bg-black/2',
    surfaceHover: isDark ? 'hover:bg-white/10' : 'hover:bg-black/5',
    border: isDark ? 'border-white/10' : 'border-black/8',
    ring: isDark ? 'ring-white/10' : 'ring-black/8',
  };
};

// Utility function for CSS variables
export const useThemeStyles = () => {
  return {
    bg: {
      primary: 'var(--bg-primary)',
      secondary: 'var(--bg-secondary)',
      tertiary: 'var(--bg-tertiary)',
    },
    surface: {
      base: 'var(--surface)',
      hover: 'var(--surface-hover)',
      active: 'var(--surface-active)',
    },
    text: {
      primary: 'var(--text-primary)',
      secondary: 'var(--text-secondary)',
      tertiary: 'var(--text-tertiary)',
    },
    border: {
      base: 'var(--border)',
      hover: 'var(--border-hover)',
    },
    accent: {
      green: 'var(--accent-green)',
      blue: 'var(--accent-blue)',
      orange: 'var(--accent-orange)',
    },
    shadow: {
      sm: 'var(--shadow-sm)',
      base: 'var(--shadow)',
      lg: 'var(--shadow-lg)',
      xl: 'var(--shadow-xl)',
    },
  };
};
