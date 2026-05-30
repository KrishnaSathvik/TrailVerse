'use client';

import { ExternalLink } from '@components/icons';
import OptimizedImage from '@/components/common/OptimizedImage';
import ExpandableDescription from './ExpandableDescription';

function contentSections(guide) {
  return (guide.sections || []).filter((section) => section.paragraphs?.length > 0);
}

export default function DiscoverNpsGuideSection({ guide }) {
  if (!guide) return null;

  const sections = contentSections(guide);
  const bodyText = (guide?.body || guide?.summary || '').trim();
  const hasSections = sections.length > 0;
  const hasBody = bodyText.length >= 40;
  const related = guide.youMightAlsoLike || [];
  const hasRelated = related.length > 0;
  const video = guide.video || null;
  const videoSrc = video?.sources?.find((s) => s?.url)?.url || null;
  const videoPoster = video?.poster || guide.image || null;
  const hasMainContent = guide.url && (hasSections || hasBody);

  if (!hasMainContent && !hasRelated) return null;

  return (
    <section
      className="mb-10 rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
    >
      {guide.image && hasMainContent && !videoSrc && (
        <div className="relative h-48 sm:h-56">
          <OptimizedImage
            src={guide.image}
            alt={guide.imageAlt || guide.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-6">
        {hasMainContent && (
          <>
            <p className="text-xs font-medium uppercase tracking-wide mb-4" style={{ color: 'var(--text-tertiary)' }}>
              From NPS.gov
            </p>
            {videoSrc && (
              <div className="mb-6 rounded-xl overflow-hidden" style={{ borderWidth: '1px', borderColor: 'var(--border)' }}>
                <video
                  controls
                  preload="metadata"
                  poster={videoPoster || undefined}
                  className="w-full h-auto"
                >
                  <source src={videoSrc} type="video/mp4" />
                </video>
              </div>
            )}
            {hasSections ? (
              <div className="space-y-6">
                {sections.map((section) => (
                  <div key={section.heading || section.paragraphs[0]?.slice(0, 40)}>
                    {section.heading && (
                      <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        {section.heading}
                      </h2>
                    )}
                    {section.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 48)}
                        className="text-base leading-relaxed mb-3 last:mb-0"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <ExpandableDescription
                text={bodyText}
                collapsedChars={1200}
                className="text-base leading-relaxed whitespace-pre-line"
              />
            )}
            <a
              href={guide.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium mt-6"
              style={{ color: 'var(--accent-green)' }}
            >
              View on NPS.gov
              <ExternalLink className="h-4 w-4" />
            </a>
          </>
        )}

        {hasRelated && (
          <div className={hasMainContent ? 'mt-10 pt-8 border-t' : ''} style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              You might also like
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Related stories and places from NPS.gov, same as the official app.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {related.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-xl overflow-hidden transition hover:-translate-y-0.5"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface-hover, var(--surface))'
                  }}
                >
                  {item.image && (
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <OptimizedImage
                        src={item.image}
                        alt={item.imageAlt || item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                      {item.title}
                    </p>
                    {item.type && (
                      <p className="text-xs mt-1 capitalize" style={{ color: 'var(--text-tertiary)' }}>
                        {item.type}
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
