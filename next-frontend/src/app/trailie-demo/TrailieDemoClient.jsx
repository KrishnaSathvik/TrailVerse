'use client';

import dynamic from 'next/dynamic';
import DotSpinner from '@/components/common/DotSpinner';

const TrailieInteractiveDemo = dynamic(
  () => import('@/components/trailie-demo/TrailieInteractiveDemo'),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[12rem] w-full items-center justify-center py-12"
        style={{
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <DotSpinner size={40} label="Loading Trailie demo" />
      </div>
    ),
  }
);

export default function TrailieDemoClient({
  showHeader = true,
  showCta = true,
  className = '',
}) {
  return (
    <TrailieInteractiveDemo
      showHeader={showHeader}
      showCta={showCta}
      className={className}
    />
  );
}
