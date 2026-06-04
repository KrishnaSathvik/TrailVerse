'use client';

import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import SharedConversation from '@/components/ai-chat/SharedConversation';
import SharedTripAlertCard from '@/components/shared-trip/SharedTripAlertCard';
import SharedTripDayCard from '@/components/shared-trip/SharedTripDayCard';
import { buildSharedTripMetaLines } from '@/utils/sharedTripFormat';
import { parkToSlug } from '@/utils/parkSlug';
import { Calendar } from '@components/icons';

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

  const tripTitle = trip.title || `${trip.parkName || 'National Park'} Trip Plan`;
  const parkSlug = trip.parkName ? parkToSlug(trip.parkName) : null;
  const parkHref = parkSlug ? `/parks/${parkSlug}` : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <section className="border-b px-4 py-5 sm:px-6 sm:py-7 lg:px-8" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto max-w-4xl">
            <span
              className="mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              Shared plan
            </span>

            <h1 className="mb-4 text-3xl font-bold leading-tight sm:text-4xl" style={{ color: 'var(--text-primary)' }}>
              {tripTitle}
            </h1>

            {trip.parkName ? (
              <div
                className="mb-5 rounded-r-lg py-1 pl-4"
                style={{ borderLeft: '3px solid var(--accent-green)' }}
              >
                <p className="text-base leading-relaxed sm:text-lg" style={{ color: 'var(--text-secondary)' }}>
                  {parkHref ? (
                    <Link href={parkHref} className="font-medium hover:underline" style={{ color: 'var(--accent-green-dark)' }}>
                      {trip.parkName}
                    </Link>
                  ) : (
                    trip.parkName
                  )}
                  {' · '}
                  Planned with Trailie
                </p>
              </div>
            ) : null}

            <div className="mb-2 space-y-1">
              {meta.schedule ? (
                <p className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <Calendar className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-green)' }} />
                  {meta.schedule}
                </p>
              ) : null}
              {meta.details ? (
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {meta.details}
                </p>
              ) : null}
              {meta.sharedOn ? (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {meta.sharedOn}
                </p>
              ) : null}
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
              <SectionHeading>Trailie conversation</SectionHeading>
              <div
                className="rounded-xl p-4 sm:p-5"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <SharedConversation conversation={trip.conversation} />
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-4 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Keep exploring with TrailVerse
            </h2>
            <div className="space-y-4">
              <SharedTripAlertCard
                badgeLabel="Explore"
                title="Explore all parks"
                body="Browse 470+ National Park Service sites with live weather, maps, compare tools, and park guides."
                buttonLabel="Browse parks"
                href="/explore"
              />
              <SharedTripAlertCard
                accentColor="#3b82f6"
                badgeBg="rgba(59, 130, 246, 0.1)"
                badgeColor="#3b82f6"
                badgeLabel="Trailie"
                title="Plan your trip with Trailie"
                body="Get a personalized itinerary, day-by-day routes, and park tips from TrailVerse AI — free to start, no account required."
                buttonLabel="Open Trailie"
                href="/plan-ai"
              />
              {parkHref ? (
                <SharedTripAlertCard
                  accentColor="var(--accent-green-dark)"
                  badgeLabel="Park guide"
                  title={`Visit ${trip.parkName}`}
                  body="See live alerts, weather, maps, permits, and things to do for this park on TrailVerse."
                  buttonLabel="Open park"
                  href={parkHref}
                />
              ) : null}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
