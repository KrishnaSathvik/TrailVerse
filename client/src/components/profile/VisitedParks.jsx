import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Calendar, Star, Trash2, ChevronRight } from 'lucide-react';
import OptimizedImage from '../common/OptimizedImage';

const VisitedParks = ({ visitedParks, onRemove }) => {
  
  const handleRemove = async (parkCode) => {
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {visitedParks.map(park => (
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
            
            {/* Visited Badge */}
            <div className="absolute top-3 left-3">
              <span className="px-3 py-1 rounded-full bg-green-500/90 backdrop-blur text-white text-xs font-semibold flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Visited
              </span>
            </div>

            <button
              onClick={() => handleRemove(park.parkCode)}
              className="absolute top-3 right-3 p-2 rounded-full bg-red-500/90 hover:bg-red-600 text-white transition"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-lg font-bold text-white mb-1 line-clamp-2 group-hover:text-green-300 transition">
                {park.parkName}
              </h3>
              <div className="flex items-center gap-2 text-white/90 text-sm">
                <Calendar className="h-4 w-4" />
                <span>Visited {formatDate(park.visitDate)}</span>
              </div>
            </div>
          </div>

          <div className="p-5">
            {park.notes && (
              <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
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
              <Link
                to={`/parks/${park.parkCode}`}
                className="flex items-center gap-1 text-forest-400 hover:text-forest-300 transition text-sm font-medium"
              >
                View Park
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default VisitedParks;
