import React, { useState, useEffect } from 'react';
import { generateAvatarCollection, clearAvatarCache } from '../../utils/avatarGenerator';
import AvatarUpload from './AvatarUpload';
import Button from '../common/Button';
import { Save, X, RefreshCw } from '@components/icons';

/**
 * Unified Avatar Selector - Combines generated avatars with image upload
 * Clean tabbed interface with Save/Cancel in each tab
 */
const UnifiedAvatarSelector = ({ 
  user, 
  currentAvatar, 
  onAvatarChange,
  onSave,
  onCancel,
  showGenerated = true,
  showUpload = true,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState('generated'); // 'generated' or 'upload'
  const [avatarOptions, setAvatarOptions] = useState([]);
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar);
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate initial avatar options
  useEffect(() => {
    if (showGenerated) {
      generateNewOptions();
    }
  }, [user?.email, showGenerated]);

  const generateNewOptions = () => {
    const seed = user?.email || user?.firstName || 'user';
    const options = generateAvatarCollection(seed, 8);
    setAvatarOptions(options);
  };

  const handleAvatarSelect = (avatarUrl) => {
    setSelectedAvatar(avatarUrl);
    // Immediately update the avatar on ProfileHero
    onAvatarChange(avatarUrl);
  };

  const handleRefreshOptions = () => {
    setIsGenerating(true);
    clearAvatarCache();
    setTimeout(() => {
      generateNewOptions();
      setIsGenerating(false);
    }, 500);
  };

  return (
    <div className={`unified-avatar-selector ${className}`}>
      {/* Tab Navigation */}
      {(showGenerated && showUpload) && (
        <div className="flex mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setActiveTab('generated')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'generated'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
            style={activeTab !== 'generated' ? { color: 'var(--text-secondary)' } : {}}
          >
            🎨 Generate Avatar
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
            style={activeTab !== 'upload' ? { color: 'var(--text-secondary)' } : {}}
          >
            📸 Upload Image
          </button>
        </div>
      )}

      {/* Generated Avatars Tab */}
      {showGenerated && (!showUpload || activeTab === 'generated') && (
        <div className="space-y-6">
          {/* Avatar Grid */}
          <div className="grid grid-cols-4 gap-3">
            {avatarOptions.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAvatarSelect(option.url)}
                className={`
                  relative overflow-hidden rounded-xl border-2 transition-all duration-200 hover:scale-105
                  ${selectedAvatar === option.url
                    ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                    : 'hover:border-blue-300'
                  }
                `}
                style={{
                  borderColor: selectedAvatar === option.url ? undefined : 'var(--border)'
                }}
              >
                <img
                  src={option.url}
                  alt={`Avatar option ${index + 1}`}
                  className="w-full h-20 object-cover"
                />
                {selectedAvatar === option.url && (
                  <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    ✓
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Generate New Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleRefreshOptions}
              disabled={isGenerating}
              loading={isGenerating}
              variant="outline"
              size="md"
              icon={RefreshCw}
            >
              Generate New Avatars
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center pt-4">
            <Button
              onClick={onCancel}
              variant="secondary"
              size="sm"
              icon={X}
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              variant="secondary"
              size="sm"
              icon={Save}
            >
              Save Avatar
            </Button>
          </div>
        </div>
      )}

      {/* Upload Tab */}
      {showUpload && (!showGenerated || activeTab === 'upload') && (
        <div className="space-y-6">
          <AvatarUpload
            user={user}
            currentAvatar={currentAvatar}
            onAvatarChange={onAvatarChange}
            maxSize={5 * 1024 * 1024} // 5MB
            showPreview={false} // Don't show preview in upload component
          />

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center pt-4">
            <Button
              onClick={onCancel}
              variant="secondary"
              size="sm"
              icon={X}
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              variant="secondary"
              size="sm"
              icon={Save}
            >
              Save Avatar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedAvatarSelector;
