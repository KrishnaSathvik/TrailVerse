import React from 'react';
import { MapPin, Star, Share2, Heart, Download } from '@components/icons';
import OptimizedImage from '../common/OptimizedImage';
import ShareButtons from '../common/ShareButtons';

const ParkHero = ({ park, isSaved, onSave, onShare }) => {
  return (
    <div className="relative h-[70vh] min-h-[500px] overflow-hidden">
      {/* Background Image */}
      <OptimizedImage
        src={park.images?.[0]?.url}
        alt={park.fullName}
        className="w-full h-full object-cover"
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 flex items-end">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-4">
            <span className="px-3 py-1.5 rounded-full bg-forest-500/90 backdrop-blur text-white text-sm font-semibold">
              {park.designation}
            </span>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-white text-sm">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">4.8</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight">
            {park.fullName}
          </h1>

          {/* Location */}
          <div className="flex items-center gap-2 text-white/90 text-lg mb-6">
            <MapPin className="h-5 w-5" />
            <span>{park.states}</span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onSave}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition ${
                isSaved
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-white/10 hover:bg-white/20 backdrop-blur text-white'
              }`}
            >
              <Heart className={`h-5 w-5 ${isSaved ? 'fill-current' : ''}`} />
              {isSaved ? 'Saved' : 'Save'}
            </button>

            <button
              onClick={onShare}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white font-semibold transition"
            >
              <Share2 className="h-5 w-5" />
              Share
            </button>

            <button className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white font-semibold transition">
              <Download className="h-5 w-5" />
              Download Map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParkHero;
