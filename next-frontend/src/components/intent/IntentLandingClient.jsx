'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from '@components/icons';
import { parkToSlug } from '@/utils/parkSlug';
import ParkCard from '@/components/explore/ParkCard';
import GuideCard from '@/components/guides/GuideCard';
import DiscoverHubHeader from '@/components/discover/DiscoverHubHeader';
import { getIntentLandingByPath } from '@/data/intentLandings';

function IntentFaqAccordion({ items }) {
  const [openItems, setOpenItems] = useState([]);

  const toggle = (id) => {
    setOpenItems((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const id = `faq-${index}`;
        const isOpen = openItems.includes(id);

        return (
          <div
            key={item.q}
            className="rounded-2xl overflow-hidden border"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={() => toggle(id)}
              className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left transition hover:bg-[color-mix(in_srgb,var(--surface-hover)_50%,transparent)]"
              aria-expanded={isOpen}
            >
              <span className="font-semibold text-base sm:text-lg pr-2" style={{ color: 'var(--text-primary)' }}>
                {item.q}
              </span>
              <ChevronDown
                className={`h-5 w-5 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                style={{ color: 'var(--text-tertiary)' }}
              />
            </button>
            {isOpen && (
              <div
                className="px-5 sm:px-6 pb-5 sm:pb-6 pt-0 text-base leading-relaxed border-t"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                <p className="pt-4">{item.a}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function IntentLandingClient({ landing, parks }) {
  const relatedLandings = (landing.relatedLinks ?? [])
    .map((link) => getIntentLandingByPath(link.href))
    .filter(Boolean);

  return (
    <div className="pb-24">
      <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 pt-6">
        <DiscoverHubHeader
          backHref="/guides"
          backLabel="Planning guides"
          title={landing.title}
          intro={landing.intro}
        />

        {landing.quickAnswer ? (
          <div
            className="mb-10 rounded-2xl border px-5 py-6 sm:px-8 sm:py-8"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              borderLeftWidth: '4px',
              borderLeftColor: 'var(--accent-green)',
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--accent-green)' }}
            >
              Quick answer
            </p>
            <p className="text-base sm:text-lg leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>
              {landing.quickAnswer}
            </p>
          </div>
        ) : null}

        {landing.standouts?.length > 0 ? (
          <section className="mb-12 max-w-3xl">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              The standouts
            </h2>
            <ul className="space-y-7">
              {landing.standouts.map((item) => (
                <li
                  key={item.parkCode}
                  className="text-base sm:text-lg leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Link
                    href={`/parks/${parkToSlug(item.fullName)}`}
                    className="font-semibold hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {item.label}
                  </Link>
                  <span aria-hidden="true"> — </span>
                  {item.description}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {landing.trailverseLinks?.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Plan on TrailVerse
            </h2>
            <div className="flex flex-wrap gap-3">
              {landing.trailverseLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--accent-green-light)',
                    color: 'var(--accent-green)',
                  }}
                >
                  {link.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <section id="ranked-parks" className="mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Top matches
          </h2>
          <p className="text-sm mb-6 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            Sorted by how well each park fits this trip type — scenic views, pace, season, terrain, and
            other traits from official NPS descriptions and activities. The summary under each name
            highlights what earned its spot so you can compare finalists quickly.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {parks.map((park, index) => (
              <ParkCard key={park.parkCode} park={park} viewMode="grid" index={index} showReviews={false} />
            ))}
          </div>
        </section>

        {landing.faq?.length > 0 && (
          <section className="mb-12 max-w-3xl">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              Frequently asked questions
            </h2>
            <IntentFaqAccordion items={landing.faq} />
          </section>
        )}

        {relatedLandings.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              Related searches
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {relatedLandings.map((related) => (
                <GuideCard
                  key={related.path}
                  guide={related}
                  href={related.path}
                  ctaLabel="See ranked parks →"
                />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
