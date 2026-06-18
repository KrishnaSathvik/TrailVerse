'use client';

import { useMemo } from 'react';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import SharedConversation from '@/components/ai-chat/SharedConversation';
import SharedTripDayCard from '@/components/shared-trip/SharedTripDayCard';
import TrailiePlanCtaCard from '@/components/plan-ai/TrailiePlanCtaCard';
import { buildSharedTripMetaLines } from '@/utils/sharedTripFormat';
import {
  resolveSharedByLabel,
  resolveSharedTripHeadline,
  resolveSharedTripParkLink,
} from '@/utils/sharedTripConversation';
import { getBestAvatar } from '@/utils/avatarGenerator';
import { Compass } from '@components/icons';

function SectionHeading({ children }) {
  return (
    <h2
      className="mb-5 border-b pb-2 text-lg font-bold sm:text-xl"
      style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}
    >
      {children}
    </h2>
  );
}

function BulletList({ items }) {
  if (!items?.length) return null;

  return (
    <ul className="space-y-2">
      {items.map((item, index) => {
        const text = typeof item === 'string' ? item : (item.name || item.label || item.notes || String(item));
        return (
          <li key={`${text}-${index}`} className="flex gap-2 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            <span className="w-3 shrink-0 font-medium" style={{ color: 'var(--accent-green)' }}>-</span>
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function EstimatedCostCard({ estimatedCost }) {
  if (!estimatedCost) return null;

  const rows = [
    estimatedCost.entranceFee ? ['Entrance fee', estimatedCost.entranceFee] : null,
    estimatedCost.camping ? ['Camping', estimatedCost.camping] : null,
    estimatedCost.total ? ['Total estimate', estimatedCost.total] : null,
  ].filter(Boolean);

  return (
    <section className="mb-10">
      <SectionHeading>Estimated cost</SectionHeading>
      <div
        className="overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--surface-hover)',
          border: '1px solid var(--border)',
          borderLeftWidth: '4px',
          borderLeftColor: 'var(--accent-green-dark)',
        }}
      >
        {rows.map(([label, value], index) => {
          const isTotal = index === rows.length - 1 && estimatedCost.total;
          return (
            <div
              key={label}
              className="flex items-center justify-between gap-4 px-5 py-3.5"
              style={{
                borderBottom: index < rows.length - 1 ? '1px solid var(--border)' : undefined,
                backgroundColor: isTotal ? 'var(--accent-green-light)' : undefined,
              }}
            >
              <span
                className="text-sm"
                style={{ color: isTotal ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isTotal ? 600 : 400 }}
              >
                {label}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: isTotal ? 'var(--accent-green-dark)' : 'var(--text-primary)' }}
              >
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function SharedTripPageClient({ trip }) {
  const formData = trip.formData || {};
  const plan = trip.plan || {};
  const days = plan.days || [];
  const highlights = plan.highlights || [];
  const packingList = plan.packingList || [];
  const permits = plan.permits || [];
  const meta = buildSharedTripMetaLines(formData, plan, trip.createdAt);
  const sharedBy = trip.sharedBy || null;
  const sharedByLabel = resolveSharedByLabel(sharedBy);
  const sharedByAvatar =
    sharedBy?.avatar?.trim() ||
    getBestAvatar(
      {
        firstName: sharedBy?.firstName,
        name: sharedBy?.name,
        email: sharedBy?.firstName || sharedBy?.name || 'traveler',
      },
      {},
      'travel'
    );
  const featuredPark = resolveSharedTripParkLink(trip);
  const tripTitle = resolveSharedTripHeadline(trip, featuredPark);

  const metaLine = [
    `Shared by ${sharedByLabel}`,
    meta.sharedOn?.replace(/^Shared\s+/i, '') || null,
    meta.details || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const planCta = useMemo(() => {
    if (featuredPark) {
      const park = featuredPark.shortLabel;
      return {
        title: `Plan your own ${park} trip`,
        body: 'Tell Trailie your dates, group size, and what you love — hiking, scenic drives, easy walks — and get a day-by-day plan built for you.',
        button: `Plan my ${park} trip`,
        href: `/plan-ai?park=${encodeURIComponent(featuredPark.parkCode)}&name=${encodeURIComponent(featuredPark.name)}`,
      };
    }

    return {
      title: 'Ready for your next trip?',
      body: 'Tell Trailie where you want to go, when, and what matters — and get a day-by-day itinerary built for you.',
      button: 'Plan with Trailie',
      href: '/plan-ai',
    };
  }, [featuredPark]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <section className="border-b px-4 py-6 sm:px-6 sm:py-8 lg:px-8" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto max-w-4xl">
            <div className="flex items-start gap-3 sm:gap-4">
              <div
                className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--border)]"
                style={{ backgroundColor: 'var(--surface)' }}
              >
                <img
                  src={sharedByAvatar}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  Shared plan
                </p>
                <h1
                  className="mt-1 text-2xl font-bold leading-tight sm:text-3xl"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                >
                  {tripTitle}
                </h1>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {metaLine}
                </p>
                {meta.schedule ? (
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {meta.schedule}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          {days.length > 0 ? (
            <section className="mb-10">
              <SectionHeading>Day-by-day itinerary</SectionHeading>
              <div className="space-y-4">
                {days.map((day, index) => (
                  <SharedTripDayCard key={day.id || `day-${index}`} day={day} dayIndex={index} />
                ))}
              </div>
            </section>
          ) : null}

          {highlights.length > 0 ? (
            <section className="mb-10">
              <SectionHeading>Highlights</SectionHeading>
              <BulletList items={highlights} />
            </section>
          ) : null}

          {packingList.length > 0 ? (
            <section className="mb-10">
              <SectionHeading>Packing list</SectionHeading>
              <BulletList items={packingList} />
            </section>
          ) : null}

          {permits.length > 0 ? (
            <section className="mb-10">
              <SectionHeading>Permits & reservations</SectionHeading>
              <BulletList items={permits} />
            </section>
          ) : null}

          <EstimatedCostCard estimatedCost={plan.estimatedCost} />

          {trip.conversation?.length > 0 ? (
            <section className="mb-10">
              <SharedConversation conversation={trip.conversation} sharedBy={sharedBy} />
            </section>
          ) : null}

          <TrailiePlanCtaCard
            title={planCta.title}
            body={planCta.body}
            buttonLabel={planCta.button}
            href={planCta.href}
            secondaryHref="/explore"
            secondaryLabel="Browse all parks"
            secondaryIcon={Compass}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
