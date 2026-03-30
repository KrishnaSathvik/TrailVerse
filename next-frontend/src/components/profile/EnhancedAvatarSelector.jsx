import React, { useState, useEffect } from 'react';
import { generateAvatarCollection, generateRandomAvatar } from '../../utils/avatarGenerator';

/**
 * Enhanced Avatar Selector with visual grid of options
 * Shows multiple avatar choices and allows random generation
 */
const EnhancedAvatarSelector = ({ user, userStats, currentAvatar, onAvatarChange }) => {
  const [avatarOptions, setAvatarOptions] = useState([]);
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar);
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate initial avatar options
  useEffect(() => {
    generateNewOptions();
  }, [user?.email]);

  const generateNewOptions = () => {
    const seed = user?.email || user?.firstName || 'user';
    const options = generateAvatarCollection(seed, 8); // Generate 8 options
    setAvatarOptions(options);
  };

  const handleAvatarSelect = (avatarUrl) => {
    setSelectedAvatar(avatarUrl);
    onAvatarChange(avatarUrl);
  };

  const handleRandomGenerate = async () => {
    setIsGenerating(true);
    
    // Add a small delay for UX
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const seed = user?.email || user?.firstName || 'user';
    const randomAvatar = generateRandomAvatar(seed);
    
    setSelectedAvatar(randomAvatar);
    onAvatarChange(randomAvatar);
    setIsGenerating(false);
  };

  const handleRefreshOptions = () => {
    setIsGenerating(true);
    setTimeout(() => {
      generateNewOptions();
      setIsGenerating(false);
    }, 500);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Choose Your Avatar
        </h3>
        <button
          onClick={handleRefreshOptions}
          disabled={isGenerating}
          className="px-3 py-1.5 text-sm rounded-lg transition"
          style={{
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)'
          }}
        >
          {isGenerating ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {/* Avatar Grid */}
      <div className="grid grid-cols-4 gap-3">
        {avatarOptions.map((avatar, index) => (
          <button
            key={`${avatar.type}-${index}`}
            onClick={() => handleAvatarSelect(avatar.url)}
            className={`
              relative aspect-square rounded-xl overflow-hidden
              transition-all duration-200 hover:scale-105
              ${selectedAvatar === avatar.url ? 'ring-4 ring-purple-500' : 'ring-2 ring-transparent'}
            `}
            style={{
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--border)'
            }}
          >
            <img
              src={avatar.url}
              alt={`Avatar option ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {selectedAvatar === avatar.url && (
              <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                <span className="text-2xl">✓</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Random Generator Button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={handleRandomGenerate}
          disabled={isGenerating}
          className={`
            px-6 py-3 rounded-lg font-medium transition-all
            ${isGenerating ? 'cursor-not-allowed opacity-60' : 'hover:scale-105'}
          `}
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white'
          }}
        >
          {isGenerating ? (
            <span className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Generating...</span>
            </span>
          ) : (
            <span className="flex items-center space-x-2">
              <span>🎲</span>
              <span>Generate Random Avatar</span>
            </span>
          )}
        </button>
      </div>

      {/* Info Text */}
      <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
        Choose from the grid or generate a random avatar
      </p>
    </div>
  );
};

export default EnhancedAvatarSelector;

