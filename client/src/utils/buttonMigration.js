// Button Migration Utility
// This file contains helper functions to migrate existing buttons to the new Button component

export const BUTTON_MIGRATION_GUIDE = {
  // Common button patterns to replace
  patterns: {
    // Primary buttons (green background)
    primary: {
      className: 'bg-forest-500 hover:bg-forest-600 text-white',
      replacement: { variant: 'primary' }
    },
    
    // Secondary buttons (surface background)
    secondary: {
      className: 'bg-var(--surface) border-var(--border) text-var(--text-primary)',
      replacement: { variant: 'secondary' }
    },
    
    // Outline buttons
    outline: {
      className: 'border-forest-500 text-forest-500 hover:bg-forest-500 hover:text-white',
      replacement: { variant: 'outline' }
    },
    
    // Ghost buttons
    ghost: {
      className: 'bg-transparent hover:bg-var(--surface-hover)',
      replacement: { variant: 'ghost' }
    }
  },
  
  // Size mappings
  sizes: {
    'px-2 py-1 text-xs': 'xs',
    'px-3 py-1.5 text-sm': 'sm', 
    'px-4 py-2 text-sm': 'md',
    'px-6 py-3 text-base': 'lg',
    'px-8 py-4 text-lg': 'xl'
  },
  
  // Common icon mappings
  icons: {
    'ArrowRight': 'ArrowRight',
    'ArrowLeft': 'ArrowLeft', 
    'Plus': 'Plus',
    'Save': 'Save',
    'Edit': 'Edit',
    'Trash': 'Trash2',
    'Eye': 'Eye',
    'Calendar': 'Calendar',
    'Search': 'Search',
    'Filter': 'Filter',
    'Download': 'Download',
    'Upload': 'Upload',
    'Settings': 'Settings',
    'User': 'User',
    'Mail': 'Mail',
    'Lock': 'Lock',
    'Heart': 'Heart',
    'Star': 'Star',
    'Share': 'Share2',
    'Copy': 'Copy',
    'ExternalLink': 'ExternalLink',
    'Navigation': 'Navigation',
    'MapPin': 'MapPin',
    'Compass': 'Compass',
    'Mountain': 'Mountain',
    'Camera': 'Camera',
    'BookOpen': 'BookOpen',
    'Route': 'Route',
    'Clock': 'Clock',
    'DollarSign': 'DollarSign',
    'Phone': 'Phone',
    'Globe': 'Globe',
    'Info': 'Info',
    'Tent': 'Tent',
    'Utensils': 'Utensils',
    'Wifi': 'Wifi',
    'Sparkles': 'Sparkles',
    'Check': 'Check',
    'X': 'X',
    'Menu': 'Menu',
    'LogOut': 'LogOut'
  }
};

// Helper function to determine button variant from className
export const getVariantFromClassName = (className) => {
  if (className.includes('bg-forest-500') || className.includes('bg-green-500') || className.includes('var(--accent-green)')) {
    return 'primary';
  }
  if (className.includes('bg-transparent') && className.includes('border-')) {
    return 'outline';
  }
  if (className.includes('bg-transparent') && !className.includes('border-')) {
    return 'ghost';
  }
  if (className.includes('bg-red-500') || className.includes('bg-red-600')) {
    return 'danger';
  }
  return 'secondary';
};

// Helper function to determine button size from className
export const getSizeFromClassName = (className) => {
  if (className.includes('px-2 py-1 text-xs')) return 'xs';
  if (className.includes('px-3 py-1.5 text-sm')) return 'sm';
  if (className.includes('px-6 py-3 text-base')) return 'lg';
  if (className.includes('px-8 py-4 text-lg')) return 'xl';
  return 'md';
};

// Helper function to extract icon from JSX
export const getIconFromJSX = (jsxString) => {
  const iconMatches = jsxString.match(/<(\w+)\s+className="[^"]*h-\d+\s+w-\d+[^"]*"/);
  return iconMatches ? iconMatches[1] : null;
};

// Migration examples for common button patterns
export const MIGRATION_EXAMPLES = {
  // Example 1: Simple primary button
  before1: `<button className="px-4 py-2 bg-forest-500 text-white rounded-full">Click me</button>`,
  after1: `<Button variant="primary" size="md">Click me</Button>`,
  
  // Example 2: Button with icon
  before2: `<button className="px-4 py-2 bg-forest-500 text-white rounded-full">
    <ArrowRight className="h-4 w-4" />
    Next
  </button>`,
  after2: `<Button variant="primary" size="md" icon={ArrowRight}>Next</Button>`,
  
  // Example 3: Button with loading state
  before3: `<button disabled={loading} className="px-4 py-2 bg-forest-500 text-white rounded-full">
    {loading ? 'Loading...' : 'Submit'}
  </button>`,
  after3: `<Button variant="primary" size="md" loading={loading}>Submit</Button>`,
  
  // Example 4: Link button
  before4: `<a href="/path" className="px-4 py-2 bg-forest-500 text-white rounded-full">Go</a>`,
  after4: `<Button href="/path" variant="primary" size="md">Go</Button>`
};

export default BUTTON_MIGRATION_GUIDE;
