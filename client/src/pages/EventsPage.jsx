import React, { useState, useMemo } from 'react';
import { 
  MapPin, Tag, Filter, 
  Search, X, CalendarDays,
  Sparkles, TrendingUp,
  AlertCircle, List
} from '@components/icons';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import Button from '../components/common/Button';
import { useEvents } from '../hooks/useEvents';
import { useParks } from '../hooks/useParks';
import { useSavedEvents } from '../hooks/useSavedEvents';
import EventCard from '../components/events/EventCard';
import EventListItem from '../components/events/EventListItem';

const EventsPage = () => {
  const { data: eventsData, isLoading, error } = useEvents();
  const { data: allParks } = useParks();
  const { saveEvent, unsaveEvent, isEventSaved } = useSavedEvents();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    parks: [],
    categories: [],
    dateRange: 'upcoming' // Default to upcoming events instead of all
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [eventsPerPage] = useState(12);

  // Event categories based on NPS event types
  const categories = [
    { id: 'ranger-programs', label: 'Ranger Programs', color: 'bg-green-500' },
    { id: 'workshops', label: 'Workshops', color: 'bg-blue-500' },
    { id: 'festivals', label: 'Festivals', color: 'bg-purple-500' },
    { id: 'guided-tours', label: 'Guided Tours', color: 'bg-orange-500' },
    { id: 'volunteer', label: 'Volunteer', color: 'bg-pink-500' },
    { id: 'family-programs', label: 'Family Programs', color: 'bg-teal-500' },
    { id: 'special-events', label: 'Special Events', color: 'bg-yellow-500' },
    { id: 'lectures', label: 'Lectures', color: 'bg-indigo-500' },
    { id: 'cultural', label: 'Cultural Events', color: 'bg-purple-500' }
  ];

  // Process and enhance NPS events data
  const events = useMemo(() => {
    if (!eventsData || eventsData.length === 0) return [];
    
    return eventsData.map(event => {
      const getEventCategory = (event) => {
        const title = (event.title || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        const text = `${title} ${description}`;
        
        if (text.includes('ranger') || text.includes('ranger program') || text.includes('ranger talk')) return 'ranger-programs';
        if (text.includes('workshop') || text.includes('class') || text.includes('photography') || text.includes('field class')) return 'workshops';
        if (text.includes('festival') || text.includes('celebration') || text.includes('special event')) return 'festivals';
        if (text.includes('tour') || text.includes('guided') || text.includes('walk') || text.includes('hike')) return 'guided-tours';
        if (text.includes('volunteer') || text.includes('cleanup') || text.includes('stewardship')) return 'volunteer';
        if (text.includes('lecture') || text.includes('talk') || text.includes('presentation') || text.includes('program')) return 'lectures';
        if (text.includes('cultural') || text.includes('heritage') || text.includes('history') || text.includes('historic')) return 'cultural';
        if (text.includes('family') || text.includes('kids') || text.includes('children')) return 'family-programs';
        return 'special-events';
      };

      const parseEventDate = (dateString) => {
        if (!dateString) return null;
        try {
          const date = new Date(dateString);
          const today = new Date(); // Use actual current date
          today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
          
          // Handle invalid dates or dates before today
          if (isNaN(date.getTime()) || date < today) {
            return null;
          }
          return date;
        } catch {
          return null;
        }
      };

      const getParkName = (parkCode) => {
        if (!parkCode || !allParks) return 'National Park';
        const park = allParks.find(p => p.parkCode === parkCode);
        return park ? park.fullName : `${parkCode.toUpperCase()} National Park`;
      };

      // Parse the event date - prioritize datestart for recurring events
      let eventDate = parseEventDate(event.datestart || event.date);
      const parkName = getParkName(event.parkCode);
      const today = new Date(); // Use actual current date
      today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
      
      // For recurring events, use the datestart if it's in the future
      if (!eventDate || eventDate < today) {
        const startDate = parseEventDate(event.datestart);
        if (startDate && startDate >= today) {
          eventDate = startDate;
        } else if (event.datestart && event.dateend) {
          // For recurring events with a date range, generate a date within the range
          const startDate = new Date(event.datestart);
          const endDate = new Date(event.dateend);
          
          if (endDate >= today) {
            // Generate a realistic date within the recurring period
            const daysInRange = Math.floor((endDate - Math.max(startDate, today)) / (1000 * 60 * 60 * 24));
            if (daysInRange > 0) {
              const randomDays = Math.floor(Math.random() * Math.min(daysInRange, 90));
              eventDate = new Date(Math.max(startDate, today));
              eventDate.setDate(eventDate.getDate() + randomDays);
            }
          }
        }
      }
      
      // If still no valid future date, skip this event
      if (!eventDate || eventDate < today) {
        return null; // This will be filtered out
      }

      // Helper function to strip HTML tags and clean up text
      const stripHtml = (html) => {
        if (!html) return 'No description available.';
        return html
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/&nbsp;/g, ' ') // Replace &nbsp; with spaces
          .replace(/&amp;/g, '&') // Replace &amp; with &
          .replace(/&lt;/g, '<') // Replace &lt; with <
          .replace(/&gt;/g, '>') // Replace &gt; with >
          .replace(/&quot;/g, '"') // Replace &quot; with "
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim(); // Remove leading/trailing whitespace
      };

      return {
        id: event.id || `${event.parkCode}-${event.title?.replace(/\s+/g, '-').toLowerCase()}`,
        title: event.title || 'Untitled Event',
        description: stripHtml(event.description),
        parkCode: event.parkCode,
        parkName,
        category: getEventCategory(event),
        date: eventDate ? eventDate.toISOString().split('T')[0] : null,
        eventid: event.id, // Use the UUID format ID for NPS event links
        time: (() => {
          if (typeof event.times === 'string') return event.times;
          if (Array.isArray(event.times) && event.times.length > 0) {
            // Handle array of time objects from NPS API
            const timeObj = event.times[0];
            if (timeObj.timestart && timeObj.timeend) {
              return `${timeObj.timestart} - ${timeObj.timeend}`;
            }
            if (timeObj.timestart) return timeObj.timestart;
          }
          if (typeof event.times === 'object' && event.times && !Array.isArray(event.times)) {
            // Handle single time object from NPS API
            if (event.times.timestart && event.times.timeend) {
              return `${event.times.timestart} - ${event.times.timeend}`;
            }
            if (event.times.timestart) return event.times.timestart;
          }
          return 'Time TBD';
        })(),
        location: event.location || 'Location TBD',
        difficulty: 'easy',
        price: event.feeInfo && event.feeInfo.trim() !== '' ? event.feeInfo : 'Free',
        isFree: !event.feeInfo || event.feeInfo.toLowerCase().includes('free'),
        contactInfo: event.contactInfo,
        ageRange: event.ageRange,
        accessibility: event.accessibility
      };
    }).filter(event => event && event.date);
  }, [eventsData, allParks]);

  // Debug: Log processed events to see dates
  React.useEffect(() => {
    if (events.length > 0) {
      console.log('Processed Events with Dates:', events.slice(0, 3).map(e => ({
        title: e.title,
        date: e.date,
        parkName: e.parkName,
        eventid: e.eventid
      })));
    }
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!event.title.toLowerCase().includes(search) &&
            !event.description.toLowerCase().includes(search) &&
            !event.parkName.toLowerCase().includes(search)) {
          return false;
        }
      }

      if (filters.parks.length > 0 && !filters.parks.includes(event.parkCode)) {
        return false;
      }

      if (filters.categories.length > 0 && !filters.categories.includes(event.category)) {
        return false;
      }

      const eventDate = new Date(event.date);
      const today = new Date(); // Use actual current date
      today.setHours(0, 0, 0, 0);

      if (filters.dateRange === 'upcoming') {
        return eventDate >= today;
      } else if (filters.dateRange === 'this-month') {
        return eventDate.getMonth() === today.getMonth() && eventDate.getFullYear() === today.getFullYear();
      } else if (filters.dateRange === 'next-month') {
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return eventDate.getMonth() === nextMonth.getMonth() && eventDate.getFullYear() === nextMonth.getFullYear();
      }

      return true;
    });
  }, [events, searchTerm, filters]);

  // Pagination logic
  const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);
  const startIndex = (currentPage - 1) * eventsPerPage;
  const endIndex = startIndex + eventsPerPage;
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

  // Group events by month for calendar view (use paginated events)
  const eventsByMonth = useMemo(() => {
    const grouped = {};
    paginatedEvents.forEach(event => {
      const date = new Date(event.date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(event);
    });
    return grouped;
  }, [paginatedEvents]);

  const toggleParkFilter = (parkCode) => {
    setFilters(prev => ({
      ...prev,
      parks: prev.parks.includes(parkCode)
        ? prev.parks.filter(p => p !== parkCode)
        : [...prev.parks, parkCode]
    }));
  };

  const toggleCategoryFilter = (categoryId) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter(c => c !== categoryId)
        : [...prev.categories, categoryId]
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      parks: [],
      categories: [],
      dateRange: 'upcoming'
    });
    setSearchTerm('');
    setCurrentPage(1); // Reset to first page
  };

  const activeFiltersCount = 
    filters.parks.length +
    filters.categories.length +
    (filters.dateRange !== 'upcoming' ? 1 : 0);

  // Get unique park codes from events
  const availableParks = useMemo(() => {
    const parkCodes = [...new Set(events.map(e => e.parkCode))];
    return parkCodes.map(parkCode => {
      const event = events.find(e => e.parkCode === parkCode);
      return {
        code: parkCode,
        name: event?.parkName || `${parkCode.toUpperCase()} National Park`
      };
    });
  }, [events]);

  return (
    <div className="events-page min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="National Parks Events Calendar - Ranger Programs & Activities"
        description="Discover upcoming events, ranger programs, workshops, and special activities at America's National Parks. Plan your visit around exciting park events."
        keywords="national parks events, ranger programs, park activities, workshops, guided tours, national park calendar, park events schedule"
        url="https://www.nationalparksexplorerusa.com/events"
        type="website"
      />
      
      <Header />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-purple-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="mt-6">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <CalendarDays className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Live NPS Events & Programs
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Discover Events
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Join ranger programs, workshops, festivals, and special events at national parks. 
              Connect with nature and fellow adventurers.
            </p>

          </div>

          {/* Search Bar */}
          <div className="mt-8 max-w-3xl">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search events by name, park, or description..."
                className="w-full pl-14 pr-14 py-5 rounded-2xl text-base font-medium outline-none transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/5 transition"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Events', value: events.length, icon: CalendarDays },
              { label: 'This Month', value: (() => {
                const today = new Date();
                const monthKey = `${today.getFullYear()}-${today.getMonth()}`;
                return eventsByMonth[monthKey]?.length || 0;
              })(), icon: TrendingUp },
              { label: 'Categories', value: categories.length, icon: Tag },
              { label: 'Parks Featured', value: availableParks.length, icon: MapPin }
            ].map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div
                  key={index}
                  className="rounded-2xl p-4 backdrop-blur text-center"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <Icon className="h-5 w-5 mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} />
                  <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {stat.value}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              {/* Mobile Filter Button */}
              <Button
                onClick={() => setShowFilters(true)}
                variant="secondary"
                size="md"
                icon={Filter}
                className="sm:hidden"
              >
                Filters
                {activeFiltersCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500 text-white">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>

              {/* Mobile Clear Button */}
              {activeFiltersCount > 0 && (
                <Button
                  onClick={clearAllFilters}
                  variant="ghost"
                  size="sm"
                  icon={X}
                  className="sm:hidden"
                >
                  Clear
                </Button>
              )}

              {/* Date Range Filter */}
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                className="px-4 py-2.5 pr-10 rounded-xl text-sm font-medium outline-none cursor-pointer transition appearance-none"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                  backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3e%3c/svg%3e")',
                  backgroundPosition: 'right 0.75rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.5em 1.5em'
                }}
              >
                <option value="upcoming">Upcoming</option>
                <option value="this-month">This Month</option>
                <option value="next-month">Next Month</option>
                <option value="all">All Dates</option>
              </select>

              {activeFiltersCount > 0 && (
                <Button
                  onClick={clearAllFilters}
                  variant="ghost"
                  size="sm"
                  icon={X}
                >
                  Clear
                </Button>
              )}
        </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2 p-1 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <Button
                onClick={() => setViewMode('grid')}
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                icon={List}
                className="px-4 py-2"
              >
                List
              </Button>
              <Button
                onClick={() => setViewMode('calendar')}
                variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
                size="sm"
                icon={CalendarDays}
                className="px-4 py-2"
              >
                Calendar
              </Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Filters - Desktop */}
            <aside className="hidden sm:block lg:w-80 flex-shrink-0">
              <div className="sticky top-24 rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-lg font-semibold mb-4"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Filters
                </h3>

                {/* Categories */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Categories
                  </h4>
                  <div className="space-y-2">
                    {categories.map(category => (
                      <label key={category.id} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={filters.categories.includes(category.id)}
                          onChange={() => toggleCategoryFilter(category.id)}
                          className="rounded border-2 w-4 h-4 text-purple-500 focus:ring-purple-500/50"
                          style={{ borderColor: 'var(--border)' }}
                        />
                        <div className={`w-3 h-3 rounded-full ${category.color}`} />
                        <span className="text-sm group-hover:text-purple-400 transition"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {category.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Parks */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Parks ({availableParks.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {availableParks.map(park => (
                      <label key={park.code} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={filters.parks.includes(park.code)}
                          onChange={() => toggleParkFilter(park.code)}
                          className="rounded border-2 w-4 h-4 text-purple-500 focus:ring-purple-500/50"
                          style={{ borderColor: 'var(--border)' }}
                        />
                        <span className="text-sm group-hover:text-purple-400 transition truncate"
                          style={{ color: 'var(--text-secondary)' }}
                          title={park.name}
                        >
                          {park.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredEvents.length)} of {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
                    {searchTerm && ` for "${searchTerm}"`}
                  </p>
                  {totalPages > 1 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Page {currentPage} of {totalPages}
                    </p>
                  )}
                </div>
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="text-center py-24">
                  <Sparkles className="h-12 w-12 animate-spin mx-auto mb-4 text-purple-500" />
                  <p style={{ color: 'var(--text-secondary)' }}>Loading events...</p>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="text-center py-24">
                  <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
                  <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Unable to load events
                  </p>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                    {error}
                  </p>
                  <Button
                    onClick={() => window.location.reload()}
                    variant="secondary"
                    size="lg"
                  >
                    Retry
                  </Button>
                </div>
              )}

              {/* Empty State */}
              {!isLoading && !error && filteredEvents.length === 0 && (
                <div className="text-center py-24">
                  <CalendarDays className="h-16 w-16 mx-auto mb-4"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <p className="text-lg font-semibold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    No events found
                  </p>
                  <p className="text-sm mb-6"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Try adjusting your filters or search terms
                  </p>
                  <Button
                    onClick={clearAllFilters}
                    variant="secondary"
                    size="lg"
                  >
                    Clear Filters
                  </Button>
                </div>
              )}

        {/* Events Grid */}
              {!isLoading && !error && filteredEvents.length > 0 && viewMode === 'grid' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {paginatedEvents.map(event => (
                      <EventCard 
                        key={event.id} 
                        event={event} 
                        categories={categories}
                        onSaveEvent={saveEvent}
                        onUnsaveEvent={unsaveEvent}
                        isSaved={isEventSaved(event.id)}
                      />
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-8">
                      <Button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        variant="secondary"
                        size="md"
                      >
                        Previous
                      </Button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                          if (pageNum > totalPages) return null;
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`px-3 py-2 rounded-full text-sm font-semibold transition ${
                                currentPage === pageNum ? 'ring-2' : ''
                              }`}
                              style={{
                                backgroundColor: currentPage === pageNum ? 'var(--surface-active)' : 'var(--surface)',
                                borderWidth: '1px',
                                borderColor: currentPage === pageNum ? 'var(--border-hover)' : 'var(--border)',
                                color: 'var(--text-primary)',
                                boxShadow: currentPage === pageNum ? 'var(--shadow-lg)' : 'var(--shadow)'
                              }}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>

                      <Button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        variant="secondary"
                        size="md"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* Calendar View */}
              {!isLoading && !error && filteredEvents.length > 0 && viewMode === 'calendar' && (
                <div className="space-y-8">
                  {Object.keys(eventsByMonth)
                    .sort()
                    .map(monthKey => {
                      const [year, month] = monthKey.split('-').map(Number);
                      const monthName = new Date(year, month).toLocaleDateString('en-US', { 
                        month: 'long',
                        year: 'numeric'
                      });
                      const monthEvents = eventsByMonth[monthKey];

                      return (
                        <div key={monthKey}>
                          <h3 className="text-2xl font-bold mb-4"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {monthName}
                          </h3>
                          <div className="space-y-4">
                            {monthEvents.map(event => (
                              <EventListItem 
                                key={event.id} 
                                event={event} 
                                categories={categories}
                                onSaveEvent={saveEvent}
                                onUnsaveEvent={unsaveEvent}
                                isSaved={isEventSaved(event.id)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile Filters Modal */}
      {showFilters && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          />
          
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl p-6"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderTopWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Filters
              </h3>
              <button
                onClick={() => setShowFilters(false)}
                className="p-2 rounded-lg hover:bg-white/5"
                style={{ color: 'var(--text-primary)' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Date Range */}
              <div>
                <h4 className="text-sm font-semibold mb-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  DATE RANGE
                </h4>
                <select
                  value={filters.dateRange}
                  onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                  className="w-full px-4 py-3 pr-10 rounded-xl text-sm font-medium outline-none cursor-pointer transition appearance-none"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                    backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3e%3c/svg%3e")',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '1.5em 1.5em'
                  }}
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="this-month">This Month</option>
                  <option value="next-month">Next Month</option>
                  <option value="all">All Dates</option>
                </select>
              </div>

              {/* Categories */}
              <div>
                <h4 className="text-sm font-semibold mb-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  CATEGORIES
                </h4>
                <div className="space-y-2">
                  {categories.map(category => (
                    <label key={category.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.categories.includes(category.id)}
                        onChange={() => toggleCategoryFilter(category.id)}
                        className="rounded border-2 w-5 h-5 text-purple-500 focus:ring-purple-500/50"
                        style={{ borderColor: 'var(--border)' }}
                      />
                      <div className={`w-3 h-3 rounded-full ${category.color}`} />
                      <span className="text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {category.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Parks */}
              <div>
                <h4 className="text-sm font-semibold mb-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  PARKS ({availableParks.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableParks.map(park => (
                    <label key={park.code} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.parks.includes(park.code)}
                        onChange={() => toggleParkFilter(park.code)}
                        className="rounded border-2 w-5 h-5 text-purple-500 focus:ring-purple-500/50"
                        style={{ borderColor: 'var(--border)' }}
                      />
                      <span className="text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {park.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <Button
                onClick={clearAllFilters}
                variant="secondary"
                size="lg"
                className="flex-1"
              >
                Clear All
              </Button>
              <Button
                onClick={() => setShowFilters(false)}
                variant="secondary"
                size="lg"
                className="flex-1"
              >
                Apply
              </Button>
            </div>
          </div>
          </div>
        )}

      <Footer />
    </div>
  );
};

export default EventsPage;
