'use client';

import { Children, isValidElement, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildMarkdownComponents } from '@/components/ai-chat/markdownComponents';
import { normalizeParkLinksInMarkdown, unwrapMislinkedParkMarkdown } from '@/utils/parkLinkifier';
import { escapeApproximateTildesForGfm, stabilizeStreamingMarkdown } from '@/utils/stripMarkdown';
import { sanitizeTrailieCitations } from '@/utils/sanitizeTrailieCitations';

function countTableColumns(children) {
  let max = 0;
  const walk = (nodes) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === 'tr' || child.props?.node?.tagName === 'tr') {
        let cells = 0;
        Children.forEach(child.props.children, (cell) => {
          if (isValidElement(cell)) cells += 1;
        });
        if (cells > max) max = cells;
      }
      if (child.props?.children) walk(child.props.children);
    });
  };
  walk(children);
  return max;
}

function columnPercents(count) {
  if (count === 3) return [24, 38, 38];
  if (count === 4) return [22, 26, 26, 26];
  if (count > 4) {
    const rest = (100 - 22) / (count - 1);
    return [22, ...Array.from({ length: count - 1 }, () => rest)];
  }
  return null;
}

function ResponsiveComparisonTable({ children }) {
  const columns = countTableColumns(children);
  const percents = columnPercents(columns);
  return (
    <div className="trailie-table-breakout my-4 w-full min-w-0 max-w-[68rem]">
      <span
        aria-hidden="true"
        className="mb-1.5 block text-[11px] font-medium tracking-wide md:hidden"
        style={{ color: 'var(--text-secondary)' }}
      >
        Swipe to compare →
      </span>
      <div
        role="region"
        aria-label="Comparison table"
        tabIndex={0}
        data-column-count={columns || undefined}
        className="w-full max-w-full overflow-hidden border-y max-md:overflow-x-auto max-md:overscroll-x-contain md:overflow-visible [-webkit-overflow-scrolling:touch] [&_table]:!my-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <table className="table-fixed w-full min-w-[34rem] border-collapse text-xs md:min-w-0 md:text-sm !my-0 [&_tr:last-child_td]:border-b-0">
          {percents ? (
            <colgroup>
              {percents.map((width, index) => (
                <col key={`col-${index}`} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
          ) : null}
          {children}
        </table>
      </div>
    </div>
  );
}

export default function TrailieMarkdown({
  text,
  parkImages = [],
  isStreaming = false,
  isFinalizing = false,
  className = '',
}) {
  const parkImageUrls = useMemo(
    () => new Set((parkImages || []).map((image) => image?.url).filter(Boolean)),
    [parkImages]
  );
  const components = useMemo(() => ({
    ...buildMarkdownComponents(parkImageUrls),
    table: ResponsiveComparisonTable,
    th: ({ children }) => (
      <th
        className="border-x-0 border-b px-3 py-3 text-left align-top text-xs font-semibold whitespace-normal md:px-4 md:text-sm"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'color-mix(in srgb, var(--accent-green) 6%, var(--surface))',
          fontFamily: 'var(--font-display)',
        }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        className="border-x-0 border-b px-3 py-3 align-top text-xs leading-relaxed whitespace-normal md:px-4 md:text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        {children}
      </td>
    ),
  }), [parkImageUrls]);

  const body = sanitizeTrailieCitations(
    (text || '').replace(/\[ITINERARY_JSON\][\s\S]*$/i, '').trimEnd()
  ).content;
  const stableBody = isStreaming ? stabilizeStreamingMarkdown(body) : body;
  const markdown = escapeApproximateTildesForGfm(
    !isStreaming && !isFinalizing
      ? normalizeParkLinksInMarkdown(stableBody)
      : unwrapMislinkedParkMarkdown(stableBody)
  );
  if (!markdown) return null;

  return (
    <div
      className={`prose prose-sm max-w-none min-w-0 break-words sm:prose-base [&>:not(.trailie-table-breakout)]:max-w-[48rem] ${className}`}
      style={{
        color: 'var(--text-primary)',
        '--tw-prose-bullets': 'var(--text-primary)',
        '--tw-prose-counters': 'var(--text-primary)',
        overflowWrap: 'anywhere',
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
