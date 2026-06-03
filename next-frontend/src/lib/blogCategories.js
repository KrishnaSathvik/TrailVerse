/** Public blog category slugs — shared by admin CMS and /blog/category/[slug] pages */
export const BLOG_CATEGORIES = {
  'trip-planning': {
    name: 'Trip Planning',
    description:
      'Guides and tips for planning your perfect national park visit — itineraries, permits, packing lists, and budgeting advice.',
  },
  'park-guides': {
    name: 'Park Guides',
    description:
      'In-depth guides to individual national parks — best trails, campgrounds, wildlife, seasonal tips, and what to expect.',
  },
  'gear-packing': {
    name: 'Gear & Packing',
    description:
      'What to bring on your national park adventure — gear recommendations, packing lists, and must-have equipment.',
  },
  seasonal: {
    name: 'Seasonal Guides',
    description:
      'The best national parks to visit by season — spring wildflowers, summer crowds, fall foliage, and winter solitude.',
  },
  astrophotography: {
    name: 'Astrophotography',
    description:
      'National park astrophotography guides — dark sky parks, Milky Way timing, camera settings, and the best stargazing spots.',
  },
  'budget-travel': {
    name: 'Budget Travel',
    description:
      'Visit national parks on a budget — free parks, annual pass math, free camping, and money-saving strategies.',
  },
};

export const BLOG_CATEGORY_SLUGS = Object.keys(BLOG_CATEGORIES);

/** Legacy display labels stored on older posts — map to canonical slug */
export const LEGACY_BLOG_CATEGORY_TO_SLUG = {
  Hiking: 'park-guides',
  Photography: 'astrophotography',
  Wildlife: 'park-guides',
  'Travel Tips': 'trip-planning',
  'Park Guides': 'park-guides',
  Camping: 'gear-packing',
  History: 'park-guides',
  Conservation: 'park-guides',
  'Fall Travel Blog': 'seasonal',
  'Travel Blogs': 'trip-planning',
  Astrophotography: 'astrophotography',
  'National Parks': 'park-guides',
  'Seasonal Guides': 'seasonal',
};

export function normalizeBlogCategory(value) {
  if (!value) return 'park-guides';
  if (BLOG_CATEGORIES[value]) return value;
  return LEGACY_BLOG_CATEGORY_TO_SLUG[value] || value.toLowerCase().replace(/\s+/g, '-');
}

export function blogCategoryLabel(slugOrLegacy) {
  const slug = normalizeBlogCategory(slugOrLegacy);
  return BLOG_CATEGORIES[slug]?.name || slugOrLegacy || 'Park Guides';
}
