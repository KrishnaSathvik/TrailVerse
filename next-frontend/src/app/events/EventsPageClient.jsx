'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Filter, ChevronDown,
  Search, X, CalendarDays,
  Sparkles,
  AlertCircle, Grid
} from '@components/icons';
import Button from '@/components/common/Button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useAuth } from '@/context/AuthContext';
import { useEvents, useEventSummary } from '@/hooks/useEvents';
import { useAllParksLite } from '@/hooks/useParks';
import { useSavedEvents } from '@/hooks/useSavedEvents';
import EventCard from '@/components/events/EventCard';
import EventListItem from '@/components/events/EventListItem';
import { logEvent } from '@/utils/analytics';
import STATE_NAMES from '@/utils/stateNames';

const EventsPage = ({ initialData }) => {
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
  const categoryButtonRef = useRef(null);
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
  const matchesInitialMonth = Boolean(
    initialData
    && selectedMonth?.dateStart === initialData.dateStart
    && selectedMonth?.dateEnd === initialData.dateEnd
  );
  const eventQueryOptions = useMemo(() => {
    return {
      upcoming: 'true',
      dateStart: selectedMonth?.dateStart || null,
      dateEnd: selectedMonth?.dateEnd || null,
      limit: 150,
      ...(matchesInitialMonth
        ? {
            initialEvents: initialData.events,
            skipInitialFetch: true,
          }
        : {}),
    };
  }, [selectedMonth, matchesInitialMonth, initialData]);
  const { data: eventsData, isLoading, error } = useEvents(eventQueryOptions);
  const { data: futureSummary } = useEventSummary({
    upcoming: 'true',
    ...(matchesInitialMonth
      ? {
          initialSummary: initialData.summary,
          skipInitialFetch: true,
        }
      : {}),
  });
  const { data: allParksData } = useAllParksLite(false);
  const allParks = allParksData?.data || [];
  const { saveEvent: rawSaveEvent, unsaveEvent: rawUnsaveEvent, isEventSaved } = useSavedEvents();
  const saveEvent = (event) => { logEvent('Event', 'save', event.title || event.id); rawSaveEvent(event); };
  const unsaveEvent = (eventId) => { logEvent('Event', 'unsave', eventId); rawUnsaveEvent(eventId); };

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

    // Sort events: ongoing events (start in past) sort as today, then ascending
    const now = new Date();
    return filtered.sort((a, b) => {
      const rawA = new Date(a.date);
      const rawB = new Date(b.date);
      const dateA = rawA < now ? now : rawA;
      const dateB = rawB < now ? now : rawB;

      if (dateA.getTime() !== dateB.getTime()) {
        return dateA - dateB;
      }

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
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b py-5 sm:py-8" style={{ borderColor: 'var(--border)' }}>
        <div className="relative z-10 public-shell">

          <div>
            <div className="public-eyebrow"
            >
              <CalendarDays className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Live NPS Events & Programs
              </span>
            </div>

            <h1 className="public-page-title mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Live National Parks Events
            </h1>
            <p className="public-page-intro"
              style={{ color: 'var(--text-secondary)' }}
            >
              Join ranger programs, workshops, festivals, and special events at national parks.
              Connect with nature and fellow adventurers.
            </p>

          </div>

          <p className="mt-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {(futureSummary.count || 0).toLocaleString()} upcoming events across the national parks
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24">
        <div className="public-shell">
          <div className="py-6" role="search" aria-label="Find park events">
            <div className="grid grid-cols-2 items-center gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto_auto_auto]">
              <div className="relative col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="search"
                  aria-label="Search events"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search events or parks"
                  className="public-search w-full border py-3 pl-11 pr-12 text-base outline-none [&::-webkit-search-cancel-button]:appearance-none"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                {searchTerm && (
                  <button type="button" aria-label="Clear search" onClick={() => setSearchTerm('')}
                    className="public-action absolute right-1 top-1/2 min-w-11 -translate-y-1/2"
                    style={{ color: 'var(--text-secondary)' }}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="relative min-w-0">
                <select
                  aria-label="Event month"
                  value={selectedMonthOffset}
                  onChange={(event) => setSelectedMonthOffset(Number(event.target.value))}
                  className="public-action public-action-secondary w-full cursor-pointer appearance-none py-3 pl-3 pr-9 text-sm font-medium outline-none lg:min-w-44"
                >
                  {monthOptions.map(month => <option key={month.offset} value={month.offset}>{month.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
              </div>

              <button
                ref={categoryButtonRef}
                type="button"
                aria-expanded={showFilters}
                aria-controls="event-category-filters"
                onClick={() => setShowFilters(value => !value)}
                className="public-action public-action-secondary gap-2 px-3 text-sm font-medium"
              >
                <Filter className="h-4 w-4 shrink-0" />
                Categories
                {activeFiltersCount > 0 && <span className="rounded-md px-1.5 text-xs" style={{ backgroundColor: 'var(--accent-green-light)', color: 'var(--accent-green)' }}>{activeFiltersCount}</span>}
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              <div role="group" aria-label="Event view" className="col-span-2 flex rounded-xl border p-0.5 lg:col-span-1"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                {[
                  { key: 'grid', label: 'Grid', Icon: Grid },
                  { key: 'calendar', label: 'Calendar', Icon: CalendarDays },
                ].map(({ key, label, Icon }) => (
                  <button key={key} type="button" aria-pressed={viewMode === key} onClick={() => setViewMode(key)}
                    className="public-action min-h-11 flex-1 gap-2 px-3 text-sm font-medium transition-colors"
                    style={{
                      minHeight: '2.75rem',
                      backgroundColor: viewMode === key ? 'var(--text-primary)' : 'transparent',
                      color: viewMode === key ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    }}>
                    <Icon className="h-4 w-4" />{label}
                  </button>
                ))}
              </div>
            </div>

            {showFilters && (
              <fieldset id="event-category-filters" className="mt-4 rounded-xl border px-4 pb-4"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setShowFilters(false);
                    categoryButtonRef.current?.focus();
                  }
                }}>
                <legend className="px-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Event categories</legend>
                <p className="mb-2 mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Choose any that interest you. Results update automatically.</p>
                <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                  {categories.map(category => (
                    <label key={category.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                      <input type="checkbox" checked={filters.categories.includes(category.id)} onChange={() => toggleCategoryFilter(category.id)}
                        className="h-4 w-4 rounded accent-[var(--accent-green)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-green)]" />
                      {category.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {(activeFiltersCount > 0 || searchTerm || selectedMonthOffset !== 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active event filters">
                {categories.filter(category => filters.categories.includes(category.id)).map(category => (
                  <button key={category.id} type="button" onClick={() => toggleCategoryFilter(category.id)} aria-label={`Remove ${category.label} filter`}
                    className="public-action public-action-secondary gap-2 px-3 text-xs font-medium">
                    {category.label}<X className="h-3.5 w-3.5" />
                  </button>
                ))}
                <button type="button" onClick={clearAllFilters} className="public-action px-3 text-sm font-medium underline underline-offset-4" style={{ color: 'var(--text-secondary)' }}>
                  Reset filters
                </button>
              </div>
            )}
          </div>

          <div>
            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Showing {filteredEvents.length ? startIndex + 1 : 0}-{Math.min(endIndex, filteredEvents.length)} of {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
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
                <div className="py-24">
                  <LoadingSpinner size="lg" text="Loading events…" />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
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


    </>
  );
};

export default function EventsPageClient(props) {
  return <EventsPage {...props} />;
}
