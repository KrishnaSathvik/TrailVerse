'use client';

import { memo } from 'react';
import Link from 'next/link';

const GuideCard = memo(({ guide, href, ctaLabel = 'Read guide →' }) => {
  const linkHref = href ?? `/guides/${guide.slug}`;
  const excerpt = guide.hubExcerpt ?? guide.metaDescription;

  return (
    <Link
      href={linkHref}
      className="public-editorial-section public-discovery-link group flex h-full min-w-0 flex-col py-6"
      style={{
        borderColor: 'var(--border)',
      }}
    >
      {guide.category ? (
        <span
          className="mb-4 inline-flex w-fit px-3 py-1 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: 'var(--accent-green-light)',
            color: 'var(--accent-green)',
          }}
        >
          {guide.category}
        </span>
      ) : null}

      <h3
        className="text-xl sm:text-2xl font-bold line-clamp-2 mb-3 group-hover:text-forest-500 transition"
        style={{ color: 'var(--text-primary)' }}
      >
        {guide.title}
      </h3>

      <p className="text-sm sm:text-base leading-relaxed line-clamp-3 flex-1" style={{ color: 'var(--text-secondary)' }}>
        {excerpt}
      </p>

      <span className="mt-5 text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
        {ctaLabel}
      </span>
    </Link>
  );
});

GuideCard.displayName = 'GuideCard';

export default GuideCard;
