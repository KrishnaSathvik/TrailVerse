'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, MapPin, ExternalLink, Loader2 } from '@components/icons';
import ParkCard from '@/components/explore/ParkCard';
import OptimizedImage from '@/components/common/OptimizedImage';
import DiscoverPagination from './DiscoverPagination';
import { recordDiscoverVisit } from './RecentChips';
import { useDiscoverDetail, useDiscoverParksPage } from '@/hooks/useDiscoverCatalog';
import { parkToSlug } from '@/utils/parkSlug';
import { htmlToPlainText } from '@/utils/htmlUtils';
import EventCard from '@/components/events/EventCard';
import { DISCOVER_EVENT_CATEGORIES } from '@/lib/discoverEvents';
import ExpandableDescription from './ExpandableDescription';
import DiscoverHubHeader from './DiscoverHubHeader';
import DiscoverNpsGuideSection from './DiscoverNpsGuideSection';
import { useSavedEvents } from '@/hooks/useSavedEvents';
import { useAuth } from '@/context/AuthContext';

const PARKS_PER_PAGE = 12;

function eventsSectionSubtitle(dimension, parkCount) {
  if (dimension === 'type') {
    return `Upcoming ranger programs and events at ${parkCount} parks in this designation (from the NPS Events API).`;
  }
  return 'Upcoming programs and events at parks in this collection (from the NPS Events API).';
}

export default function DiscoverDetailClient({ detail: initialDetail, dimension }) {
  const { isAuthenticated } = useAuth();
  const { saveEvent, unsaveEvent, isEventSaved } = useSavedEvents();
  const { data: liveDetail, isFetching: detailFetching, isFetched } = useDiscoverDetail(
    dimension,
    initialDetail?.slug,
    { initialData: initialDetail }
  );
  const detail = liveDetail || initialDetail;
  const [nationalParksOnly, setNationalParksOnly] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (detail?.slug && dimension) {
      recordDiscoverVisit({
        dimension,
        slug: detail.slug,
        label: detail.title
      });
    }
  }, [detail?.slug, detail?.title, dimension]);

  useEffect(() => {
    setPage(1);
  }, [nationalParksOnly, detail?.slug, dimension]);

  const { data: parksPage, isLoading: parksLoading, isFetching } = useDiscoverParksPage(
    dimension,
    detail?.slug,
    page,
    PARKS_PER_PAGE,
    nationalParksOnly
  );

  const parks = parksPage?.data || detail?.parks || [];
  const pagination = useMemo(() => {
    const total = parksPage?.total ?? detail?.parksPagination?.total ?? parks.length;
    const pages = parksPage?.pages ?? detail?.parksPagination?.pages ?? 1;
    const limit = parksPage?.limit ?? PARKS_PER_PAGE;
    const currentPage = parksPage?.page ?? page;
    const startIndex = total === 0 ? 0 : (currentPage - 1) * limit + 1;
    const endIndex = Math.min(currentPage * limit, total);
    return { total, pages, currentPage, startIndex, endIndex };
  }, [parksPage, detail, parks.length, page]);

  if (!detail) return null;

  const programParkSlug = (parkCode) =>
    detail.featured?.parks?.find((p) => p.parkCode?.toLowerCase() === parkCode?.toLowerCase());

  const handlePageChange = (nextPage) => {
    setPage(nextPage);
    const el = document.getElementById('discover-all-parks');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="pb-24">
      <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 pt-6">
        <DiscoverHubHeader
          title={detail.title}
          intro={detail.intro}
          parkCount={detail.nps?.parkCount ?? pagination.total}
        />

        <DiscoverNpsGuideSection guide={detail.npsGuide} />

        {detail.about && (detail.about.summary || detail.about.snippets?.length > 0) && (
          <section className="mb-10 rounded-2xl p-6" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              {detail.about.title}
            </h2>
            {detail.about.summary && (
              <div className="mb-4">
                <ExpandableDescription
                  text={detail.about.summary}
                  className="text-base leading-relaxed whitespace-pre-line"
                />
              </div>
            )}
            {detail.about.snippets?.length > 0 && (
              <ul className="space-y-4">
                {detail.about.snippets
                  .filter((snippet) => {
                    const text = (snippet.description || snippet.excerpt || '').trim();
                    return text.length >= 20;
                  })
                  .map((snippet) => (
                    <li
                      key={`${snippet.title}-${snippet.parkCode}`}
                      className="border-t pt-4 first:border-0 first:pt-0"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div className="flex gap-4">
                        {snippet.image && (
                          <div
                            className="relative shrink-0 rounded-xl overflow-hidden"
                            style={{ width: '7.5rem', height: '5.25rem', borderWidth: '1px', borderColor: 'var(--border)' }}
                          >
                            <OptimizedImage
                              src={snippet.image}
                              alt={snippet.imageAlt || snippet.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                            {snippet.title}
                            {snippet.parkName && (
                              <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>
                                {' '}
                                · {snippet.parkName}
                              </span>
                            )}
                          </p>
                          <ExpandableDescription
                            text={snippet.description || snippet.excerpt}
                            className="text-sm mt-1 leading-relaxed whitespace-pre-line"
                          />
                          {snippet.url && (
                            <a
                              href={snippet.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium mt-2"
                              style={{ color: 'var(--accent-green)' }}
                            >
                              View on NPS.gov
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        {detailFetching && !isFetched && !detail?.about && (
          <p className="text-sm mb-6 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading NPS details…
          </p>
        )}

        {detail.featured?.parks?.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              {detail.featured.title}
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
              {detail.featured.parks.map((park) => (
                <Link
                  key={park.parkCode}
                  href={`/parks/${parkToSlug(park.fullName)}`}
                  className="shrink-0 w-64 rounded-2xl overflow-hidden group"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface)'
                  }}
                >
                  <div className="relative h-36">
                    <OptimizedImage
                      src={park.images?.[0]?.url}
                      alt={park.fullName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                      {park.fullName}
                    </p>
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <MapPin className="h-3 w-3" />
                      {park.states}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {dimension !== 'type' && detail.programs?.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Programs & experiences
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {detail.programs.map((program) => {
                const park = programParkSlug(program.parkCode);
                const parkHref = park
                  ? `/parks/${parkToSlug(park.fullName)}?tab=activities`
                  : program.url;
                const programText =
                  program.description ||
                  (program.shortDescription ? htmlToPlainText(program.shortDescription) : null);

                return (
                  <article
                    key={program.id || program.title}
                    className="rounded-2xl p-4 transition hover:-translate-y-0.5"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <Link
                      href={parkHref || '#'}
                      target={program.url && !park ? '_blank' : undefined}
                      rel={program.url && !park ? 'noopener noreferrer' : undefined}
                      className="block"
                    >
                      <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                        {program.title}
                      </p>
                      {program.parkName && (
                        <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                          {program.parkName}
                        </p>
                      )}
                    </Link>
                    {programText && (
                      <ExpandableDescription
                        text={programText}
                        collapsedChars={320}
                        className="text-sm leading-relaxed whitespace-pre-line"
                      />
                    )}
                    <Link
                      href={parkHref || program.url || '#'}
                      target={program.url && !park ? '_blank' : undefined}
                      rel={program.url && !park ? 'noopener noreferrer' : undefined}
                      className="inline-flex items-center gap-1 text-xs font-medium mt-2"
                      style={{ color: 'var(--accent-green)' }}
                    >
                      View
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {detail.relatedContent?.blogPosts?.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Guides from TrailVerse
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {detail.relatedContent.blogPosts.map((post) => (
                <article
                  key={post.slug}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface)'
                  }}
                >
                  <Link href={`/blog/${post.slug}`} className="block">
                    {post.image && (
                      <div className="relative h-40">
                        <OptimizedImage src={post.image} alt={post.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <p className="font-semibold p-4 pb-0" style={{ color: 'var(--text-primary)' }}>
                      {post.title}
                    </p>
                  </Link>
                  {post.excerpt && (
                    <div className="px-4 pb-4">
                      <ExpandableDescription
                        text={post.excerpt}
                        collapsedChars={280}
                        className="text-sm leading-relaxed whitespace-pre-line"
                      />
                      <Link
                        href={`/blog/${post.slug}`}
                        className="inline-block text-xs font-medium mt-2 hover:underline"
                        style={{ color: 'var(--accent-green)' }}
                      >
                        Read full guide
                      </Link>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {detail.events?.length > 0 && (
          <section className="mb-10">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Upcoming events
                </h2>
                <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
                  {eventsSectionSubtitle(dimension, detail.nps?.parkCount ?? pagination.total)}
                </p>
              </div>
              <Link
                href="/events"
                className="text-sm font-medium shrink-0 inline-flex items-center gap-1"
                style={{ color: 'var(--accent-green)' }}
              >
                Browse all events
                <Calendar className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {detail.events.map((event) => (
                <EventCard
                  key={event.id || `${event.title}-${event.parkCode}`}
                  event={event}
                  categories={DISCOVER_EVENT_CATEGORIES}
                  onSaveEvent={isAuthenticated ? saveEvent : undefined}
                  onUnsaveEvent={isAuthenticated ? unsaveEvent : undefined}
                  isSaved={isAuthenticated ? isEventSaved(event.id) : false}
                />
              ))}
            </div>
          </section>
        )}

        <section id="discover-all-parks">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              All parks ({pagination.total})
            </h2>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={nationalParksOnly}
                onChange={(e) => setNationalParksOnly(e.target.checked)}
                className="rounded border-2 w-4 h-4 text-forest-500"
                style={{ borderColor: 'var(--border)' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>National parks only</span>
            </label>
          </div>

          {(parksLoading && page === 1 && !parks.length) || (isFetching && !parks.length) ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent-green)' }} />
            </div>
          ) : parks.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No parks match this filter.</p>
          ) : (
            <>
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 transition-opacity ${isFetching ? 'opacity-60' : ''}`}
              >
                {parks.map((park) => (
                  <ParkCard key={park.parkCode} park={park} showReviews={false} />
                ))}
              </div>
              <DiscoverPagination
                page={pagination.currentPage}
                totalPages={pagination.pages}
                total={pagination.total}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                onPageChange={handlePageChange}
                disabled={isFetching}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
