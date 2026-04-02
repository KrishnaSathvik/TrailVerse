import React, { useMemo } from 'react';
import Link from 'next/link';
import { CheckCircle, Calendar, Star, Trash2, ChevronRight } from '@components/icons';
import OptimizedImage from '../common/OptimizedImage';
import { useAllParks } from '../../hooks/useParks';

const VisitedParks = ({ visitedParks, onRemove }) => {
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

  const handleRemove = async (e, parkCode) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('Remove this park from your visited list?')) {
      try {
        await onRemove(parkCode);
      } catch (err) {
        console.error('Failed to remove visited park:', err);
      }
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (!visitedParks || visitedParks.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No visited parks yet
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Mark parks as visited from the park details page to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {visitedParks.map(park => {
        const npsData = parkDataMap[park.parkCode];
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
              <OptimizedImage
                src={park.imageUrl || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80&fit=crop&crop=center'}
                alt={park.parkName}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                onError={(e) => {
                  if (e.target.src !== 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80&fit=crop&crop=center') {
                    e.target.src = 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80&fit=crop&crop=center';
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

              {/* Visited Badge - top left */}
              <div className="absolute top-4 left-4">
                <span className="px-3 py-1 rounded-full bg-green-500/90 backdrop-blur text-white text-xs font-semibold flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Visited
                </span>
              </div>

              {/* Trash button - top right */}
              <button
                onClick={(e) => handleRemove(e, park.parkCode)}
                className="absolute top-4 right-4 p-2 rounded-full bg-red-500/90 hover:bg-red-600 text-white transition z-10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <h4 className="text-lg font-semibold mb-1 line-clamp-2 group-hover:text-forest-500 transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                {npsData?.fullName || park.parkName}
              </h4>

              <div className="flex items-center gap-1.5 text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                <Calendar className="h-3.5 w-3.5" />
                <span>Visited {formatDate(park.visitDate)}</span>
              </div>

              {park.notes && (
                <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {park.notes}
                </p>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {park.rating ? (
                    <>
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold">{park.rating}/5</span>
                    </>
                  ) : (
                    <span className="text-xs">No rating</span>
                  )}
                </div>
                <span className="flex items-center gap-1 text-forest-400 text-sm font-medium">
                  View Park
                  <ChevronRight className="h-4 w-4" />
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export default VisitedParks;
