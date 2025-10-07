import React from 'react';
// import { Link } from 'react-router-dom';
import { MapPin, Clock, Users, ExternalLink, Heart, HeartOff } from 'lucide-react';
import Button from '../common/Button';

const EventCard = ({ event, categories, onSaveEvent, onUnsaveEvent, isSaved = false }) => {
  const category = categories?.find(c => c.id === event.category);
  const eventDate = new Date(event.date);

  const handleSaveToggle = () => {
    if (isSaved) {
      onUnsaveEvent?.(event.id);
    } else {
      onSaveEvent?.(event);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden backdrop-blur group hover:-translate-y-1 transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {/* Header with badges */}
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-4">
          {/* Category Badge */}
          {category && (
            <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${category.color} text-white`}>
              {category.label}
            </div>
          )}

          {/* Date Badge and Save Button */}
          <div className="flex items-center gap-3">
            {/* Save Button */}
            <Button
              onClick={handleSaveToggle}
              variant={isSaved ? 'danger' : 'ghost'}
              size="sm"
              icon={isSaved ? Heart : HeartOff}
              className="p-2"
              title={isSaved ? 'Remove from saved events' : 'Save event'}
            />

            {/* Date Badge */}
            <div className="text-center bg-white rounded-xl p-2 shadow-lg">
              <div className="text-xs font-semibold text-gray-600 uppercase">
                {eventDate.toLocaleDateString('en-US', { month: 'short' })}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {eventDate.getDate()}
              </div>
            </div>
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
              {event.location}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {event.price}
          </div>
          
          <Button
            href={`https://www.nps.gov/planyourvisit/event-details.htm?id=${event.id}`}
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            size="md"
            icon={ExternalLink}
            iconPosition="right"
          >
            View Event Details
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EventCard;