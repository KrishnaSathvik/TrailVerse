import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, ExternalLink, Heart, X, CalendarDays } from 'lucide-react';
import { useSavedEvents } from '../../hooks/useSavedEvents';
import { useParks } from '../../hooks/useParks';

const SavedEvents = () => {
  const { savedEvents, loading, unsaveEvent, clearAllSavedEvents } = useSavedEvents();
  const { data: allParks } = useParks();
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
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Save events from the Events page to see them here
        </p>
        <a
          href="/events"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-purple-500 hover:bg-purple-600 text-white font-semibold transition"
        >
          <Calendar className="h-4 w-4" />
          Browse Events
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Saved Events
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {filteredEvents.length} of {savedEvents.length} saved events
          </p>
        </div>
        
        {savedEvents.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition hover:bg-red-500/10 text-red-400 hover:text-red-300"
          >
            <X className="h-4 w-4" />
            Clear All
          </button>
        )}
      </div>

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
              className="rounded-xl p-5 backdrop-blur hover:-translate-y-0.5 transition-all duration-300"
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
                        <div className={`w-2 h-2 rounded-full ${category.color}`} />
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                          {category.label}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                        {event.title}
                      </h3>
                      <div className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                        <MapPin className="h-3 w-3" />
                        <span>{event.parkName}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
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
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      <button
                        onClick={() => handleRemoveEvent(event.id)}
                        className="p-1.5 rounded-full transition-all duration-200 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300"
                        title="Remove from saved events"
                      >
                        <Heart className="h-3 w-3 fill-current" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {typeof event.time === 'string' ? event.time : 'Time TBD'}
                    </span>
                    <span className="flex items-center gap-1">
                      <span>{event.price}</span>
                    </span>
                  </div>

                  <p className="text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {event.description}
                  </p>
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
            No events found matching "{searchTerm}"
          </p>
        </div>
      )}
    </div>
  );
};

export default SavedEvents;
