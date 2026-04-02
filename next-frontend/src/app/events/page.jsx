'use client';

import React, { useState, useMemo } from 'react';
import {
  MapPin, Tag, Filter,
  Search, X, CalendarDays,
  Sparkles, TrendingUp,
  AlertCircle, Grid
} from '@components/icons';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import Button from '@/components/common/Button';
import { useAuth } from '@/context/AuthContext';
import { useEvents, useEventSummary } from '@/hooks/useEvents';
import { useAllParks } from '@/hooks/useParks';
import { useSavedEvents } from '@/hooks/useSavedEvents';
import EventCard from '@/components/events/EventCard';
import EventListItem from '@/components/events/EventListItem';

const STATE_NAMES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
  AS: 'American Samoa',
  GU: 'Guam',
  MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico',
  VI: 'U.S. Virgin Islands'
};

const EventsPage = () => {
  const formatLocalDate = (date) => (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  );

  const parseLocalDate = (dateString) => {
    if (!dateString) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  };

  const { isAuthenticated } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);

  const [filters, setFilters] = useState({
    categories: [],
  });
  const monthOptions = useMemo(() => (
    Array.from({ length: 12 }, (_, offset) => {
      const baseDate = new Date();
      const monthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      return {
        offset,
        label: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        dateStart: formatLocalDate(monthStart),
        dateEnd: formatLocalDate(monthEnd),
      };
    })
  ), []);
  const selectedMonth = monthOptions[selectedMonthOffset] || monthOptions[0];
  const eventQueryOptions = useMemo(() => {
    return {
      upcoming: 'true',
      dateStart: selectedMonth?.dateStart || null,
      dateEnd: selectedMonth?.dateEnd || null,
      limit: 150,
    };
  }, [selectedMonth]);
  const { data: eventsData, isLoading, error } = useEvents(eventQueryOptions);
  const { data: futureSummary } = useEventSummary({ upcoming: 'true' });
  const { data: allParksData } = useAllParks();
  const allParks = allParksData?.data || [];
  const { saveEvent, unsaveEvent, isEventSaved } = useSavedEvents();

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return eventsData.map((event, index) => {
      const getEventCategory = (event) => {
        const typesText = Array.isArray(event.types)
          ? event.types.map(type => String(type).toLowerCase()).join(' ')
          : '';
        const categoryText = String(event.category || '').toLowerCase();
        const title = (event.title || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        const text = `${categoryText} ${typesText} ${title} ${description}`;

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
        return parseLocalDate(dateString);
      };
      const resolveDisplayDate = (rawEvent) => {
        const recurringDates = Array.isArray(rawEvent.dates)
          ? rawEvent.dates
              .map(parseEventDate)
              .filter(Boolean)
              .sort((a, b) => a - b)
          : [];
        const nextRecurringDate = recurringDates.find((date) => date >= today);

        if (nextRecurringDate) {
          return nextRecurringDate;
        }

        const directDate = parseEventDate(rawEvent.date);
        if (directDate && directDate >= today) {
          return directDate;
        }

        const startDate = parseEventDate(rawEvent.datestart);
        if (startDate && startDate >= today) {
          return startDate;
        }

        return directDate || startDate || parseEventDate(rawEvent.dateend);
      };

      const resolvedParkCode = event.parkCode || event.sitecode || '';
      const matchedPark = resolvedParkCode && allParks
        ? allParks.find(p => p.parkCode === resolvedParkCode)
        : null;
      const parkName = event.parkfullname || matchedPark?.fullName || (resolvedParkCode ? `${resolvedParkCode.toUpperCase()} National Park` : 'National Park');
      const eventDate = resolveDisplayDate(event);

      if (!eventDate) {
        return null;
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

      const baseId = event.id || `${resolvedParkCode}-${event.title?.replace(/\s+/g, '-').toLowerCase()}`;
      const eventDateKey = eventDate ? eventDate.toISOString().split('T')[0] : 'unknown-date';

      return {
        id: baseId,
        renderKey: `${baseId}-${resolvedParkCode || 'unknown-park'}-${eventDateKey}-${index}`,
        title: event.title || 'Untitled Event',
        description: stripHtml(event.description),
        parkCode: resolvedParkCode,
        parkName,
        states: matchedPark?.states ? matchedPark.states.split(',').map(s => s.trim()) : [],
        category: getEventCategory(event),
        date: eventDate
          ? `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`
          : null,
        eventid: event.id,
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
        price: event.feeinfo && event.feeinfo.trim() !== '' ? event.feeinfo : 'Free',
        isFree: Boolean(event.isfree) || !event.feeinfo || event.feeinfo.toLowerCase().includes('free'),
        contactInfo: event.contactname || event.contactemailaddress || event.contacttelephonenumber,
        ageRange: event.ageRange,
        accessibility: event.accessibility,
        detailsUrl: event.regresurl || (event.id ? `https://www.nps.gov/planyourvisit/event-details.htm?id=${event.id}` : null),
        dateLabel: event.isrecurring && event.dateend
          ? `${eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • Recurring`
          : null,
      };
    }).filter(event => event && event.date).filter((event, index, list) => (
      list.findIndex((candidate) => (
        candidate.id === event.id &&
        candidate.date === event.date &&
        candidate.time === event.time &&
        candidate.parkCode === event.parkCode
      )) === index
    ));
  }, [eventsData, allParks]);

  // Filter and sort events by date
  const filteredEvents = useMemo(() => {
    const selectedMonthStart = selectedMonth?.dateStart ? parseLocalDate(selectedMonth.dateStart) : null;
    const selectedMonthEnd = selectedMonth?.dateEnd ? parseLocalDate(selectedMonth.dateEnd) : null;

    const filtered = events.filter(event => {
      const eventDate = parseLocalDate(event.date);

      if (!eventDate) {
        return false;
      }

      if (selectedMonthStart && selectedMonthEnd) {
        if (eventDate < selectedMonthStart || eventDate > selectedMonthEnd) {
          return false;
        }
      }

      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const searchableStates = event.states.join(' ').toLowerCase();
        const searchableStateNames = event.states
          .map(stateCode => STATE_NAMES[stateCode] || stateCode)
          .join(' ')
          .toLowerCase();
        if (!event.title.toLowerCase().includes(search) &&
            !event.description.toLowerCase().includes(search) &&
            !event.parkName.toLowerCase().includes(search) &&
            !searchableStates.includes(search) &&
            !searchableStateNames.includes(search)) {
          return false;
        }
      }

      if (filters.categories.length > 0 && !filters.categories.includes(event.category)) {
        return false;
      }

      return true;
    });

    // Sort events by date (earliest first), then by title for events on the same date
    return filtered.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);

      // Primary sort: by date (earliest first)
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA - dateB;
      }

      // Secondary sort: by title (alphabetical) for events on the same date
      return a.title.localeCompare(b.title);
    });
  }, [events, searchTerm, filters, selectedMonth]);

  // Pagination logic
  const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);
  const startIndex = (currentPage - 1) * eventsPerPage;
  const endIndex = startIndex + eventsPerPage;
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters, selectedMonthOffset]);

  // Group events by month for calendar view
  const eventsByMonth = useMemo(() => {
    const grouped = {};
    filteredEvents.forEach(event => {
      const date = new Date(event.date);
      const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(event);
    });
    return grouped;
  }, [filteredEvents]);

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
      categories: [],
    });
    setSearchTerm('');
    setSelectedMonthOffset(0);
    setCurrentPage(1); // Reset to first page
  };

  const activeFiltersCount =
    filters.categories.length;

  return (
    <div className="events-page min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>


      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-8 sm:py-20">
        <div className="relative z-10 max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">

          <div className="mt-3 sm:mt-6">
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
              Live National Parks Events
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
                { label: 'Future Events', value: futureSummary.count || 0, icon: CalendarDays },
                { label: selectedMonth?.label || 'Selected Month', value: filteredEvents.length, icon: TrendingUp },
                { label: 'Categories', value: categories.length, icon: Tag },
                { label: 'Parks This Month', value: new Set(filteredEvents.map(event => event.parkCode).filter(Boolean)).size, icon: MapPin }
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
        <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
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

              {/* Month Filter */}
                <select
                  value={selectedMonthOffset}
                  onChange={(e) => setSelectedMonthOffset(Number(e.target.value))}
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
                  {monthOptions.map(month => (
                    <option key={month.offset} value={month.offset}>
                      {month.label}
                    </option>
                  ))}
                </select>

              {/* Clear Button - Desktop only */}
              {activeFiltersCount > 0 && (
                <Button
                  onClick={clearAllFilters}
                  variant="ghost"
                  size="sm"
                  icon={X}
                  className="hidden sm:flex"
                >
                  Clear
                </Button>
              )}
        </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
              {[
                { key: 'grid', label: 'Grid', Icon: Grid },
                { key: 'calendar', label: 'Calendar', Icon: CalendarDays },
              ].map(({ key, label, Icon }) => {
                const isActive = viewMode === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setViewMode(key)}
                    className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: isActive ? 'var(--border-hover)' : 'var(--border)',
                      color: 'var(--text-primary)',
                      boxShadow: isActive ? 'var(--shadow-lg)' : 'var(--shadow)',
                    }}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
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
                <div>
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
                        key={event.renderKey}
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
                                key={event.renderKey}
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
              <div>
                <h4 className="text-sm font-semibold mb-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  MONTH
                </h4>
                <select
                  value={selectedMonthOffset}
                  onChange={(e) => setSelectedMonthOffset(Number(e.target.value))}
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
                  {monthOptions.map(month => (
                    <option key={month.offset} value={month.offset}>
                      {month.label}
                    </option>
                  ))}
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
