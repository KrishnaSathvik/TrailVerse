'use client';

import { useEffect, useState } from 'react';
import { Eye } from '@components/icons';

/**
 * View counts are rendered after mount so SSR HTML matches the first client paint
 * (avoids hydration mismatches when cached HTML or API data differ slightly).
 */
export default function BlogViewCount({ views, className = 'flex items-center gap-1' }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready || typeof views !== 'number') {
    return null;
  }

  return (
    <span className={className}>
      <Eye className="h-3 w-3" />
      {views.toLocaleString()} views
    </span>
  );
}
