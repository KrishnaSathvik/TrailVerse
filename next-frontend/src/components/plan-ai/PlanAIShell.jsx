'use client';

import LoadingSpinner from '@components/common/LoadingSpinner';
import Header from '@components/common/Header';

/**
 * Shared Plan AI page chrome — used for Suspense fallbacks, session restore,
 * and the loaded chat so refresh never flashes a different layout.
 */
export default function PlanAIShell({
  title = 'Plan Your Trip',
  subtitle,
  headerActions,
  loadingMessage,
  children,
}) {
  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        <section
          className="relative z-30 shrink-0 overflow-visible border-b px-4 py-2 sm:px-6 sm:py-4 lg:px-10 xl:px-12"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[11px] font-medium uppercase tracking-[0.18em] sm:text-xs sm:tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Trailie
              </p>
              <h1 className="mt-1 truncate text-base font-semibold sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
                {title}
              </h1>
              {subtitle && (
                <p
                  className="mt-0.5 line-clamp-2 text-[11px] leading-snug sm:text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {subtitle}
                </p>
              )}
            </div>
            {headerActions}
          </div>
        </section>

        <div className="relative z-10 flex flex-1 min-h-0 flex-col overflow-hidden">
          {children ?? (
            loadingMessage ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4">
                <LoadingSpinner size="md" text={loadingMessage} />
              </div>
            ) : null
          )}
        </div>
      </main>
    </div>
  );
}
