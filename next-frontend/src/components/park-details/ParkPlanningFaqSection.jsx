'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from '@components/icons';
import { logCtaClick } from '@/utils/analytics';
import { buildFaqIntroCopy } from '@/lib/planningFaqTabs';
import { parseParkTabHref } from '@/lib/parkTabNavigation';

export default function ParkPlanningFaqSection({
  faqItems = [],
  parkCode,
  parkName,
  parkSlug,
  faqTabContext = {},
  onTabNavigate,
}) {
  const [openIndex, setOpenIndex] = useState(0);
  const shortName = parkName?.replace(/ National Park.*$/i, '') || 'this park';

  if (!faqItems.length) return null;

  const introCopy = buildFaqIntroCopy(faqTabContext);

  const toggle = (index, question) => {
    setOpenIndex((prev) => (prev === index ? -1 : index));
    logCtaClick({
      ctaId: 'park_faq_toggle',
      label: question,
      surface: 'park_planning_faq',
      parkCode,
    });
  };

  return (
    <div aria-labelledby="park-planning-faq-heading">
      <p
        className="text-xs font-medium uppercase tracking-[0.2em] mb-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Common questions
      </p>
      <h2
        id="park-planning-faq-heading"
        className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        Planning {shortName}
      </h2>
      <p className="text-sm sm:text-base mb-6 sm:mb-8" style={{ color: 'var(--text-secondary)' }}>
        {introCopy}
      </p>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;
          const isLast = index === faqItems.length - 1;
          return (
            <div
              key={item.q}
              style={{
                borderBottomWidth: isLast ? 0 : '1px',
                borderColor: 'var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => toggle(index, item.q)}
                className="flex w-full items-start justify-between gap-4 px-4 sm:px-5 py-4 text-left transition hover:opacity-90"
                aria-expanded={isOpen}
              >
                <span
                  className="text-sm sm:text-base font-medium leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {item.q}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-tertiary)' }}
                />
              </button>
              {isOpen && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                  <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {item.a}
                  </p>
                  {item.href ? (
                    (() => {
                      const tabId = parkSlug && onTabNavigate
                        ? parseParkTabHref(item.href, parkSlug)
                        : null;

                      if (tabId && onTabNavigate) {
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              logCtaClick({
                                ctaId: 'park_faq_link',
                                label: item.q,
                                surface: 'park_planning_faq',
                                destination: item.href,
                                parkCode,
                              });
                              onTabNavigate(tabId);
                            }}
                            className="inline-block mt-3 text-sm font-semibold hover:underline text-left"
                            style={{ color: 'var(--accent-green)' }}
                          >
                            {item.linkLabel || 'Learn more →'}
                          </button>
                        );
                      }

                      if (/^https?:\/\//i.test(item.href)) {
                        return (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => logCtaClick({
                              ctaId: 'park_faq_link',
                              label: item.q,
                              surface: 'park_planning_faq',
                              destination: item.href,
                              parkCode,
                            })}
                            className="inline-block mt-3 text-sm font-semibold hover:underline"
                            style={{ color: 'var(--accent-green)' }}
                          >
                            {item.linkLabel || 'Learn more →'}
                          </a>
                        );
                      }

                      return (
                        <Link
                          href={item.href}
                          onClick={() => logCtaClick({
                            ctaId: 'park_faq_link',
                            label: item.q,
                            surface: 'park_planning_faq',
                            destination: item.href,
                            parkCode,
                          })}
                          className="inline-block mt-3 text-sm font-semibold hover:underline"
                          style={{ color: 'var(--accent-green)' }}
                        >
                          {item.linkLabel || 'Learn more →'}
                        </Link>
                      );
                    })()
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
