import React from 'react';
import { Globe } from '@components/icons';
import TrailieAvatar from '@components/plan-ai/TrailieAvatar';

const TypingIndicator = ({ text = 'Working on that…', sources = [], inlineAvatarLayout = false }) => {
  const isSearching = sources?.includes('web');

  const brandHeader = (
    <span
      className="text-sm font-semibold leading-none"
      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
    >
      Trailie
    </span>
  );

  const typingBody = (
    <div className="flex items-center gap-3">
      {isSearching ? (
        <Globe
          className="h-4 w-4 animate-spin"
          style={{ color: 'var(--accent-blue, #0ea5e9)', animationDuration: '2s' }}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '0ms' }}
          />
          <span
            className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '150ms' }}
          />
          <span
            className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '300ms' }}
          />
        </div>
      )}

      <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {text}
      </span>
    </div>
  );

  // Phase 6A — the NPS Data / Weather / Web Search source badges are removed
  // deliberately: evidence infrastructure (which providers are being
  // consulted) must stay invisible during generation, not just unnamed.
  // `sources` itself is still accepted (it still drives the searching-globe
  // vs. bouncing-dots icon above) — only the labeled badge row is gone.

  if (inlineAvatarLayout) {
    return (
      <div className="trailie-status-row group w-full max-w-[48rem] py-1" role="status" aria-live="polite" aria-label={text}>
        <div className="flex items-start gap-3">
          <div className="pt-0.5">
            <TrailieAvatar className="!h-8 !w-8 shrink-0 sm:!h-9 sm:!w-9" />
          </div>
          <div className="min-w-0 pt-0.5">
            {brandHeader}
            <div className="mt-2">{typingBody}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 sm:gap-4" role="status" aria-live="polite" aria-label={text}>
      <TrailieAvatar />
      <div className="flex-1">
        <div
          className="inline-block rounded-2xl rounded-tl-sm px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          {typingBody}
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
