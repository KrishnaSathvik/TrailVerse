import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Trash2, Heart, ChevronRight } from 'lucide-react';
import OptimizedImage from '../common/OptimizedImage';
const SavedParks = ({ savedParks, onRemove }) => {
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
    return (
      <div className="text-center py-12">
        <MapPin className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No saved parks yet
        </h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Save parks from the Explore page to see them here
        </p>
        <Link
          to="/explore"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-purple-500 hover:bg-purple-600 text-white font-semibold transition"
        >
          <MapPin className="h-4 w-4" />
          Explore Parks
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          <div className="relative h-48 overflow-hidden">
            <OptimizedImage
              src={`https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800`}
              alt={park.parkName}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
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
