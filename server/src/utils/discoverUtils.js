const STATE_CODE_TO_SLUG = {
  AL: 'alabama',
  AK: 'alaska',
  AZ: 'arizona',
  AR: 'arkansas',
  CA: 'california',
  CO: 'colorado',
  CT: 'connecticut',
  DE: 'delaware',
  DC: 'district-of-columbia',
  FL: 'florida',
  GA: 'georgia',
  HI: 'hawaii',
  ID: 'idaho',
  IL: 'illinois',
  IN: 'indiana',
  IA: 'iowa',
  KS: 'kansas',
  KY: 'kentucky',
  LA: 'louisiana',
  ME: 'maine',
  MD: 'maryland',
  MA: 'massachusetts',
  MI: 'michigan',
  MN: 'minnesota',
  MS: 'mississippi',
  MO: 'missouri',
  MT: 'montana',
  NE: 'nebraska',
  NV: 'nevada',
  NH: 'new-hampshire',
  NJ: 'new-jersey',
  NM: 'new-mexico',
  NY: 'new-york',
  NC: 'north-carolina',
  ND: 'north-dakota',
  OH: 'ohio',
  OK: 'oklahoma',
  OR: 'oregon',
  PA: 'pennsylvania',
  RI: 'rhode-island',
  SC: 'south-carolina',
  SD: 'south-dakota',
  TN: 'tennessee',
  TX: 'texas',
  UT: 'utah',
  VT: 'vermont',
  VA: 'virginia',
  WA: 'washington',
  WV: 'west-virginia',
  WI: 'wisconsin',
  WY: 'wyoming',
  AS: 'american-samoa',
  GU: 'guam',
  PR: 'puerto-rico',
  VI: 'virgin-islands'
};

const STATE_NAMES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  AS: 'American Samoa',
  GU: 'Guam',
  PR: 'Puerto Rico',
  VI: 'Virgin Islands'
};

const TYPE_GROUPS = [
  { name: 'Parks', slug: 'parks', match: (d) => /^national park$/i.test(d) },
  { name: 'Monuments', slug: 'monuments', match: (d) => /monument/i.test(d) },
  { name: 'Historic Sites', slug: 'historic-sites', match: (d) => /historic site/i.test(d) },
  { name: 'Historical Parks', slug: 'historical-parks', match: (d) => /historical park/i.test(d) },
  { name: 'Memorials', slug: 'memorials', match: (d) => /memorial/i.test(d) },
  { name: 'Preserves', slug: 'preserves', match: (d) => /preserve/i.test(d) },
  { name: 'Recreation Areas', slug: 'recreation-areas', match: (d) => /recreation area/i.test(d) },
  { name: 'Seashores', slug: 'seashores', match: (d) => /seashore/i.test(d) },
  { name: 'Other Designations', slug: 'other-designations', match: () => true }
];

function slugify(name = '') {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function activityIconKey(name = '') {
  return slugify(name);
}

function groupDesignation(designation = '') {
  const d = designation || 'Unknown';
  for (const group of TYPE_GROUPS) {
    if (group.slug === 'other-designations') continue;
    if (group.match(d)) return group;
  }
  return TYPE_GROUPS.find((g) => g.slug === 'other-designations');
}

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function activityKeywordTokens(name = '') {
  const lower = name.toLowerCase();
  const tokens = lower.split(/\s+/).filter((t) => t.length > 2);
  if (lower.includes('astronomy') || lower.includes('stargaz')) {
    return [...tokens, 'astro', 'star', 'night', 'sky', 'dark'];
  }
  if (lower.includes('wildlife')) {
    return [...tokens, 'wildlife', 'bird', 'animal'];
  }
  if (lower.includes('hiking') || lower.includes('trail')) {
    return [...tokens, 'hike', 'trail', 'walk'];
  }
  return tokens;
}

function parkMatchesTypeSlug(park, typeSlug) {
  const designation = park.designation || '';
  if (typeSlug === 'other-designations') {
    const grouped = groupDesignation(designation);
    return grouped.slug === 'other-designations';
  }
  const group = TYPE_GROUPS.find((g) => g.slug === typeSlug);
  return group ? group.match(designation) : false;
}

function isParkIndexHealthy(index, expectedItemCount) {
  if (!index || typeof index !== 'object') return false;
  const keys = Object.keys(index);
  if (!keys.length) return false;
  if (expectedItemCount > 0 && keys.length < expectedItemCount * 0.5) return false;

  const emptyCount = keys.filter((key) => !(index[key] || []).length).length;
  const emptyRatio = emptyCount / keys.length;
  return emptyRatio <= 0.15;
}

module.exports = {
  isParkIndexHealthy,
  STATE_CODE_TO_SLUG,
  STATE_NAMES,
  TYPE_GROUPS,
  slugify,
  activityIconKey,
  groupDesignation,
  parkMatchesTypeSlug,
  stripHtml,
  activityKeywordTokens
};
