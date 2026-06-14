'use client';

import { ExternalLink, MapPin } from '@components/icons';
import OptimizedImage from '@/components/common/OptimizedImage';
import ExpandableDescription from './ExpandableDescription';

function filterSnippets(snippets = []) {
  return snippets.filter((snippet) => {
    const text = (snippet.description || snippet.excerpt || '').trim();
    return text.length >= 20;
  });
}

export default function DiscoverAboutSection({ about }) {
  if (!about) return null;

  const snippets = filterSnippets(about.snippets);
  const hasSummary = Boolean(about.summary?.trim());
  const hasSnippets = snippets.length > 0;

  if (!hasSummary && !hasSnippets) return null;

  return (
    <section
      className="mb-10 rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
    >
      <div className="p-4 sm:p-6">
        <h2 className="text-xl font-bold mb-4 sm:mb-5" style={{ color: 'var(--text-primary)' }}>
          {about.title}
        </h2>

        {hasSummary && (
          <div className={hasSnippets ? 'mb-6 sm:mb-8' : ''}>
            <ExpandableDescription
              text={about.summary}
              collapsedLines={5}
              className="text-base leading-relaxed whitespace-pre-line"
            />
          </div>
        )}

        {hasSnippets && (
          <ul
            className={`grid grid-cols-1 sm:grid-cols-2 items-stretch gap-4 sm:gap-5 ${hasSummary ? 'pt-6 sm:pt-8 border-t' : ''}`}
            style={{ borderColor: 'var(--border)' }}
          >
            {snippets.map((snippet) => (
              <li key={`${snippet.title}-${snippet.parkCode}`} className="min-w-0 flex">
                <article
                  className="flex h-full w-full flex-col rounded-xl overflow-hidden"
                  style={{ borderWidth: '1px', borderColor: 'var(--border)' }}
                >
                  {snippet.image && (
                    <div className="relative aspect-[16/10] w-full shrink-0">
                      <OptimizedImage
                        src={snippet.image}
                        alt={snippet.imageAlt || snippet.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                    <div className="shrink-0">
                      <h3
                        className="font-semibold text-base leading-snug line-clamp-2 min-h-[2.75rem]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {snippet.title}
                      </h3>
                      {snippet.parkName ? (
                        <p
                          className="text-xs mt-1.5 flex items-start gap-1 line-clamp-2 min-h-[2rem]"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <MapPin className="h-3 w-3 shrink-0 mt-0.5" aria-hidden />
                          <span>{snippet.parkName}</span>
                        </p>
                      ) : (
                        <div className="min-h-[2rem]" aria-hidden />
                      )}
                    </div>
                    <div className="mt-3 flex flex-1 flex-col">
                      <ExpandableDescription
                        text={snippet.description || snippet.excerpt}
                        collapsedLines={4}
                        className="text-sm leading-relaxed whitespace-pre-line min-h-[5.25rem]"
                      />
                    </div>
                    {snippet.url && (
                      <a
                        href={snippet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium mt-auto pt-3 shrink-0"
                        style={{ color: 'var(--accent-green)' }}
                      >
                        View on NPS.gov
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
