'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/common/Button';
import ShareButtons from '@/components/common/ShareButtons';
import TableOfContents from '@/components/blog/TableOfContents';
import GuideCard from '@/components/guides/GuideCard';
import { getGuideBySlug } from '@/data/guides';
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

const surfaceCardStyle = {
  background:
    'linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, white 4%), var(--surface))',
  borderColor: 'var(--border)',
  boxShadow: 'var(--shadow)',
};

function toSectionId(section) {
  if (section.id) return section.id;
  return section.heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function getLinkIcon(href) {
  if (href.includes('/plan-ai')) return Sparkles;
  if (href.includes('/compare')) return Scales;
  if (href.includes('/discover')) return Compass;
  if (href.includes('/explore')) return MapPin;
  if (href.includes('/chatgpt') || href.includes('/mcp')) return Globe;
  return ArrowRight;
}

function GuideTable({ table }) {
  if (!table) return null;

  return (
    <div
      className="overflow-x-auto my-6 rounded-2xl border"
      style={{ borderColor: 'var(--border)' }}
    >
      <table className="w-full text-sm text-left">
        <thead>
          <tr style={{ backgroundColor: 'var(--surface-hover)' }}>
            {table.headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3.5 font-semibold text-xs uppercase tracking-wider"
                style={{ color: 'var(--text-primary)' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-t transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_60%,transparent)]"
              style={{ borderColor: 'var(--border)' }}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-4 py-3.5 align-top ${cellIndex === 0 ? 'font-semibold' : ''}`}
                  style={{
                    color: cellIndex === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuideSectionBlock({ section }) {
  const sectionId = toSectionId(section);

  return (
    <section className="scroll-mt-28">
      <h2
        id={sectionId}
        className="text-2xl sm:text-3xl font-bold tracking-tight mb-5"
        style={{ color: 'var(--text-primary)' }}
      >
        {section.heading}
      </h2>
      {section.paragraphs?.map((paragraph) => (
        <p
          key={paragraph.slice(0, 48)}
          className="text-base sm:text-lg leading-relaxed mb-4"
          style={{ color: 'var(--text-secondary)' }}
        >
          {paragraph}
        </p>
      ))}
      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-3 mb-4">
          {section.bullets.map((item) => (
            <li key={item.slice(0, 48)} className="flex items-start gap-3">
              <CheckCircle
                className="h-5 w-5 flex-shrink-0 mt-0.5"
                style={{ color: 'var(--accent-green)' }}
                weight="fill"
              />
              <span className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      )}
      <GuideTable table={section.table} />
    </section>
  );
}

function GuideFaqAccordion({ items }) {
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

export default function GuideDetailClient({ guide, canonicalUrl }) {
  const contentRef = useRef(null);
  const relatedGuides = (guide.relatedSlugs || [])
    .map((slug) => getGuideBySlug(slug))
    .filter(Boolean);

  const tocHeadings = useMemo(() => {
    const headings = [{ id: 'quick-answer', text: 'Quick answer', level: 2 }];

    if (guide.trailverseLinks?.length) {
      headings.push({ id: 'trailverse-tools', text: 'Live on TrailVerse', level: 2 });
    }

    guide.sections.forEach((section) => {
      headings.push({ id: toSectionId(section), text: section.heading, level: 2 });
    });

    if (guide.faq?.length) {
      headings.push({ id: 'faq', text: 'FAQ', level: 2 });
    }

    return headings;
  }, [guide]);

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

        {guide.category ? (
          <div className="mb-4">
            <span
              className="inline-block px-4 py-1 rounded-full text-sm font-semibold"
              style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
            >
              {guide.category}
            </span>
          </div>
        ) : null}

        <h1
          className="text-3xl sm:text-4xl md:text-5xl xl:text-[3.25rem] font-bold mb-5 leading-[1.05] tracking-tight max-w-5xl"
          style={{ color: 'var(--text-primary)' }}
        >
          {guide.title}
        </h1>

        {guide.metaDescription ? (
          <p
            className="text-lg sm:text-xl leading-relaxed font-medium mb-8 max-w-4xl"
            style={{ color: 'var(--text-secondary)' }}
          >
            {guide.metaDescription}
          </p>
        ) : null}

        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p className="text-sm">Planning guide · TrailVerse</p>
          {canonicalUrl ? (
            <ShareButtons
              url={canonicalUrl}
              title={guide.title}
              description={guide.metaDescription}
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

        <div ref={contentRef} className="xl:order-2 min-w-0 max-w-[72rem] space-y-8">
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
              {guide.quickAnswer}
            </p>
          </div>

          {guide.trailverseLinks?.length > 0 && (
            <div className="scroll-mt-28">
              <h2
                id="trailverse-tools"
                className="text-xl sm:text-2xl font-bold mb-5 scroll-mt-28"
                style={{ color: 'var(--text-primary)' }}
              >
                Live on TrailVerse
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {guide.trailverseLinks.map((link) => {
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

          <div
            className="rounded-[2rem] border px-5 py-8 sm:px-8 lg:px-10 xl:py-10 space-y-12"
            style={surfaceCardStyle}
          >
            {guide.sections.map((section) => (
              <GuideSectionBlock key={section.heading} section={section} />
            ))}
          </div>

          {guide.faq?.length > 0 && (
            <section className="scroll-mt-28">
              <h2
                id="faq"
                className="text-2xl sm:text-3xl font-bold tracking-tight mb-6 scroll-mt-28"
                style={{ color: 'var(--text-primary)' }}
              >
                Frequently asked questions
              </h2>
              <GuideFaqAccordion items={guide.faq} />
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

          {relatedGuides.length > 0 && (
            <section>
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight mb-6"
                style={{ color: 'var(--text-primary)' }}
              >
                Related guides
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {relatedGuides.map((related) => (
                  <GuideCard key={related.slug} guide={related} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
