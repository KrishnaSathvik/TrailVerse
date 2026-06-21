import LoadingSpinner from '@/components/common/LoadingSpinner';

/**
 * Park grid loading state for intent landings — matches explore section spinner + card skeletons.
 */
export default function IntentTopMatchesSkeleton({ showSpinner = true }) {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading park matches">
      {showSpinner ? (
        <div className="flex justify-center py-12 sm:py-16">
          <LoadingSpinner size="lg" text="Loading park matches…" />
        </div>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-5 sm:gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-80 rounded-2xl animate-pulse"
            style={{ backgroundColor: 'var(--surface-hover)' }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
