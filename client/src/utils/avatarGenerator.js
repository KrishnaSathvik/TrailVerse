/**
 * Travel-themed avatar generation utilities
 * Provides multiple avatar generation methods with travel/nature themes
 */

// Travel-themed avatar styles with different themes
const TRAVEL_AVATAR_STYLES = [
  { style: 'avataaars', theme: 'outdoor', colors: ['2c5530', '4a6741', '6b8e23', '8b4513'] },
  { style: 'personas', theme: 'adventure', colors: ['2c5530', '4a6741', '6b8e23', '8b4513'] },
  { style: 'fun-emoji', theme: 'nature', colors: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc'] },
  { style: 'avataaars', theme: 'mountain', colors: ['8b4513', 'cd853f', 'daa520', '2c5530'] },
  { style: 'personas', theme: 'forest', colors: ['2c5530', '4a6741', '6b8e23', '228b22'] },
  { style: 'avataaars', theme: 'beach', colors: ['87ceeb', '4682b4', '5f9ea0', '20b2aa'] },
  { style: 'fun-emoji', theme: 'desert', colors: ['f4a460', 'cd853f', 'daa520', 'b8860b'] },
  { style: 'personas', theme: 'arctic', colors: ['b0e0e6', '87ceeb', 'add8e6', 'f0f8ff'] },
  { style: 'bottts', theme: 'tech-explorer', colors: ['00b8d4', '00acc1', '0097a7', '00838f'] },
  { style: 'adventurer', theme: 'trail-blazer', colors: ['ff6b35', 'f7931e', 'fdc700', 'c1666b'] },
  { style: 'micah', theme: 'wanderer', colors: ['4a5759', '6c7a89', '95a5a6', 'bdc3c7'] },
  { style: 'lorelei', theme: 'coastal', colors: ['48c9b0', '16a085', '1abc9c', '26d0ce'] },
  { style: 'pixel-art', theme: 'retro-traveler', colors: ['e74c3c', 'c0392b', 'e67e22', 'd35400'] },
  { style: 'notionists', theme: 'modern-nomad', colors: ['9b59b6', '8e44ad', '3498db', '2980b9'] },
  { style: 'big-smile', theme: 'happy-camper', colors: ['f39c12', 'f1c40f', 'e67e22', 'd35400'] },
  { style: 'miniavs', theme: 'micro-adventurer', colors: ['1abc9c', '16a085', '2ecc71', '27ae60'] }
];

// Adventure-themed avatar styles
const ADVENTURE_AVATAR_STYLES = [
  { style: 'avataaars', theme: 'climber', colors: ['262e33', '65c9ff', '5199e4', '8b4513'] },
  { style: 'personas', theme: 'hiker', colors: ['2c5530', '4a6741', '6b8e23', '8b4513'] },
  { style: 'avataaars', theme: 'explorer', colors: ['8b4513', 'cd853f', 'daa520', '2c5530'] },
  { style: 'fun-emoji', theme: 'sports', colors: ['ff6b6b', '4ecdc4', '45b7d1', '96ceb4'] },
  { style: 'adventurer', theme: 'peak-seeker', colors: ['34495e', '2c3e50', '95a5a6', '7f8c8d'] },
  { style: 'bottts', theme: 'trail-bot', colors: ['27ae60', '229954', '1e8449', '186a3b'] },
  { style: 'pixel-art', theme: '8bit-adventurer', colors: ['e74c3c', '922b21', 'cb4335', 'b03a2e'] },
  { style: 'micah', theme: 'summit-chaser', colors: ['d35400', 'ba4a00', 'a04000', '873600'] },
  { style: 'lorelei', theme: 'outdoor-enthusiast', colors: ['2874a6', '1f618d', '1a5276', '154360'] },
  { style: 'big-smile', theme: 'thrill-seeker', colors: ['c0392b', 'a93226', '922b21', '7b241c'] },
  { style: 'miniavs', theme: 'tiny-explorer', colors: ['e67e22', 'd68910', 'ca6f1e', 'af601a'] }
];

// Nature-themed avatar styles  
const NATURE_AVATAR_STYLES = [
  { style: 'personas', theme: 'gardener', colors: ['2c5530', '4a6741', '6b8e23', '228b22'] },
  { style: 'avataaars', theme: 'naturalist', colors: ['8b4513', 'cd853f', 'daa520', '2c5530'] },
  { style: 'personas', theme: 'birdwatcher', colors: ['2c5530', '4a6741', '6b8e23', '8b4513'] },
  { style: 'fun-emoji', theme: 'wildlife', colors: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc'] },
  { style: 'adventurer', theme: 'forest-dweller', colors: ['145a32', '196f3d', '1d8348', '239b56'] },
  { style: 'bottts', theme: 'nature-bot', colors: ['52be80', '48c9b0', '45b39d', '58d68d'] },
  { style: 'micah', theme: 'eco-warrior', colors: ['1e8449', '229954', '27ae60', '2ecc71'] },
  { style: 'lorelei', theme: 'green-thumb', colors: ['7dcea0', '82e0aa', '7dcea0', '52be80'] },
  { style: 'notionists', theme: 'botanist', colors: ['16a085', '1abc9c', '17a589', '138d75'] },
  { style: 'pixel-art', theme: 'pixel-naturalist', colors: ['27ae60', '229954', '1e8449', '186a3b'] },
  { style: 'big-smile', theme: 'nature-lover', colors: ['52be80', '48c9b0', '16a085', '1abc9c'] },
  { style: 'miniavs', theme: 'mini-ranger', colors: ['27ae60', '2ecc71', '28b463', '239b56'] }
];

// Seasonal-themed avatar styles
const SEASONAL_AVATAR_STYLES = [
  { style: 'avataaars', theme: 'spring', colors: ['a8e6cf', '8fd3f4', 'ffd3b6', 'ffaaa5'] },
  { style: 'personas', theme: 'summer', colors: ['ffd700', 'ff8c00', 'ff6347', 'ff4500'] },
  { style: 'fun-emoji', theme: 'autumn', colors: ['d2691e', 'cd853f', 'daa520', 'b8860b'] },
  { style: 'avataaars', theme: 'winter', colors: ['e0f2f7', 'b3e5fc', '81d4fa', '4fc3f7'] },
  { style: 'adventurer', theme: 'spring-bloom', colors: ['ffb6c1', 'ffc0cb', 'ffb3ba', 'ffa6c9'] },
  { style: 'lorelei', theme: 'summer-sun', colors: ['fff68f', 'ffec8b', 'ffefdb', 'ffdab9'] },
  { style: 'micah', theme: 'autumn-leaves', colors: ['ff7f50', 'ff6347', 'cd5c5c', 'dc143c'] },
  { style: 'notionists', theme: 'winter-frost', colors: ['f0f8ff', 'e6f3ff', 'd9ecff', 'cce5ff'] }
];

// Time-of-day themed avatar styles
const DAYTIME_AVATAR_STYLES = [
  { style: 'avataaars', theme: 'dawn', colors: ['ff9999', 'ffb380', 'ffc966', 'ffdb4d'] },
  { style: 'personas', theme: 'morning', colors: ['fff68f', 'ffec8b', 'ffefdb', 'ffdab9'] },
  { style: 'fun-emoji', theme: 'noon', colors: ['ffff00', 'ffd700', 'ffa500', 'ff8c00'] },
  { style: 'avataaars', theme: 'sunset', colors: ['ff6b6b', 'ff8b94', 'ffa07a', 'ffb997'] },
  { style: 'adventurer', theme: 'twilight', colors: ['9370db', '8a7aa8', '7a6faa', '6a5acd'] },
  { style: 'lorelei', theme: 'night', colors: ['191970', '000080', '00008b', '0000cd'] },
  { style: 'micah', theme: 'midnight', colors: ['2c3e50', '34495e', '1c2833', '17202a'] }
];

// Activity-based avatar styles
const ACTIVITY_AVATAR_STYLES = [
  { style: 'avataaars', theme: 'hiking', colors: ['8b4513', '6b4423', '5c4033', '4a3728'] },
  { style: 'personas', theme: 'camping', colors: ['556b2f', '6b8e23', '808000', '9acd32'] },
  { style: 'fun-emoji', theme: 'swimming', colors: ['4682b4', '5f9ea0', '48d1cc', '40e0d0'] },
  { style: 'avataaars', theme: 'cycling', colors: ['ff6347', 'ff4500', 'ff69b4', 'ff1493'] },
  { style: 'adventurer', theme: 'kayaking', colors: ['00ced1', '00bfff', '1e90ff', '4169e1'] },
  { style: 'bottts', theme: 'climbing', colors: ['708090', '778899', '696969', '808080'] },
  { style: 'micah', theme: 'fishing', colors: ['4682b4', '6495ed', '7b68ee', '6a5acd'] },
  { style: 'lorelei', theme: 'birdwatching', colors: ['9370db', '8470ff', '7b68ee', '6a5acd'] },
  { style: 'pixel-art', theme: 'photography', colors: ['696969', '808080', 'a9a9a9', 'c0c0c0'] },
  { style: 'notionists', theme: 'stargazing', colors: ['191970', '483d8b', '4b0082', '663399'] }
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
 * Get current time of day
 * @returns {string} Time of day (dawn, morning, noon, sunset, twilight, night, midnight)
 */
const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'noon';
  if (hour >= 17 && hour < 19) return 'sunset';
  if (hour >= 19 && hour < 21) return 'twilight';
  if (hour >= 21 && hour < 23) return 'night';
  return 'midnight';
};

/**
 * Generate a random travel-themed avatar based on user data
 * @param {string} email - User's email for seed generation
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {Object} userStats - User's travel stats
 * @param {Object} options - Additional options (useSeasonalTheme, useDaytimeTheme, useActivityTheme)
 * @returns {string} Random travel-themed avatar URL
 */
export const generateEmojiAvatar = (email, firstName, lastName, userStats = {}, options = {}) => {
  // Use stats to influence avatar style selection
  const { parksVisited = 0, tripsPlanned = 0, favorites = 0 } = userStats;
  const { useSeasonalTheme = false, useDaytimeTheme = false, useActivityTheme = false } = options;
  
  let avatarStyles = TRAVEL_AVATAR_STYLES;
  
  // Choose avatar style set based on options or user activity
  if (useSeasonalTheme) {
    avatarStyles = SEASONAL_AVATAR_STYLES;
  } else if (useDaytimeTheme) {
    avatarStyles = DAYTIME_AVATAR_STYLES;
  } else if (useActivityTheme) {
    avatarStyles = ACTIVITY_AVATAR_STYLES;
  } else if (parksVisited > 10 || tripsPlanned > 5) {
    avatarStyles = ADVENTURE_AVATAR_STYLES; // More adventurous avatars for very active users
  } else if (parksVisited > 5 || tripsPlanned > 3) {
    avatarStyles = ACTIVITY_AVATAR_STYLES; // Activity-based avatars for active users
  } else if (favorites > 5) {
    avatarStyles = NATURE_AVATAR_STYLES; // Nature-focused avatars for nature enthusiasts
  } else if (favorites > 2) {
    avatarStyles = SEASONAL_AVATAR_STYLES; // Seasonal avatars for engaged users
  }
  
  // Select random avatar style
  const randomIndex = Math.floor(Math.random() * avatarStyles.length);
  const selectedStyle = avatarStyles[randomIndex];
  
  // Create unique seed for this avatar
  const timestamp = Date.now();
  const seed = `${email || 'traveler'}-${timestamp}`;
  const cleanSeed = encodeURIComponent(seed);
  
  // Generate random colors from the theme
  const randomColors = [...selectedStyle.colors].sort(() => 0.5 - Math.random());
  const backgroundColor = randomColors.slice(0, 3).join(',');
  const clothingColor = randomColors.slice(0, 2).join(',');
  
  // Build the avatar URL with additional parameters for more variety
  const baseUrl = `https://api.dicebear.com/7.x/${selectedStyle.style}/svg`;
  const params = new URLSearchParams({
    seed: cleanSeed,
    backgroundColor,
    ...(selectedStyle.style !== 'fun-emoji' && selectedStyle.style !== 'bottts' && { clothingColor }),
    ...(Math.random() > 0.5 && { flip: true }), // 50% chance of flipping avatar
    ...(Math.random() > 0.7 && { rotate: Math.floor(Math.random() * 360) }) // 30% chance of rotation
  });
  
  return `${baseUrl}?${params.toString()}`;
};

/**
 * Generate a DiceBear travel-themed avatar URL
 * @param {string} seed - Seed for consistent generation (usually email or name)
 * @param {string} style - DiceBear style (avataaars, personas, etc.)
 * @returns {string} DiceBear avatar URL
 */
export const generateDiceBearAvatar = (seed, style = 'avataaars') => {
  const cleanSeed = encodeURIComponent(seed || 'traveler');
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${cleanSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

/**
 * Generate a travel-themed avatar using Avataaars with travel colors
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Travel-themed avataaars URL
 */
export const generateTravelAvatar = (seed) => {
  const cleanSeed = encodeURIComponent(seed || 'traveler');
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&clothingColor=262e33,65c9ff,5199e4&hairColor=0e4429,2c1b18,a55728&skinColor=edb98a,fdbcb4,fd9841`;
};

/**
 * Generate a nature-themed avatar using Personas style
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Nature-themed personas URL
 */
export const generateNatureAvatar = (seed) => {
  const cleanSeed = encodeURIComponent(seed || 'nature-lover');
  return `https://api.dicebear.com/7.x/personas/svg?seed=${cleanSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&clothingColor=2c5530,4a6741,6b8e23&hairColor=8b4513,cd853f,daa520`;
};

/**
 * Generate an adventure-themed avatar using Fun-emoji style
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Adventure-themed fun emoji URL
 */
export const generateAdventureAvatar = (seed) => {
  const cleanSeed = encodeURIComponent(seed || 'adventurer');
  return `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${cleanSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

/**
 * Get the best avatar based on user data and preferences
 * @param {Object} user - User object with email, firstName, lastName
 * @param {Object} userStats - User's travel statistics
 * @param {string} preference - Avatar type preference ('emoji', 'dicebear', 'travel', 'nature', 'adventure')
 * @returns {string} Avatar URL or emoji
 */
export const getBestAvatar = (user, userStats = {}, preference = 'travel') => {
  const { email, firstName, lastName } = user || {};
  const seed = email || `${firstName || ''}${lastName || ''}` || 'traveler';
  
  switch (preference) {
    case 'emoji':
      return generateEmojiAvatar(email, firstName, lastName, userStats);
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
 * Generate a seasonal avatar based on current season
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Seasonal avatar URL
 */
export const generateSeasonalAvatar = (seed) => {
  const season = getCurrentSeason();
  const seasonalStyles = SEASONAL_AVATAR_STYLES.filter(s => s.theme.includes(season));
  const selectedStyle = seasonalStyles[Math.floor(Math.random() * seasonalStyles.length)] || SEASONAL_AVATAR_STYLES[0];
  
  const cleanSeed = encodeURIComponent(seed || 'seasonal-traveler');
  const backgroundColor = selectedStyle.colors.join(',');
  
  return `https://api.dicebear.com/7.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}`;
};

/**
 * Generate a time-of-day themed avatar
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Time-based avatar URL
 */
export const generateDaytimeAvatar = (seed) => {
  const timeOfDay = getTimeOfDay();
  const daytimeStyles = DAYTIME_AVATAR_STYLES.filter(s => s.theme === timeOfDay);
  const selectedStyle = daytimeStyles[0] || DAYTIME_AVATAR_STYLES[0];
  
  const cleanSeed = encodeURIComponent(seed || `${timeOfDay}-traveler`);
  const backgroundColor = selectedStyle.colors.join(',');
  
  return `https://api.dicebear.com/7.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}`;
};

/**
 * Generate an activity-based avatar
 * @param {string} seed - Seed for consistent generation
 * @param {string} activity - Activity type (hiking, camping, swimming, etc.)
 * @returns {string} Activity-themed avatar URL
 */
export const generateActivityAvatar = (seed, activity = null) => {
  let selectedStyle;
  
  if (activity) {
    const activityStyles = ACTIVITY_AVATAR_STYLES.filter(s => s.theme === activity);
    selectedStyle = activityStyles[0] || ACTIVITY_AVATAR_STYLES[0];
  } else {
    selectedStyle = ACTIVITY_AVATAR_STYLES[Math.floor(Math.random() * ACTIVITY_AVATAR_STYLES.length)];
  }
  
  const cleanSeed = encodeURIComponent(seed || `${activity || 'activity'}-enthusiast`);
  const backgroundColor = selectedStyle.colors.join(',');
  
  return `https://api.dicebear.com/7.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}`;
};

/**
 * Generate a random avatar from all available styles
 * @param {string} seed - Seed for consistent generation
 * @returns {string} Random avatar URL from any category
 */
export const generateRandomAvatar = (seed) => {
  const allStyles = [
    ...TRAVEL_AVATAR_STYLES,
    ...ADVENTURE_AVATAR_STYLES,
    ...NATURE_AVATAR_STYLES,
    ...SEASONAL_AVATAR_STYLES,
    ...DAYTIME_AVATAR_STYLES,
    ...ACTIVITY_AVATAR_STYLES
  ];
  
  const selectedStyle = allStyles[Math.floor(Math.random() * allStyles.length)];
  const cleanSeed = encodeURIComponent(seed || 'random-traveler');
  const backgroundColor = selectedStyle.colors.join(',');
  
  const params = new URLSearchParams({
    seed: cleanSeed,
    backgroundColor,
    ...(Math.random() > 0.5 && { flip: true }),
    ...(Math.random() > 0.8 && { rotate: Math.floor(Math.random() * 360) })
  });
  
  return `https://api.dicebear.com/7.x/${selectedStyle.style}/svg?${params.toString()}`;
};

/**
 * Get all available avatar style types
 * @returns {Array} Array of style type names
 */
export const getAvailableStyles = () => {
  return [
    'avataaars', 'personas', 'fun-emoji', 'bottts', 'adventurer',
    'micah', 'lorelei', 'pixel-art', 'notionists', 'big-smile', 'miniavs'
  ];
};

/**
 * Get all available themes
 * @returns {Object} Object with theme categories
 */
export const getAvailableThemes = () => {
  return {
    travel: TRAVEL_AVATAR_STYLES.map(s => s.theme),
    adventure: ADVENTURE_AVATAR_STYLES.map(s => s.theme),
    nature: NATURE_AVATAR_STYLES.map(s => s.theme),
    seasonal: SEASONAL_AVATAR_STYLES.map(s => s.theme),
    daytime: DAYTIME_AVATAR_STYLES.map(s => s.theme),
    activity: ACTIVITY_AVATAR_STYLES.map(s => s.theme)
  };
};

/**
 * Generate avatar with specific style and theme
 * @param {string} seed - Seed for consistent generation
 * @param {string} style - DiceBear style name
 * @param {string} theme - Theme category (travel, adventure, nature, seasonal, daytime, activity)
 * @returns {string} Themed avatar URL
 */
export const generateThemedAvatar = (seed, style, theme = 'travel') => {
  let styleSet;
  
  switch (theme.toLowerCase()) {
    case 'adventure':
      styleSet = ADVENTURE_AVATAR_STYLES;
      break;
    case 'nature':
      styleSet = NATURE_AVATAR_STYLES;
      break;
    case 'seasonal':
      styleSet = SEASONAL_AVATAR_STYLES;
      break;
    case 'daytime':
      styleSet = DAYTIME_AVATAR_STYLES;
      break;
    case 'activity':
      styleSet = ACTIVITY_AVATAR_STYLES;
      break;
    default:
      styleSet = TRAVEL_AVATAR_STYLES;
  }
  
  const matchingStyles = styleSet.filter(s => s.style === style);
  const selectedStyle = matchingStyles.length > 0 
    ? matchingStyles[Math.floor(Math.random() * matchingStyles.length)]
    : styleSet[0];
  
  const cleanSeed = encodeURIComponent(seed || `${theme}-${style}`);
  const backgroundColor = selectedStyle.colors.join(',');
  
  return `https://api.dicebear.com/7.x/${selectedStyle.style}/svg?seed=${cleanSeed}&backgroundColor=${backgroundColor}`;
};

/**
 * Generate a collection of different avatars for the same user
 * @param {string} seed - Seed for consistent generation
 * @param {number} count - Number of avatars to generate (default: 5)
 * @returns {Array} Array of avatar URLs
 */
export const generateAvatarCollection = (seed, count = 5) => {
  const cleanSeed = seed || 'collection-user';
  const avatars = [];
  const allStyles = [
    ...TRAVEL_AVATAR_STYLES,
    ...ADVENTURE_AVATAR_STYLES,
    ...NATURE_AVATAR_STYLES,
    ...SEASONAL_AVATAR_STYLES,
    ...DAYTIME_AVATAR_STYLES,
    ...ACTIVITY_AVATAR_STYLES
  ];
  
  // Shuffle and select unique styles
  const shuffledStyles = [...allStyles].sort(() => 0.5 - Math.random());
  
  for (let i = 0; i < Math.min(count, shuffledStyles.length); i++) {
    const style = shuffledStyles[i];
    const seedVariation = `${cleanSeed}-${i}`;
    const backgroundColor = style.colors.join(',');
    
    avatars.push({
      url: `https://api.dicebear.com/7.x/${style.style}/svg?seed=${encodeURIComponent(seedVariation)}&backgroundColor=${backgroundColor}`,
      style: style.style,
      theme: style.theme
    });
  }
  
  return avatars;
};
