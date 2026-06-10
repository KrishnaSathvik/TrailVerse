"use client";

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MapPin, Mountain, Sparkles } from '@components/icons';
import Button from '@/components/common/Button';
import OptimizedImage from '@/components/common/OptimizedImage';
import dailyFeedService from '@/services/dailyFeedService';
import { parkToSlug } from '@/utils/parkSlug';
import { getFeedDateKey } from '@/utils/dailyFeedDate';
import { LANDING_SECTION, LANDING_SECTION_HEADER_MB } from '@/lib/landingLayout';
import { logCtaClick } from '@/utils/analytics';

export default function LandingDailyFeedClient({ initialDailyFeed = null }) {
  const feedDate = getFeedDateKey();

  const { data: dailyFeed, isLoading, isFetched } = useQuery({
    queryKey: ['landingDailyFeed', feedDate],
    queryFn: async () => {
      const feed = await dailyFeedService.getDailyFeed().catch(() => null);
      if (!feed?.parkOfDay) return null;
      return { parkOfDay: feed.parkOfDay, natureFact: feed.natureFact };
    },
    initialData: initialDailyFeed ?? undefined,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: initialDailyFeed == null,
  });

  const feed = dailyFeed ?? initialDailyFeed;
  const showSkeleton = isLoading && !feed;
  const shouldHide = isFetched && !(feed?.parkOfDay && feed?.natureFact);

  if (shouldHide) {
    return null;
  }

  return (
    <section className={LANDING_SECTION} style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-[92rem] mx-auto">
        <div className={`flex items-end justify-between ${LANDING_SECTION_HEADER_MB}`}>
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 ring-1"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <Sparkles className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />
              <span className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                Daily Inspiration
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Park of the day
            </h2>
            <p className="text-base sm:text-lg mt-2 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Today&apos;s park pick with why to go, best season, top activity, and a planning tip.
            </p>
          </div>
        </div>

        {feed?.parkOfDay && feed?.natureFact ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.8fr)] gap-6 xl:gap-8 items-stretch">
            <Link
              href={`/parks/${parkToSlug(feed.parkOfDay.name)}`}
              className="group block relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{ minHeight: '28rem', boxShadow: 'var(--shadow-lg)' }}
              onClick={() => logCtaClick({
                ctaId: 'park_of_day',
                label: feed.parkOfDay.name,
                surface: 'landing_daily_feed',
                destination: `/parks/${parkToSlug(feed.parkOfDay.name)}`,
                parkCode: feed.parkOfDay.parkCode || null,
              })}
            >
              <OptimizedImage
                src={feed.parkOfDay.image || '/background1.png'}
                alt={feed.parkOfDay.name}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
              <div className="absolute top-5 left-5 sm:top-6 sm:left-6 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/15 bg-black/35">
                <Sparkles className="h-4 w-4 text-white" />
                <span className="text-xs font-bold text-white tracking-wide">PARK OF THE DAY</span>
              </div>
              <div className="absolute top-5 right-5 sm:top-6 sm:right-6 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                <ArrowRight className="h-4 w-4 text-white" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                {feed.parkOfDay.states && (
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="h-3.5 w-3.5 text-white/70" />
                    <span className="text-xs font-medium text-white/70 uppercase tracking-wider">{feed.parkOfDay.states}</span>
                  </div>
                )}
                <h3 className="text-2xl sm:text-3xl font-semibold text-white leading-tight mb-3">
                  {feed.parkOfDay.name}
                </h3>
                {(feed.parkOfDay.bestTime || feed.parkOfDay.crowdLevel) && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {feed.parkOfDay.bestTime ? (
                      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium text-white/90 bg-white/10 border border-white/15">
                        Best: {feed.parkOfDay.bestTime}
                      </span>
                    ) : null}
                    {feed.parkOfDay.crowdLevel ? (
                      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium text-white/90 bg-white/10 border border-white/15">
                        Crowds: {feed.parkOfDay.crowdLevel}
                      </span>
                    ) : null}
                  </div>
                )}
                {feed.parkOfDay.mustDo?.[0] ? (
                  <p className="text-sm sm:text-base text-white/80 max-w-2xl line-clamp-2 mb-2">
                    Don&apos;t miss: {feed.parkOfDay.mustDo[0]}
                  </p>
                ) : null}
                <p className="text-sm sm:text-base text-white/75 max-w-2xl line-clamp-2">
                  Check live weather, alerts, and reviews — then plan your visit with Trailie.
                </p>
              </div>
            </Link>

            <div
              className="rounded-2xl p-6 sm:p-8 backdrop-blur transition-all duration-300 hover:-translate-y-1"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-5 ring-1"
                style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}
              >
                <Mountain className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Nature Fact
                </span>
              </div>
              <p className="text-lg sm:text-xl leading-relaxed mb-8" style={{ color: 'var(--text-primary)' }}>
                &ldquo;{feed.natureFact.replace(/\*\*(.*?)\*\*/g, '$1')}&rdquo;
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  href={`/parks/${parkToSlug(feed.parkOfDay.name)}`}
                  variant="primary"
                  size="lg"
                  icon={ArrowRight}
                  iconPosition="right"
                  className="w-full sm:w-auto"
                >
                  Explore Today&apos;s Park
                </Button>
                {feed.parkOfDay.parkCode ? (
                  <Button
                    href={`/plan-ai?park=${encodeURIComponent(feed.parkOfDay.parkCode)}&name=${encodeURIComponent(feed.parkOfDay.name)}`}
                    variant="secondary"
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    Plan with Trailie
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.8fr)] gap-6 xl:gap-8 items-stretch animate-pulse">
            <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: '28rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="absolute top-5 left-5 sm:top-6 sm:left-6 flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }}>
                <Sparkles className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>PARK OF THE DAY</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                <div className="h-3 w-24 rounded-full mb-4" style={{ backgroundColor: 'var(--surface-hover)' }} />
                <div className="h-7 w-72 rounded-full mb-3" style={{ backgroundColor: 'var(--surface-hover)' }} />
                <div className="h-4 w-96 max-w-full rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
              </div>
            </div>
            <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="h-7 w-32 rounded-full mb-5" style={{ backgroundColor: 'var(--surface-hover)' }} />
              <div className="space-y-3 mb-8">
                <div className="h-5 w-full rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
                <div className="h-5 w-full rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
                <div className="h-5 w-3/4 rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
              </div>
              <div className="h-12 w-48 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
