import React from 'react';
import DotSpinner from '@/components/common/DotSpinner';

/** Centered loading spinner used across park detail tabs. */
export default function ParkTabSpinner() {
  return (
    <div className="flex justify-center py-12">
      <DotSpinner size={32} label="Loading tab content" />
    </div>
  );
}
