/**
 * Travel-themed avatar generation utilities
 * Provides multiple avatar generation methods with travel/nature themes
 * Updated to use modern avatar APIs and more variety
 */

// Modern DiceBear v9 styles (updated API)
const DICEBEAR_STYLES = [
  'adventurer',
  'adventurer-neutral',
  'avataaars',
  'avataaars-neutral',
  'big-ears',
  'big-ears-neutral',
  'big-smile',
  'bottts',
  'bottts-neutral',
  'croodles',
  'croodles-neutral',
  'fun-emoji',
  'icons',
  'identicon',
  'initials',
  'lorelei',
  'lorelei-neutral',
  'micah',
  'miniavs',
  'notionists',
  'notionists-neutral',
  'open-peeps',
  'personas',
  'pixel-art',
  'pixel-art-neutral',
  'shapes',
  'thumbs'
];

// Travel-themed color palettes
const COLOR_PALETTES = {
  forest: ['2c5530', '4a6741', '6b8e23', '228b22', '3d5a3d'],
  ocean: ['006994', '1e88e5', '42a5f5', '64b5f6', '90caf9'],
  sunset: ['ff6b35', 'f7931e', 'fdc700', 'ff8c42', 'fa6900'],
  mountain: ['8b4513', 'cd853f', 'daa520', 'b8860b', '8b7355'],
  desert: ['f4a460', 'cd853f', 'deb887', 'd2b48c', 'f5deb3'],
  arctic: ['b0e0e6', '87ceeb', 'add8e6', 'b0c4de', 'd6e4f5'],
  meadow: ['9acd32', 'adff2f', '7cfc00', '32cd32', '00fa9a'],
  autumn: ['d2691e', 'ff7f50', 'ff8c00', 'ffa500', 'ff6347'],
  spring: ['ffb6c1', 'ffc0cb', 'ffa6c9', 'ff85b3', 'ff73a8'],
  tropical: ['00b8a9', '16a085', '1abc9c', '48c9b0', '52be80'],
  twilight: ['9370db', '8470ff', '7b68ee', '6a5acd', '8a7aa8'],
  lavender: ['e6e6fa', 'dda0dd', 'da70d6', 'ba55d3', '9370db'],
  coral: ['ff7f50', 'ff6b6b', 'f08080', 'fa8072', 'e9967a'],
  sage: ['9dc183', '8fbc8f', '90ee90', '98fb98', 'afeeee'],
  earth: ['8b7355', 'a0826d', '967969', '8b7765', '9b8b80']
};

// Travel-themed avatar configurations
const TRAVEL_AVATAR_STYLES = [
  { style: 'adventurer', theme: 'outdoor', palette: 'forest' },
  { style: 'adventurer-neutral', theme: 'explorer', palette: 'mountain' },
  { style: 'avataaars', theme: 'wanderer', palette: 'ocean' },
  { style: 'avataaars-neutral', theme: 'nomad', palette: 'desert' },
  { style: 'big-ears', theme: 'hiker', palette: 'meadow' },
  { style: 'big-ears-neutral', theme: 'camper', palette: 'forest' },
  { style: 'big-smile', theme: 'happy-traveler', palette: 'spring' },
  { style: 'bottts', theme: 'tech-explorer', palette: 'twilight' },
  { style: 'bottts-neutral', theme: 'robo-ranger', palette: 'arctic' },
  { style: 'croodles', theme: 'doodler', palette: 'coral' },
  { style: 'croodles-neutral', theme: 'sketcher', palette: 'lavender' },
  { style: 'fun-emoji', theme: 'emoji-adventurer', palette: 'tropical' },
  { style: 'lorelei', theme: 'coastal', palette: 'ocean' },
  { style: 'lorelei-neutral', theme: 'beach-goer', palette: 'sunset' },
  { style: 'micah', theme: 'minimalist', palette: 'sage' },
  { style: 'miniavs', theme: 'micro-explorer', palette: 'earth' },
  { style: 'notionists', theme: 'modern-nomad', palette: 'twilight' },
  { style: 'notionists-neutral', theme: 'contemporary', palette: 'lavender' },
  { style: 'open-peeps', theme: 'character', palette: 'spring' },
  { style: 'personas', theme: 'persona', palette: 'autumn' },
  { style: 'pixel-art', theme: 'retro', palette: 'sunset' },
  { style: 'pixel-art-neutral', theme: '8bit-traveler', palette: 'twilight' },
  { style: 'thumbs', theme: 'thumbs-up', palette: 'tropical' }
];

// Boring Avatars variants (modern, colorful alternatives)
const BORING_AVATARS_VARIANTS = [
  'marble',
  'beam',
  'pixel',
  'sunset',
  'ring',
  'bauhaus'
];

// Boring Avatars color schemes
const BORING_COLORS = [
  ['264653', '2a9d8f', 'e9c46a', 'f4a261', 'e76f51'], // Earthy
  ['590d22', '800f2f', 'a4133c', 'c9184a', 'ff4d6d'], // Red passion
  ['05668d', '028090', '00a896', '02c39a', 'f0f3bd'], // Ocean breeze
  ['4a4e69', '9a8c98', 'c9ada7', 'f2e9e4', '22223b'], // Muted elegance
  ['003049', 'd62828', 'f77f00', 'fcbf49', 'eae2b7'], // Warm contrast
  ['6a4c93', '1982c4', '8ac926', 'ffca3a', 'ff595e'], // Vibrant mix
  ['582f0e', '7f4f24', '936639', 'a68a64', 'b6ad90'], // Wood tones
  ['ff6700', 'ebebeb', 'c0c0c0', '3a6ea5', '004e98'], // Modern tech
  ['2b2d42', '8d99ae', 'edf2f4', 'ef233c', 'd90429'], // Bold minimal
  ['f72585', 'b5179e', '7209b7', '560bad', '480ca8']  // Purple gradient
];

/**
 * Get current season based on month
 * @returns {string} Current season (spring, summer, autumn, winter)
 */
const getCurrentSeason = () => {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
};

/**
 * Generate hash from string for consistent randomization
 * @param {string} str - String to hash
 * @returns {number} Hash number
 */
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

/**
 * Generate Boring Avatars URL (modern, colorful alternative)
 * @param {string} seed - Seed for consistent generation
 * @param {string} variant - Avatar variant (marble, beam, pixel, sunset, ring, bauhaus)
 * @param {Array} colors - Array of color hex codes (without #)
 * @returns {string} Boring Avatars URL
 */
const generateBoringAvatar = (seed, variant = 'marble', colors = null) => {
  const cleanSeed = encodeURIComponent(seed || 'user');
  const selectedColors = colors || BORING_COLORS[hashString(seed) % BORING_COLORS.length];
  const colorString = selectedColors.join(',');
  
  return `https://source.boringavatars.com/${variant}/120/${cleanSeed}?colors=${colorString}`;
};

/**
 * Generate UI Avatars URL (text-based fallback)
 * @param {string} name - Name to display
 * @param {string} background - Background color hex (without #)
 * @param {string} color - Text color hex (without #)
 * @returns {string} UI Avatars URL
 */
const generateUIAvatar = (name, background = '6366f1', color = 'ffffff') => {
  const cleanName = encodeURIComponent(name || 'User');
  return `https://ui-avatars.com/api/?name=${cleanName}&background=${background}&color=${color}&size=200&bold=true&format=svg`;
};

/**
 * Generate a random travel-themed avatar based on user data (IMPROVED VERSION)
 * Uses modern DiceBear v9 API and Boring Avatars for better variety
 * @param {string} email - User's email for seed generation
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {Object} userStats - User's travel stats
 * @param {Object} options - Additional options (useBoring, variant)
 * @returns {string} Random travel-themed avatar URL
 */
export const generateEmojiAvatar = (email, firstName, lastName, userStats = {}, options = {}) => {
  const { useBoring = false } = options;
  
  // Create unique seed for this avatar with timestamp AND random number for uniqueness
  const timestamp = Date.now();
  const randomNum = Math.floor(Math.random() * 1000000);
  const baseSeed = email || `${firstName || ''}${lastName || ''}` || 'traveler';
  const seed = `${baseSeed}-${timestamp}-${randomNum}`;
  
  // 40% chance to use Boring Avatars (modern, colorful style)
  if (useBoring || Math.random() > 0.6) {
    const variant = BORING_AVATARS_VARIANTS[Math.floor(Math.random() * BORING_AVATARS_VARIANTS.length)];
    const colors = BORING_COLORS[Math.floor(Math.random() * BORING_COLORS.length)];
    return generateBoringAvatar(seed, variant, colors);
  }
  
  // Otherwise use DiceBear with modern styles
  const selectedStyle = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
  const palette = COLOR_PALETTES[selectedStyle.palette];
  const cleanSeed = encodeURIComponent(seed);
  
  // Shuffle colors for variety
  const shuffledColors = [...palette].sort(() => 0.5 - Math.random());
  const backgroundColor = shuffledColors.join(',');
  
  // Build the DiceBear v9 URL
  const baseUrl = `https://api.dicebear.com/9.x/${selectedStyle.style}/svg`;
  const params = new URLSearchParams({
    seed: cleanSeed,
    backgroundColor,
    size: '200',
    radius: Math.floor(Math.random() * 50).toString(), // Random radius for more variety
    ...(Math.random() > 0.5 && { flip: 'true' })
  });
  
  return `${baseUrl}?${params.toString()}`;
};

/**
 * Generate a DiceBear travel-themed avatar URL (UPDATED to v9)
 * @param {string} seed - Seed for consistent generation (usually email or name)
 * @param {string} style - DiceBear style (avataaars, personas, etc.)
 * @returns {string} DiceBear avatar URL
 */
export const generateDiceBearAvatar = (seed, style = 'avataaars') => {
  const cleanSeed = encodeURIComponent(seed || 'traveler');
  const colors = COLOR_PALETTES.ocean.join(',');
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${cleanSeed}&backgroundColor=${colors}&size=200`;
};

/**
 * Generate a travel-themed avatar using Avataaars with travel colors
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Travel-themed avataaars URL
 */
export const generateTravelAvatar = (seed) => {
  const cleanSeed = encodeURIComponent(seed || 'traveler');
  const bgColors = COLOR_PALETTES.ocean.join(',');
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${cleanSeed}&backgroundColor=${bgColors}&size=200`;
};

/**
 * Generate a nature-themed avatar using Personas style
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Nature-themed personas URL
 */
export const generateNatureAvatar = (seed) => {
  const cleanSeed = encodeURIComponent(seed || 'nature-lover');
  const bgColors = COLOR_PALETTES.forest.join(',');
  return `https://api.dicebear.com/9.x/personas/svg?seed=${cleanSeed}&backgroundColor=${bgColors}&size=200`;
};

/**
 * Generate an adventure-themed avatar using Fun-emoji style
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Adventure-themed fun emoji URL
 */
export const generateAdventureAvatar = (seed) => {
  const cleanSeed = encodeURIComponent(seed || 'adventurer');
  const bgColors = COLOR_PALETTES.sunset.join(',');
  return `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${cleanSeed}&backgroundColor=${bgColors}&size=200`;
};

/**
 * Get the best avatar based on user data and preferences (IMPROVED)
 * @param {Object} user - User object with email, firstName, lastName
 * @param {Object} userStats - User's travel statistics
 * @param {string} preference - Avatar type preference ('emoji', 'dicebear', 'travel', 'nature', 'adventure', 'boring', 'ui')
 * @returns {string} Avatar URL or emoji
 */
export const getBestAvatar = (user, userStats = {}, preference = 'travel') => {
  const { email, firstName, lastName } = user || {};
  const seed = email || `${firstName || ''}${lastName || ''}` || 'traveler';
  const name = `${firstName || ''} ${lastName || ''}`.trim() || 'User';
  
  switch (preference) {
    case 'emoji':
      return generateEmojiAvatar(email, firstName, lastName, userStats);
    case 'boring':
      const variant = BORING_AVATARS_VARIANTS[hashString(seed) % BORING_AVATARS_VARIANTS.length];
      const colors = BORING_COLORS[hashString(seed) % BORING_COLORS.length];
      return generateBoringAvatar(seed, variant, colors);
    case 'ui':
      return generateUIAvatar(name);
    case 'dicebear':
      return generateDiceBearAvatar(seed);
    case 'travel':
      return generateTravelAvatar(seed);
    case 'nature':
      return generateNatureAvatar(seed);
    case 'adventure':
      return generateAdventureAvatar(seed);
    default:
      return generateTravelAvatar(seed);
  }
};

/**
 * Generate a custom emoji-based avatar with background
 * @param {string} emoji - The emoji to use
 * @param {string} size - Size in pixels (default: 100)
 * @param {string} backgroundColor - Background color (default: #f0f9ff)
 * @returns {string} Data URL for the custom avatar
 */
export const generateCustomEmojiAvatar = (emoji, size = 100, backgroundColor = '#f0f9ff') => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = size;
  canvas.height = size;
  
  // Draw background circle
  ctx.fillStyle = backgroundColor;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
  ctx.fill();
  
  // Draw emoji
  ctx.font = `${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2);
  
  return canvas.toDataURL();
};

/**
 * Get avatar with fallback chain
 * @param {Object} user - User object
 * @param {Object} userStats - User statistics
 * @param {Array} fallbacks - Array of fallback methods
 * @returns {string} Avatar URL or emoji
 */
export const getAvatarWithFallbacks = (user, userStats = {}, fallbacks = ['travel', 'emoji', 'dicebear']) => {
  for (const method of fallbacks) {
    try {
      const avatar = getBestAvatar(user, userStats, method);
      if (avatar) return avatar;
    } catch (error) {
      console.warn(`Avatar method ${method} failed:`, error);
    }
  }
  
  // Ultimate fallback
  return '🧗'; // Default travel emoji
};

/**
 * Generate a seasonal avatar based on current season (UPDATED)
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Seasonal avatar URL
 */
export const generateSeasonalAvatar = (seed) => {
  const season = getCurrentSeason();
  const paletteMap = {
    spring: 'spring',
    summer: 'tropical',
    autumn: 'autumn',
    winter: 'arctic'
  };
  
  const palette = COLOR_PALETTES[paletteMap[season]];
  const cleanSeed = encodeURIComponent(seed || 'seasonal-traveler');
  const backgroundColor = palette.join(',');
  
  const selectedStyle = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
  
  return `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}&size=200`;
};

/**
 * Generate a time-of-day themed avatar (UPDATED)
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Time-based avatar URL
 */
export const generateDaytimeAvatar = (seed) => {
  // Use twilight/sunset colors for evening, ocean for day
  const hour = new Date().getHours();
  const paletteKey = (hour >= 6 && hour < 18) ? 'ocean' : 'twilight';
  const palette = COLOR_PALETTES[paletteKey];
  
  const cleanSeed = encodeURIComponent(seed || 'daytime-traveler');
  const backgroundColor = palette.join(',');
  
  const selectedStyle = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
  
  return `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}&size=200`;
};

/**
 * Generate an activity-based avatar (UPDATED)
 * @param {string} seed - Seed for consistent generation
 * @param {string} activity - Activity type (hiking, camping, swimming, etc.)
 * @returns {string} Activity-themed avatar URL
 */
export const generateActivityAvatar = (seed, activity = null) => {
  const activityPaletteMap = {
    hiking: 'forest',
    camping: 'meadow',
    swimming: 'ocean',
    cycling: 'sunset',
    default: 'earth'
  };
  
  const paletteKey = activityPaletteMap[activity] || activityPaletteMap.default;
  const palette = COLOR_PALETTES[paletteKey];
  const cleanSeed = encodeURIComponent(seed || `${activity || 'activity'}-enthusiast`);
  const backgroundColor = palette.join(',');
  
  const selectedStyle = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
  
  return `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}&size=200`;
};

/**
 * Generate a random avatar from all available styles (IMPROVED VERSION)
 * Uses modern DiceBear v9 and Boring Avatars for better variety
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Random avatar URL from any category
 */
export const generateRandomAvatar = (seed) => {
  // Add timestamp AND random number for MAXIMUM uniqueness
  const timestamp = Date.now();
  const randomNum = Math.floor(Math.random() * 1000000);
  const uniqueSeed = `${seed || 'random'}-${timestamp}-${randomNum}`;
  const cleanSeed = encodeURIComponent(uniqueSeed);
  
  // 50% chance to use Boring Avatars (modern, colorful, and highly varied)
  if (Math.random() > 0.5) {
    const variant = BORING_AVATARS_VARIANTS[Math.floor(Math.random() * BORING_AVATARS_VARIANTS.length)];
    const colors = BORING_COLORS[Math.floor(Math.random() * BORING_COLORS.length)];
    return generateBoringAvatar(uniqueSeed, variant, colors);
  }
  
  // Otherwise use DiceBear v9 with random style
  const selectedStyle = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
  const palette = COLOR_PALETTES[selectedStyle.palette];
  
  // Shuffle colors for variety
  const shuffledColors = [...palette].sort(() => 0.5 - Math.random());
  const backgroundColor = shuffledColors.join(',');
  
  const params = new URLSearchParams({
    seed: cleanSeed,
    backgroundColor,
    size: '200',
    radius: Math.floor(Math.random() * 50).toString(), // Random radius for more variety
    ...(Math.random() > 0.5 && { flip: 'true' }),
    ...(Math.random() > 0.7 && { rotate: Math.floor(Math.random() * 360).toString() })
  });
  
  return `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?${params.toString()}`;
};

/**
 * Get all available avatar style types (UPDATED for v9)
 * @returns {Array} Array of style type names
 */
export const getAvailableStyles = () => {
  return DICEBEAR_STYLES;
};

/**
 * Get all available themes (UPDATED)
 * @returns {Object} Object with theme categories
 */
export const getAvailableThemes = () => {
  return {
    travel: TRAVEL_AVATAR_STYLES.map(s => s.theme),
    palettes: Object.keys(COLOR_PALETTES),
    boring: BORING_AVATARS_VARIANTS
  };
};

/**
 * Generate avatar with specific style and palette (UPDATED)
 * @param {string} seed - Seed for consistent generation
 * @param {string} style - DiceBear style name
 * @param {string} palette - Color palette name from COLOR_PALETTES
 * @returns {string} Themed avatar URL
 */
export const generateThemedAvatar = (seed, style = 'avataaars', palette = 'ocean') => {
  const cleanSeed = encodeURIComponent(seed || 'themed-avatar');
  const colors = COLOR_PALETTES[palette] || COLOR_PALETTES.ocean;
  const backgroundColor = colors.join(',');
  
  // Validate style exists
  const validStyle = DICEBEAR_STYLES.includes(style) ? style : 'avataaars';
  
  return `https://api.dicebear.com/9.x/${validStyle}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}&size=200`;
};

/**
 * Generate a collection of different avatars for the same user (IMPROVED)
 * Mix of DiceBear v9 and Boring Avatars for variety
 * @param {string} seed - Seed for consistent generation
 * @param {number} count - Number of avatars to generate (default: 5)
 * @returns {Array} Array of avatar objects with url, type, and metadata
 */
export const generateAvatarCollection = (seed, count = 5) => {
  const cleanSeed = seed || 'collection-user';
  const avatars = [];
  
  // Mix DiceBear and Boring Avatars
  const halfCount = Math.ceil(count / 2);
  
  // Generate DiceBear avatars
  const shuffledStyles = [...TRAVEL_AVATAR_STYLES].sort(() => 0.5 - Math.random());
  for (let i = 0; i < Math.min(halfCount, shuffledStyles.length); i++) {
    const style = shuffledStyles[i];
    const seedVariation = `${cleanSeed}-dicebear-${i}`;
    const palette = COLOR_PALETTES[style.palette];
    const backgroundColor = palette.join(',');
    
    avatars.push({
      url: `https://api.dicebear.com/9.x/${style.style}/svg?seed=${encodeURIComponent(seedVariation)}&backgroundColor=${backgroundColor}&size=200`,
      type: 'dicebear',
      style: style.style,
      theme: style.theme
    });
  }
  
  // Generate Boring Avatars
  const remainingCount = count - avatars.length;
  for (let i = 0; i < remainingCount; i++) {
    const variant = BORING_AVATARS_VARIANTS[i % BORING_AVATARS_VARIANTS.length];
    const colors = BORING_COLORS[i % BORING_COLORS.length];
    const seedVariation = `${cleanSeed}-boring-${i}`;
    
    avatars.push({
      url: generateBoringAvatar(seedVariation, variant, colors),
      type: 'boring',
      style: variant,
      theme: `${variant}-${i}`
    });
  }
  
  return avatars;
};
