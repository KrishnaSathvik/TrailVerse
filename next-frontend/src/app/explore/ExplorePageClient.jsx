"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef, memo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Search, X, MapPin, Star, ArrowRight,
  Loader2, SlidersHorizontal, Grid, List, Compass,
  ChevronLeft, ChevronRight, ChevronDown
} from '@components/icons';
import OptimizedImage from '@/components/common/OptimizedImage';
import LoadingScreen from '@/components/common/LoadingScreen';
import { useAuth } from '@/context/AuthContext';
import { useParks, useAllParks } from '@/hooks/useParks';
import { useParkRatings } from '@/hooks/useParkRatings';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchPrefetch } from '@/hooks/useSmartPrefetch';
import STATE_NAMES from '@/utils/stateNames';

const ExploreContent = ({ initialPaginatedData }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const searchParams = useSearchParams();
  const { data: parkRatings, isLoading: ratingsLoading, error: ratingsError } = useParkRatings();
  const { handleSearch } = useSearchPrefetch();

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const hasMounted = useRef(false);
  const lastAppliedUrlSearch = useRef(null);
  const prevFiltersRef = useRef({
    search: '',
    npOnly: true,
    statesLen: 0,
    actsLen: 0,
  });

  const [currentPage, setCurrentPage] = useState(() => {
    const pageParam = searchParams.get('page');
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    return page > 0 ? page : 1;
  });

  // Responsive parks per page: initialize from window on client to avoid query key mismatch on back navigation
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const parksPerPage = isMobile ? 6 : 12;

  const [filters, setFilters] = useState({
    nationalParksOnly: true,
    states: [],
    activities: []
  });

  const hasActiveFilters = searchTerm || filters.states.length > 0 || filters.activities.length > 0;
  const activityFiltersActive = filters.activities.length > 0;
  const needsAllParks = !filters.nationalParksOnly || hasActiveFilters || sortBy === 'state';

  const { data: paginatedData, isLoading: paginatedLoading, isPending: paginatedPending, error: paginatedError } = useParks(
    currentPage,
    parksPerPage,
    filters.nationalParksOnly,
    currentPage === 1 && parksPerPage === 12 && filters.nationalParksOnly ? initialPaginatedData : undefined
  );
  const { data: allParksData, isLoading: allParksLoading, isPending: allParksPending, error: allParksError } = useAllParks();
  const {
    data: allParksWithActivitiesData,
    isLoading: allParksWithActivitiesLoading,
    isPending: allParksWithActivitiesPending,
    error: allParksWithActivitiesError
  } = useAllParks(null, true, activityFiltersActive);

  const activeAllParksData = activityFiltersActive ? allParksWithActivitiesData : allParksData;
  const activeAllParksLoading = activityFiltersActive
    ? (allParksWithActivitiesLoading || allParksWithActivitiesPending)
    : (allParksLoading || allParksPending);
  const activeAllParksError = activityFiltersActive ? allParksWithActivitiesError : allParksError;

  // In React Query v5, isLoading = isPending && isFetching (only true on first load with no cache).
  // Use isPending as fallback to catch cases where cache is empty but fetch hasn't started yet.
  const isLoading = needsAllParks ? activeAllParksLoading : (paginatedLoading || paginatedPending);
  const error = needsAllParks ? activeAllParksError : paginatedError;
  const allParks = needsAllParks ? activeAllParksData?.data : paginatedData?.data;
  const totalParks = needsAllParks ? activeAllParksData?.total : paginatedData?.total;
  const totalPages = needsAllParks ? null : paginatedData?.pages;

  const hasFullParksData = Array.isArray(allParksData?.data) && allParksData.data.length > 0;

  useEffect(() => {
    hasMounted.current = true;
  }, []);

  // Update isMobile on resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam === 'national-parks') {
      setFilters(prev => ({ ...prev, nationalParksOnly: true }));
    }
  }, [searchParams]);

  useEffect(() => {
    const urlSearch = searchParams.get('search');
    if (urlSearch === lastAppliedUrlSearch.current) return;

    lastAppliedUrlSearch.current = urlSearch;

    if (typeof urlSearch === 'string') {
      setSearchTerm(urlSearch);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSortDropdown && !event.target.closest('.sort-dropdown-container')) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showSortDropdown]);

  const normalizedSearchTerm = searchTerm.trim();
  const debouncedSearchTerm = useDebounce(normalizedSearchTerm, 300);

  useEffect(() => {
    if (debouncedSearchTerm && debouncedSearchTerm.length > 2) {
      handleSearch(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm, handleSearch]);

  const uniqueStates = useMemo(() => {
    const parksForStates = allParksData?.data || [];
    if (!Array.isArray(parksForStates)) return [];
    const states = new Set();
    parksForStates.forEach(park => {
      if (park && park.states) {
        park.states.split(',').forEach(state => states.add(state.trim()));
      }
    });
    return Array.from(states).sort((a, b) =>
      (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b)
    );
  }, [allParksData]);

  const popularActivities = [
    'Hiking', 'Camping', 'Wildlife Watching', 'Photography',
    'Fishing', 'Boating', 'Biking', 'Climbing', 'Stargazing'
  ];

  const filteredParks = useMemo(() => {
    if (!allParks || !Array.isArray(allParks)) return [];
    let result = [...allParks];

    if (normalizedSearchTerm) {
      const searchLower = normalizedSearchTerm.toLowerCase();
      const scoredMatches = result
        .map((park) => {
          const parkStates = park.states ? park.states.split(',').map(s => s.trim().toLowerCase()) : [];
          const stateCode = Object.entries(STATE_NAMES).find(
            ([, name]) => name.toLowerCase() === searchLower
          )?.[0]?.toLowerCase();
          const searchTerms = [searchLower];
          if (stateCode) searchTerms.push(stateCode);
          const fullName = park.fullName?.toLowerCase() || '';
          const description = park.description?.toLowerCase() || '';
          const parkCode = park.parkCode?.toLowerCase() || '';

          let score = 0;
          let directMatch = false;

          if (fullName.startsWith(searchLower)) {
            score += 120;
            directMatch = true;
          } else if (fullName.includes(searchLower)) {
            score += 90;
            directMatch = true;
          }

          if (parkCode === searchLower) {
            score += 80;
            directMatch = true;
          } else if (parkCode.includes(searchLower)) {
            score += 50;
            directMatch = true;
          }

          if (parkStates.some((state) => searchTerms.some((term) => state === term))) {
            score += 70;
            directMatch = true;
          } else if (parkStates.some((state) => searchTerms.some((term) => state.includes(term)))) {
            score += 45;
            directMatch = true;
          }

          if (description.includes(searchLower)) score += 15;

          return { park, score, directMatch, descriptionMatch: description.includes(searchLower) };
        })
        .filter(({ score }) => score > 0);

      const hasDirectMatches = scoredMatches.some(({ directMatch }) => directMatch);

      result = scoredMatches
        .filter(({ directMatch, descriptionMatch }) => {
          if (!hasDirectMatches) return directMatch || descriptionMatch;
          return directMatch;
        })
        .sort((a, b) => b.score - a.score || a.park.fullName.localeCompare(b.park.fullName))
        .map(({ park }) => park);
    }

    if (filters.states.length > 0) {
      const stateFiltered = result.filter(park => {
        const parkStates = park.states ? park.states.split(',').map(s => s.trim()) : [];
        return filters.states.some(state => parkStates.includes(state));
      });

      if (filters.nationalParksOnly) {
        const nationalOnly = stateFiltered.filter(park =>
          park.designation && park.designation.toLowerCase().includes('national park')
        );
        // Fall back to all sites in selected states if no national parks exist there
        result = nationalOnly.length > 0 ? nationalOnly : stateFiltered;
      } else {
        result = stateFiltered;
      }
    } else if (filters.nationalParksOnly) {
      result = result.filter(park =>
        park.designation && park.designation.toLowerCase().includes('national park')
      );
    }

    if (filters.activities.length > 0) {
      result = result.filter(park =>
        filters.activities.some(activity =>
          park.activities?.some(a => a.name?.toLowerCase() === activity.toLowerCase())
        )
      );
    }

    return result;
  }, [allParks, normalizedSearchTerm, filters]);

  const calculatedTotalPages = needsAllParks ? Math.ceil(filteredParks.length / parksPerPage) : (totalPages || 1);
  const startIndex = (currentPage - 1) * parksPerPage;
  const endIndex = startIndex + parksPerPage;

  const currentParks = useMemo(() => {
    let parks;
    if (needsAllParks) {
      let sortedParks = [...filteredParks];
      if (normalizedSearchTerm) {
        parks = sortedParks.slice(startIndex, endIndex);
        return parks;
      }
      if (sortBy === 'name') {
        sortedParks.sort((a, b) => a.fullName.localeCompare(b.fullName));
      } else if (sortBy === 'state') {
        sortedParks.sort((a, b) => a.states.localeCompare(b.states));
      }
      parks = sortedParks.slice(startIndex, endIndex);
    } else {
      parks = [...(allParks || [])];
      if (sortBy === 'name') {
        parks.sort((a, b) => a.fullName.localeCompare(b.fullName));
      }
    }
    return parks;
  }, [needsAllParks, filteredParks, startIndex, endIndex, allParks, sortBy, normalizedSearchTerm]);

  // Reset page when filters change
  useEffect(() => {
    const prev = prevFiltersRef.current;
    const changed =
      prev.search !== normalizedSearchTerm ||
      prev.npOnly !== filters.nationalParksOnly ||
      prev.statesLen !== filters.states.length ||
      prev.actsLen !== filters.activities.length;

    if (hasMounted.current && changed) {
      setCurrentPage(1);
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.set('page', '1');
      router.replace(`${pathname}?${newSearchParams.toString()}`, { scroll: false });
    }

    prevFiltersRef.current = {
      search: normalizedSearchTerm,
      npOnly: filters.nationalParksOnly,
      statesLen: filters.states.length,
      actsLen: filters.activities.length,
    };
  }, [normalizedSearchTerm, filters.nationalParksOnly, filters.states.length, filters.activities.length, pathname, router, searchParams]);

  // Handle page reset when switching between server/client pagination
  useEffect(() => {
    if (needsAllParks && currentPage > 1) {
      const maxPages = Math.ceil(filteredParks.length / parksPerPage);
      if (currentPage > maxPages) {
        setCurrentPage(1);
        const newSearchParams = new URLSearchParams(searchParams.toString());
        newSearchParams.set('page', '1');
        router.replace(`${pathname}?${newSearchParams.toString()}`, { scroll: false });
      }
    }
  }, [needsAllParks, filteredParks.length, currentPage]);

  const goToPage = useCallback((page) => {
    setCurrentPage(page);
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.set('page', page.toString());
    router.replace(`${pathname}?${newSearchParams.toString()}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchParams, router, pathname]);

  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    if (currentPage < calculatedTotalPages) goToPage(currentPage + 1);
  }, [currentPage, calculatedTotalPages, goToPage]);

  const toggleStateFilter = useCallback((state) => {
    setFilters(prev => ({
      ...prev,
      states: prev.states.includes(state)
        ? prev.states.filter(s => s !== state)
        : [...prev.states, state]
    }));
  }, []);

  const toggleActivityFilter = useCallback((activity) => {
    setFilters(prev => ({
      ...prev,
      activities: prev.activities.includes(activity)
        ? prev.activities.filter(a => a !== activity)
        : [...prev.activities, activity]
    }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({ nationalParksOnly: true, states: [], activities: [] });
    setSearchTerm('');
  }, []);

  const activeFiltersCount =
    filters.states.length +
    filters.activities.length;

  const nationalParksCount = useMemo(() => {
    const parksToCount = allParksData?.data || [];
    if (!Array.isArray(parksToCount)) return 0;
    return parksToCount.filter(park =>
      (park.designation && park.designation.toLowerCase().includes('national park')) ||
      (park.fullName && park.fullName.toLowerCase().includes('national park'))
    ).length;
  }, [allParksData]);

  const displayedNationalParksCount = nationalParksCount || (filters.nationalParksOnly ? (paginatedData?.total || 0) : 0);
  const displayedParksAndSitesCount = allParksData?.data?.length || totalParks || 0;
  const statesLabelCount = hasFullParksData ? uniqueStates.length : null;

  return (
    <>
      {/* Hero/Search Section */}
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
              <Compass className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Discover Parks
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Explore National Parks
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Discover {filters.nationalParksOnly ? `${displayedNationalParksCount} national parks` : `${displayedParksAndSitesCount} parks and sites`} across America.
              Find your next adventure with real-time weather, reviews, and smart recommendations.
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
                placeholder="Search parks by name, state, or description..."
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
          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>
                Showing {filteredParks.length > 0 ? startIndex + 1 : 0}-{Math.min(endIndex, filteredParks.length)} of {filteredParks.length} parks
              </span>
            </div>
            {calculatedTotalPages > 1 && (
              <div className="flex items-center gap-2">
                <span>Page {currentPage} of {calculatedTotalPages}</span>
              </div>
            )}
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-white/5 transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <X className="h-3 w-3" />
                <span>Clear {activeFiltersCount} filter{activeFiltersCount !== 1 ? 's' : ''}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Filters - Desktop */}
            <aside className="hidden lg:block lg:w-80 flex-shrink-0">
              <div className="sticky top-24 rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="mb-6">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Filters</h3>
                </div>

                <div className="mb-6">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={filters.nationalParksOnly}
                      onChange={(e) => setFilters({ ...filters, nationalParksOnly: e.target.checked })}
                      className="rounded border-2 w-5 h-5 text-forest-500 focus:ring-forest-500/50 transition"
                      style={{ borderColor: 'var(--border)' }}
                    />
                    <span className="text-sm font-medium group-hover:text-forest-400 transition"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      National Parks Only ({displayedNationalParksCount})
                    </span>
                  </label>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    States {statesLabelCount === null ? '' : `(${statesLabelCount})`}
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {!hasFullParksData && (
                      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading states...</p>
                    )}
                    {hasFullParksData && uniqueStates.map(state => (
                      <label key={state} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={filters.states.includes(state)}
                          onChange={() => toggleStateFilter(state)}
                          className="rounded border-2 w-4 h-4 text-forest-500 focus:ring-forest-500/50"
                          style={{ borderColor: 'var(--border)' }}
                        />
                        <span className="text-sm group-hover:text-forest-400 transition" style={{ color: 'var(--text-secondary)' }}>
                          {STATE_NAMES[state] || state}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Activities</h4>
                  <div className="flex flex-wrap gap-2">
                    {popularActivities.map(activity => (
                      <button
                        key={activity}
                        onClick={() => toggleActivityFilter(activity)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                          filters.activities.includes(activity) ? '' : 'ring-1 hover:bg-white/5'
                        }`}
                        style={
                          filters.activities.includes(activity)
                            ? {
                                backgroundColor: 'var(--surface-active)',
                                borderWidth: '1px',
                                borderColor: 'var(--border-hover)',
                                color: 'var(--text-primary)'
                              }
                            : {
                                backgroundColor: 'var(--surface)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-secondary)'
                              }
                        }
                      >
                        {activity}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowFilters(true)}
                    className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition"
                    style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="text-sm">Filters</span>
                    {activeFiltersCount > 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-forest-500 text-white">{activeFiltersCount}</span>
                    )}
                  </button>

                  <div className="relative sort-dropdown-container">
                    <button
                      onClick={() => setShowSortDropdown(!showSortDropdown)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium outline-none transition backdrop-blur"
                      style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      <span>{sortBy === 'name' ? 'Sort by Name' : 'Sort by State'}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
                    </button>

                    {showSortDropdown && (
                      <div className="absolute top-full left-0 mt-2 min-w-[180px] z-50 rounded-xl overflow-hidden backdrop-blur-xl"
                        style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2)' }}
                      >
                        <button onClick={() => { setSortBy('name'); setShowSortDropdown(false); }}
                          className="w-full px-4 py-2.5 text-left text-sm font-medium transition-colors"
                          style={{ backgroundColor: sortBy === 'name' ? 'var(--surface-active)' : 'transparent', color: sortBy === 'name' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                        >Sort by Name</button>
                        <button onClick={() => { setSortBy('state'); setShowSortDropdown(false); }}
                          className="w-full px-4 py-2.5 text-left text-sm font-medium transition-colors"
                          style={{ backgroundColor: sortBy === 'state' ? 'var(--surface-active)' : 'transparent', color: sortBy === 'state' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                        >Sort by State</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2">
                  {[
                    { key: 'grid', label: 'Grid', Icon: Grid },
                    { key: 'list', label: 'List', Icon: List },
                  ].map(({ key, label, Icon }) => {
                    const isActive = viewMode === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setViewMode(key)}
                        className="inline-flex min-w-[96px] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200"
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

              {isLoading && (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-forest-500" />
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading parks...</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-center py-24">
                  <p className="text-lg" style={{ color: 'var(--text-primary)' }}>Failed to load parks</p>
                  <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Please try again later</p>
                </div>
              )}

              {!isLoading && !error && filteredParks.length === 0 && (
                <div className="text-center py-24">
                  <Compass className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No parks found</p>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Try adjusting your search or filters</p>
                  <button
                    onClick={clearAllFilters}
                    className="px-6 py-3 rounded-full font-semibold transition"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    Clear Filters
                  </button>
                </div>
              )}

              {!isLoading && !error && filteredParks.length > 0 && (
                <>
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6' : 'space-y-4'}>
                    {currentParks.map((park, index) => (
                      <ParkCard key={park.parkCode} park={park} viewMode={viewMode} rating={parkRatings?.[park.parkCode]} index={index} />
                    ))}
                  </div>

                  {calculatedTotalPages > 1 && (
                    <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Showing {startIndex + 1}-{Math.min(endIndex, filteredParks.length)} of {filteredParks.length} parks
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={goToPreviousPage} disabled={currentPage === 1}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: currentPage === 1 ? 'transparent' : 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        >
                          <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span>
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: calculatedTotalPages }, (_, i) => i + 1).map((page) => {
                            if (page === 1 || page === calculatedTotalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                              return (
                                <button key={page} onClick={() => goToPage(page)}
                                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${page === currentPage ? 'ring-2' : 'hover:bg-white/5'}`}
                                  style={{ backgroundColor: page === currentPage ? 'var(--surface-active)' : 'var(--surface)', borderWidth: '1px', borderColor: page === currentPage ? 'var(--border-hover)' : 'var(--border)', color: 'var(--text-primary)' }}
                                >{page}</button>
                              );
                            } else if (page === currentPage - 2 || page === currentPage + 2) {
                              return <span key={page} className="px-2 py-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>...</span>;
                            }
                            return null;
                          })}
                        </div>
                        <button onClick={goToNextPage} disabled={currentPage === calculatedTotalPages}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: currentPage === calculatedTotalPages ? 'transparent' : 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        >
                          <span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile Filters Modal */}
      {showFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', borderTopWidth: '1px', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Filters</h3>
              <button onClick={() => setShowFilters(false)} className="p-2 rounded-lg hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={filters.nationalParksOnly} onChange={(e) => setFilters({ ...filters, nationalParksOnly: e.target.checked })}
                  className="rounded border-2 w-5 h-5 text-forest-500 focus:ring-forest-500/50" style={{ borderColor: 'var(--border)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  National Parks Only ({displayedNationalParksCount})
                </span>
              </label>
              <div>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
                  STATES {statesLabelCount === null ? '' : `(${statesLabelCount})`}
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {!hasFullParksData && (
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading states...</p>
                  )}
                  {hasFullParksData && uniqueStates.map(state => (
                    <label key={state} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={filters.states.includes(state)} onChange={() => toggleStateFilter(state)}
                        className="rounded border-2 w-4 h-4 text-forest-500 focus:ring-forest-500/50" style={{ borderColor: 'var(--border)' }} />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{STATE_NAMES[state] || state}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>ACTIVITIES</h4>
                <div className="flex flex-wrap gap-2">
                  {popularActivities.map(activity => (
                    <button
                      key={activity}
                      onClick={() => toggleActivityFilter(activity)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${filters.activities.includes(activity) ? '' : 'ring-1 hover:bg-white/5'}`}
                      style={
                        filters.activities.includes(activity)
                          ? {
                              backgroundColor: 'var(--bg-secondary)',
                              borderWidth: '1px',
                              borderColor: 'var(--border)',
                              color: 'var(--text-primary)'
                            }
                          : {
                              backgroundColor: 'var(--surface)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-secondary)'
                            }
                      }
                    >{activity}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={clearAllFilters} className="flex-1 py-3 rounded-xl font-semibold transition"
                style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>Clear All</button>
              <button
                onClick={() => setShowFilters(false)}
                className="flex-1 py-3 rounded-xl font-semibold transition"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

const ParkCard = memo(({ park, viewMode, rating, index = 0 }) => {
  if (viewMode === 'list') {
    return (
      <Link href={`/parks/${park.parkCode}`}
        className="group flex gap-6 p-6 rounded-2xl backdrop-blur hover:-translate-y-1 transition-all duration-300"
        style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', boxShadow: 'var(--shadow)' }}
      >
        <div className="w-48 h-32 flex-shrink-0 rounded-xl overflow-hidden">
          <OptimizedImage src={park.images[0]?.url} alt={park.fullName} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h3 className="text-xl font-bold group-hover:text-forest-500 transition" style={{ color: 'var(--text-primary)' }}>{park.fullName}</h3>
            <ArrowRight className="h-5 w-5 flex-shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" style={{ color: 'var(--text-primary)' }} />
          </div>
          <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--text-secondary)' }}>{park.description}</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
              <MapPin className="h-4 w-4" /><span className="text-sm">{park.states}</span>
            </div>
            {rating && rating.totalReviews > 0 ? (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{rating.averageRating.toFixed(1)}</span>
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>({rating.totalReviews})</span>
              </div>
            ) : null}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/parks/${park.parkCode}`}
      className="group rounded-2xl overflow-hidden backdrop-blur hover:-translate-y-1 transition-all duration-300"
      style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', boxShadow: 'var(--shadow)' }}
    >
      <div className="relative h-56 overflow-hidden">
        <OptimizedImage src={park.images[0]?.url} alt={park.fullName} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur"
          style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >{park.states}</div>
      </div>
      <div className="p-6">
        <h3 className="text-xl font-bold mb-2 line-clamp-2 group-hover:text-forest-500 transition" style={{ color: 'var(--text-primary)' }}>{park.fullName}</h3>
        <p className="text-sm line-clamp-3 mb-4" style={{ color: 'var(--text-secondary)' }}>{park.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            <MapPin className="h-4 w-4" /><span className="text-sm">{park.states}</span>
          </div>
          {rating && rating.totalReviews > 0 ? (
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{rating.averageRating.toFixed(1)}</span>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>({rating.totalReviews})</span>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
});

ParkCard.displayName = 'ParkCard';

export default function ExplorePage({ initialPaginatedData }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ExploreContent initialPaginatedData={initialPaginatedData} />
    </Suspense>
  );
}
