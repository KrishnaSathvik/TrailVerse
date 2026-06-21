'use client';

import dynamic from 'next/dynamic';
import DotSpinner from '@/components/common/DotSpinner';

const TrailieInteractiveDemo = dynamic(
  () => import('@/components/trailie-demo/TrailieInteractiveDemo'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-9 w-20 animate-pulse rounded-full sm:h-10 sm:w-24"
              style={{ backgroundColor: 'var(--surface)' }}
            />
          ))}
        </div>
        <div
          className="flex min-h-[20rem] items-center justify-center rounded-2xl border py-12 sm:rounded-3xl sm:min-h-[24rem]"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          <DotSpinner size={40} label="Loading Trailie demo" />
        </div>
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
