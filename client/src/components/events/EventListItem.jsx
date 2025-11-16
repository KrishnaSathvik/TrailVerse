import React, { memo, useCallback, useMemo } from 'react';
import { MapPin, Users, Clock, ArrowRight, Heart, HeartOff } from '@components/icons';

const EventListItem = memo(({ event, categories, onSaveEvent, onUnsaveEvent, isSaved = false }) => {
  const category = useMemo(() => categories.find(c => c.id === event.category), [categories, event.category]);
  const eventDate = useMemo(() => new Date(event.date), [event.date]);

  const handleSaveToggle = useCallback(() => {
    if (isSaved) {
      onUnsaveEvent?.(event.id);
    } else {
      onSaveEvent?.(event);
    }
  }, [isSaved, event, onSaveEvent, onUnsaveEvent]);

  return (
    <div className="rounded-xl p-5 backdrop-blur hover:-translate-y-0.5 transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex gap-4">
        {/* Date */}
        <div className="flex-shrink-0 text-center bg-white rounded-xl p-3 shadow-lg h-fit">
          <div className="text-xs font-semibold text-gray-600 uppercase">
            {eventDate.toLocaleDateString('en-US', { month: 'short' })}
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {eventDate.getDate()}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${category?.color}`} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                  {category?.label}
                </span>
              </div>
              <h3 className="text-lg font-bold mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {event.title}
              </h3>
              <div className="flex items-center gap-2 text-sm mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <MapPin className="h-3 w-3" />
                <span>{event.parkName}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={event.id ? 
                    `https://www.nps.gov/planyourvisit/event-details.htm?id=${event.id}` :
                    `https://www.nps.gov/${event.parkCode}/planyourvisit/events.htm`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-purple-400 hover:text-purple-300"
                  title={event.id ? `View ${event.title}` : `View events at ${event.parkName}`}
                >
                  View Event
                  <ArrowRight className="h-3 w-3" />
                </a>

                <button
                  onClick={handleSaveToggle}
                  className={`p-1.5 rounded-full transition-all duration-200 ${
                    isSaved 
                      ? 'bg-red-500 text-white hover:bg-red-600' 
                      : 'bg-white/10 hover:bg-white/20 text-gray-400 hover:text-red-400'
                  }`}
                  title={isSaved ? 'Remove from saved events' : 'Save event'}
                >
                  {isSaved ? (
                    <Heart className="h-3 w-3 fill-current" />
                  ) : (
                    <HeartOff className="h-3 w-3" />
                  )}
                </button>
              </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {typeof event.time === 'string' ? event.time : 'Time TBD'}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {event.location}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default EventListItem;
