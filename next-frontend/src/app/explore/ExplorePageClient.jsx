"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Search, X, MapPin, ArrowRight, Info,
  SlidersHorizontal, Grid, List, Compass,
  ChevronLeft, ChevronRight, ChevronDown
} from '@components/icons';
import { exploreNationalParksFilterHint, exploreSeoSubtitle } from '@/lib/exploreSeoCopy';
import ParkCard from '@/components/explore/ParkCard';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import { useAuth } from '@/context/AuthContext';
import { getExploreMobilePlanCta } from '@/lib/planAiWelcomeCopy';
import { BROWSE_HUB_CTA_LABEL, BROWSE_HUB_PATH } from '@/lib/browseHub';
import { useParks, useAllParksLite } from '@/hooks/useParks';
import { useParkRatings } from '@/hooks/useParkRatings';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchPrefetch } from '@/hooks/useSmartPrefetch';
import { logSearch, logSearchResultClick, logEvent } from '@/utils/analytics';
import npsApi from '@/services/npsApi';
import { saveParkSearchSession } from '@/lib/parkSearchSession';
import { parkToSlug } from '@/utils/parkSlug';
import { useReturnPath } from '@/hooks/useReturnPath';
import STATE_NAMES from '@/utils/stateNames';

function NationalParksFilterHint({ allSitesCount }) {
  const hint = exploreNationalParksFilterHint(allSitesCount);

  return (
    <p
      className="mt-2 flex items-start gap-2 text-xs leading-relaxed"
      style={{ color: 'var(--text-tertiary)' }}
      title={hint}
    >
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{hint}</span>
    </p>
  );
}

const ExploreContent = ({ initialPaginatedData, initialAllParksData }) => {
  const pathname = usePathname();
  const router = useRouter();
  const returnPath = useReturnPath();
  const { isAuthenticated, user } = useAuth();
  const searchParams = useSearchParams();
  const { data: parkRatings, isLoading: ratingsLoading, error: ratingsError } = useParkRatings();
  const { handleSearch } = useSearchPrefetch();

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showStateFilter, setShowStateFilter] = useState(false);

  const hasMounted = useRef(false);
  const lastAppliedUrlSearch = useRef(null);
  const prevFiltersRef = useRef({
    search: '',
    npOnly: true,
    statesLen: 0,
  });

  const [currentPage, setCurrentPage] = useState(() => {
    const pageParam = searchParams.get('page');
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    return page > 0 ? page : 1;
  });

  const [parksPerPage, setParksPerPage] = useState(12);

  const [filters, setFilters] = useState({
    nationalParksOnly: true,
    states: []
  });

  const hasActiveFilters = searchTerm || filters.states.length > 0;
  const needsAllParks = !filters.nationalParksOnly || hasActiveFilters || sortBy === 'state';

  const { data: paginatedData, isPending: paginatedPending, error: paginatedError } = useParks(
    currentPage,
    parksPerPage,
    filters.nationalParksOnly,
    currentPage === 1 && filters.nationalParksOnly ? initialPaginatedData : undefined
  );
  const { data: allParksData, isPending: allParksPending, error: allParksError } = useAllParksLite(
    true,
    true,
    initialAllParksData
  );

  useEffect(() => {
    hasMounted.current = true;
  }, []);

  useEffect(() => {
    const updateParksPerPage = () => {
      setParksPerPage(window.innerWidth >= 1280 ? 16 : 12);
    };
    updateParksPerPage();
    window.addEventListener('resize', updateParksPerPage);
    return () => window.removeEventListener('resize', updateParksPerPage);
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
      if (showStateFilter && !event.target.closest('.state-filter-container')) {
        setShowStateFilter(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showSortDropdown, showStateFilter]);

  const normalizedSearchTerm = searchTerm.trim();
  const debouncedSearchTerm = useDebounce(normalizedSearchTerm, 300);
  const [catalogSearchParks, setCatalogSearchParks] = useState(null);
  const [catalogSearchId, setCatalogSearchId] = useState(null);
  const [catalogSearchLoading, setCatalogSearchLoading] = useState(false);

  const hasPaginatedParks = Array.isArray(paginatedData?.data) && paginatedData.data.length > 0;
  const showParksLoading = normalizedSearchTerm
    ? catalogSearchLoading
    : needsAllParks
      ? allParksPending && !Array.isArray(allParksData?.data)
      : paginatedPending && !hasPaginatedParks;
  const error = needsAllParks ? allParksError : paginatedError;
  const allParks = needsAllParks ? allParksData?.data : paginatedData?.data;
  const totalParks = needsAllParks ? allParksData?.total : paginatedData?.total;
  const totalPages = needsAllParks ? null : paginatedData?.pages;

  const hasFullParksData = Array.isArray(allParksData?.data) && allParksData.data.length > 0;

  useEffect(() => {
    if (!debouncedSearchTerm || debouncedSearchTerm.length < 2) {
      setCatalogSearchParks(null);
      setCatalogSearchId(null);
      setCatalogSearchLoading(false);
      return;
    }

    let cancelled = false;
    setCatalogSearchLoading(true);
    setCatalogSearchParks(null);
    handleSearch(debouncedSearchTerm);

    const stateFilter =
      filters.states.length === 1 ? filters.states[0] : null;

    npsApi
      .searchParks(debouncedSearchTerm, stateFilter, 120)
      .then(({ parks, count, searchId }) => {
        if (cancelled) return;
        setCatalogSearchParks(parks);
        setCatalogSearchId(searchId);
        saveParkSearchSession({
          searchTerm: debouncedSearchTerm,
          searchId,
          resultCount: count,
          surface: 'explore',
        });
        logSearch(debouncedSearchTerm, count, 'parks', { searchId });
      })
      .catch(() => {
        if (!cancelled) setCatalogSearchParks([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchTerm, handleSearch, filters.states]);

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

  const filteredParks = useMemo(() => {
    let result;
    const isSearching = Boolean(normalizedSearchTerm);

    if (isSearching) {
      if (catalogSearchParks === null) return [];
      result = [...catalogSearchParks];
    } else {
      if (!allParks || !Array.isArray(allParks)) return [];
      result = [...allParks];
    }

    if (filters.states.length > 0) {
      const stateFiltered = result.filter(park => {
        const parkStates = park.states ? park.states.split(',').map(s => s.trim()) : [];
        return filters.states.some(state => parkStates.includes(state));
      });

      if (filters.nationalParksOnly && !isSearching) {
        const nationalOnly = stateFiltered.filter(park =>
          park.designation && park.designation.toLowerCase().includes('national park')
        );
        // Fall back to all sites in selected states if no national parks exist there
        result = nationalOnly.length > 0 ? nationalOnly : stateFiltered;
      } else {
        result = stateFiltered;
      }
    } else if (filters.nationalParksOnly && !isSearching) {
      result = result.filter(park =>
        park.designation && park.designation.toLowerCase().includes('national park')
      );
    }

    return result;
  }, [allParks, normalizedSearchTerm, filters, catalogSearchParks]);

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
      prev.statesLen !== filters.states.length;

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
    };
  }, [normalizedSearchTerm, filters.nationalParksOnly, filters.states.length, pathname, router, searchParams]);

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

  const clearAllFilters = useCallback(() => {
    setFilters({ nationalParksOnly: true, states: [] });
    setSearchTerm('');
  }, []);

  const activeFiltersCount = filters.states.length;

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

  const resultsTotal = needsAllParks ? filteredParks.length : (totalParks || filteredParks.length);
  const resultsRangeStart = resultsTotal > 0
    ? (needsAllParks ? startIndex + 1 : (currentPage - 1) * parksPerPage + 1)
    : 0;
  const resultsRangeEnd = needsAllParks
    ? Math.min(endIndex, filteredParks.length)
    : Math.min(currentPage * parksPerPage, resultsTotal);

  const mobilePlanCta = useMemo(
    () => getExploreMobilePlanCta({
      user,
      isAuthenticated,
      searchTerm,
      stateCodes: filters.states,
    }),
    [user, isAuthenticated, searchTerm, filters.states]
  );

  useEffect(() => {
    const subtitle = document.querySelector('#explore-page-hero p');
    if (!subtitle) return;
    subtitle.textContent = exploreSeoSubtitle({
      nationalParksOnly: filters.nationalParksOnly,
      nationalParksCount: displayedNationalParksCount,
      totalSitesCount: displayedParksAndSitesCount,
    });
  }, [filters.nationalParksOnly, displayedNationalParksCount, displayedParksAndSitesCount]);

  return (
    <>
      {/* Search & filters — page title/intro is server-rendered in ExploreSeoShell */}
      <section className="relative overflow-hidden py-4 sm:py-10">
        <div className="relative z-10 max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          {/* Search Bar */}
          <div className="max-w-3xl">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search parks by name, state, or description..."
                className="w-full pl-12 pr-12 py-4 sm:pl-14 sm:pr-14 sm:py-5 rounded-2xl text-base font-medium outline-none transition"
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

          {/* Quick stats — mobile/tablet (desktop uses unified toolbar below) */}
          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm lg:hidden" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>
                Showing {resultsRangeStart}-{resultsRangeEnd} of {resultsTotal} parks
              </span>
            </div>
            {calculatedTotalPages > 1 && (
              <div className="flex items-center gap-2">
                <span>Page {currentPage} of {calculatedTotalPages}</span>
              </div>
            )}
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-white/5 transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
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
          {/* Mobile toolbar — original layout */}
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition"
                style={{ backgroundColor: 'var(--bg-secondary)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="text-sm">Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-forest-500 text-white">{activeFiltersCount}</span>
                )}
              </button>

              <div className="relative sort-dropdown-container">
                <button
                  type="button"
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium outline-none transition"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <span>{sortBy === 'name' ? 'Sort by Name' : 'Sort by State'}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
                </button>

                {showSortDropdown && (
                  <div
                    className="absolute top-full left-0 z-50 mt-2 min-w-[180px] overflow-hidden rounded-xl shadow-xl"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderWidth: '1px', borderColor: 'var(--border)' }}
                  >
                    <button
                      type="button"
                      onClick={() => { setSortBy('name'); setShowSortDropdown(false); }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium transition-colors"
                      style={{ backgroundColor: sortBy === 'name' ? 'var(--bg-tertiary)' : 'transparent', color: sortBy === 'name' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      Sort by Name
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSortBy('state'); setShowSortDropdown(false); }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium transition-colors"
                      style={{ backgroundColor: sortBy === 'state' ? 'var(--bg-tertiary)' : 'transparent', color: sortBy === 'state' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      Sort by State
                    </button>
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
                      backgroundColor: 'var(--bg-secondary)',
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

          {/* Desktop unified toolbar */}
          <div
            className="mb-6 hidden rounded-2xl p-3 sm:p-4 lg:block"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
            }}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, nationalParksOnly: !prev.nationalParksOnly }))}
                  className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition lg:inline-flex"
                  style={{
                    backgroundColor: filters.nationalParksOnly ? 'var(--surface-active)' : 'var(--bg-primary)',
                    borderWidth: '1px',
                    borderColor: filters.nationalParksOnly ? 'var(--border-hover)' : 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  aria-pressed={filters.nationalParksOnly}
                >
                  National Parks
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {displayedNationalParksCount}
                  </span>
                </button>

                <div className="relative state-filter-container hidden lg:block">
                  <button
                    type="button"
                    onClick={() => setShowStateFilter((open) => !open)}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
                    style={{
                      backgroundColor: filters.states.length > 0 ? 'var(--accent-green-light)' : 'var(--bg-primary)',
                      borderWidth: '1px',
                      borderColor: filters.states.length > 0 ? 'var(--accent-green)' : 'var(--border)',
                      color: filters.states.length > 0 ? 'var(--accent-green)' : 'var(--text-primary)',
                    }}
                    aria-expanded={showStateFilter}
                  >
                    States
                    {filters.states.length > 0 && (
                      <span className="rounded-full bg-forest-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {filters.states.length}
                      </span>
                    )}
                    <ChevronDown className={`h-4 w-4 transition-transform ${showStateFilter ? 'rotate-180' : ''}`} />
                  </button>

                  {showStateFilter && (
                    <div
                      className="absolute left-0 top-full z-50 mt-2 max-h-72 w-72 overflow-y-auto rounded-2xl p-3 shadow-xl"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                      }}
                    >
                      {!hasFullParksData && (
                        <p className="px-2 py-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading states...</p>
                      )}
                      {hasFullParksData && uniqueStates.map((state) => (
                        <label
                          key={state}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          <input
                            type="checkbox"
                            checked={filters.states.includes(state)}
                            onChange={() => toggleStateFilter(state)}
                            className="h-4 w-4 rounded border-2 text-forest-500 focus:ring-forest-500/50"
                            style={{ borderColor: 'var(--border)' }}
                          />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {STATE_NAMES[state] || state}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <Link
                  href={BROWSE_HUB_PATH}
                  className="hidden text-sm font-medium hover:opacity-90 lg:inline-flex"
                  style={{ color: 'var(--accent-green)' }}
                >
                  {BROWSE_HUB_CTA_LABEL} →
                </Link>
              </div>

              <p
                className="hidden shrink-0 text-center text-sm tabular-nums lg:block lg:flex-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {resultsRangeStart}–{resultsRangeEnd} of {resultsTotal} parks
                {calculatedTotalPages > 1 ? ` · Page ${currentPage} of ${calculatedTotalPages}` : ''}
              </p>

              <div className="flex items-center justify-between gap-2 sm:justify-end lg:shrink-0">
                <div className="relative sort-dropdown-container">
                  <button
                    type="button"
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span className="hidden sm:inline">{sortBy === 'name' ? 'Sort by Name' : 'Sort by State'}</span>
                    <span className="sm:hidden">Sort</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                  </button>

                  {showSortDropdown && (
                    <div
                      className="absolute right-0 top-full z-50 mt-2 min-w-[180px] overflow-hidden rounded-xl shadow-xl"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => { setSortBy('name'); setShowSortDropdown(false); }}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: sortBy === 'name' ? 'var(--bg-tertiary)' : 'transparent',
                          color: sortBy === 'name' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        Sort by Name
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSortBy('state'); setShowSortDropdown(false); }}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: sortBy === 'state' ? 'var(--bg-tertiary)' : 'transparent',
                          color: sortBy === 'state' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        Sort by State
                      </button>
                    </div>
                  )}
                </div>

                <div
                  className="inline-flex rounded-xl p-1"
                  style={{ backgroundColor: 'var(--bg-primary)', borderWidth: '1px', borderColor: 'var(--border)' }}
                  role="group"
                  aria-label="View mode"
                >
                  {[
                    { key: 'grid', label: 'Grid view', Icon: Grid },
                    { key: 'list', label: 'List view', Icon: List },
                  ].map(({ key, label, Icon }) => {
                    const isActive = viewMode === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setViewMode(key)}
                        aria-pressed={isActive}
                        aria-label={label}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition"
                        style={{
                          backgroundColor: isActive ? 'var(--surface-active)' : 'transparent',
                          color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        }}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="hidden sm:inline">{key === 'grid' ? 'Grid' : 'List'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div
              className="hidden items-start gap-2 border-t pt-3 lg:flex"
              style={{ borderColor: 'var(--border)' }}
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                {exploreNationalParksFilterHint(displayedParksAndSitesCount)}
              </p>
            </div>
          </div>

          {showParksLoading && (
                <div className="flex items-center justify-center py-24">
                  <LoadingSpinner size="lg" text="Loading parks…" />
                </div>
              )}

              {error && (
                <div className="text-center py-24">
                  <p className="text-lg" style={{ color: 'var(--text-primary)' }}>Failed to load parks</p>
                  <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Please try again later</p>
                </div>
              )}

              {!showParksLoading && !error && filteredParks.length === 0 && (
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

              {!showParksLoading && !error && filteredParks.length > 0 && (
                <>
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4' : 'space-y-4'}>
                    {currentParks.map((park, index) => (
                      <ParkCard key={park.parkCode} park={park} viewMode={viewMode} rating={parkRatings?.[park.parkCode]} index={index} fromPath={returnPath} />
                    ))}
                  </div>

                  {calculatedTotalPages > 1 && (
                    <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Showing {resultsRangeStart}-{resultsRangeEnd} of {resultsTotal} parks
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
      </section>

      {/* Plan CTA — mobile only (desktop users see it in the header nav) */}
      <section className="pb-16 px-4 sm:px-6 lg:hidden">
        <div
          className="max-w-3xl mx-auto rounded-2xl p-6 sm:p-8 backdrop-blur text-left"
          style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
        >
          <div className="flex items-start gap-4 mb-4">
            <TrailieAvatar className="!h-12 !w-12 shrink-0" />
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: 'var(--accent-green)' }}
              >
                Trailie
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                {mobilePlanCta.title}
              </h2>
            </div>
          </div>
          <p className="text-base mb-6 max-w-none" style={{ color: 'var(--text-secondary)' }}>
            {mobilePlanCta.body}
          </p>
          <Link
            href="/plan-ai"
            className="inline-flex w-full items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 sm:w-auto"
            style={{ backgroundColor: 'var(--accent-green)' }}
          >
            {mobilePlanCta.button}
            <ArrowRight className="h-4 w-4" />
          </Link>
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
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={filters.nationalParksOnly} onChange={(e) => setFilters({ ...filters, nationalParksOnly: e.target.checked })}
                    className="rounded border-2 w-5 h-5 text-forest-500 focus:ring-forest-500/50" style={{ borderColor: 'var(--border)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    National Parks Only ({displayedNationalParksCount})
                  </span>
                </label>
                <NationalParksFilterHint allSitesCount={displayedParksAndSitesCount} />
              </div>
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
              <Link
                href={BROWSE_HUB_PATH}
                className="inline-flex text-sm font-medium"
                style={{ color: 'var(--accent-green)' }}
              >
                {BROWSE_HUB_CTA_LABEL} →
              </Link>
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

function ExplorePageFallback() {
  return (
    <div
      className="min-h-[50vh] animate-pulse"
      style={{ backgroundColor: 'var(--bg-primary)' }}
      aria-hidden
    />
  );
}

export default function ExplorePage({ initialPaginatedData, initialAllParksData }) {
  return (
    <Suspense fallback={<ExplorePageFallback />}>
      <ExploreContent
        initialPaginatedData={initialPaginatedData}
        initialAllParksData={initialAllParksData}
      />
    </Suspense>
  );
}
