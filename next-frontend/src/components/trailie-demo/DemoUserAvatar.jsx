'use client';

import { useState } from 'react';
import { User } from '@components/icons';
import { generateDemoGuestAvatar } from '@/utils/avatarGenerator';

export const DEMO_GUEST_AVATAR = generateDemoGuestAvatar();

/** Guest avatar in the Trailie demo — curated DiceBear, not the generic User icon. */
export default function DemoUserAvatar({ className = '' }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-gray-200/80 ${className}`}
        style={{ backgroundColor: 'var(--surface)' }}
        aria-hidden="true"
      >
        <User className="h-[42%] w-[42%]" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  return (
    <img
      src={DEMO_GUEST_AVATAR}
      alt=""
      width={32}
      height={32}
      decoding="async"
      className={`shrink-0 rounded-full object-cover ring-2 ring-green-500/15 ${className}`}
      onError={() => setError(true)}
    />
  );
}
