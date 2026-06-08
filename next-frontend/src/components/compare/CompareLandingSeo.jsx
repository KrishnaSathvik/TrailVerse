import Link from 'next/link';
import { COMPARE_LANDINGS } from '@/data/compareLandings';

export default function CompareLandingSeo({ landing }) {
  const otherLandings = COMPARE_LANDINGS.filter((item) => item.slug !== landing.slug);

  return (
    <>
      <section className="relative overflow-hidden py-6 sm:py-12 lg:py-16">
        <div className="relative z-10 max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          <p className="text-xs font-medium uppercase tracking-wider mb-3 sm:mb-4" style={{ color: 'var(--text-secondary)' }}>
            Park comparison
          </p>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight mb-3 sm:mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            {landing.headline}
          </h1>
          <p className="text-base sm:text-lg lg:text-xl max-w-3xl mb-6" style={{ color: 'var(--text-secondary)' }}>
            {landing.intro}
          </p>
          <p className="text-sm max-w-3xl" style={{ color: 'var(--text-tertiary)' }}>
            Compare entrance fees, parking, crowd levels, weather, and top activities side by side — then plan the winner with Trailie.
          </p>
        </div>
      </section>

      {otherLandings.length > 0 && (
        <section className="pb-6 sm:pb-10">
          <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              More popular comparisons
            </h2>
            <ul className="flex flex-wrap gap-2">
              {otherLandings.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/compare/${item.slug}`}
                    className="inline-flex px-3 py-1.5 rounded-full text-xs font-medium transition hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/compare"
                  className="inline-flex px-3 py-1.5 rounded-full text-xs font-medium transition hover:opacity-80"
                  style={{ color: 'var(--accent-green)' }}
                >
                  Compare any parks
                </Link>
              </li>
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
