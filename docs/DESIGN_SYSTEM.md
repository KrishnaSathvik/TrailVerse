# TrailVerse Design System

## 🎨 Design Tokens & Guidelines

This document outlines the complete design system for TrailVerse, ensuring consistency across all components and pages.

---

## 🌈 Color Palette

### Primary Colors
```css
/* Forest Green - Primary Brand Color */
--accent-green: #22c55e;        /* Primary actions, success states */
--accent-green-alt: #059669;    /* Darker variant for hover states */

/* Sky Blue - Secondary Actions */
--accent-blue: #0ea5e9;         /* Secondary actions, links */
--accent-blue-alt: #0369A1;     /* Darker variant for hover states */

/* Earth Orange - Accent */
--accent-orange: #f97316;       /* Warning states, highlights */
--accent-earth: #B45309;        /* Earth tones, natural elements */
```

### Background Colors
```css
/* Dark Theme */
--bg-primary: #0A0E0F;          /* Main background */
--bg-secondary: #131719;        /* Secondary backgrounds */
--bg-tertiary: #1A1F21;         /* Tertiary backgrounds */

/* Light Theme */
--bg-primary: #FEFCF9;          /* Warm white with cream undertone */
--bg-secondary: #F9F7F4;        /* Soft beige */
--bg-tertiary: #F4F1EC;         /* Light warm gray */
```

### Surface Colors
```css
/* Universal Surface Colors */
--surface: rgba(255, 255, 255, 0.05);           /* Card backgrounds */
--surface-hover: rgba(255, 255, 255, 0.10);     /* Hover states */
--surface-active: rgba(255, 255, 255, 0.15);    /* Active states */

/* Light Theme Surfaces */
--surface: rgba(255, 255, 255, 0.8);            /* Semi-transparent white */
--surface-hover: rgba(255, 255, 255, 0.9);      /* More opaque on hover */
--surface-active: rgba(255, 255, 255, 0.95);    /* Nearly opaque when active */
```

### Text Colors
```css
/* Universal Text Hierarchy */
--text-primary: #FFFFFF;                        /* Primary text (dark theme) */
--text-primary: #2D2B28;                        /* Primary text (light theme) */
--text-secondary: rgba(255, 255, 255, 0.85);    /* Secondary text */
--text-tertiary: rgba(255, 255, 255, 0.60);     /* Tertiary text */
```

### Border Colors
```css
/* Universal Borders */
--border: rgba(255, 255, 255, 0.10);            /* Default borders */
--border-hover: rgba(255, 255, 255, 0.20);      /* Hover borders */

/* Light Theme Borders */
--border: rgba(0, 0, 0, 0.08);                  /* Subtle dark borders */
--border-hover: rgba(0, 0, 0, 0.12);            /* More visible on hover */
```

### Error Colors
```css
/* Error States */
--error-red: #ef4444;                           /* Error messages, danger states */
```

---

## 📝 Typography

### Font Family
```css
font-family: 'Geist', 'Inter', system-ui, sans-serif;
```

### Font Weights
- **Light**: `font-light` (300)
- **Regular**: `font-normal` (400)
- **Medium**: `font-medium` (500)
- **Semibold**: `font-semibold` (600)
- **Bold**: `font-bold` (700)

### Text Sizes
```css
/* Tailwind Text Sizes */
text-xs      /* 12px - Small labels, captions */
text-sm      /* 14px - Secondary text, form labels */
text-base    /* 16px - Body text, default size */
text-lg      /* 18px - Large body text */
text-xl      /* 20px - Small headings */
text-2xl     /* 24px - Medium headings */
text-3xl     /* 30px - Large headings */
text-4xl     /* 36px - Extra large headings */
text-5xl     /* 48px - Hero headings */
```

---

## 📐 Spacing Scale

### Tailwind Spacing Units
```css
/* Spacing Scale (rem units) */
space-1      /* 0.25rem - 4px */
space-2      /* 0.5rem - 8px */
space-3      /* 0.75rem - 12px */
space-4      /* 1rem - 16px */
space-5      /* 1.25rem - 20px */
space-6      /* 1.5rem - 24px */
space-8      /* 2rem - 32px */
space-10     /* 2.5rem - 40px */
space-12     /* 3rem - 48px */
space-16     /* 4rem - 64px */
space-20     /* 5rem - 80px */
```

### Common Spacing Patterns
```css
/* Component Spacing */
.p-4         /* 16px padding - Standard card padding */
.p-5         /* 20px padding - Large card padding */
.p-6         /* 24px padding - Section padding */

/* Layout Spacing */
.mb-4        /* 16px margin-bottom - Standard vertical spacing */
.mb-6        /* 24px margin-bottom - Large vertical spacing */
.mb-8        /* 32px margin-bottom - Section spacing */
```

---

## 🎯 Component Guidelines

### Cards
```css
/* Standard Card Pattern */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;           /* rounded-2xl */
  box-shadow: var(--shadow);
  padding: 1.25rem;              /* p-5 */
}

.card:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-lg);
  transform: translateY(-4px);    /* hover:-translate-y-1 */
}
```

### Buttons
```css
/* Primary Button */
.btn-primary {
  background: var(--accent-green);
  color: white;
  border: none;
  border-radius: 8px;            /* rounded-xl */
  padding: 12px 24px;            /* px-6 py-3 */
  font-weight: 600;              /* font-semibold */
  transition: all 0.2s ease;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

/* Secondary Button */
.btn-secondary {
  background: var(--surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;            /* rounded-xl */
  padding: 12px 24px;            /* px-6 py-3 */
  font-weight: 600;              /* font-semibold */
  transition: all 0.2s ease;
}
```

### Form Inputs
```css
/* Standard Input Pattern */
.input {
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: 12px;           /* rounded-xl */
  padding: 14px 16px;            /* px-4 py-3.5 */
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.input:focus {
  border-color: var(--accent-green);
  background: var(--surface-active);
  outline: none;
}
```

---

## 🎨 Animation & Transitions

### Standard Transitions
```css
/* Component Transitions */
transition: all 0.2s ease;       /* Standard hover transitions */
transition: all 0.3s ease;       /* Longer transitions */
transition: transform 0.3s ease; /* Transform-only transitions */
```

### Hover Effects
```css
/* Standard Hover Patterns */
hover:-translate-y-1              /* Lift effect on cards */
hover:scale-105                   /* Scale effect on buttons */
hover:opacity-80                  /* Opacity change on links */
```

### Loading States
```css
/* Loading Spinners */
.loading-spinner {
  border-color: var(--accent-green);
  animation: spin 1s linear infinite;
}
```

---

## 🏗️ Layout Patterns

### Container Widths
```css
/* Standard Container Sizes */
max-w-7xl    /* 1280px - Main content areas */
max-w-6xl    /* 1152px - Secondary content */
max-w-4xl    /* 896px - Form containers */
max-w-md     /* 448px - Small forms */
```

### Grid Systems
```css
/* Common Grid Patterns */
grid-cols-1 md:grid-cols-2 lg:grid-cols-3    /* Responsive 3-column */
grid-cols-1 md:grid-cols-2                    /* Responsive 2-column */
grid-cols-1 sm:grid-cols-2 lg:grid-cols-4    /* Responsive 4-column */
```

---

## 🌙 Theme Implementation

### CSS Variables Usage
Always use CSS variables for colors to ensure theme consistency:

```css
/* ✅ Correct - Uses CSS variables */
.component {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--border);
}

/* ❌ Incorrect - Hard-coded colors */
.component {
  background-color: #0A0E0F;
  color: #FFFFFF;
  border-color: #333333;
}
```

### Theme Switching
The application supports three themes:
- **Light**: Clean, bright interface
- **Dark**: Dark interface (default)
- **System**: Follows OS preference

---

## 📱 Responsive Design

### Breakpoints
```css
/* Tailwind Breakpoints */
sm: 640px     /* Small devices */
md: 768px     /* Medium devices */
lg: 1024px    /* Large devices */
xl: 1280px    /* Extra large devices */
2xl: 1536px   /* 2X large devices */
```

### Common Responsive Patterns
```css
/* Responsive Text */
text-lg md:text-xl lg:text-2xl

/* Responsive Spacing */
p-4 md:p-6 lg:p-8

/* Responsive Grid */
grid-cols-1 md:grid-cols-2 lg:grid-cols-3
```

---

## ✅ Quality Checklist

### Before Adding New Components:
- [ ] Uses CSS variables for all colors
- [ ] Follows established spacing patterns
- [ ] Implements proper hover states
- [ ] Includes loading/error states
- [ ] Works in both light and dark themes
- [ ] Responsive across all breakpoints
- [ ] Accessible (proper contrast, focus states)
- [ ] Consistent with existing component patterns

### Code Review Checklist:
- [ ] No hard-coded colors (use CSS variables)
- [ ] Consistent border radius (rounded-xl, rounded-2xl)
- [ ] Proper transition timing (0.2s, 0.3s)
- [ ] Semantic HTML structure
- [ ] Proper ARIA labels where needed

---

## 🚀 Getting Started

1. **Import the theme system**: Ensure `themes.css` is imported in your main CSS file
2. **Use the ThemeProvider**: Wrap your app with the ThemeProvider context
3. **Follow component patterns**: Use established patterns for cards, buttons, forms
4. **Test both themes**: Always test components in both light and dark modes
5. **Maintain consistency**: Reference this guide when creating new components

---

*This design system ensures TrailVerse maintains a cohesive, professional appearance across all pages and components while supporting both light and dark themes seamlessly.*
