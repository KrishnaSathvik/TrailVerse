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
    <div className="relative overflow-hidden rounded-[2rem] p-5 sm:p-7 lg:p-10 backdrop-blur mb-6 sm:mb-8 shadow-xl"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        backgroundImage: 'linear-gradient(145deg, color-mix(in srgb, var(--surface) 82%, white 18%) 0%, var(--surface) 42%, color-mix(in srgb, var(--surface-hover) 78%, var(--accent-green-light) 22%) 100%)'
      }}
    >
      {/* Decorative blobs */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-32 sm:h-40"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-green-light) 40%, transparent 60%) 0%, transparent 100%)'
        }}
      />
      <div
        className="pointer-events-none absolute -right-10 top-8 h-28 w-28 rounded-full blur-3xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent-blue) 28%, transparent 72%)' }}
      />
      <div
        className="pointer-events-none absolute -left-8 bottom-0 h-32 w-32 rounded-full blur-3xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent-green) 20%, transparent 80%)' }}
      />

      <div className="relative">
        {/* TrailVerse badge — centred on mobile, left on desktop */}
        <div className="mb-5 flex justify-center lg:justify-start">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--surface-hover) 72%, white 28%)',
              color: 'var(--text-secondary)',
              border: '1px solid color-mix(in srgb, var(--border) 82%, white 18%)'
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: 'var(--accent-green)' }}
            />
            TrailVerse Profile
          </div>
        </div>

        {/* ── Main hero row: avatar left | info right (desktop) ── */}
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-10">

          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="relative inline-block">
              {profileData.avatar && !profileData.avatar.startsWith('http') ? (
                <div
                  key={`${profileData.avatar}-${profileData.avatarVersion}`}
                  className="w-28 h-28 lg:w-36 lg:h-36 rounded-full ring-4 ring-offset-4 flex items-center justify-center text-5xl shadow-lg"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-green-light) 72%, white 28%) 0%, color-mix(in srgb, var(--accent-blue) 16%, white 84%) 100%)',
                  }}
                >
                  {profileData.avatar}
                </div>
              ) : (
                <img
                  key={`${profileData.avatar}-${profileData.avatarVersion}`}
                  src={`${profileData.avatar}${profileData.avatar.includes('?') ? '&' : '?'}v=${profileData.avatarVersion}`}
                  alt={`${profileData.firstName} ${profileData.lastName}`}
                  className="w-28 h-28 lg:w-36 lg:h-36 rounded-full ring-4 ring-offset-4 shadow-lg object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.target.src = 'https://api.dicebear.com/9.x/avataaars/svg?seed=fallback&backgroundColor=6366f1,8b5cf6,a855f7&size=200';
                  }}
                />
              )}
            </div>
          </div>

          {/* Info block */}
          <div className="flex flex-col items-center lg:items-start flex-1 min-w-0">
            <h1
              className="text-3xl lg:text-4xl font-bold mb-2 text-center lg:text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              {profileData.firstName || profileData.lastName
                ? `${profileData.firstName} ${profileData.lastName}`.trim()
                : 'Complete Your Profile'
              }
            </h1>


            {/* Contact chips */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-5 text-sm">
              <div className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--surface-hover) 72%, white 28%)',
                  border: '1px solid color-mix(in srgb, var(--border) 82%, white 18%)',
                  color: 'var(--text-secondary)'
                }}
              >
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span className="truncate max-w-[220px]">{profileData.email}</span>
              </div>
              {profileData.location && (
                <div className="flex items-center gap-2 rounded-full px-3 py-1.5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--surface-hover) 72%, white 28%)',
                    border: '1px solid color-mix(in srgb, var(--border) 82%, white 18%)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span>{profileData.location}</span>
                </div>
              )}
            </div>

            {/* Bio */}
            {profileData.bio && (
              <div className="mb-5 rounded-2xl px-5 py-3 max-w-lg"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--surface-hover) 72%, white 28%)',
                  border: '1px solid color-mix(in srgb, var(--border) 86%, white 14%)'
                }}
              >
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {profileData.bio}
                </p>
              </div>
            )}

            {/* Change Avatar button / selector */}
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
              <div className="w-full space-y-4">
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileHero;
