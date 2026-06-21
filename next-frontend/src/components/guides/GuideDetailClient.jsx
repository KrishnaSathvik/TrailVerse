'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ShareButtons from '@/components/common/ShareButtons';
import TrailiePlanningCta from '@/components/plan-ai/TrailiePlanningCta';
import TableOfContents from '@/components/blog/TableOfContents';
import GuideCard from '@/components/guides/GuideCard';
import { getGuideBySlug } from '@/data/guides';
import { getGuidePlanCta } from '@/lib/guidePlanCta';
import {
  ARTICLE_BODY,
  ARTICLE_CONTENT,
  ARTICLE_CALLOUT,
  ARTICLE_CALLOUT_LABEL,
  ARTICLE_DECK,
  ARTICLE_H2,
  ARTICLE_HERO,
  ARTICLE_SECTION,
  ARTICLE_SECTIONS,
  ARTICLE_STANDARD,
  ARTICLE_TITLE,
} from '@/lib/articleLayout';
import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
} from '@components/icons';

function toSectionId(section) {
  if (section.id) return section.id;
  return section.heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
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
    <section className={ARTICLE_SECTION}>
      <h2
        id={sectionId}
        className={ARTICLE_H2}
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
  const planCta = getGuidePlanCta(guide);

  const tocHeadings = useMemo(() => {
    const headings = [{ id: 'quick-answer', text: 'Quick answer', level: 2 }];

    guide.sections.forEach((section) => {
      headings.push({ id: toSectionId(section), text: section.heading, level: 2 });
    });

    if (guide.faq?.length) {
      headings.push({ id: 'faq', text: 'FAQ', level: 2 });
    }

    return headings;
  }, [guide]);

  return (
    <article className={ARTICLE_STANDARD}>
      <header className={ARTICLE_HERO} style={{ borderColor: 'var(--border)' }}>
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
              className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
              style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
            >
              {guide.category}
            </span>
          </div>
        ) : null}

        <h1 className={ARTICLE_TITLE} style={{ color: 'var(--text-primary)' }}>
          {guide.title}
        </h1>

        {guide.metaDescription ? (
          <p className={`${ARTICLE_DECK} mb-6`} style={{ color: 'var(--text-secondary)' }}>
            {guide.metaDescription}
          </p>
        ) : null}

        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p>Planning guide · TrailVerse</p>
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
      </header>

      <div className={ARTICLE_CONTENT}>
        <div ref={contentRef} className={ARTICLE_BODY}>
          {tocHeadings.length > 0 && (
            <TableOfContents
              headings={tocHeadings}
              variant="inline"
              containerRef={contentRef}
            />
          )}

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
              {guide.quickAnswer}
            </p>
          </div>

          <TrailiePlanningCta
              title={planCta.title}
              body={planCta.body}
              planLabel={planCta.planLabel}
              compareLabel={planCta.compareLabel}
              compareHref={planCta.compareHref}
            />

          <div className={ARTICLE_SECTIONS}>
            {guide.sections.map((section) => (
              <GuideSectionBlock key={section.heading} section={section} />
            ))}
          </div>

          {guide.faq?.length > 0 && (
            <section id="faq" className="scroll-mt-28">
              <h2 className={`${ARTICLE_H2} mb-6`} style={{ color: 'var(--text-primary)' }}>
                Frequently asked questions
              </h2>
              <GuideFaqAccordion items={guide.faq} />
            </section>
          )}

          {relatedGuides.length > 0 && (
            <section>
              <h2 className={`${ARTICLE_H2} mb-6`} style={{ color: 'var(--text-primary)' }}>
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
