import React, { memo, useCallback, useMemo } from 'react';
import { MapPin, Users, Clock, ArrowRight, Heart, HeartOff } from '@components/icons';

const EventListItem = memo(({ event, categories, onSaveEvent, onUnsaveEvent, isSaved = false }) => {
  const category = useMemo(() => categories.find(c => c.id === event.category), [categories, event.category]);
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
    <div className="rounded-xl p-5 backdrop-blur hover:-translate-y-0.5 transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex items-start gap-4">
        {/* Date - compact calendar badge */}
        <div className="h-16 flex-shrink-0 flex items-center justify-center rounded-xl bg-white px-4 text-center shadow-lg">
          <span className="text-sm font-bold uppercase tracking-[0.14em] text-gray-900 leading-none whitespace-nowrap">
            {eventDate.toLocaleDateString('en-US', { month: 'short' })} {eventDate.getDate()}
          </span>
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
              {event.dateLabel && (
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
                  {event.dateLabel}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={event.detailsUrl || (event.id ?
                    `https://www.nps.gov/planyourvisit/event-details.htm?id=${event.id}` :
                    `https://www.nps.gov/${event.parkCode}/planyourvisit/events.htm`
                  )}
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
