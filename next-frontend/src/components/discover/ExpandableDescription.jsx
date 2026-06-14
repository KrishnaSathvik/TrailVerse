'use client';

import { useLayoutEffect, useRef, useState } from 'react';

export const DEFAULT_COLLAPSED_CHARS = 520;

export default function ExpandableDescription({
  text,
  collapsedChars = DEFAULT_COLLAPSED_CHARS,
  collapsedLines = null,
  className = 'text-sm leading-relaxed whitespace-pre-line',
  style
}) {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const contentRef = useRef(null);

  useLayoutEffect(() => {
    if (!collapsedLines || expanded) return;

    const el = contentRef.current;
    if (!el) return;
    setIsTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded, collapsedLines]);

  if (!text) return null;

  const needsCharToggle = !collapsedLines && text.length > collapsedChars;
  const needsLineToggle = Boolean(collapsedLines) && (isTruncated || expanded);
  const needsToggle = needsCharToggle || needsLineToggle;

  const displayText =
    needsCharToggle && !expanded ? `${text.slice(0, collapsedChars).trim()}…` : text;

  const lineClampClass =
    collapsedLines && !expanded
      ? {
          2: 'line-clamp-2',
          3: 'line-clamp-3',
          4: 'line-clamp-4',
          5: 'line-clamp-5',
          6: 'line-clamp-6',
        }[collapsedLines] || 'line-clamp-3'
      : '';

  return (
    <div>
      <p
        ref={contentRef}
        className={[className, lineClampClass].filter(Boolean).join(' ')}
        style={style ?? { color: 'var(--text-secondary)' }}
      >
        {collapsedLines ? text : displayText}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          className="text-xs font-medium mt-2 hover:underline"
          style={{ color: 'var(--accent-green)' }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
