import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Star, Users, TrendingUp } from 'lucide-react';
import OptimizedImage from '../common/OptimizedImage';

const ThemedParkCard = ({ park, variant = 'default' }) => {
  const variants = {
    default: 'rounded-2xl',
    compact: 'rounded-xl',
    large: 'rounded-3xl'
  };

  return (
    <Link
      to={`/parks/${park.parkCode}`}
      className={`group ${variants[variant]} overflow-hidden backdrop-blur hover:-translate-y-1 transition-all duration-300 block`}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {/* Image */}
      <div className={`relative ${variant === 'large' ? 'h-80' : variant === 'compact' ? 'h-40' : 'h-56'} overflow-hidden`}>
        <OptimizedImage
          src={park.images?.[0]?.url}
          alt={park.fullName}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        {/* Badges */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-forest-500/90 backdrop-blur text-white text-xs font-semibold">
            {park.designation}
          </span>
          {park.isFeatured && (
            <span className="px-3 py-1 rounded-full bg-yellow-500/90 backdrop-blur text-white text-xs font-semibold flex items-center gap-1">
              <Star className="h-3 w-3 fill-current" />
              Featured
            </span>
          )}
        </div>

        {/* Bottom Info */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h3 className={`${variant === 'large' ? 'text-3xl' : 'text-xl'} font-bold text-white mb-2 line-clamp-2 group-hover:text-forest-300 transition`}>
            {park.fullName}
          </h3>
          <div className="flex items-center gap-2 text-white/90 text-sm">
            <MapPin className="h-4 w-4" />
            <span>{park.states}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      {variant !== 'compact' && (
        <div className="p-5">
          <p className="text-sm mb-4 line-clamp-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            {park.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {park.visitors || '2.5M'} visitors
              </span>
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                {park.rating || '4.8'}
              </span>
            </div>
            <TrendingUp className="h-5 w-5 text-forest-400 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      )}
    </Link>
  );
};

export default ThemedParkCard;
