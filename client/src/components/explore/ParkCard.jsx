import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Star, Heart, ExternalLink } from 'lucide-react';
import OptimizedImage from '../common/OptimizedImage';
import { useParkRatings } from '../../hooks/useParkRatings';

const ParkCard = ({ park, onSave, isSaved = false }) => {
  const { data: parkRatings } = useParkRatings();
  const parkRating = parkRatings?.[park.parkCode];
  
  const handleSaveClick = (e) => {
    e.preventDefault();
    onSave(park);
  };

  return (
    <Link
      to={`/parks/${park.parkCode}`}
      className="group rounded-2xl overflow-hidden backdrop-blur hover:-translate-y-1 transition-all duration-300 block"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {/* Image */}
      <div className="relative h-56 overflow-hidden">
        <OptimizedImage
          src={park.images?.[0]?.url}
          alt={park.fullName}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Save Button */}
        <button
          onClick={handleSaveClick}
          className={`absolute top-4 right-4 p-2 rounded-full backdrop-blur transition ${
            isSaved ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'
          }`}
        >
          <Heart className={`h-4 w-4 ${isSaved ? 'fill-white text-white' : 'text-white'}`} />
        </button>

        {/* Badge */}
        <div className="absolute top-4 left-4">
          <span className="px-3 py-1 rounded-full bg-forest-500/90 backdrop-blur text-white text-xs font-semibold">
            {park.designation}
          </span>
        </div>

        {/* Title */}
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

      {/* Content */}
      <div className="p-5">
        <p className="text-sm mb-4 line-clamp-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {park.description}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="font-semibold">
              {parkRating?.averageRating ? parkRating.averageRating.toFixed(1) : 'N/A'}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              ({parkRating?.totalReviews || 0})
            </span>
          </div>
          <ExternalLink className="h-5 w-5 text-forest-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
};

export default ParkCard;