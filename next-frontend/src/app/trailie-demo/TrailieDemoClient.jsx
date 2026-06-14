'use client';

import dynamic from 'next/dynamic';
import DotSpinner from '@/components/common/DotSpinner';

const TrailieInteractiveDemo = dynamic(
  () => import('@/components/trailie-demo/TrailieInteractiveDemo'),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex w-full items-center justify-center overflow-hidden rounded-2xl sm:rounded-3xl shadow-lg"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          minHeight: '28rem',
        }}
      >
        <DotSpinner size={40} label="Loading Trailie demo" />
      </div>
    ),
  }
);

export default function TrailieDemoClient({ showHeader = true, showCta = true }) {
  return <TrailieInteractiveDemo showHeader={showHeader} showCta={showCta} />;
}
