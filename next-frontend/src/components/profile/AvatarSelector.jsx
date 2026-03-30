import React, { useState } from 'react';
import { generateEmojiAvatar } from '../../utils/avatarGenerator';

const AvatarSelector = ({ user, userStats, onAvatarChange }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSelected, setIsSelected] = useState(false);

  const handleRandomAvatar = async () => {
    setIsGenerating(true);
    setIsSelected(true);
    
    // Add a small delay to show loading animation
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const newAvatar = generateEmojiAvatar(user?.email, user?.firstName, user?.lastName, userStats);
    onAvatarChange(newAvatar);
    setIsGenerating(false);
  };

  return (
    <div className="flex justify-center">
      <button
        onClick={handleRandomAvatar}
        disabled={isGenerating}
        className={`p-4 rounded-lg transition border ${
          isSelected 
            ? 'border-purple-500 bg-purple-500/5' 
            : 'border-gray-200 hover:border-gray-300'
        } ${isGenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        style={{
          backgroundColor: isSelected ? 'var(--surface-hover)' : 'var(--surface)',
          borderColor: isSelected ? 'var(--accent)' : 'var(--border)'
        }}
      >
        <div className="flex items-center space-x-3">
          {isGenerating ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
          ) : (
            <span className="text-lg">🎲</span>
          )}
          
          <span className="font-medium text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            {isGenerating ? 'Generating...' : 'Random Avatar'}
          </span>
        </div>
      </button>
    </div>
  );
};

export default AvatarSelector;