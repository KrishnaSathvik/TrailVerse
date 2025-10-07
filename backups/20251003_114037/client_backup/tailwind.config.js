/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme with nature-inspired accents
        background: {
          DEFAULT: '#0A0E0F', // Slightly warmer than pure black
          light: '#131719',
          lighter: '#1A1F21',
        },
        // Light theme backgrounds
        'background-light': {
          DEFAULT: '#FEFCF9', // Warm white with cream undertone
          light: '#F9F7F4', // Soft beige
          lighter: '#F4F1EC', // Light warm gray
        },
        forest: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e', // Primary green
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        earth: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        sky: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Keep existing for compatibility
        dark: {
          bg: '#0A0E0F',
          'bg-light': '#131719',
          'bg-lighter': '#1A1F21',
          surface: 'rgba(255, 255, 255, 0.05)',
          'surface-hover': 'rgba(255, 255, 255, 0.10)',
          border: 'rgba(255, 255, 255, 0.10)',
          text: '#FFFFFF',
          'text-secondary': 'rgba(255, 255, 255, 0.70)',
          'text-tertiary': 'rgba(255, 255, 255, 0.40)',
        },
        light: {
          bg: '#FDFDFB',
          'bg-light': '#F8F8F6',
          'bg-lighter': '#F3F3F0',
          surface: 'rgba(0, 0, 0, 0.02)',
          'surface-hover': 'rgba(0, 0, 0, 0.05)',
          border: 'rgba(0, 0, 0, 0.08)',
          text: '#1A1A1A',
          'text-secondary': 'rgba(0, 0, 0, 0.70)',
          'text-tertiary': 'rgba(0, 0, 0, 0.50)',
        },
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#059669',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'sans-serif'],
      },
      fontSize: {
        '7xl': ['4.5rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        '8xl': ['6rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        '9xl': ['8rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
      },
      backgroundImage: {
        'hero-pattern': "url('/images/hero-mountain.jpg')",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
        'hero-dark': "linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.8)), url('/images/hero-dark.jpg')",
        'hero-light': "linear-gradient(to bottom, rgba(255,255,255,0.3), rgba(255,255,255,0.7)), url('/images/hero-light.jpg')",
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-lg': '0 16px 48px 0 rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/line-clamp'),
  ],
}