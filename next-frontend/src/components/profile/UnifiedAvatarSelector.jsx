import React, { useState, useEffect, useCallback } from 'react';
import {
  AVATAR_PICKER_COUNT,
  generateAvatarCollection,
  clearAvatarCache,
} from '../../utils/avatarGenerator';
import AvatarUpload from './AvatarUpload';
import Button from '../common/Button';
import { Save, X, RefreshCw, Sparkles, Upload } from '@components/icons';

const accentActiveStyle = {
  borderColor: 'var(--accent-green)',
  color: 'var(--accent-green)',
};

/**
 * Unified Avatar Selector - generated avatars + image upload
 */
const UnifiedAvatarSelector = ({
  user,
  currentAvatar,
  onAvatarChange,
  onSave,
  onCancel,
  isSaving = false,
  showGenerated = true,
  showUpload = true,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState('generated');
  const [avatarOptions, setAvatarOptions] = useState([]);
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateNewOptions = useCallback(() => {
    const seed = user?.email || user?.firstName || 'user';
    const options = generateAvatarCollection(seed, AVATAR_PICKER_COUNT);
    setAvatarOptions(options);
  }, [user?.email, user?.firstName]);

  useEffect(() => {
    if (showGenerated) {
      generateNewOptions();
    }
  }, [showGenerated, generateNewOptions]);

  useEffect(() => {
    setSelectedAvatar(currentAvatar);
  }, [currentAvatar]);

  const handleAvatarSelect = (avatarUrl) => {
    setSelectedAvatar(avatarUrl);
    onAvatarChange(avatarUrl);
  };

  const handleRefreshOptions = () => {
    setIsGenerating(true);
    clearAvatarCache();
    const seed = user?.email || user?.firstName || 'user';
    setAvatarOptions(generateAvatarCollection(seed, AVATAR_PICKER_COUNT));
    setIsGenerating(false);
  };

  const tabButtonClass = (tab) =>
    `flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
      activeTab === tab ? '' : 'border-transparent opacity-60 hover:opacity-100'
    }`;

  return (
    <div className={`unified-avatar-selector ${className}`}>
      {(showGenerated && showUpload) && (
        <div
          className="mb-6 flex overflow-x-auto border-b"
          style={{ borderColor: 'var(--border)' }}
          role="tablist"
          aria-label="Avatar source"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'generated'}
            onClick={() => setActiveTab('generated')}
            className={tabButtonClass('generated')}
            style={
              activeTab === 'generated'
                ? accentActiveStyle
                : { color: 'var(--text-secondary)' }
            }
          >
            <Sparkles className="h-4 w-4" />
            Generate
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'upload'}
            onClick={() => setActiveTab('upload')}
            className={tabButtonClass('upload')}
            style={
              activeTab === 'upload' ? accentActiveStyle : { color: 'var(--text-secondary)' }
            }
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        </div>
      )}

      {showGenerated && (!showUpload || activeTab === 'generated') && (
        <div className="space-y-6" role="tabpanel">
          <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {AVATAR_PICKER_COUNT} travel-themed looks — each with a different style and color palette.
            Tap refresh for a new batch.
          </p>
          <div className="mx-auto grid max-w-lg grid-cols-4 gap-2.5 sm:max-w-xl sm:gap-3">
            {avatarOptions.map((option, index) => {
              const isSelected = selectedAvatar === option.url;
              const label = option.theme
                ? `${option.theme} avatar, option ${index + 1}`
                : `Avatar option ${index + 1}`;
              return (
                <button
                  key={option.url || index}
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleAvatarSelect(option.url)}
                  className="group relative aspect-square w-full overflow-hidden rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] disabled:opacity-60"
                  style={{
                    borderColor: isSelected ? 'var(--accent-green)' : 'var(--border)',
                    backgroundColor: 'var(--surface)',
                    boxShadow: isSelected
                      ? '0 0 0 2px color-mix(in srgb, var(--accent-green) 35%, transparent)'
                      : undefined,
                  }}
                  aria-pressed={isSelected}
                  aria-label={label}
                  title={option.theme || undefined}
                >
                  <img
                    src={option.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain p-1.5"
                  />
                  {option.theme && (
                    <span
                      className="pointer-events-none absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-center text-[9px] font-medium capitalize opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      style={{
                        color: '#fff',
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.72))',
                      }}
                    >
                      {option.theme}
                    </span>
                  )}
                  {isSelected && (
                    <span
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
                      style={{ backgroundColor: 'var(--accent-green)' }}
                      aria-hidden
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex justify-center">
            <Button
              onClick={handleRefreshOptions}
              disabled={isGenerating || isSaving}
              loading={isGenerating}
              variant="outline"
              size="md"
              icon={RefreshCw}
            >
              Generate new set
            </Button>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-center">
            <Button
              onClick={onCancel}
              disabled={isSaving}
              variant="secondary"
              size="sm"
              icon={X}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={isSaving}
              loading={isSaving}
              variant="success"
              size="sm"
              icon={Save}
              className="w-full sm:w-auto"
            >
              Save photo
            </Button>
          </div>
        </div>
      )}

      {showUpload && (!showGenerated || activeTab === 'upload') && (
        <div className="space-y-6" role="tabpanel">
          <AvatarUpload
            user={user}
            currentAvatar={currentAvatar}
            onAvatarChange={onAvatarChange}
            maxSize={5 * 1024 * 1024}
            showPreview={false}
            disabled={isSaving}
          />

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-center">
            <Button
              onClick={onCancel}
              disabled={isSaving}
              variant="secondary"
              size="sm"
              icon={X}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={isSaving}
              loading={isSaving}
              variant="success"
              size="sm"
              icon={Save}
              className="w-full sm:w-auto"
            >
              Save photo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedAvatarSelector;
