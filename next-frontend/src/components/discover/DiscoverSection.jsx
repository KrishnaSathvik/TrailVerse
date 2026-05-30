'use client';

import Link from 'next/link';

export default function DiscoverSection({ title, seeAllHref, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-sm font-semibold"
            style={{ color: 'var(--accent-green)' }}
          >
            See all
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}
