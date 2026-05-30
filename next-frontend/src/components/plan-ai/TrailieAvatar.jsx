'use client';

import React from 'react';

const TRAILIE_AVATAR_SRC = '/trailie-avatar.png';

/**
 * Trailie assistant avatar — full circular PNG (no extra green badge wrapper).
 */
export default function TrailieAvatar({ className = '' }) {
  return (
    <img
      src={TRAILIE_AVATAR_SRC}
      alt="Trailie"
      width={40}
      height={40}
      decoding="async"
      className={`flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover ring-2 ring-green-500/20 ${className}`}
      style={{ marginTop: '2px' }}
    />
  );
}
