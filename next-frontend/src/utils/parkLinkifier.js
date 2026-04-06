// next-frontend/src/utils/parkLinkifier.js

// Map of park name variations to their slug
// These are the 63 national parks — cover common name variations
const PARK_NAME_TO_SLUG = {
  'Yellowstone': 'yellowstone-national-park',
  'Yellowstone National Park': 'yellowstone-national-park',
  'Yosemite': 'yosemite-national-park',
  'Yosemite National Park': 'yosemite-national-park',
  'Grand Canyon': 'grand-canyon-national-park',
  'Grand Canyon National Park': 'grand-canyon-national-park',
  'Zion': 'zion-national-park',
  'Zion National Park': 'zion-national-park',
  'Glacier': 'glacier-national-park',
  'Glacier National Park': 'glacier-national-park',
  'Acadia': 'acadia-national-park',
  'Acadia National Park': 'acadia-national-park',
  'Arches': 'arches-national-park',
  'Arches National Park': 'arches-national-park',
  'Badlands': 'badlands-national-park',
  'Badlands National Park': 'badlands-national-park',
  'Big Bend': 'big-bend-national-park',
  'Big Bend National Park': 'big-bend-national-park',
  'Biscayne': 'biscayne-national-park',
  'Biscayne National Park': 'biscayne-national-park',
  'Bryce Canyon': 'bryce-canyon-national-park',
  'Bryce Canyon National Park': 'bryce-canyon-national-park',
  'Canyonlands': 'canyonlands-national-park',
  'Canyonlands National Park': 'canyonlands-national-park',
  'Capitol Reef': 'capitol-reef-national-park',
  'Capitol Reef National Park': 'capitol-reef-national-park',
  'Carlsbad Caverns': 'carlsbad-caverns-national-park',
  'Carlsbad Caverns National Park': 'carlsbad-caverns-national-park',
  'Channel Islands': 'channel-islands-national-park',
  'Channel Islands National Park': 'channel-islands-national-park',
  'Congaree': 'congaree-national-park',
  'Congaree National Park': 'congaree-national-park',
  'Crater Lake': 'crater-lake-national-park',
  'Crater Lake National Park': 'crater-lake-national-park',
  'Cuyahoga Valley': 'cuyahoga-valley-national-park',
  'Cuyahoga Valley National Park': 'cuyahoga-valley-national-park',
  'Death Valley': 'death-valley-national-park',
  'Death Valley National Park': 'death-valley-national-park',
  'Denali': 'denali-national-park-and-preserve',
  'Denali National Park': 'denali-national-park-and-preserve',
  'Dry Tortugas': 'dry-tortugas-national-park',
  'Dry Tortugas National Park': 'dry-tortugas-national-park',
  'Everglades': 'everglades-national-park',
  'Everglades National Park': 'everglades-national-park',
  'Glacier Bay': 'glacier-bay-national-park-and-preserve',
  'Glacier Bay National Park': 'glacier-bay-national-park-and-preserve',
  'Grand Teton': 'grand-teton-national-park',
  'Grand Teton National Park': 'grand-teton-national-park',
  'Great Basin': 'great-basin-national-park',
  'Great Basin National Park': 'great-basin-national-park',
  'Great Sand Dunes': 'great-sand-dunes-national-park-and-preserve',
  'Great Sand Dunes National Park': 'great-sand-dunes-national-park-and-preserve',
  'Great Smoky Mountains': 'great-smoky-mountains-national-park',
  'Great Smoky Mountains National Park': 'great-smoky-mountains-national-park',
  'Guadalupe Mountains': 'guadalupe-mountains-national-park',
  'Guadalupe Mountains National Park': 'guadalupe-mountains-national-park',
  'Haleakala': 'haleakala-national-park',
  'Haleakala National Park': 'haleakala-national-park',
  'Hawaii Volcanoes': 'hawaii-volcanoes-national-park',
  'Hawaii Volcanoes National Park': 'hawaii-volcanoes-national-park',
  'Hot Springs': 'hot-springs-national-park',
  'Hot Springs National Park': 'hot-springs-national-park',
  'Indiana Dunes': 'indiana-dunes-national-park',
  'Indiana Dunes National Park': 'indiana-dunes-national-park',
  'Isle Royale': 'isle-royale-national-park',
  'Isle Royale National Park': 'isle-royale-national-park',
  'Joshua Tree': 'joshua-tree-national-park',
  'Joshua Tree National Park': 'joshua-tree-national-park',
  'Katmai': 'katmai-national-park-and-preserve',
  'Katmai National Park': 'katmai-national-park-and-preserve',
  'Kenai Fjords': 'kenai-fjords-national-park',
  'Kenai Fjords National Park': 'kenai-fjords-national-park',
  'Lassen Volcanic': 'lassen-volcanic-national-park',
  'Lassen Volcanic National Park': 'lassen-volcanic-national-park',
  'Mammoth Cave': 'mammoth-cave-national-park',
  'Mammoth Cave National Park': 'mammoth-cave-national-park',
  'Mesa Verde': 'mesa-verde-national-park',
  'Mesa Verde National Park': 'mesa-verde-national-park',
  'Mount Rainier': 'mount-rainier-national-park',
  'Mount Rainier National Park': 'mount-rainier-national-park',
  'North Cascades': 'north-cascades-national-park',
  'North Cascades National Park': 'north-cascades-national-park',
  'Olympic': 'olympic-national-park',
  'Olympic National Park': 'olympic-national-park',
  'Petrified Forest': 'petrified-forest-national-park',
  'Petrified Forest National Park': 'petrified-forest-national-park',
  'Pinnacles': 'pinnacles-national-park',
  'Pinnacles National Park': 'pinnacles-national-park',
  'Redwood': 'redwood-national-and-state-parks',
  'Redwood National Park': 'redwood-national-and-state-parks',
  'Rocky Mountain': 'rocky-mountain-national-park',
  'Rocky Mountain National Park': 'rocky-mountain-national-park',
  'Saguaro': 'saguaro-national-park',
  'Saguaro National Park': 'saguaro-national-park',
  'Sequoia': 'sequoia-national-park',
  'Sequoia National Park': 'sequoia-national-park',
  'Shenandoah': 'shenandoah-national-park',
  'Shenandoah National Park': 'shenandoah-national-park',
  'Theodore Roosevelt': 'theodore-roosevelt-national-park',
  'Theodore Roosevelt National Park': 'theodore-roosevelt-national-park',
  'Voyageurs': 'voyageurs-national-park',
  'Voyageurs National Park': 'voyageurs-national-park',
  'White Sands': 'white-sands-national-park',
  'White Sands National Park': 'white-sands-national-park',
  'Wind Cave': 'wind-cave-national-park',
  'Wind Cave National Park': 'wind-cave-national-park',
  'Wrangell-St. Elias': 'wrangell-st-elias-national-park-and-preserve',
  'New River Gorge': 'new-river-gorge-national-park-and-preserve',
  'New River Gorge National Park': 'new-river-gorge-national-park-and-preserve',
  'Virgin Islands': 'virgin-islands-national-park',
  'Virgin Islands National Park': 'virgin-islands-national-park',
};

// Sort by length descending so longer matches (e.g. "Grand Canyon National Park")
// are matched before shorter ones ("Grand Canyon")
const sortedParks = Object.keys(PARK_NAME_TO_SLUG).sort((a, b) => b.length - a.length);

/**
 * Replace park name occurrences in markdown text with markdown links.
 * Only replaces in plain text — skips existing markdown links and code blocks.
 * currentSlug: the slug of the current page (to avoid self-linking)
 */
export function linkifyParkNames(content, currentSlug = '') {
  if (!content || typeof content !== 'string') return content;

  // Split on code blocks and existing links to avoid processing them
  const codeBlockRegex = /```[\s\S]*?```|`[^`]+`|\[([^\]]+)\]\([^)]+\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({ text: content.slice(lastIndex, match.index), process: true });
    }
    parts.push({ text: match[0], process: false });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), process: true });
  }

  return parts.map(part => {
    if (!part.process) return part.text;

    let text = part.text;
    for (const parkName of sortedParks) {
      const slug = PARK_NAME_TO_SLUG[parkName];
      // Don't self-link
      if (currentSlug && currentSlug === slug) continue;
      // Match whole word occurrences not already inside a link
      const regex = new RegExp(`(?<!\\[)\\b(${parkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b(?![^[]*\\])`, 'g');
      text = text.replace(regex, `[$1](/parks/${slug})`);
    }
    return text;
  }).join('');
}

/**
 * Replace park name occurrences in HTML text with HTML links.
 * Skips text already inside <a> tags and HTML tags themselves.
 * currentSlug: the slug of the current page (to avoid self-linking)
 */
export function linkifyParkNamesHtml(content, currentSlug = '') {
  if (!content || typeof content !== 'string') return content;

  // Split on HTML tags and existing <a>...</a> blocks to avoid processing them
  const htmlBlockRegex = /<a\b[^>]*>[\s\S]*?<\/a>|<[^>]+>/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = htmlBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: content.slice(lastIndex, match.index), process: true });
    }
    parts.push({ text: match[0], process: false });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), process: true });
  }

  return parts.map(part => {
    if (!part.process) return part.text;

    let text = part.text;
    for (const parkName of sortedParks) {
      const slug = PARK_NAME_TO_SLUG[parkName];
      if (currentSlug && currentSlug === slug) continue;
      const regex = new RegExp(`\\b(${parkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'g');
      text = text.replace(regex, `<a href="/parks/${slug}" style="color:var(--accent-green);text-decoration:underline">$1</a>`);
    }
    return text;
  }).join('');
}

export default PARK_NAME_TO_SLUG;
