'use client';

import React, { useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Mail, MapPin, Globe, Camera, X } from '@components/icons';
import Button from '../common/Button';
import UnifiedAvatarSelector from './UnifiedAvatarSelector';

function isImageAvatar(avatar) {
  if (!avatar || typeof avatar !== 'string') return false;
  return (
    avatar.startsWith('http') ||
    avatar.startsWith('/') ||
    avatar.startsWith('data:')
  );
}

function AvatarDisplay({ profileData, showUnsavedRing }) {
  const ringClass =
    'h-28 w-28 rounded-full border object-cover lg:h-32 lg:w-32 transition-shadow';

  const ringStyle = {
    borderColor: 'var(--border)',
    boxShadow: showUnsavedRing
      ? '0 0 0 3px var(--bg-primary), 0 0 0 5px var(--accent-green)'
      : undefined,
  };

  if (profileData.avatar && !isImageAvatar(profileData.avatar)) {
    return (
      <div
        key={`${profileData.avatar}-${profileData.avatarVersion}`}
        className={`flex items-center justify-center text-5xl ${ringClass}`}
        style={{
          ...ringStyle,
          backgroundColor: 'var(--surface)',
        }}
      >
        {profileData.avatar}
      </div>
    );
  }

  return (
    <Image
      key={`${profileData.avatar}-${profileData.avatarVersion}`}
      src={`${profileData.avatar}${profileData.avatar?.includes('?') ? '&' : '?'}v=${profileData.avatarVersion}`}
      alt={`${profileData.firstName} ${profileData.lastName}`}
      width={128}
      height={128}
      className={ringClass}
      style={ringStyle}
      unoptimized
    />
  );
}

const ProfileHero = ({
  profileData,
  isChangingAvatar,
  isSavingAvatar = false,
  onChangeAvatarStart,
  onCancelAvatarChange,
  onSaveAvatar,
  onAvatarChange,
  user,
}) => {
  const selectorProps = {
    user,
    currentAvatar: profileData.avatar,
    onAvatarChange,
    onSave: onSaveAvatar,
    onCancel: onCancelAvatarChange,
    isSaving: isSavingAvatar,
    showGenerated: true,
    showUpload: true,
  };

  const handleEscape = useCallback(
    (event) => {
      if (event.key === 'Escape' && isChangingAvatar && !isSavingAvatar) {
        onCancelAvatarChange();
      }
    },
    [isChangingAvatar, isSavingAvatar, onCancelAvatarChange]
  );

  useEffect(() => {
    if (!isChangingAvatar) return undefined;
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isChangingAvatar, handleEscape]);

  useEffect(() => {
    if (!isChangingAvatar) return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const lockScroll = () => {
      if (mq.matches) {
        document.body.style.overflow = 'hidden';
      }
    };
    lockScroll();
    const onChange = () => lockScroll();
    mq.addEventListener('change', onChange);
    return () => {
      document.body.style.overflow = '';
      mq.removeEventListener('change', onChange);
    };
  }, [isChangingAvatar]);

  return (
    <div
      className="mb-6 sm:mb-8"
      style={{
        borderBottom: '1px solid var(--border)',
        paddingBottom: '2rem',
      }}
    >
      <div
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}
        >
          TrailVerse Profile
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex flex-shrink-0 flex-col items-center gap-3">
            <button
              type="button"
              onClick={onChangeAvatarStart}
              disabled={isChangingAvatar || isSavingAvatar}
              aria-label="Change profile photo"
              aria-expanded={isChangingAvatar}
              className="group relative inline-block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-green)]"
              style={{ cursor: isChangingAvatar ? 'default' : 'pointer' }}
            >
              <AvatarDisplay profileData={profileData} showUnsavedRing={isChangingAvatar} />
              {!isChangingAvatar && (
                <span
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition group-hover:bg-black/45 group-focus-visible:bg-black/45"
                  aria-hidden
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
                  >
                    <Camera className="h-5 w-5" />
                  </span>
                </span>
              )}
            </button>

            {!isChangingAvatar && (
              <div className="lg:hidden">
                <Button
                  onClick={onChangeAvatarStart}
                  variant="secondary"
                  size="sm"
                  icon={Camera}
                >
                  Change photo
                </Button>
              </div>
            )}
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

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm lg:justify-start">
              <div
                className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
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
                    color: 'var(--text-secondary)',
                  }}
                >
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span>{profileData.location}</span>
                </div>
              )}
              {profileData.website && (
                <a
                  href={
                    profileData.website.startsWith('http')
                      ? profileData.website
                      : `https://${profileData.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
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

            {!isChangingAvatar && (
              <div className="mt-6 hidden lg:flex">
                <Button onClick={onChangeAvatarStart} variant="secondary" size="sm" icon={Camera}>
                  Change photo
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop: full-width editor below hero row */}
        {isChangingAvatar && (
          <div
            className="hidden w-full rounded-2xl border p-4 sm:p-6 lg:block"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-editor-title-desktop"
          >
            <h2
              id="avatar-editor-title-desktop"
              className="mb-1 text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Change profile photo
            </h2>
            <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Pick a generated avatar or upload an image, then save to update your profile.
            </p>
            <UnifiedAvatarSelector {...selectorProps} />
          </div>
        )}
      </div>

      {/* Mobile: bottom sheet modal */}
      {isChangingAvatar && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm lg:hidden"
          role="presentation"
          onClick={isSavingAvatar ? undefined : onCancelAvatarChange}
        >
          <div
            className="max-h-[min(92dvh,720px)] w-full overflow-y-auto rounded-t-3xl p-4 pb-8 sm:p-6"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderTop: '1px solid var(--border)',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-editor-title-mobile"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="avatar-editor-title-mobile"
                  className="text-lg font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Change profile photo
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Preview updates live on your photo above.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={isSavingAvatar}
                onClick={onCancelAvatarChange}
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--text-secondary)',
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <UnifiedAvatarSelector {...selectorProps} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileHero;
