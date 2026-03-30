import React from 'react';
import { Mail, MapPin, User } from '@components/icons';
import Button from '../common/Button';
import UnifiedAvatarSelector from './UnifiedAvatarSelector';

const ProfileHero = ({
  profileData,
  isChangingAvatar,
  onChangeAvatarStart,
  onCancelAvatarChange,
  onGenerateNewAvatar,
  onSaveAvatar,
  onAvatarChange,
  user
}) => {
  return (
    <div className="rounded-3xl p-4 sm:p-6 lg:p-12 text-center backdrop-blur mb-6 sm:mb-8 shadow-xl"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        backgroundImage: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-hover) 100%)'
      }}
    >
      {/* Avatar Section */}
      <div className="mx-auto mb-6">
        <div className="relative inline-block">
          {profileData.avatar && !profileData.avatar.startsWith('http') ? (
            <div
              key={`${profileData.avatar}-${profileData.avatarVersion}`}
              className="w-24 h-24 lg:w-32 lg:h-32 rounded-full ring-4 ring-offset-4 flex items-center justify-center text-4xl lg:text-5xl bg-gradient-to-br from-purple-100 to-blue-100 shadow-lg"
              style={{ 
                backgroundColor: 'var(--surface-hover)',
                ringColor: 'var(--accent-green)',
                ringOffsetColor: 'var(--bg-primary)'
              }}
            >
              {profileData.avatar}
            </div>
          ) : (
            <img
              key={`${profileData.avatar}-${profileData.avatarVersion}`}
              src={`${profileData.avatar}${profileData.avatar.includes('?') ? '&' : '?'}v=${profileData.avatarVersion}`}
              alt={`${profileData.firstName} ${profileData.lastName}`}
              className="w-24 h-24 lg:w-32 lg:h-32 rounded-full ring-4 ring-offset-4 shadow-lg object-cover"
              style={{ 
                ringColor: 'var(--accent-green)',
                ringOffsetColor: 'var(--bg-primary)'
              }}
              loading="lazy"
              onError={(e) => {
                console.log('Avatar image failed to load:', profileData.avatar);
                // Fallback to a reliable DiceBear avatar
                e.target.src = 'https://api.dicebear.com/9.x/avataaars/svg?seed=fallback&backgroundColor=6366f1,8b5cf6,a855f7&size=200';
              }}
            />
          )}
        </div>
      </div>

      {/* Profile Info */}
      <h1 className="text-3xl lg:text-4xl font-bold mb-3"
        style={{ color: 'var(--text-primary)' }}
      >
        {profileData.firstName || profileData.lastName 
          ? `${profileData.firstName} ${profileData.lastName}`.trim()
          : 'Complete Your Profile'
        }
      </h1>
      
      <div className="flex flex-wrap items-center justify-center gap-4 mb-4 text-base">
        <div className="flex items-center gap-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Mail className="h-4 w-4" />
          <span>{profileData.email}</span>
        </div>
        {profileData.location && (
          <>
            <span style={{ color: 'var(--text-tertiary)' }}>•</span>
            <div className="flex items-center gap-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MapPin className="h-4 w-4" />
              <span>{profileData.location}</span>
            </div>
          </>
        )}
      </div>
      
      {/* Avatar Change Section */}
      <div className="mb-6">
        {!isChangingAvatar ? (
          <Button
            onClick={onChangeAvatarStart}
            variant="secondary"
            size="sm"
            icon={User}
          >
            Change Avatar
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Avatar Selector with integrated Save/Cancel */}
            <div className="max-w-2xl mx-auto">
              <UnifiedAvatarSelector
                user={user}
                currentAvatar={profileData.avatar}
                onAvatarChange={onAvatarChange}
                onSave={onSaveAvatar}
                onCancel={onCancelAvatarChange}
                showGenerated={true}
                showUpload={true}
              />
            </div>
          </div>
        )}
      </div>
      
      {profileData.bio && (
        <p className="text-base leading-relaxed max-w-2xl mx-auto mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          {profileData.bio}
        </p>
      )}
    </div>
  );
};

export default ProfileHero;

