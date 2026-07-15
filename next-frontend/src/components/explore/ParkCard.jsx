import React, { memo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Star, Heart, ExternalLink, ArrowRight } from '@components/icons';
import OptimizedImage from '../common/OptimizedImage';
import { useParkRatings } from '../../hooks/useParkRatings';
import { htmlToPlainText } from '../../utils/htmlUtils';
import { parkToSlug } from '../../utils/parkSlug';
import { getParkSearchSession, saveParkSearchSession } from '../../lib/parkSearchSession';
import { logParkCardClick } from '../../utils/analytics';
import { parkDetailHref } from '@/lib/returnNavigation';

const DEFAULT_PARK_IMAGE = '/og-image-trailverse.jpg';

function getParkCardSubtitle(park) {
  if (park.matchReason) return park.matchReason;
  const description = htmlToPlainText(park.description || '').trim();
  if (description) return description.slice(0, 160);
  return park.designation || '';
}

const ExploreListCard = ({ park, rating, detailHref, onNavigate }) => (
  <Link
    href={detailHref}
    onClick={onNavigate}
    className="group flex gap-6 p-6 rounded-2xl backdrop-blur hover:-translate-y-1 transition-all duration-300"
    style={{
      backgroundColor: 'var(--surface)',
      borderWidth: '1px',
      borderColor: 'var(--border)',
      boxShadow: 'var(--shadow)',
    }}
  >
    <div className="relative w-48 h-32 flex-shrink-0 rounded-xl overflow-hidden">
      <Image
        src={park.images?.[0]?.url || DEFAULT_PARK_IMAGE}
        alt={park.fullName}
        fill
        sizes="192px"
        className="object-cover group-hover:scale-110 transition-transform duration-500"
      />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3
          className="text-xl font-bold group-hover:text-forest-500 transition"
          style={{ color: 'var(--text-primary)' }}
        >
          {park.fullName}
        </h3>
        <ArrowRight
          className="h-5 w-5 flex-shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
      <p
        className="text-sm line-clamp-2 mb-3"
        style={{ color: park.matchReason ? 'var(--accent-green)' : 'var(--text-secondary)' }}
      >
        {getParkCardSubtitle(park)}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
          <MapPin className="h-4 w-4" />
          <span className="text-sm">{park.states}</span>
        </div>
        {rating && rating.totalReviews > 0 ? (
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 text-yellow-400" weight="fill" />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {rating.averageRating.toFixed(1)}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              ({rating.totalReviews})
            </span>
          </div>
        ) : null}
      </div>
    </div>
  </Link>
);

const ExploreGridCard = ({ park, rating, detailHref, priority = false, onNavigate }) => (
  <Link
    href={detailHref}
    onClick={onNavigate}
    className="group rounded-2xl overflow-hidden backdrop-blur hover:-translate-y-1 transition-all duration-300"
    style={{
      backgroundColor: 'var(--surface)',
      borderWidth: '1px',
      borderColor: 'var(--border)',
      boxShadow: 'var(--shadow)',
    }}
  >
    <div
      className="relative h-56 overflow-hidden xl:h-44"
      style={{ backgroundColor: 'var(--surface-hover)' }}
    >
      <Image
        src={park.images?.[0]?.url || DEFAULT_PARK_IMAGE}
        alt={park.fullName}
        fill
        priority={priority}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
        className="object-cover group-hover:scale-110 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
    </div>
    <div className="p-6 xl:p-4">
      <h3
        className="text-xl font-bold mb-2 line-clamp-2 group-hover:text-forest-500 transition xl:mb-1.5 xl:text-base"
        style={{ color: 'var(--text-primary)' }}
      >
        {park.fullName}
      </h3>
      <p
        className="text-sm line-clamp-3 mb-4 xl:mb-3 xl:line-clamp-2 xl:text-[0.8125rem]"
        style={{ color: park.matchReason ? 'var(--accent-green)' : 'var(--text-secondary)' }}
      >
        {getParkCardSubtitle(park)}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
          <MapPin className="h-4 w-4" />
          <span className="text-sm">{park.states}</span>
        </div>
        {rating && rating.totalReviews > 0 ? (
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 text-yellow-400" weight="fill" />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {rating.averageRating.toFixed(1)}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              ({rating.totalReviews})
            </span>
          </div>
        ) : null}
      </div>
    </div>
  </Link>
);

const ParkCard = memo(({
  park,
  onSave,
  isSaved = false,
  showReviews = true,
  viewMode,
  rating: ratingProp,
  index = 0,
  analyticsSurface = null,
  intentSlug = null,
  fromPath = null,
}) => {
  const { data: parkRatings } = useParkRatings();
  const parkRating = ratingProp ?? parkRatings?.[park.parkCode];
  const hasReviews = (parkRating?.totalReviews || 0) > 0;
  const detailHref = parkDetailHref(parkToSlug(park.fullName), fromPath);

  const handleSaveClick = useCallback(
    (e) => {
      e.preventDefault();
      onSave?.(park);
    },
    [park, onSave]
  );

  const handleNavigate = useCallback(() => {
    if (analyticsSurface) {
      logParkCardClick({
        parkCode: park.parkCode,
        parkName: park.fullName,
        surface: analyticsSurface,
        position: index + 1,
        intentSlug,
      });
      return;
    }
    const session = getParkSearchSession();
    if (!session?.searchTerm) return;
    saveParkSearchSession({
      ...session,
      clickedParkCode: park.parkCode,
    });
    logParkCardClick({
      searchTerm: session.searchTerm,
      searchId: session.searchId,
      parkCode: park.parkCode,
      parkName: park.fullName,
      surface: session.surface || 'explore',
      position: index + 1,
    });
  }, [park, index, analyticsSurface, intentSlug]);

  if (viewMode === 'list') {
    return (
      <ExploreListCard
        park={park}
        rating={parkRating}
        detailHref={detailHref}
        onNavigate={handleNavigate}
      />
    );
  }

  if (viewMode === 'grid') {
    return (
      <ExploreGridCard
        park={park}
        rating={parkRating}
        detailHref={detailHref}
        priority={index < 6}
        onNavigate={handleNavigate}
      />
    );
  }

  return (
    <Link
      href={detailHref}
      className="group rounded-2xl overflow-hidden backdrop-blur hover:-translate-y-1 transition-all duration-300 block"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      <div className="relative h-56 overflow-hidden">
        <OptimizedImage
          src={park.images?.[0]?.url}
          alt={park.fullName}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {onSave ? (
          <button
            type="button"
            onClick={handleSaveClick}
            className={`absolute top-4 right-4 p-2 rounded-full backdrop-blur transition ${
              isSaved ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'
            }`}
          >
            <Heart className="h-4 w-4 text-white" weight={isSaved ? 'fill' : 'regular'} />
          </button>
        ) : null}

        <div className="absolute top-4 left-4">
          <span className="px-3 py-1 rounded-full bg-forest-500/90 backdrop-blur text-white text-xs font-semibold">
            {park.designation}
          </span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-xl font-bold text-white mb-1 line-clamp-2 group-hover:text-forest-300 transition">
            {park.fullName}
          </h3>
          <div className="flex items-center gap-2 text-white/90 text-sm">
            <MapPin className="h-4 w-4" />
            <span>{park.states}</span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
          {htmlToPlainText(park.description)}
        </p>

        <div
          className={`flex items-center ${showReviews && hasReviews ? 'justify-between' : 'justify-end'}`}
        >
          {showReviews && hasReviews && (
            <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Star className="h-4 w-4 text-yellow-400" weight="fill" />
              <span className="font-semibold">{parkRating.averageRating.toFixed(1)}</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                ({parkRating.totalReviews})
              </span>
            </div>
          )}
          <ExternalLink className="h-5 w-5 text-forest-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
});

ParkCard.displayName = 'ParkCard';

export default ParkCard;
