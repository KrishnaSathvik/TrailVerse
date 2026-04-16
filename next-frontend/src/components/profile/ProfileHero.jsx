import React from 'react';
import Image from 'next/image';
import { Mail, MapPin, Globe, User } from '@components/icons';
import Button from '../common/Button';
import UnifiedAvatarSelector from './UnifiedAvatarSelector';

const ProfileHero = ({
  profileData,
  isChangingAvatar,
  onChangeAvatarStart,
  onCancelAvatarChange,
  onSaveAvatar,
  onAvatarChange,
  user
}) => {
  return (
    <div
      className="mb-6 sm:mb-8"
      style={{
        borderBottom: '1px solid var(--border)',
        paddingBottom: '2rem'
      }}
    >
      <div
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}
      >
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          TrailVerse Profile
        </span>
      </div>

      <div className="mt-6 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex flex-shrink-0 flex-col items-center gap-4">
            <div className="relative inline-block">
              {profileData.avatar && !profileData.avatar.startsWith('http') ? (
                <div
                  key={`${profileData.avatar}-${profileData.avatarVersion}`}
                  className="flex h-28 w-28 items-center justify-center rounded-full border text-5xl lg:h-32 lg:w-32"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)'
                  }}
                >
                  {profileData.avatar}
                </div>
              ) : (
                <Image
                  key={`${profileData.avatar}-${profileData.avatarVersion}`}
                  src={`${profileData.avatar}${profileData.avatar.includes('?') ? '&' : '?'}v=${profileData.avatarVersion}`}
                  alt={`${profileData.firstName} ${profileData.lastName}`}
                  width={128}
                  height={128}
                  className="h-28 w-28 rounded-full border object-cover lg:h-32 lg:w-32"
                  style={{ borderColor: 'var(--border)' }}
                  unoptimized
                />
              )}
            </div>

            <div className="hidden lg:flex lg:flex-col lg:items-center lg:gap-4">
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
                <div className="w-[26rem] space-y-4">
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

          <div className="min-w-0 flex-1">
            <h1
              className="text-center text-5xl font-semibold tracking-tighter leading-none lg:text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              {profileData.firstName || profileData.lastName
                ? `${profileData.firstName} ${profileData.lastName}`.trim()
                : 'Complete Your Profile'}
            </h1>

            <p
              className="mt-4 max-w-3xl text-center text-lg sm:text-xl lg:text-left"
              style={{ color: 'var(--text-secondary)' }}
            >
              Manage your account details, saved parks, reviews, and planning history in one place.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start text-sm">
              <div
                className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)'
                }}
              >
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span className="break-all sm:break-normal">{profileData.email}</span>
              </div>
              {profileData.location && (
                <div
                  className="flex items-center gap-2 rounded-full px-3 py-1.5"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span>{profileData.location}</span>
                </div>
              )}
              {profileData.website && (
                <a
                  href={profileData.website.startsWith('http') ? profileData.website : `https://${profileData.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <Globe className="h-4 w-4 flex-shrink-0" />
                  <span className="break-all sm:break-normal">
                    {profileData.website.replace(/^https?:\/\//, '')}
                  </span>
                </a>
              )}
            </div>

            {profileData.bio && (
              <p
                className="mt-5 max-w-2xl text-center text-sm leading-7 lg:text-left"
                style={{ color: 'var(--text-secondary)' }}
              >
                {profileData.bio}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-center lg:hidden">
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
            <div className="w-full space-y-4 lg:w-[26rem]">
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
  );
};

export default ProfileHero;
