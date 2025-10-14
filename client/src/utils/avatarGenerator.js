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

// Travel-themed color palettes (EXPANDED with 25+ new themes!)
const COLOR_PALETTES = {
  // Original palettes
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
  earth: ['8b7355', 'a0826d', '967969', '8b7765', '9b8b80'],
  
  // New Nature Themes
  jungle: ['1a5f3a', '2d6a4f', '40916c', '52b788', '74c69d'],
  rainforest: ['084c61', '177e89', '323031', '4a7c59', '6b9080'],
  canyon: ['bc4b51', 'c9554f', 'e07a5f', 'f2a679', 'f4d58d'],
  glacier: ['d0f4ff', 'a9def9', 'e4f1fe', '81c5e8', 'b6e3f4'],
  volcano: ['6a040f', '9d0208', 'd00000', 'dc2f02', 'e85d04'],
  bamboo: ['718355', '87a330', 'a7c957', 'b5e48c', 'd4f1a6'],
  savanna: ['d4a373', 'e9c46a', 'f4e4a7', 'e9d8a6', 'c7b198'],
  tundra: ['e0e1dd', 'c6cad1', 'adb5bd', '778da9', '415a77'],
  
  // New Adventure Themes
  safari: ['b7784a', 'd4a373', 'e8c8a0', 'f0e5d8', 'a86f49'],
  paradise: ['06d6a0', '00bbf9', '00f5ff', '7df9ff', 'b8ffff'],
  expedition: ['8b0000', 'b22222', 'cd5c5c', 'f08080', 'fa8072'],
  summit: ['495057', '6c757d', 'adb5bd', 'ced4da', 'dee2e6'],
  valley: ['588157', '90be6d', 'b5e48c', 'e9ff70', 'fcffa4'],
  
  // New Vibrant/Cosmic Themes
  neon: ['ff006e', 'fb5607', 'ffbe0b', '8338ec', '3a86ff'],
  cosmic: ['240046', '3c096c', '5a189a', '7209b7', '9d4edd'],
  galaxy: ['10002b', '240046', '5a189a', '9d4edd', 'c77dff'],
  aurora: ['b5e48c', '99d98c', '52b69a', '34a0a4', '168aad'],
  nebula: ['ff0a54', 'ff477e', 'ff5c8a', 'ff7096', 'ffa3b5'],
  stardust: ['e0aaff', 'c77dff', 'b5a2ff', '9d4edd', '7209b7'],
  
  // New Seasonal Variations
  summer: ['ffdd00', 'ffbe0b', 'fb5607', 'ff006e', 'f72585'],
  winter: ['d0f4ff', 'a9def9', 'e4f1fe', 'b6e3f4', '8ecae6'],
  cherry: ['ff99c8', 'fcf6bd', 'd0f4de', 'a9def9', 'e4c1f9'],
  golden: ['f9c74f', 'f8961e', 'f3722c', 'f94144', 'ffca3a'],
  
  // New Modern Themes  
  mint: ['c7f9cc', '80ed99', '57cc99', '38a3a5', '22577a'],
  peach: ['ffcdb2', 'ffb4a2', 'e5989b', 'b5838d', '6d6875'],
  azure: ['0077b6', '0096c7', '00b4d8', '48cae4', '90e0ef'],
  rose: ['f72585', 'b5179e', '7209b7', '560bad', '480ca8'],
  emerald: ['007200', '008000', '38b000', '70e000', '9ef01a'],
  ruby: ['641220', '6e1423', '85182a', 'a11d33', 'a71e34'],
  sapphire: ['003f88', '0353a4', '006ba6', '0496ff', '5fa8d3'],
  amethyst: ['4a154b', '6c2c6e', '8e4091', 'b054b5', 'd268d8'],
  citrine: ['fbb13c', 'ffc857', 'ffd166', 'ffd97d', 'ffe194']
};

// Travel-themed avatar configurations (EXPANDED with 40+ new combinations!)
const TRAVEL_AVATAR_STYLES = [
  // Original combinations
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
  { style: 'thumbs', theme: 'thumbs-up', palette: 'tropical' },
  
  // New Nature-themed combinations
  { style: 'adventurer', theme: 'jungle-explorer', palette: 'jungle' },
  { style: 'adventurer-neutral', theme: 'rainforest-guide', palette: 'rainforest' },
  { style: 'personas', theme: 'canyon-hiker', palette: 'canyon' },
  { style: 'avataaars', theme: 'glacier-trekker', palette: 'glacier' },
  { style: 'big-ears', theme: 'volcano-climber', palette: 'volcano' },
  { style: 'open-peeps', theme: 'bamboo-wanderer', palette: 'bamboo' },
  { style: 'lorelei', theme: 'savanna-safari', palette: 'savanna' },
  { style: 'micah', theme: 'tundra-explorer', palette: 'tundra' },
  
  // New Adventure-themed combinations
  { style: 'adventurer', theme: 'safari-guide', palette: 'safari' },
  { style: 'lorelei-neutral', theme: 'paradise-seeker', palette: 'paradise' },
  { style: 'big-smile', theme: 'expedition-leader', palette: 'expedition' },
  { style: 'personas', theme: 'summit-climber', palette: 'summit' },
  { style: 'open-peeps', theme: 'valley-dweller', palette: 'valley' },
  
  // New Cosmic/Vibrant combinations
  { style: 'bottts', theme: 'neon-explorer', palette: 'neon' },
  { style: 'bottts-neutral', theme: 'cosmic-traveler', palette: 'cosmic' },
  { style: 'pixel-art', theme: 'galaxy-rider', palette: 'galaxy' },
  { style: 'croodles', theme: 'aurora-chaser', palette: 'aurora' },
  { style: 'fun-emoji', theme: 'nebula-navigator', palette: 'nebula' },
  { style: 'pixel-art-neutral', theme: 'stardust-seeker', palette: 'stardust' },
  
  // New Seasonal combinations
  { style: 'big-smile', theme: 'summer-vacationer', palette: 'summer' },
  { style: 'avataaars-neutral', theme: 'winter-wanderer', palette: 'winter' },
  { style: 'lorelei', theme: 'cherry-blossom', palette: 'cherry' },
  { style: 'big-ears-neutral', theme: 'golden-hour', palette: 'golden' },
  
  // New Modern/Gem combinations
  { style: 'notionists', theme: 'mint-modernist', palette: 'mint' },
  { style: 'micah', theme: 'peach-minimalist', palette: 'peach' },
  { style: 'avataaars', theme: 'azure-adventurer', palette: 'azure' },
  { style: 'notionists-neutral', theme: 'rose-romantic', palette: 'rose' },
  { style: 'personas', theme: 'emerald-explorer', palette: 'emerald' },
  { style: 'miniavs', theme: 'ruby-ranger', palette: 'ruby' },
  { style: 'open-peeps', theme: 'sapphire-sailor', palette: 'sapphire' },
  { style: 'croodles-neutral', theme: 'amethyst-artist', palette: 'amethyst' },
  { style: 'thumbs', theme: 'citrine-cheerful', palette: 'citrine' },
  
  // Extra variety with repeated styles but different palettes
  { style: 'adventurer', theme: 'cosmic-adventurer', palette: 'cosmic' },
  { style: 'avataaars', theme: 'tropical-wanderer', palette: 'tropical' },
  { style: 'big-smile', theme: 'coral-happiness', palette: 'coral' },
  { style: 'lorelei', theme: 'twilight-dreamer', palette: 'twilight' },
  { style: 'personas', theme: 'meadow-soul', palette: 'meadow' },
  { style: 'micah', theme: 'desert-minimalist', palette: 'desert' }
];

// Boring Avatars variants (temporarily disabled due to SSL certificate issues)
const BORING_AVATARS_VARIANTS = [
  // 'marble',
  // 'beam',
  // 'pixel',
  // 'sunset',
  // 'ring',
  // 'bauhaus'
];

// Boring Avatars color schemes (EXPANDED with 20+ new color combinations!)
const BORING_COLORS = [
  // Original schemes
  ['264653', '2a9d8f', 'e9c46a', 'f4a261', 'e76f51'], // Earthy
  ['590d22', '800f2f', 'a4133c', 'c9184a', 'ff4d6d'], // Red passion
  ['05668d', '028090', '00a896', '02c39a', 'f0f3bd'], // Ocean breeze
  ['4a4e69', '9a8c98', 'c9ada7', 'f2e9e4', '22223b'], // Muted elegance
  ['003049', 'd62828', 'f77f00', 'fcbf49', 'eae2b7'], // Warm contrast
  ['6a4c93', '1982c4', '8ac926', 'ffca3a', 'ff595e'], // Vibrant mix
  ['582f0e', '7f4f24', '936639', 'a68a64', 'b6ad90'], // Wood tones
  ['ff6700', 'ebebeb', 'c0c0c0', '3a6ea5', '004e98'], // Modern tech
  ['2b2d42', '8d99ae', 'edf2f4', 'ef233c', 'd90429'], // Bold minimal
  ['f72585', 'b5179e', '7209b7', '560bad', '480ca8'], // Purple gradient
  
  // New vibrant schemes
  ['ff006e', 'fb5607', 'ffbe0b', '8338ec', '3a86ff'], // Electric neon
  ['06ffa5', '0affa3', '0bffa1', '0cff9f', '0dff9d'], // Mint fresh
  ['ff69eb', 'ff86f1', 'ffa3f7', 'ffc0fd', 'ffdeff'], // Pink dreams
  ['00f5ff', '00d9ff', '00bdff', '00a1ff', '0085ff'], // Cyan waves
  ['ffba08', 'faa307', 'f48c06', 'e85d04', 'dc2f02'], // Sunset fire
  
  // New nature schemes
  ['2d6a4f', '40916c', '52b788', '74c69d', '95d5b2'], // Forest green
  ['03045e', '023e8a', '0077b6', '0096c7', '00b4d8'], // Deep ocean
  ['8e7dbe', '9d8ac4', 'ac97ca', 'bba4d0', 'cab1d6'], // Lavender fields
  ['fff1e6', 'fde2e4', 'fad2e1', 'e2ece9', 'bee1e6'], // Pastel clouds
  ['ff99c8', 'fcf6bd', 'd0f4de', 'a9def9', 'e4c1f9'], // Rainbow pastel
  
  // New jewel tones
  ['641220', '85182a', 'a11d33', 'a71e34', 'b21e35'], // Ruby red
  ['007200', '008000', '38b000', '70e000', '9ef01a'], // Emerald green
  ['003f88', '0353a4', '006ba6', '0496ff', '5fa8d3'], // Sapphire blue
  ['4a154b', '6c2c6e', '8e4091', 'b054b5', 'd268d8'], // Amethyst purple
  ['f9c74f', 'f8961e', 'f3722c', 'f94144', 'ffca3a'], // Topaz gold
  
  // New modern schemes
  ['14213d', 'fca311', 'e5e5e5', 'ffffff', '000000'], // Bold contrast
  ['1a535c', '4ecdc4', 'f7fff7', 'ff6b6b', 'ffe66d'], // Retro modern
  ['0d1b2a', '1b263b', '415a77', '778da9', 'e0e1dd'], // Slate gradient
  ['e63946', 'f1faee', 'a8dadc', '457b9d', '1d3557'], // Americana
  ['ef476f', 'ffd166', '06d6a0', '118ab2', '073b4c'], // Pop colors
  
  // New seasonal schemes  
  ['ff9770', 'ffe6a1', 'b9fbc0', '8eecf5', 'a8b3f0'], // Spring bloom
  ['ffdd00', 'ffbe0b', 'fb5607', 'ff006e', 'f72585'], // Hot summer
  ['bc6c25', 'dda15e', 'fefae0', 'faedcd', 'e9edc9'], // Autumn harvest
  ['caf0f8', 'ade8f4', '90e0ef', '48cae4', '00b4d8'], // Winter frost
  
  // New artistic schemes
  ['9b5de5', 'f15bb5', 'fee440', '00bbf9', '00f5ff'], // Pop art
  ['ff0a54', 'ff477e', 'ff5c8a', 'ff7096', 'ffa3b5'], // Hot pink
  ['b5e48c', '99d98c', '76c893', '52b69a', '34a0a4'], // Garden path
  ['e0aaff', 'c77dff', 'b5a2ff', '9d4edd', '7209b7']  // Purple haze
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
  // Fallback to DiceBear avatar due to SSL certificate issues with source.boringavatars.com
  const cleanSeed = encodeURIComponent(seed || 'user');
  const randomStyle = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)];
  const randomPalette = Object.values(COLOR_PALETTES)[Math.floor(Math.random() * Object.values(COLOR_PALETTES).length)];
  const backgroundColor = randomPalette.join(',');
  
  return `https://api.dicebear.com/9.x/${randomStyle}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}&size=200&radius=${Math.floor(Math.random() * 50)}`;
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
 * Generate a truly unique seed with maximum randomness
 * @param {string} baseSeed - Base seed string
 * @returns {string} Highly unique seed
 */
const generateUniqueSeed = (baseSeed = 'user') => {
  const timestamp = Date.now();
  const microtime = performance.now();
  const randomNum = Math.floor(Math.random() * 10000000);
  const randomStr = Math.random().toString(36).substring(2, 15);
  const randomStr2 = Math.random().toString(36).substring(2, 15);
  
  return `${baseSeed}-${timestamp}-${microtime}-${randomNum}-${randomStr}${randomStr2}`;
};

/**
 * Generate a random travel-themed avatar based on user data (VISUAL-ONLY VERSION)
 * Eliminates text-based avatars and focuses on visual variety
 * @param {string} email - User's email for seed generation
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {Object} userStats - User's travel stats
 * @param {Object} options - Additional options (useBoring, variant)
 * @returns {string} Random travel-themed avatar URL
 */
export const generateEmojiAvatar = (email, firstName, lastName, userStats = {}, options = {}) => {
  const { useBoring = false } = options;
  
  // Create unique seed for this avatar with maximum randomness
  const baseSeed = email || `${firstName || ''}${lastName || ''}` || 'traveler';
  const seed = generateUniqueSeed(baseSeed);
  
  // Use weighted random selection - NO TEXT AVATARS
  const randomType = Math.random();
  
  // Use DiceBear avatars instead of BoringAvatars (SSL issues)
  // 70% chance for themed DiceBear
  if (randomType < 0.7) {
    const shuffledStyles = [...TRAVEL_AVATAR_STYLES].sort(() => Math.random() - 0.5);
    const selectedStyle = shuffledStyles[Math.floor(Math.random() * shuffledStyles.length)];
    
    const palette = Object.values(COLOR_PALETTES)[Math.floor(Math.random() * Object.values(COLOR_PALETTES).length)];
    const shuffledColors = [...palette].sort(() => Math.random() - 0.5);
    const backgroundColor = shuffledColors.join(',');
    
    const params = new URLSearchParams({
      seed: cleanSeed,
      backgroundColor,
      size: '200',
      radius: Math.floor(Math.random() * 50).toString(),
      ...(Math.random() > 0.5 && { flip: 'true' })
    });
    
    return `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?${params.toString()}`;
  }
  
  // 35% chance for DiceBear with our expanded themes
  if (randomType < 0.85) {
    // Shuffle the styles array first for true randomness
    const shuffledStyles = [...TRAVEL_AVATAR_STYLES].sort(() => Math.random() - 0.5);
    const selectedStyle = shuffledStyles[Math.floor(Math.random() * shuffledStyles.length)];
    
    // Use the palette from the selected style OR pick a random palette for extra variety
    const useStylePalette = Math.random() > 0.3; // 70% use style palette, 30% random palette
    const palette = useStylePalette 
      ? COLOR_PALETTES[selectedStyle.palette]
      : Object.values(COLOR_PALETTES)[Math.floor(Math.random() * Object.values(COLOR_PALETTES).length)];
    
    const cleanSeed = encodeURIComponent(seed);
    
    // Shuffle colors for variety
    const shuffledColors = [...palette].sort(() => Math.random() - 0.5);
    const backgroundColor = shuffledColors.join(',');
    
    // Build the DiceBear v9 URL with extra randomization
    const baseUrl = `https://api.dicebear.com/9.x/${selectedStyle.style}/svg`;
    const params = new URLSearchParams({
      seed: cleanSeed,
      backgroundColor,
      size: '200',
      radius: Math.floor(Math.random() * 50).toString(),
      ...(Math.random() > 0.5 && { flip: 'true' }),
      ...(Math.random() > 0.7 && { rotate: Math.floor(Math.random() * 360).toString() }),
      ...(Math.random() > 0.8 && { scale: (0.8 + Math.random() * 0.4).toString() })
    });
    
    return `${baseUrl}?${params.toString()}`;
  }
  
  // 15% chance for basic DiceBear styles with random palette
  const randomStyle = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)];
  const randomPalette = Object.values(COLOR_PALETTES)[Math.floor(Math.random() * Object.values(COLOR_PALETTES).length)];
  const backgroundColor = randomPalette.join(',');
  const cleanSeed = encodeURIComponent(seed);
  
  const params = new URLSearchParams({
    seed: cleanSeed,
    backgroundColor,
    size: '200',
    radius: Math.floor(Math.random() * 50).toString(),
    ...(Math.random() > 0.5 && { flip: 'true' })
  });
  
  return `https://api.dicebear.com/9.x/${randomStyle}/svg?${params.toString()}`;
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
  const uniqueSeed = generateUniqueSeed(seed || 'seasonal-traveler');
  const cleanSeed = encodeURIComponent(uniqueSeed);
  
  // Shuffle colors for variety
  const shuffledColors = [...palette].sort(() => 0.5 - Math.random());
  const backgroundColor = shuffledColors.join(',');
  
  const selectedStyle = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
  
  return `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}&size=200&radius=${Math.floor(Math.random() * 50)}`;
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
  
  const uniqueSeed = generateUniqueSeed(seed || 'daytime-traveler');
  const cleanSeed = encodeURIComponent(uniqueSeed);
  
  // Shuffle colors for variety
  const shuffledColors = [...palette].sort(() => 0.5 - Math.random());
  const backgroundColor = shuffledColors.join(',');
  
  const selectedStyle = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
  
  return `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}&size=200&radius=${Math.floor(Math.random() * 50)}`;
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
  const uniqueSeed = generateUniqueSeed(seed || `${activity || 'activity'}-enthusiast`);
  const cleanSeed = encodeURIComponent(uniqueSeed);
  
  // Shuffle colors for variety
  const shuffledColors = [...palette].sort(() => 0.5 - Math.random());
  const backgroundColor = shuffledColors.join(',');
  
  const selectedStyle = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
  
  return `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}&size=200&radius=${Math.floor(Math.random() * 50)}`;
};

// Store last generated avatar to prevent immediate repetition
let lastGeneratedAvatar = null;

/**
 * Generate a random avatar from all available styles (GUARANTEED UNIQUE VERSION)
 * Ensures maximum variety and prevents immediate repetition
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Random avatar URL from visual categories only
 */
export const generateRandomAvatar = (seed) => {
  // Generate truly unique seed with maximum randomness
  const uniqueSeed = generateUniqueSeed(seed || 'random');
  const cleanSeed = encodeURIComponent(uniqueSeed);
  
  let generatedAvatar = null;
  let attempts = 0;
  const maxAttempts = 10; // Prevent infinite loops
  
  // Keep generating until we get a unique avatar
  while (!generatedAvatar || (generatedAvatar === lastGeneratedAvatar && attempts < maxAttempts)) {
    attempts++;
    
    // Use DiceBear only (BoringAvatars disabled due to SSL issues)
    const randomType = Math.random();
    
    if (randomType < 0.7) {
      // 70% chance for DiceBear with our expanded themes
      const shuffledStyles = [...TRAVEL_AVATAR_STYLES].sort(() => Math.random() - 0.5);
      const selectedStyle = shuffledStyles[Math.floor(Math.random() * shuffledStyles.length)];
      
      // Always use random palette for maximum variety
      const palette = Object.values(COLOR_PALETTES)[Math.floor(Math.random() * Object.values(COLOR_PALETTES).length)];
      const shuffledColors = [...palette].sort(() => Math.random() - 0.5);
      const backgroundColor = shuffledColors.join(',');
      
      const params = new URLSearchParams({
        seed: cleanSeed + `-${attempts}`,
        backgroundColor,
        size: '200',
        radius: Math.floor(Math.random() * 50).toString(),
        ...(Math.random() > 0.5 && { flip: 'true' }),
        ...(Math.random() > 0.7 && { rotate: Math.floor(Math.random() * 360).toString() }),
        ...(Math.random() > 0.8 && { scale: (0.8 + Math.random() * 0.4).toString() })
      });
      
      generatedAvatar = `https://api.dicebear.com/9.x/${selectedStyle.style}/svg?${params.toString()}`;
      
    } else {
      // 30% chance for basic DiceBear styles with random palette
      const randomStyle = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)];
      const randomPalette = Object.values(COLOR_PALETTES)[Math.floor(Math.random() * Object.values(COLOR_PALETTES).length)];
      const backgroundColor = randomPalette.join(',');
      
      const params = new URLSearchParams({
        seed: cleanSeed + `-${attempts}`,
        backgroundColor,
        size: '200',
        radius: Math.floor(Math.random() * 50).toString(),
        ...(Math.random() > 0.5 && { flip: 'true' })
      });
      
      generatedAvatar = `https://api.dicebear.com/9.x/${randomStyle}/svg?${params.toString()}`;
    }
  }
  
  // Store the generated avatar to prevent immediate repetition
  lastGeneratedAvatar = generatedAvatar;
  
  return generatedAvatar;
};

/**
 * Clear avatar generation cache to ensure fresh generation
 * Call this when you want to reset the avatar generation state
 */
export const clearAvatarCache = () => {
  lastGeneratedAvatar = null;
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
 * Generate a collection of different avatars for the same user (GUARANTEED UNIQUE VERSION)
 * Ensures every avatar is unique and fills all requested slots
 * @param {string} seed - Seed for consistent generation
 * @param {number} count - Number of avatars to generate (default: 5)
 * @returns {Array} Array of avatar objects with url, type, and metadata
 */
export const generateAvatarCollection = (seed, count = 5) => {
  const cleanSeed = seed || 'collection-user';
  const avatars = [];
  const usedSeeds = new Set(); // Track used seeds to prevent duplicates
  
  // Ensure we generate exactly the requested count
  let generated = 0;
  const maxAttempts = count * 3; // Prevent infinite loops
  let attempts = 0;
  
  while (generated < count && attempts < maxAttempts) {
    attempts++;
    
    // Randomly choose avatar type for maximum variety
    const typeRandom = Math.random();
    let avatarType, avatarData;
    
    if (typeRandom < 0.6) {
      // 60% Themed DiceBear avatars
      const style = TRAVEL_AVATAR_STYLES[Math.floor(Math.random() * TRAVEL_AVATAR_STYLES.length)];
      const seedVariation = generateUniqueSeed(`${cleanSeed}-themed-${generated}-${attempts}-${Date.now()}`);
      
      // Use random palette for maximum variety
      const palette = Object.values(COLOR_PALETTES)[Math.floor(Math.random() * Object.values(COLOR_PALETTES).length)];
      const shuffledColors = [...palette].sort(() => Math.random() - 0.5);
      const backgroundColor = shuffledColors.join(',');
      
      // Skip if we've used this exact combination
      const seedKey = `${style.style}-${backgroundColor}`;
      if (usedSeeds.has(seedKey)) continue;
      usedSeeds.add(seedKey);
      
      avatarType = 'dicebear';
      avatarData = {
        url: `https://api.dicebear.com/9.x/${style.style}/svg?seed=${encodeURIComponent(seedVariation)}&backgroundColor=${backgroundColor}&size=200&radius=${Math.floor(Math.random() * 50)}&flip=${Math.random() > 0.5 ? 'true' : 'false'}`,
        type: avatarType,
        style: style.style,
        theme: style.theme
      };
      
    } else {
      // 40% Basic DiceBear styles
      const style = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)];
      const randomPalette = Object.values(COLOR_PALETTES)[Math.floor(Math.random() * Object.values(COLOR_PALETTES).length)];
      const backgroundColor = randomPalette.join(',');
      const seedVariation = generateUniqueSeed(`${cleanSeed}-basic-${generated}-${attempts}-${Date.now()}`);
      
      // Skip if we've used this exact combination
      const seedKey = `${style}-${backgroundColor}`;
      if (usedSeeds.has(seedKey)) continue;
      usedSeeds.add(seedKey);
      
      avatarType = 'dicebear';
      avatarData = {
        url: `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seedVariation)}&backgroundColor=${backgroundColor}&size=200&radius=${Math.floor(Math.random() * 50)}`,
        type: avatarType,
        style: style,
        theme: 'basic-random'
      };
    }
    
    // Add the avatar if it's unique
    if (avatarData) {
      avatars.push(avatarData);
      generated++;
    }
  }
  
  // If we still don't have enough avatars, generate more using fallback method
  while (avatars.length < count) {
    const fallbackAvatar = generateRandomAvatar(`${cleanSeed}-fallback-${avatars.length}-${Date.now()}`);
    avatars.push({
      url: fallbackAvatar,
      type: 'fallback',
      style: 'random',
      theme: 'fallback-random'
    });
  }
  
  // Shuffle the final array for random order
  return avatars.sort(() => Math.random() - 0.5);
};
