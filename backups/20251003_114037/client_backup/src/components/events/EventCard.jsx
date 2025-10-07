import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Users, Calendar, ExternalLink } from 'lucide-react';
import OptimizedImage from '../common/OptimizedImage';

const EventCard = ({ event, categories }) => {
  const category = categories?.find(c => c.id === event.category);
  const eventDate = new Date(event.date);
  const spotsLeft = event.capacity - event.registered;
  const isFull = spotsLeft <= 0;
  const isAlmostFull = spotsLeft > 0 && spotsLeft <= 5;

  return (
    <div className="rounded-2xl overflow-hidden backdrop-blur group hover:-translate-y-1 transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <OptimizedImage
          src={event.imageUrl}
          alt={event.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Category Badge */}
        {category && (
          <div className={`absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-semibold ${category.color} text-white`}>
            {category.label}
          </div>
        )}

        {/* Date Badge */}
        <div className="absolute top-4 right-4 text-center bg-white rounded-xl p-2 shadow-lg">
          <div className="text-xs font-semibold text-gray-600 uppercase">
            {eventDate.toLocaleDateString('en-US', { month: 'short' })}
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {eventDate.getDate()}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
            {event.parkName}
          </span>
        </div>

        <h3 className="text-xl font-bold mb-2 group-hover:text-purple-400 transition line-clamp-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {event.title}
        </h3>

        <p className="text-sm mb-4 line-clamp-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {event.description}
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Clock className="h-4 w-4" />
            <span>{event.time}</span>
          </div>
          <div className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Users className="h-4 w-4" />
            <span>
              {event.registered}/{event.capacity} registered
            </span>
            {isAlmostFull && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                Almost Full
              </span>
            )}
            {isFull && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                Full
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {event.price}
          </div>
          
          <a
            href={event.registrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold transition ${
              isFull
                ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
                : 'bg-purple-500 hover:bg-purple-600 text-white'
            }`}
            onClick={(e) => isFull && e.preventDefault()}
          >
            <span>{isFull ? 'Sold Out' : 'Register'}</span>
            {!isFull && <ExternalLink className="h-4 w-4" />}
          </a>
        </div>
      </div>
    </div>
  );
};

export default EventCard;