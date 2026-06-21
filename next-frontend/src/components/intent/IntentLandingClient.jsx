'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle,
  ChevronDown,
} from '@components/icons';
import ShareButtons from '@/components/common/ShareButtons';
import TrailiePlanningCta from '@/components/plan-ai/TrailiePlanningCta';
import { getIntentPlanCta } from '@/lib/intentPlanCta';
import ReturnNavLink from '@/components/common/ReturnNavLink';
import GuideCard from '@/components/guides/GuideCard';
import IntentTopMatches from '@/components/intent/IntentTopMatches';
import { getIntentLandingByPath } from '@/data/intentLandings';
import { parkToSlug } from '@/utils/parkSlug';
import { hrefWithFrom, sanitizeFromPath } from '@/lib/returnNavigation';
import {
  ARTICLE_BODY,
  ARTICLE_CALLOUT,
  ARTICLE_CALLOUT_LABEL,
  ARTICLE_DECK,
  ARTICLE_H2,
  ARTICLE_HERO_WIDE,
  ARTICLE_TITLE,
  ARTICLE_WIDE,
} from '@/lib/articleLayout';

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
            className="rounded-2xl overflow-hidden border backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
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

export default function IntentLandingClient({ landing, canonicalUrl, children }) {
  const searchParams = useSearchParams();
  const returnFrom = sanitizeFromPath(searchParams.get('from'));
  const relatedLandings = (landing.relatedLinks ?? [])
    .map((link) => getIntentLandingByPath(link.href))
    .filter(Boolean);
  const planCta = getIntentPlanCta(landing);

  return (
    <article className={ARTICLE_WIDE}>
      <header className={ARTICLE_HERO_WIDE} style={{ borderColor: 'var(--border)' }}>
        <ReturnNavLink
          defaultHref="/guides"
          defaultLabel="All planning guides"
          className="inline-flex items-center gap-2 mb-6 text-sm font-medium transition hover:opacity-80"
        />

        {landing.category ? (
          <div className="mb-4">
            <span
              className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
              style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
            >
              {landing.category}
            </span>
          </div>
        ) : null}

        <h1 className={ARTICLE_TITLE} style={{ color: 'var(--text-primary)' }}>
          {landing.title}
        </h1>

        {landing.metaDescription ? (
          <p className={`${ARTICLE_DECK} mb-6`} style={{ color: 'var(--text-secondary)' }}>
            {landing.metaDescription}
          </p>
        ) : null}

        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p>Park picks · TrailVerse</p>
          {canonicalUrl ? (
            <ShareButtons
              url={canonicalUrl}
              title={landing.title}
              description={landing.metaDescription}
              type="article"
              showPrint={false}
            />
          ) : null}
        </div>
      </header>

      <div className={ARTICLE_BODY}>
        {landing.quickAnswer ? (
          <div
            id="quick-answer"
            className={ARTICLE_CALLOUT}
            style={{ borderColor: 'var(--accent-green)' }}
          >
            <p className={ARTICLE_CALLOUT_LABEL} style={{ color: 'var(--accent-green)' }}>
              Quick answer
            </p>
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            >
              {landing.quickAnswer}
            </p>
          </div>
        ) : null}

        <div className="max-w-3xl">
          <TrailiePlanningCta
            title={planCta.title}
            body={planCta.body}
            planLabel={planCta.planLabel}
            compareLabel={planCta.compareLabel}
            intentPath={landing.path}
          />
        </div>

        {landing.intro ? (
          <p
            className="text-base sm:text-lg leading-relaxed max-w-3xl"
            style={{ color: 'var(--text-secondary)' }}
          >
            {landing.intro}
          </p>
        ) : null}

        {landing.standouts?.length > 0 ? (
          <section id="standouts" className="scroll-mt-28 max-w-3xl">
            <h2 className={`${ARTICLE_H2} mb-6`} style={{ color: 'var(--text-primary)' }}>
              The standouts
            </h2>
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-7">
              {landing.standouts.map((item) => (
                <li
                  key={item.parkCode}
                  className="flex items-start gap-3 text-base sm:text-lg leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <CheckCircle
                    className="h-5 w-5 flex-shrink-0 mt-1"
                    style={{ color: 'var(--accent-green)' }}
                    weight="fill"
                  />
                  <span>
                    <Link
                      href={hrefWithFrom(`/parks/${parkToSlug(item.fullName)}`, returnFrom)}
                      className="font-semibold hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.label}
                    </Link>
                    <span aria-hidden="true"> — </span>
                    {item.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="ranked-parks" className="scroll-mt-28">
          <h2 className={`${ARTICLE_H2} mb-2`} style={{ color: 'var(--text-primary)' }}>
            Top matches
          </h2>
          <p
            className="text-base sm:text-lg leading-relaxed mb-6 max-w-3xl"
            style={{ color: 'var(--text-secondary)' }}
          >
            Sorted by how well each park fits this trip type — scenic views, pace, season, terrain, and
            other traits from official NPS descriptions and activities. The summary under each name
            highlights what earned its spot so you can compare finalists quickly.
          </p>
          {children ?? (
            <IntentTopMatches landing={landing} initialParks={[]} fromPath={returnFrom} />
          )}
        </section>

        {landing.faq?.length > 0 && (
          <section id="faq" className="scroll-mt-28 max-w-3xl">
            <h2 className={`${ARTICLE_H2} mb-6`} style={{ color: 'var(--text-primary)' }}>
              Frequently asked questions
            </h2>
            <IntentFaqAccordion items={landing.faq} />
          </section>
        )}

        {relatedLandings.length > 0 && (
          <section id="related-searches" className="scroll-mt-28">
            <h2 className={`${ARTICLE_H2} mb-6`} style={{ color: 'var(--text-primary)' }}>
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
    </article>
  );
}
