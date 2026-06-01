'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  Compass,
  Globe,
  MapPin,
  Scales,
  Sparkles,
} from '@components/icons';
import ShareButtons from '@/components/common/ShareButtons';
import Button from '@/components/common/Button';
import TableOfContents from '@/components/blog/TableOfContents';
import GuideCard from '@/components/guides/GuideCard';
import IntentTopMatches from '@/components/intent/IntentTopMatches';
import { getIntentLandingByPath } from '@/data/intentLandings';
import { parkToSlug } from '@/utils/parkSlug';

const surfaceCardStyle = {
  background:
    'linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, white 4%), var(--surface))',
  borderColor: 'var(--border)',
  boxShadow: 'var(--shadow)',
};

function getLinkIcon(href) {
  if (href.includes('/plan-ai')) return Sparkles;
  if (href.includes('/compare')) return Scales;
  if (href.includes('/discover')) return Compass;
  if (href.includes('/explore')) return MapPin;
  if (href.includes('/chatgpt') || href.includes('/mcp')) return Globe;
  if (href.includes('/reports')) return MapPin;
  return ArrowRight;
}

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

export default function IntentLandingClient({ landing, parks, canonicalUrl }) {
  const contentRef = useRef(null);
  const relatedLandings = (landing.relatedLinks ?? [])
    .map((link) => getIntentLandingByPath(link.href))
    .filter(Boolean);

  const tocHeadings = useMemo(() => {
    const headings = [{ id: 'quick-answer', text: 'Quick answer', level: 2 }];
    if (landing.standouts?.length) {
      headings.push({ id: 'standouts', text: 'The standouts', level: 2 });
    }
    if (landing.trailverseLinks?.length) {
      headings.push({ id: 'trailverse-tools', text: 'Live on TrailVerse', level: 2 });
    }
    headings.push({ id: 'ranked-parks', text: 'Top matches', level: 2 });
    if (landing.faq?.length) {
      headings.push({ id: 'faq', text: 'FAQ', level: 2 });
    }
    if (relatedLandings.length) {
      headings.push({ id: 'related-searches', text: 'Related searches', level: 2 });
    }
    return headings;
  }, [landing, relatedLandings.length]);

  return (
    <article className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8 lg:py-12">
      <div
        className="mb-10 rounded-[2rem] border px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10"
        style={{
          ...surfaceCardStyle,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, white 6%), var(--surface))',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <Link
          href="/guides"
          className="inline-flex items-center gap-2 mb-6 text-sm font-medium transition hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          All planning guides
        </Link>

        {landing.category ? (
          <div className="mb-4">
            <span
              className="inline-block px-4 py-1 rounded-full text-sm font-semibold"
              style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
            >
              {landing.category}
            </span>
          </div>
        ) : null}

        <h1
          className="text-3xl sm:text-4xl md:text-5xl xl:text-[3.25rem] font-bold mb-5 leading-[1.05] tracking-tight max-w-5xl"
          style={{ color: 'var(--text-primary)' }}
        >
          {landing.title}
        </h1>

        {landing.metaDescription ? (
          <p
            className="text-lg sm:text-xl leading-relaxed font-medium mb-8 max-w-4xl"
            style={{ color: 'var(--text-secondary)' }}
          >
            {landing.metaDescription}
          </p>
        ) : null}

        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p className="text-sm">Park picks · TrailVerse</p>
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
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)] gap-8 xl:gap-10 2xl:gap-12 items-start">
        <aside className="xl:order-1 xl:pr-2 2xl:pr-4">
          {tocHeadings.length > 0 && (
            <TableOfContents headings={tocHeadings} sticky containerRef={contentRef} />
          )}
        </aside>

        <div ref={contentRef} className="xl:order-2 min-w-0 max-w-none w-full space-y-8">
          {landing.quickAnswer ? (
            <div
              id="quick-answer"
              className="scroll-mt-28 rounded-[2rem] border px-5 py-6 sm:px-8 sm:py-8"
              style={{
                ...surfaceCardStyle,
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
              <p
                className="text-base sm:text-lg leading-relaxed font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {landing.quickAnswer}
              </p>
            </div>
          ) : null}

          {landing.intro ? (
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {landing.intro}
            </p>
          ) : null}

          {landing.standouts?.length > 0 ? (
            <section id="standouts" className="scroll-mt-28">
              <div
                className="rounded-[2rem] border px-5 py-8 sm:px-8 lg:px-10 xl:py-10"
                style={surfaceCardStyle}
              >
                <h2
                  className="text-2xl sm:text-3xl font-bold tracking-tight mb-6"
                  style={{ color: 'var(--text-primary)' }}
                >
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
                          href={`/parks/${parkToSlug(item.fullName)}`}
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
              </div>
            </section>
          ) : null}

          {landing.trailverseLinks?.length > 0 && (
            <div className="scroll-mt-28">
              <h2
                id="trailverse-tools"
                className="text-xl sm:text-2xl font-bold mb-5 scroll-mt-28"
                style={{ color: 'var(--text-primary)' }}
              >
                Live on TrailVerse
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {landing.trailverseLinks.map((link) => {
                  const Icon = getLinkIcon(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="group flex items-center gap-4 rounded-2xl border p-4 sm:p-5 transition-all duration-300 hover:-translate-y-0.5"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border)',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <div
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: 'var(--accent-green-light)',
                          color: 'var(--accent-green)',
                        }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span
                        className="flex-1 text-sm sm:text-base font-semibold leading-snug"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {link.label}
                      </span>
                      <ArrowRight
                        className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                        style={{ color: 'var(--accent-green)' }}
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <section id="ranked-parks" className="scroll-mt-28">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
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
            <IntentTopMatches landing={landing} initialParks={parks} />
          </section>

          {landing.faq?.length > 0 && (
            <section id="faq" className="scroll-mt-28">
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight mb-6"
                style={{ color: 'var(--text-primary)' }}
              >
                Frequently asked questions
              </h2>
              <IntentFaqAccordion items={landing.faq} />
            </section>
          )}

          <section
            className="rounded-[2rem] border px-6 py-8 sm:px-10 sm:py-10 text-center"
            style={{
              ...surfaceCardStyle,
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--accent-green) 12%, var(--surface)), var(--surface))',
            }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Start planning
            </h2>
            <p
              className="text-base sm:text-lg mb-8 max-w-xl mx-auto leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              Browse 470+ parks, compare destinations, or ask Trailie to build your itinerary — free to
              explore, no account required.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button href="/plan-ai" variant="primary" size="md">
                Plan with Trailie
              </Button>
              <Button href="/compare" variant="secondary" size="md">
                Compare parks
              </Button>
              <Button href="/explore" variant="secondary" size="md">
                Explore parks
              </Button>
            </div>
          </section>

          {relatedLandings.length > 0 && (
            <section id="related-searches" className="scroll-mt-28">
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight mb-6"
                style={{ color: 'var(--text-primary)' }}
              >
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
    </article>
  );
}
