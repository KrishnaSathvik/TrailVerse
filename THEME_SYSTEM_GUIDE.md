# 🎨 TrailVerse - Multi-Theme System Guide

## Overview

The TrailVerse application now features a complete multi-theme system with three modes:
- **Dark Mode** (Default): Deep blacks with nature imagery
- **Light Mode**: Warm whites with subtle earth tones  
- **System Mode**: Respects OS preference

## 🚀 Features

### Theme Modes
- **Dark**: `#0A0E0F` backgrounds with frosted glass effects
- **Light**: `#FDFDFB` warm backgrounds, not harsh white
- **System**: Auto-detects OS preference and switches accordingly

### Persistence
- Theme preference saved to localStorage
- Remembers user choice across sessions
- Smooth transitions between themes

### CSS Variables
All colors defined as CSS variables for easy maintenance:
```css
--bg-primary: #0A0E0F;
--text-primary: #FFFFFF;
--surface: rgba(255, 255, 255, 0.05);
--accent-green: #22c55e;
```

## 📁 File Structure

```
client/src/
├── context/
│   └── ThemeContext.jsx          # Theme provider and hooks
├── components/
│   ├── common/
│   │   └── ThemeSwitcher.jsx     # Theme switcher component
│   └── examples/
│       └── ThemedParkCard.jsx    # Example themed component
├── hooks/
│   └── useThemeClasses.js        # Theme utility hooks
├── styles/
│   └── themes.css                # Theme CSS variables
└── index.css                     # Base styles with theme support
```

## 🎯 Usage

### 1. Using Theme Context

```jsx
import { useTheme } from '../context/ThemeContext';

const MyComponent = () => {
  const { theme, resolvedTheme, setTheme, isDark } = useTheme();
  
  return (
    <div>
      <p>Current theme: {theme}</p>
      <p>Resolved theme: {resolvedTheme}</p>
      <p>Is dark mode: {isDark ? 'Yes' : 'No'}</p>
      <button onClick={() => setTheme('light')}>
        Switch to Light
      </button>
    </div>
  );
};
```

### 2. Using CSS Variables

```jsx
const ThemedComponent = () => {
  return (
    <div 
      className="p-4 rounded-lg"
      style={{
        backgroundColor: 'var(--surface)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow)'
      }}
    >
      Content
    </div>
  );
};
```

### 3. Using Theme Utility Hooks

```jsx
import { useThemeStyles } from '../hooks/useThemeClasses';

const MyComponent = () => {
  const themeStyles = useThemeStyles();
  
  return (
    <div 
      style={{
        backgroundColor: themeStyles.bg.primary,
        color: themeStyles.text.primary,
        borderColor: themeStyles.border.base
      }}
    >
      Content
    </div>
  );
};
```

### 4. Using Tailwind Classes

```jsx
// Use the new theme-aware classes
<div className="bg-dark-bg text-dark-text">
  Dark theme content
</div>

<div className="bg-light-bg text-light-text">
  Light theme content
</div>

// Or use CSS variables directly
<div className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
  Theme-aware content
</div>
```

## 🎨 Color Palette

### Dark Theme
- **Primary Background**: `#0A0E0F`
- **Secondary Background**: `#131719`
- **Surface**: `rgba(255, 255, 255, 0.05)`
- **Text Primary**: `#FFFFFF`
- **Text Secondary**: `rgba(255, 255, 255, 0.70)`
- **Border**: `rgba(255, 255, 255, 0.10)`

### Light Theme
- **Primary Background**: `#FDFDFB` (warm white)
- **Secondary Background**: `#F8F8F6`
- **Surface**: `rgba(0, 0, 0, 0.02)`
- **Text Primary**: `#1A1A1A`
- **Text Secondary**: `rgba(0, 0, 0, 0.70)`
- **Border**: `rgba(0, 0, 0, 0.08)`

### Brand Colors (Universal)
- **Forest Green**: `#22c55e` / `#16a34a`
- **Earth Orange**: `#f97316` / `#ea580c`
- **Sky Blue**: `#0ea5e9` / `#0284c7`

## 🛠️ Component Guidelines

### 1. Always Use CSS Variables
```jsx
// ✅ Good
<div style={{ color: 'var(--text-primary)' }}>

// ❌ Bad
<div className="text-white dark:text-black">
```

### 2. Use Theme Utility Hooks
```jsx
// ✅ Good
const themeStyles = useThemeStyles();
<div style={{ backgroundColor: themeStyles.bg.primary }}>

// ❌ Bad
<div className={isDark ? 'bg-gray-900' : 'bg-white'}>
```

### 3. Consistent Spacing
```jsx
// Use consistent border radius
<div className="rounded-xl">  // 12px
<div className="rounded-2xl"> // 16px
<div className="rounded-3xl"> // 24px
```

### 4. Glass Morphism Effects
```jsx
<div className="glass">  // Uses backdrop-blur and surface colors
```

## 🔧 Customization

### Adding New Theme Colors

1. **Update CSS Variables** in `styles/themes.css`:
```css
.dark {
  --new-color: #123456;
}

.light {
  --new-color: #654321;
}
```

2. **Update Tailwind Config** in `tailwind.config.js`:
```js
colors: {
  custom: {
    color: 'var(--new-color)'
  }
}
```

3. **Use in Components**:
```jsx
<div style={{ backgroundColor: 'var(--new-color)' }}>
```

### Adding New Theme Modes

1. **Update ThemeContext** to support new mode
2. **Add CSS variables** for new theme
3. **Update ThemeSwitcher** component
4. **Test across all components**

## 🚀 Performance

### Optimizations
- CSS variables for instant theme switching
- Smooth transitions with `transition` property
- No JavaScript re-renders for theme changes
- Minimal bundle size impact

### Best Practices
- Use CSS variables over conditional classes
- Avoid inline styles when possible
- Use `will-change` for animated elements
- Test theme switching performance

## 🧪 Testing

### Manual Testing
1. Switch between all three themes
2. Verify persistence across page reloads
3. Test system theme detection
4. Check all components in both themes

### Automated Testing
```jsx
// Test theme context
const { result } = renderHook(() => useTheme(), {
  wrapper: ThemeProvider
});

expect(result.current.theme).toBe('system');
```

## 📱 Mobile Considerations

- Theme switcher works on mobile
- System theme detection works on mobile
- Touch-friendly theme switcher UI
- Proper contrast ratios for accessibility

## ♿ Accessibility

- High contrast ratios in both themes
- Respects `prefers-color-scheme` media query
- Keyboard navigation for theme switcher
- Screen reader friendly labels

## 🔮 Future Enhancements

1. **Custom Theme Creator**: Let users create custom themes
2. **Theme Scheduling**: Auto-switch themes based on time
3. **More Theme Modes**: High contrast, sepia, etc.
4. **Theme Animations**: Smooth transitions between themes
5. **Theme Sharing**: Share custom themes between users

---

## 🎯 Quick Start

1. **Use Theme Context**:
```jsx
import { useTheme } from '../context/ThemeContext';
const { theme, setTheme } = useTheme();
```

2. **Use CSS Variables**:
```jsx
<div style={{ color: 'var(--text-primary)' }}>
```

3. **Use Theme Hooks**:
```jsx
import { useThemeStyles } from '../hooks/useThemeClasses';
const themeStyles = useThemeStyles();
```

4. **Add Theme Switcher**:
```jsx
import ThemeSwitcher from '../components/common/ThemeSwitcher';
<ThemeSwitcher />
```

That's it! Your components are now theme-aware! 🎉
