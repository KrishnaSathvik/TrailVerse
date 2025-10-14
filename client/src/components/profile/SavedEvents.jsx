import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, ExternalLink, Heart, X, CalendarDays } from '@components/icons';
import { useSavedEvents } from '../../hooks/useSavedEvents';
import { useAllParks } from '../../hooks/useParks';

const SavedEvents = () => {
  const { savedEvents, loading, unsaveEvent, clearAllSavedEvents } = useSavedEvents();
  useAllParks(); // Prefetch all parks data for park name lookups
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter events based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredEvents(savedEvents);
    } else {
      const filtered = savedEvents.filter(event => 
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.parkName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredEvents(filtered);
    }
  }, [savedEvents, searchTerm]);

  const handleRemoveEvent = (eventId) => {
    unsaveEvent(eventId);
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to remove all saved events?')) {
      clearAllSavedEvents();
    }
  };

  const getEventCategory = (event) => {
    const title = (event.title || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    const text = `${title} ${description}`;
    
    if (text.includes('ranger') || text.includes('ranger program') || text.includes('ranger talk')) return { id: 'ranger-programs', label: 'Ranger Programs', color: 'bg-green-500' };
    if (text.includes('workshop') || text.includes('class') || text.includes('photography') || text.includes('field class')) return { id: 'workshops', label: 'Workshops', color: 'bg-blue-500' };
    if (text.includes('festival') || text.includes('celebration') || text.includes('special event')) return { id: 'festivals', label: 'Festivals', color: 'bg-purple-500' };
    if (text.includes('tour') || text.includes('guided') || text.includes('walk') || text.includes('hike')) return { id: 'guided-tours', label: 'Guided Tours', color: 'bg-orange-500' };
    if (text.includes('volunteer') || text.includes('cleanup') || text.includes('stewardship')) return { id: 'volunteer', label: 'Volunteer', color: 'bg-pink-500' };
    if (text.includes('lecture') || text.includes('talk') || text.includes('presentation') || text.includes('program')) return { id: 'lectures', label: 'Lectures', color: 'bg-indigo-500' };
    if (text.includes('cultural') || text.includes('heritage') || text.includes('history') || text.includes('historic')) return { id: 'cultural', label: 'Cultural', color: 'bg-teal-500' };
    if (text.includes('family') || text.includes('kids') || text.includes('children')) return { id: 'family-programs', label: 'Family Programs', color: 'bg-yellow-500' };
    return { id: 'special-events', label: 'Special Events', color: 'bg-gray-500' };
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-500" />
        <p style={{ color: 'var(--text-secondary)' }}>Loading saved events...</p>
      </div>
    );
  }

  if (savedEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <CalendarDays className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No saved events yet
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Save events from the Events page to see them here
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      {savedEvents.length > 0 && (
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search saved events..."
              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            />
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="space-y-4">
        {filteredEvents.map(event => {
          const category = getEventCategory(event);
          const eventDate = new Date(event.date);
          
          return (
            <div
              key={event.id}
              className="group rounded-2xl p-4 sm:p-6 backdrop-blur hover:shadow-lg transition-all duration-300 border"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)'
              }}
            >
              {/* Header with date and actions */}
              <div className="flex items-start justify-between mb-4">
                {/* Date */}
                <div className="flex-shrink-0">
                  <div className="bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl p-3 text-white shadow-lg min-w-[50px] text-center">
                    <div className="text-xs font-bold uppercase tracking-wider opacity-95">
                      {eventDate.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div className="text-2xl font-bold leading-none">
                      {eventDate.getDate()}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <a
                    href={event.id ? 
                      `https://www.nps.gov/planyourvisit/event-details.htm?id=${event.id}` :
                      `https://www.nps.gov/${event.parkCode}/planyourvisit/events.htm`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      color: 'white'
                    }}
                    title={event.id ? `View ${event.title}` : `View events at ${event.parkName}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="hidden sm:inline">View Event</span>
                    <span className="sm:hidden">View</span>
                  </a>

                  <button
                    onClick={() => handleRemoveEvent(event.id)}
                    className="p-2 rounded-full bg-red-500/90 hover:bg-red-600 text-white transition-all duration-200 hover:scale-105"
                    title="Remove from saved events"
                  >
                    <Heart className="h-4 w-4 fill-current" />
                  </button>
                </div>
              </div>

              {/* Event Content */}
              <div className="space-y-3">
                {/* Category and Title */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${category.color}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-full" 
                      style={{ 
                        backgroundColor: 'var(--surface-hover)',
                        color: 'var(--text-tertiary)'
                      }}
                    >
                      {category.label}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold leading-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                    {event.title}
                  </h3>
                </div>

                {/* Location */}
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span>{event.parkName}</span>
                </div>

                {/* Time and Price */}
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Clock className="h-4 w-4" />
                    <span>{typeof event.time === 'string' ? event.time : 'Time TBD'}</span>
                  </div>
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-medium">{event.price}</span>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {filteredEvents.length === 0 && searchTerm && (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No events found matching &quot;{searchTerm}&quot;
          </p>
        </div>
      )}
    </div>
  );
};

export default SavedEvents;
