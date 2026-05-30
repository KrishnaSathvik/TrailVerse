import React from 'react';

/** Centered loading spinner used across park detail tabs. */
export default function ParkTabSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div
        className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }}
      />
    </div>
  );
}
