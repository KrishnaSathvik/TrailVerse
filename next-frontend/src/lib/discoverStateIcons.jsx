'use client';

import stateIcons from '@/data/discover-state-icons.json';

export function StateIcon({ stateCode, className = 'h-7 w-7', style }) {
  const code = stateCode?.toUpperCase();
  const data = code ? stateIcons[code] : null;

  if (!data) {
    return null;
  }

  return (
    <svg
      viewBox={data.viewBox}
      className={className}
      style={style}
      aria-hidden
      focusable="false"
    >
      <path d={data.path} fill="currentColor" />
    </svg>
  );
}
