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
  { style: 'personas', theme: 'arctic', colors: ['b0e0e6', '87ceeb', 'add8e6', 'f0f8ff'] }
];

// Adventure-themed avatar styles
const ADVENTURE_AVATAR_STYLES = [
  { style: 'avataaars', theme: 'climber', colors: ['262e33', '65c9ff', '5199e4', '8b4513'] },
  { style: 'personas', theme: 'hiker', colors: ['2c5530', '4a6741', '6b8e23', '8b4513'] },
  { style: 'avataaars', theme: 'explorer', colors: ['8b4513', 'cd853f', 'daa520', '2c5530'] },
  { style: 'fun-emoji', theme: 'sports', colors: ['ff6b6b', '4ecdc4', '45b7d1', '96ceb4'] }
];

// Nature-themed avatar styles  
const NATURE_AVATAR_STYLES = [
  { style: 'personas', theme: 'gardener', colors: ['2c5530', '4a6741', '6b8e23', '228b22'] },
  { style: 'avataaars', theme: 'naturalist', colors: ['8b4513', 'cd853f', 'daa520', '2c5530'] },
  { style: 'personas', theme: 'birdwatcher', colors: ['2c5530', '4a6741', '6b8e23', '8b4513'] },
  { style: 'fun-emoji', theme: 'wildlife', colors: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc'] }
];

/**
 * Generate a random travel-themed avatar based on user data
 * @param {string} email - User's email for seed generation
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {Object} userStats - User's travel stats
 * @returns {string} Random travel-themed avatar URL
 */
export const generateEmojiAvatar = (email, firstName, lastName, userStats = {}) => {
  // Use stats to influence avatar style selection
  const { parksVisited = 0, tripsPlanned = 0, favorites = 0 } = userStats;
  
  let avatarStyles = TRAVEL_AVATAR_STYLES;
  
  // Choose avatar style set based on user activity
  if (parksVisited > 5 || tripsPlanned > 3) {
    avatarStyles = ADVENTURE_AVATAR_STYLES; // More adventurous avatars for active users
  } else if (favorites > 2) {
    avatarStyles = NATURE_AVATAR_STYLES; // Nature-focused avatars for nature lovers
  }
  
  // Select random avatar style
  const randomIndex = Math.floor(Math.random() * avatarStyles.length);
  const selectedStyle = avatarStyles[randomIndex];
  
  // Create unique seed for this avatar
  const timestamp = Date.now();
  const seed = `${email || 'traveler'}-${timestamp}`;
  const cleanSeed = encodeURIComponent(seed);
  
  // Generate random colors from the theme
  const randomColors = selectedStyle.colors.sort(() => 0.5 - Math.random());
  const backgroundColor = randomColors.slice(0, 3).join(',');
  const clothingColor = randomColors.slice(0, 2).join(',');
  
  // Build the avatar URL
  const baseUrl = `https://api.dicebear.com/7.x/${selectedStyle.style}/svg`;
  const params = new URLSearchParams({
    seed: cleanSeed,
    backgroundColor,
    clothingColor
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
