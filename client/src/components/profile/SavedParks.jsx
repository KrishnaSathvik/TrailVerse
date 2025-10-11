import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Heart, ChevronRight } from 'lucide-react';
import OptimizedImage from '../common/OptimizedImage';
const SavedParks = ({ savedParks, onRemove }) => {
  // Debug logging
  console.log('SavedParks - Component rendered with:', {
    savedParksCount: savedParks?.length || 0,
    savedParks,
    timestamp: new Date().toISOString()
  });
  
  const handleRemove = async (parkCode) => {
    if (window.confirm('Remove this park from your saved list?')) {
      try {
        await onRemove(parkCode);
      } catch (err) {
        console.error('Failed to remove park:', err);
      }
    }
  };

  if (!savedParks || savedParks.length === 0) {
    console.log('SavedParks - Showing empty state:', { savedParks, length: savedParks?.length });
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {savedParks.map(park => (
        <div
          key={park.parkCode}
          className="rounded-2xl overflow-hidden backdrop-blur group"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="relative h-40 sm:h-48 overflow-hidden">
            <OptimizedImage
              src={park.imageUrl || `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80&fit=crop&crop=center`}
              alt={park.parkName}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              onError={(e) => {
                // If the park image fails to load, try a more generic nature fallback
                if (e.target.src !== 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80&fit=crop&crop=center') {
                  e.target.src = 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80&fit=crop&crop=center';
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            
            <button
              onClick={() => handleRemove(park.parkCode)}
              className="absolute top-3 right-3 p-2 rounded-full bg-red-500/90 hover:bg-red-600 text-white transition"
            >
              <Heart className="h-4 w-4 fill-current" />
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h4 className="text-lg font-bold text-white mb-1">
                {park.parkName}
              </h4>
              <p className="text-sm text-white/80 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {park.parkCode} National Park
              </p>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between">
            <span className="text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Saved {new Date(park.createdAt).toLocaleDateString()}
            </span>
            <Link
              to={`/parks/${park.parkCode}`}
              className="text-sm font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              View Details
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SavedParks;
