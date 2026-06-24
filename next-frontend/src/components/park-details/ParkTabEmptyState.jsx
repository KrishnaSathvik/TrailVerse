import React from 'react';

/** Shown when a park tab loaded successfully but NPS returned no items. */
export default function ParkTabEmptyState({
  message = 'No park information is available for this section yet.',
}) {
  return (
    <p
      className="text-center py-12 text-sm leading-relaxed"
      style={{ color: 'var(--text-secondary)' }}
    >
      {message}
    </p>
  );
}
