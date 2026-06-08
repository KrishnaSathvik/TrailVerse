/** Keep in sync with next-frontend/src/lib/blogCategories.js */
const BLOG_CATEGORIES = {
  'trip-planning': { name: 'Trip Planning' },
  'national-parks': { name: 'National Parks' },
  'park-guides': { name: 'Park Guides' },
  'gear-packing': { name: 'Gear & Packing' },
  seasonal: { name: 'Seasonal Guides' },
  astrophotography: { name: 'Astrophotography' },
  'budget-travel': { name: 'Budget Travel' },
};

const LEGACY_BLOG_CATEGORY_TO_SLUG = {
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
  'National Parks': 'national-parks',
  'Seasonal Guides': 'seasonal',
};

function normalizeBlogCategory(value) {
  if (!value) return 'park-guides';
  if (BLOG_CATEGORIES[value]) return value;
  return LEGACY_BLOG_CATEGORY_TO_SLUG[value] || value.toLowerCase().replace(/\s+/g, '-');
}

function blogCategoryLabel(slugOrLegacy) {
  const slug = normalizeBlogCategory(slugOrLegacy);
  return BLOG_CATEGORIES[slug]?.name || slugOrLegacy || 'Park Guides';
}

/** All raw DB values that belong to a canonical category slug */
function categoryValuesForSlug(slugOrLegacy) {
  const slug = normalizeBlogCategory(slugOrLegacy);
  const values = new Set([slug]);
  if (BLOG_CATEGORIES[slug]?.name) values.add(BLOG_CATEGORIES[slug].name);
  for (const [legacy, mapped] of Object.entries(LEGACY_BLOG_CATEGORY_TO_SLUG)) {
    if (mapped === slug) values.add(legacy);
  }
  return [...values];
}

module.exports = {
  BLOG_CATEGORIES,
  LEGACY_BLOG_CATEGORY_TO_SLUG,
  normalizeBlogCategory,
  blogCategoryLabel,
  categoryValuesForSlug,
};
