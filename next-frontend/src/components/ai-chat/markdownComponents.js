import React from 'react';

/**
 * Stable ReactMarkdown component map — recreated only when parkImageUrls changes.
 */
export function buildMarkdownComponents(parkImageUrls) {
  const parkUrls = parkImageUrls instanceof Set ? parkImageUrls : new Set(parkImageUrls || []);

  return {
    h1: ({ children }) => <h1 className="text-lg sm:text-xl font-bold mb-3 mt-2 break-words">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base sm:text-lg font-semibold mb-2 mt-3 break-words">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm sm:text-base font-semibold mb-2 mt-2 break-words">{children}</h3>,
    strong: ({ children }) => <strong className="font-semibold break-words">{children}</strong>,
    em: ({ children }) => <em className="italic break-words">{children}</em>,
    p: ({ children, node }) => {
      const hasImage = node?.children?.some((c) => c.tagName === 'img');
      const Tag = hasImage ? 'div' : 'p';
      return (
        <Tag
          className="mb-2 leading-relaxed text-sm sm:text-base break-words"
          style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
        >
          {children}
        </Tag>
      );
    },
    br: () => <br />,
    ul: ({ children }) => (
      <ul
        className="ml-4 list-disc space-y-1 mb-2 text-sm sm:text-base break-words"
        style={{ color: 'var(--text-primary)', listStyleType: 'disc' }}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol
        className="ml-4 list-decimal space-y-1 mb-2 text-sm sm:text-base break-words"
        style={{ color: 'var(--text-primary)', listStyleType: 'decimal' }}
      >
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li
        className="break-words"
        style={{
          color: 'var(--text-primary)',
          markerColor: 'var(--text-primary)',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </li>
    ),
    code: ({ children, className }) => {
      const isInline = !className;
      return isInline ? (
        <code className="px-1 rounded text-xs sm:text-sm" style={{ backgroundColor: 'var(--surface-hover)' }}>
          {children}
        </code>
      ) : (
        <code
          className="block p-2 rounded text-xs sm:text-sm overflow-x-auto mb-2"
          style={{ backgroundColor: 'var(--surface-hover)' }}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="p-2 rounded overflow-x-auto mb-2 text-xs sm:text-sm" style={{ backgroundColor: 'var(--surface-hover)' }}>
        {children}
      </pre>
    ),
    a: ({ href, children }) => {
      if (href?.startsWith('/parks/')) {
        return (
          <a href={href} className="underline" style={{ color: 'var(--accent-green)', textDecoration: 'underline' }}>
            {children}
          </a>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: 'var(--forest-500)' }}
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt }) => {
      if (parkUrls.has(src)) return null;
      return (
        <img
          src={src}
          alt={alt || 'Photo'}
          className="rounded-xl my-3 w-full max-w-sm object-cover"
          style={{ aspectRatio: '4/3', backgroundColor: 'var(--surface-hover)' }}
          loading="eager"
          decoding="async"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      );
    },
    hr: () => <hr className="my-4" style={{ borderColor: 'var(--border)' }} />,
    blockquote: ({ children }) => (
      <blockquote
        className="border-l-4 pl-4 italic mb-2 break-words overflow-wrap-anywhere"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      >
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <table className="min-w-full border-collapse border mb-2 text-xs sm:text-sm" style={{ borderColor: 'var(--border)' }}>
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th
        className="border px-2 py-1 font-semibold text-left break-words overflow-wrap-anywhere"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-hover)' }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border px-2 py-1 break-words overflow-wrap-anywhere" style={{ borderColor: 'var(--border)' }}>
        {children}
      </td>
    ),
  };
}
