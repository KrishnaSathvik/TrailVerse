import React, { memo, useCallback, useMemo } from 'react';
// import { Link } from 'react-router-dom';
import { Landmark, Clock, MapPinCheck, ExternalLink, Heart, HeartOff } from '@components/icons';
import Button from '../common/Button';
import { htmlToPlainText } from '../../utils/htmlUtils';
import ExpandableDescription from '../discover/ExpandableDescription';

const EventCard = memo(({ event, categories, onSaveEvent, onUnsaveEvent, isSaved = false }) => {
  const category = useMemo(() => categories?.find(c => c.id === event.category), [categories, event.category]);
  const canSave = Boolean(onSaveEvent || onUnsaveEvent);
  const eventDate = useMemo(() => {
    const match = (event.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
    <div className="event-card h-full flex flex-col rounded-2xl overflow-hidden backdrop-blur group hover:-translate-y-1 transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {/* Header with badges */}
      <div className="relative shrink-0 p-4 pb-0">
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
            {canSave && (
              <Button
                onClick={handleSaveToggle}
                variant={isSaved ? 'danger' : 'ghost'}
                size="sm"
                icon={isSaved ? Heart : HeartOff}
                className="p-2"
                title={isSaved ? 'Remove from saved events' : 'Save event'}
              />
            )}

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
      <div className="flex flex-1 flex-col p-6 pt-4">
        <div className="flex items-center gap-2 mb-3 min-h-[1.25rem]">
          <Landmark size={18} weight="fill" className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
            {event.parkName}
          </span>
        </div>

        <h3 className="text-xl font-bold mb-2 min-h-[3.5rem] group-hover:text-purple-400 transition line-clamp-2 leading-snug"
          style={{ color: 'var(--text-primary)' }}
        >
          {event.title}
        </h3>

        <p className="text-xs font-medium mb-2 min-h-[1rem]" style={{ color: 'var(--text-tertiary)' }}>
          {event.dateLabel || '\u00a0'}
        </p>

        <div className="mb-4 min-h-[5.25rem]">
          <ExpandableDescription
            text={htmlToPlainText(event.description)}
            collapsedLines={3}
            className="text-sm leading-relaxed whitespace-pre-line"
          />
        </div>

        <div className="space-y-2 mb-4 shrink-0">
          <div className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Clock
              size={18}
              weight="fill"
              className="flex-shrink-0"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <span>{event.time}</span>
          </div>
          <div className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <MapPinCheck
              size={18}
              weight="fill"
              className="flex-shrink-0"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <span>
              {event.location}
            </span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-end pt-2">
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
