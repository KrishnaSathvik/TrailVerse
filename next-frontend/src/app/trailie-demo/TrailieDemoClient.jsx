'use client';

import dynamic from 'next/dynamic';

const TrailieInteractiveDemo = dynamic(
  () => import('@/components/trailie-demo/TrailieInteractiveDemo'),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-lg animate-pulse"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          minHeight: '28rem',
        }}
        aria-hidden="true"
      />
    ),
  }
);

export default function TrailieDemoClient({ showHeader = true, showCta = true }) {
  return <TrailieInteractiveDemo showHeader={showHeader} showCta={showCta} />;
}
