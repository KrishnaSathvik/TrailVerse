'use client';

import LoadingSpinner from '@components/common/LoadingSpinner';
import Header from '@components/common/Header';

/**
 * Shared Plan AI page chrome — chat-first layout with contextual sub-header.
 */
export default function PlanAIShell({
  title = 'Trailie',
  subtitle,
  showSubHeader = true,
  headerActions,
  loadingMessage,
  children,
}) {
  const showChromeBar = showSubHeader || headerActions;

  return (
    <div className="plan-ai-shell h-dvh flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        {showChromeBar && (
          <section
            className="relative z-30 shrink-0 border-b px-3 py-2.5 sm:px-5 sm:py-3"
            style={{
              borderColor: 'var(--border)',
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--accent-green) 8%, var(--bg-primary)) 0%, var(--bg-primary) 100%)',
            }}
          >
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2.5 sm:gap-3">
              {showSubHeader ? (
                <div className="min-w-0 flex-1">
                  {title ? (
                    <h1
                      className="truncate text-[15px] font-semibold leading-tight sm:text-lg"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                    >
                      {title}
                    </h1>
                  ) : null}
                  {subtitle ? (
                    <p
                      className="line-clamp-1 text-[11px] leading-snug sm:text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {subtitle}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex-1" aria-hidden="true" />
              )}
              {headerActions ? (
                <div className="flex shrink-0 items-center">{headerActions}</div>
              ) : null}
            </div>
          </section>
        )}

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col overflow-hidden">
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
