import React, { useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Heart, Calendar } from '@components/icons';
import { useAllParks } from '../../hooks/useParks';
import { htmlToPlainText } from '../../utils/htmlUtils';

const SavedParks = ({ savedParks, onRemove }) => {
  const { data: allParksData } = useAllParks();
  const parksData = allParksData?.data;

  // Map parkCode → NPS park data for enrichment
  const parkDataMap = useMemo(() => {
    if (!parksData) return {};
    return parksData.reduce((map, park) => {
      map[park.parkCode] = park;
      return map;
    }, {});
  }, [parksData]);

  useEffect(() => {
    console.log('[SavedParks] 🔄 Received updated savedParks:', savedParks?.length || 0);
  }, [savedParks]);

  const handleRemove = async (e, parkCode) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('Remove this park from your saved list?')) {
      try {
        await onRemove(parkCode);
      } catch (err) {
        console.error('Failed to remove park:', err);
      }
    }
  };

  if (!savedParks || savedParks.length === 0) {
    return (
      <div className="text-center py-12">
        <MapPin className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No saved parks yet
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Save parks from the Explore page to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {savedParks.map(park => {
        const npsData = parkDataMap[park.parkCode];
        const stateAbbr = npsData?.states || '';
        const description = npsData?.description || '';

        return (
          <Link
            key={park.parkCode}
            href={`/parks/${park.parkCode}`}
            className="group rounded-2xl overflow-hidden hover:-translate-y-1 transition-all duration-300"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <div className="relative h-56 overflow-hidden">
              <Image
                src={park.imageUrl || '/og-image-trailverse.jpg'}
                alt={park.parkName}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                className="object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

              {/* Remove heart button - top left */}
              <button
                onClick={(e) => handleRemove(e, park.parkCode)}
                className="absolute top-4 left-4 p-2 rounded-full bg-red-500/90 hover:bg-red-600 text-white transition z-10"
              >
                <Heart className="h-4 w-4 fill-current" />
              </button>

              {/* State badge - top right */}
              {stateAbbr && (
                <span className="absolute top-4 right-4 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {stateAbbr}
                </span>
              )}
            </div>

            <div className="p-5">
              <h4 className="text-lg font-semibold mb-1 line-clamp-2 group-hover:text-forest-500 transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                {npsData?.fullName || park.parkName}
              </h4>

              {description && (
                <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {htmlToPlainText(description)}
                </p>
              )}

              <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-tertiary)' }}>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {stateAbbr || park.parkCode}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Saved {new Date(park.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export default SavedParks;
