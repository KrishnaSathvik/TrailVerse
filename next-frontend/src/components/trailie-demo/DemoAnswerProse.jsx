'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildMarkdownComponents } from '@/components/ai-chat/markdownComponents';
import { normalizeParkLinksInMarkdown } from '@/utils/parkLinkifier';
import { escapeApproximateTildesForGfm } from '@/utils/stripMarkdown';

export default function DemoAnswerProse({ text, className = '' }) {
  const markdownComponents = useMemo(() => buildMarkdownComponents(new Set()), []);

  const markdown = escapeApproximateTildesForGfm(
    normalizeParkLinksInMarkdown(
      (text || '').replace(/\[ITINERARY_JSON\][\s\S]*$/i, '').trimEnd()
    )
  );

  if (!markdown) return null;

  return (
    <div
      className={`prose prose-sm max-w-none min-w-0 break-words ${className}`}
      style={{
        color: 'var(--text-primary)',
        '--tw-prose-bullets': 'var(--text-primary)',
        '--tw-prose-counters': 'var(--text-primary)',
        overflowWrap: 'anywhere',
        wordBreak: 'normal',
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
