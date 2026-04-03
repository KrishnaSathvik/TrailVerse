import React, { memo, useCallback, useMemo } from 'react';
// import { Link } from 'react-router-dom';
import { MapPin, Clock, Users, ExternalLink, Heart, HeartOff } from '@components/icons';
import Button from '../common/Button';
import { htmlToPlainText } from '../../utils/htmlUtils';

const EventCard = memo(({ event, categories, onSaveEvent, onUnsaveEvent, isSaved = false }) => {
  const category = useMemo(() => categories?.find(c => c.id === event.category), [categories, event.category]);
  const eventDate = useMemo(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date || '');
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    return new Date(event.date);
  }, [event.date]);

  const handleSaveToggle = useCallback(() => {
    if (isSaved) {
      onUnsaveEvent?.(event.id);
    } else {
      onSaveEvent?.(event);
    }
  }, [isSaved, event, onSaveEvent, onUnsaveEvent]);

  return (
    <div className="event-card rounded-2xl overflow-hidden backdrop-blur group hover:-translate-y-1 transition-all duration-300"
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
            <div className="flex min-h-11 items-center justify-center rounded-xl bg-white px-3 py-2 text-center shadow-lg">
              <div className="text-sm font-bold uppercase leading-none tracking-[0.14em] text-gray-900">
                {eventDate.toLocaleDateString('en-US', { month: 'short' })} {eventDate.getDate()}
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

        {event.dateLabel && (
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
            {event.dateLabel}
          </p>
        )}

        <p className="text-sm mb-4 line-clamp-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {htmlToPlainText(event.description)}
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

        <div className="flex items-center justify-end">
          <Button
            href={event.detailsUrl || `https://www.nps.gov/planyourvisit/event-details.htm?id=${event.id}`}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
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
});

EventCard.displayName = 'EventCard';

export default EventCard;
