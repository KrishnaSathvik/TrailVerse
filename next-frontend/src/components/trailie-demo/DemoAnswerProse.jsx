'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeParkLinksInMarkdown } from '@/utils/parkLinkifier';
import { escapeApproximateTildesForGfm } from '@/utils/stripMarkdown';

export default function DemoAnswerProse({ text, className = '' }) {
  const markdown = escapeApproximateTildesForGfm(
    normalizeParkLinksInMarkdown(
      (text || '').replace(/\[ITINERARY_JSON\][\s\S]*$/, '').trimEnd()
    )
  );

  if (!markdown) return null;

  return (
    <div
      className={`text-sm leading-relaxed space-y-3 break-words ${className}`}
      style={{ color: 'var(--text-secondary)' }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong style={{ color: 'var(--text-primary)' }}>{children}</strong>,
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0" style={{ color: 'var(--text-primary)' }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-sm font-semibold first:mt-0" style={{ color: 'var(--text-primary)' }}>
              {children}
            </h3>
          ),
          a: ({ href, children }) => {
            const internal = href?.startsWith('/parks/');
            return (
              <a
                href={href}
                target={internal ? undefined : '_blank'}
                rel={internal ? undefined : 'noopener noreferrer'}
                className="font-medium underline underline-offset-2"
                style={{ color: 'var(--accent-green)' }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
