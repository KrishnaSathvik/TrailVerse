import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  Search, X, MapPin, Star, ArrowRight, 
  Loader2, SlidersHorizontal, Grid, List, Compass,
  ChevronLeft, ChevronRight, ChevronDown
} from '@components/icons';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import OptimizedImage from '../components/common/OptimizedImage';
import { useParks, useAllParks } from '../hooks/useParks';
import { useParkRatings } from '../hooks/useParkRatings';
import { useDebounce } from '../hooks/useDebounce';
import { useSearchPrefetch } from '../hooks/useSmartPrefetch';
// import { logSearch } from '../utils/analytics';

const ExploreParksPage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: parkRatings, isLoading: ratingsLoading, error: ratingsError } = useParkRatings();
  const { handleSearch } = useSearchPrefetch();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  
  // Track mount state and previous filter values to prevent resetting on first render
  const hasMounted = useRef(false);
  const prevFiltersRef = useRef({
    search: '',
    npOnly: true,
    statesLen: 0,
    actsLen: 0,
  });
  
  // Initialize currentPage from URL parameter
  const [currentPage, setCurrentPage] = useState(() => {
    const pageParam = searchParams.get('page');
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    console.log(`📄 INIT: Using page ${page} (URL param: ${pageParam})`);
    return page > 0 ? page : 1;
  });
  
  // Responsive parks per page: 6 on mobile, 12 on desktop
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const parksPerPage = isMobile ? 6 : 12;
  
  // Determine if we need to fetch all parks (for filtering) or use pagination
  const [filters, setFilters] = useState({
    nationalParksOnly: true,
    states: [],
    activities: []
  });
  
  // Determine if we need all parks for filtering or sorting
  // Note: When any client-side filter is active (search, states, activities) OR when sorting by state,
  // we need all parks data for proper sorting across all parks
  const hasActiveFilters = searchTerm || filters.states.length > 0 || filters.activities.length > 0;
  const needsAllParks = hasActiveFilters || sortBy === 'state';
  
  // Use paginated query when no filters, all parks when filtering
  const { data: paginatedData, isLoading: paginatedLoading, error: paginatedError } = useParks(
    currentPage, 
    parksPerPage,
    filters.nationalParksOnly
  );
  const { data: allParksData, isLoading: allParksLoading, error: allParksError } = useAllParks();
  
  // Debug data fetching
  console.log(`📊 DATA FETCH: currentPage=${currentPage}, parksPerPage=${parksPerPage}, needsAllParks=${needsAllParks}`);
  console.log(`📊 DATA FETCH: paginatedData count=${paginatedData?.data?.length || 0}, allParksData count=${allParksData?.data?.length || 0}`);
  
  
  // Choose which data source to use
  const isLoading = needsAllParks ? allParksLoading : paginatedLoading;
  const error = needsAllParks ? allParksError : paginatedError;
  const allParks = needsAllParks ? allParksData?.data : paginatedData?.data;
  const totalParks = needsAllParks ? allParksData?.total : paginatedData?.total;
  const totalPages = needsAllParks ? null : paginatedData?.pages; // null means client-side pagination
  
  // Debug data source selection
  console.log(`🎯 DATA SOURCE: needsAllParks=${needsAllParks}, allParks count=${allParks?.length || 0}, totalPages=${totalPages}`);
  
  
  // Mark component as mounted
  useEffect(() => {
    hasMounted.current = true;
  }, []);

  // Update mobile state on window resize (don't reset page - just update the flag)
  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth < 640;
      if (newIsMobile !== isMobile) {
        // Just update the flag; KEEP the page & URL
        setIsMobile(newIsMobile);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // Handle URL filter parameter
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam === 'national-parks') {
      setFilters(prev => ({
        ...prev,
        nationalParksOnly: true
      }));
    }
  }, [searchParams]);

  // Debug function - expose to window for testing
  useEffect(() => {
    window.debugPagination = {
      getCurrentPage: () => currentPage,
      getUrlPage: () => searchParams.get('page'),
      goToPage: (page) => {
        console.log(`Debug: Navigating to page ${page}`);
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.set('page', page.toString());
        setSearchParams(newSearchParams);
      }
    };
  }, [currentPage, searchParams, setSearchParams]);

  // Close sort dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSortDropdown && !event.target.closest('.sort-dropdown-container')) {
        setShowSortDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showSortDropdown]);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Track search queries for smart prefetching and analytics
  useEffect(() => {
    if (debouncedSearchTerm && debouncedSearchTerm.length > 2) {
      handleSearch(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm, handleSearch]);

  // Get unique states and activities (always use all parks data, not paginated subset)
  const uniqueStates = useMemo(() => {
    const parksForStates = allParksData?.data || [];
    if (!Array.isArray(parksForStates)) return [];
    const states = new Set();
    
    parksForStates.forEach(park => {
      if (park && park.states) {
        park.states.split(',').forEach(state => states.add(state.trim()));
      }
    });
    
    return Array.from(states).sort();
  }, [allParksData]);

  const popularActivities = [
    'Hiking', 'Camping', 'Wildlife Watching', 'Photography', 
    'Fishing', 'Boating', 'Biking', 'Climbing', 'Stargazing'
  ];

  // Filter parks (without sorting - sorting will be applied later)
  const filteredParks = useMemo(() => {
    if (!allParks || !Array.isArray(allParks)) return [];
    
    let result = [...allParks];

    // Search filter
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase();
      result = result.filter(park => {
        const parkStates = park.states ? park.states.split(',').map(s => s.trim().toLowerCase()) : [];
        
        // Map common state names to state codes for better searching
        const stateNameMap = {
          'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar', 'california': 'ca',
          'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de', 'florida': 'fl', 'georgia': 'ga',
          'hawaii': 'hi', 'idaho': 'id', 'illinois': 'il', 'indiana': 'in', 'iowa': 'ia',
          'kansas': 'ks', 'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
          'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms', 'missouri': 'mo',
          'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
          'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh',
          'oklahoma': 'ok', 'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
          'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut', 'vermont': 'vt',
          'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv', 'wisconsin': 'wi', 'wyoming': 'wy'
        };
        
        const stateCode = stateNameMap[searchLower];
        const searchTerms = [searchLower];
        if (stateCode) {
          searchTerms.push(stateCode);
        }
        
        return (
          park.fullName.toLowerCase().includes(searchLower) ||
          park.description.toLowerCase().includes(searchLower) ||
          parkStates.some(state => searchTerms.some(term => state.includes(term)))
        );
      });
    }

    // National parks only filter (includes variations like "National Park & Preserve")
    if (filters.nationalParksOnly) {
      result = result.filter(park => 
        park.designation && park.designation.toLowerCase().includes('national park')
      );
    }

    // States filter
    if (filters.states.length > 0) {
      result = result.filter(park => {
        const parkStates = park.states ? park.states.split(',').map(s => s.trim()) : [];
        return filters.states.some(state => parkStates.includes(state));
      });
    }

    // Activities filter
    if (filters.activities.length > 0) {
      result = result.filter(park =>
        filters.activities.some(activity =>
          park.activities?.some(a => a.name === activity)
        )
      );
    }

    return result;
  }, [allParks, debouncedSearchTerm, filters]);

  // Pagination calculations - Hybrid approach
  // Server-side pagination (no filters and sort by name): Use server's pagination data
  // Client-side pagination (with filters or sort by state): Calculate from filtered results
  const calculatedTotalPages = needsAllParks ? Math.ceil(filteredParks.length / parksPerPage) : (totalPages || 1);
  const startIndex = (currentPage - 1) * parksPerPage;
  const endIndex = startIndex + parksPerPage;
  
  // currentParks: Apply sorting and pagination correctly
  const currentParks = useMemo(() => {
    let parks;
    
    if (needsAllParks) {
      // For filtered results or state sorting: sort first, then paginate
      let sortedParks = [...filteredParks];
      
      // Apply sorting
      if (sortBy === 'name') {
        sortedParks.sort((a, b) => a.fullName.localeCompare(b.fullName));
      } else if (sortBy === 'state') {
        sortedParks.sort((a, b) => a.states.localeCompare(b.states));
      }
      
      // Apply pagination to sorted results
      parks = sortedParks.slice(startIndex, endIndex);
    } else {
      // For server-paginated data with name sorting: sort the current page
      parks = [...(allParks || [])];
      
      // Apply sorting to current page (only name sorting for server data)
      if (sortBy === 'name') {
        parks.sort((a, b) => a.fullName.localeCompare(b.fullName));
      }
    }
    
    return parks;
  }, [needsAllParks, filteredParks, startIndex, endIndex, allParks, sortBy]);

  // Reset page when filters change (but not on first mount)
  React.useEffect(() => {
    const prev = prevFiltersRef.current;
    const changed =
      prev.search !== debouncedSearchTerm ||
      prev.npOnly !== filters.nationalParksOnly ||
      prev.statesLen !== filters.states.length ||
      prev.actsLen !== filters.activities.length;

    if (hasMounted.current && changed) {
      console.log(`🔄 FILTERS CHANGED: Resetting to page 1`);
      setCurrentPage(1);
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.set('page', '1');
      setSearchParams(newSearchParams);
    }
    
    prevFiltersRef.current = {
      search: debouncedSearchTerm,
      npOnly: filters.nationalParksOnly,
      statesLen: filters.states.length,
      actsLen: filters.activities.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, filters.nationalParksOnly, filters.states.length, filters.activities.length]);

  // Handle page reset when switching between server/client pagination due to sorting
  React.useEffect(() => {
    // If we're switching to client-side pagination (sort by state) and current page is too high,
    // reset to page 1
    if (needsAllParks && currentPage > 1) {
      const maxPages = Math.ceil(filteredParks.length / parksPerPage);
      if (currentPage > maxPages) {
        setCurrentPage(1);
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.set('page', '1');
        setSearchParams(newSearchParams);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAllParks, filteredParks.length, currentPage]);

  // Pagination handlers
  const goToPage = useCallback((page) => {
    setCurrentPage(page);
    
    // Update URL with page parameter
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('page', page.toString());
    setSearchParams(newSearchParams); // Create history entry for each page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchParams, setSearchParams]);

  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    if (currentPage < calculatedTotalPages) {
      goToPage(currentPage + 1);
    }
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
    setFilters({
      nationalParksOnly: true,
      states: [],
      activities: []
    });
    setSearchTerm('');
  }, []);

  const activeFiltersCount = 
    filters.states.length +
    filters.activities.length;

  // Calculate actual National Parks count from ALL parks data (includes variations like "National Park & Preserve")
  const nationalParksCount = useMemo(() => {
    // Always use allParksData for counting, not the paginated subset
    const parksToCount = allParksData?.data || [];
    if (!Array.isArray(parksToCount)) return 0;
    return parksToCount.filter(park => 
      park.designation && park.designation.toLowerCase().includes('national park')
    ).length;
  }, [allParksData]);

  // Generate structured data for the parks listing
  const parksStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Explore National Parks',
    description: 'Discover America\'s 470+ National Parks, Monuments, and Historic Sites with detailed guides, photos, activities, and planning tools.',
    url: 'https://www.nationalparksexplorerusa.com/explore',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: allParks?.length || 63,
      itemListElement: filteredParks.slice(0, 10).map((park, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'TouristAttraction',
          name: park.fullName,
          description: park.description,
          url: `https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`,
          image: park.images?.[0]?.url
        }
      }))
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="Explore All 470+ National Parks & Sites - Find Your Perfect Adventure"
        description="Discover America's 470+ National Parks, Monuments, Historic Sites, and more with detailed guides, photos, activities, and planning tools. Find parks by state, activity, or search by name."
        keywords="national parks explorer, USA national parks, park finder, national park guide, hiking, camping, outdoor activities, park activities"
        url="https://www.nationalparksexplorerusa.com/explore"
        type="website"
      />
      
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(parksStructuredData)}
        </script>
      </Helmet>
      
      <Header />

      {/* Hero/Search Section */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-forest-500/20 to-transparent" />
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
              Discover {filters.nationalParksOnly ? `${nationalParksCount} national parks` : `${allParksData?.data?.length || 0} parks and sites`} across America. 
              Find your next adventure with AI-powered recommendations.
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                  <h3 className="text-lg font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Filters
                  </h3>
                </div>

                {/* National Parks Only */}
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
                      {debouncedSearchTerm ? 'Major Parks & Sites' : 'National Parks Only'} ({nationalParksCount})
                    </span>
                  </label>
                </div>

                {/* States */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    States ({uniqueStates.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {uniqueStates.map(state => (
                      <label key={state} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={filters.states.includes(state)}
                          onChange={() => toggleStateFilter(state)}
                          className="rounded border-2 w-4 h-4 text-forest-500 focus:ring-forest-500/50"
                          style={{ borderColor: 'var(--border)' }}
                        />
                        <span className="text-sm group-hover:text-forest-400 transition"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {state}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Activities */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Activities
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {popularActivities.map(activity => (
                      <button
                        key={activity}
                        onClick={() => toggleActivityFilter(activity)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                          filters.activities.includes(activity)
                            ? 'bg-forest-500 text-white'
                            : 'ring-1 hover:bg-white/5'
                        }`}
                        style={
                          !filters.activities.includes(activity)
                            ? {
                                backgroundColor: 'var(--surface)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-secondary)'
                              }
                            : {}
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
                  {/* Mobile Filter Button */}
                  <button
                    onClick={() => setShowFilters(true)}
                    className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="text-sm">Filters</span>
                    {activeFiltersCount > 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-forest-500 text-white">
                        {activeFiltersCount}
                      </span>
                    )}
                  </button>

                  {/* Sort */}
                  <div className="relative sort-dropdown-container">
                    <button
                      onClick={() => setShowSortDropdown(!showSortDropdown)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium outline-none transition backdrop-blur"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                        WebkitFontSmoothing: 'antialiased',
                        MozOsxFontSmoothing: 'grayscale'
                      }}
                    >
                      <span>{sortBy === 'name' ? 'Sort by Name' : 'Sort by State'}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-tertiary)' }}
                      />
                    </button>
                    
                    {showSortDropdown && (
                      <div className="absolute top-full left-0 mt-2 min-w-[180px] z-50 rounded-xl overflow-hidden backdrop-blur-xl"
                        style={{
                          backgroundColor: 'var(--surface)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)'
                        }}
                      >
                        <button
                          onClick={() => {
                            setSortBy('name');
                            setShowSortDropdown(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                            sortBy === 'name' ? '' : 'hover:bg-white/5 dark:hover:bg-white/5'
                          }`}
                          style={{
                            backgroundColor: sortBy === 'name' ? 'var(--surface-active)' : 'transparent',
                            color: sortBy === 'name' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            WebkitFontSmoothing: 'antialiased',
                            MozOsxFontSmoothing: 'grayscale'
                          }}
                        >
                          Sort by Name
                        </button>
                        <button
                          onClick={() => {
                            setSortBy('state');
                            setShowSortDropdown(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                            sortBy === 'state' ? '' : 'hover:bg-white/5 dark:hover:bg-white/5'
                          }`}
                          style={{
                            backgroundColor: sortBy === 'state' ? 'var(--surface-active)' : 'transparent',
                            color: sortBy === 'state' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            WebkitFontSmoothing: 'antialiased',
                            MozOsxFontSmoothing: 'grayscale'
                          }}
                        >
                          Sort by State
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* View Mode Toggle */}
                <div className="hidden sm:flex items-center gap-2 p-1 rounded-xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition ${
                      viewMode === 'grid' ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-lg transition ${
                      viewMode === 'list' ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-forest-500" />
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Loading parks...
                    </p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="text-center py-24">
                  <p className="text-lg" style={{ color: 'var(--text-primary)' }}>
                    Failed to load parks
                  </p>
                  <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                    Please try again later
                  </p>
                </div>
              )}

              {/* Empty State */}
              {!isLoading && !error && filteredParks.length === 0 && (
                <div className="text-center py-24">
                  <Compass className="h-16 w-16 mx-auto mb-4"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <p className="text-lg font-semibold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    No parks found
                  </p>
                  <p className="text-sm mb-6"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Try adjusting your search or filters
                  </p>
                  <button
                    onClick={clearAllFilters}
                    className="px-6 py-3 rounded-full bg-forest-500 hover:bg-forest-600 text-white font-semibold transition"
                  >
                    Clear Filters
                  </button>
                </div>
              )}

              {/* Parks Grid */}
              {!isLoading && !error && filteredParks.length > 0 && (
                <>
                  <div className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'
                      : 'space-y-4'
                  }>
                  {currentParks.map((park) => (
                    <ParkCard 
                      key={park.parkCode} 
                      park={park} 
                      viewMode={viewMode} 
                      rating={parkRatings?.[park.parkCode]}
                      location={location}
                    />
                  ))}
                  </div>

                  {/* Pagination Controls */}
                  {calculatedTotalPages > 1 && (
                    <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4">
                      {/* Results Info */}
                      <div className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Showing {startIndex + 1}-{Math.min(endIndex, filteredParks.length)} of {filteredParks.length} parks
                      </div>

                      {/* Pagination Buttons */}
                      <div className="flex items-center gap-2">
                        {/* Previous Button */}
                        <button
                          onClick={goToPreviousPage}
                          disabled={currentPage === 1}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: currentPage === 1 ? 'transparent' : 'var(--surface)',
                            borderWidth: '1px',
                            borderColor: 'var(--border)',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span className="hidden sm:inline">Previous</span>
                        </button>

                        {/* Page Numbers */}
                        <div className="flex items-center gap-1">
                          {Array.from({ length: calculatedTotalPages }, (_, i) => i + 1).map((page) => {
                            // Show first page, last page, current page, and pages around current page
                            if (
                              page === 1 ||
                              page === calculatedTotalPages ||
                              (page >= currentPage - 1 && page <= currentPage + 1)
                            ) {
                              return (
                                <button
                                  key={page}
                                  onClick={() => goToPage(page)}
                                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                                    page === currentPage ? 'ring-2' : 'hover:bg-white/5'
                                  }`}
                                  style={{
                                    backgroundColor: page === currentPage ? 'var(--surface-active)' : 'var(--surface)',
                                    borderWidth: '1px',
                                    borderColor: page === currentPage ? 'var(--border-hover)' : 'var(--border)',
                                    color: 'var(--text-primary)',
                                    boxShadow: page === currentPage ? 'var(--shadow-lg)' : 'var(--shadow)'
                                  }}
                                >
                                  {page}
                                </button>
                              );
                            } else if (
                              page === currentPage - 2 ||
                              page === currentPage + 2
                            ) {
                              return (
                                <span key={page} className="px-2 py-2 text-sm"
                                  style={{ color: 'var(--text-tertiary)' }}
                                >
                                  ...
                                </span>
                              );
                            }
                            return null;
                          })}
                        </div>

                        {/* Next Button */}
                        <button
                          onClick={goToNextPage}
                          disabled={currentPage === calculatedTotalPages}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: currentPage === calculatedTotalPages ? 'transparent' : 'var(--surface)',
                            borderWidth: '1px',
                            borderColor: 'var(--border)',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <span className="hidden sm:inline">Next</span>
                          <ChevronRight className="h-4 w-4" />
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

            {/* Same filter content as sidebar */}
            <div className="space-y-6">
              {/* National Parks Only */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.nationalParksOnly}
                  onChange={(e) => setFilters({ ...filters, nationalParksOnly: e.target.checked })}
                  className="rounded border-2 w-5 h-5 text-forest-500 focus:ring-forest-500/50"
                  style={{ borderColor: 'var(--border)' }}
                />
                <span className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {debouncedSearchTerm ? 'Major Parks & Sites' : 'National Parks Only'} ({nationalParksCount})
                </span>
              </label>

              {/* States */}
              <div>
                <h4 className="text-sm font-semibold mb-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  STATES ({uniqueStates.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {uniqueStates.map(state => (
                    <label key={state} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.states.includes(state)}
                        onChange={() => toggleStateFilter(state)}
                        className="rounded border-2 w-4 h-4 text-forest-500 focus:ring-forest-500/50"
                        style={{ borderColor: 'var(--border)' }}
                      />
                      <span className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {state}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Activities */}
              <div>
                <h4 className="text-sm font-semibold mb-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  ACTIVITIES
                </h4>
                <div className="flex flex-wrap gap-2">
                  {popularActivities.map(activity => (
                    <button
                      key={activity}
                      onClick={() => toggleActivityFilter(activity)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                        filters.activities.includes(activity)
                          ? 'bg-forest-500 text-white'
                          : 'ring-1 hover:bg-white/5'
                      }`}
                      style={
                        !filters.activities.includes(activity)
                          ? {
                              backgroundColor: 'var(--surface)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-secondary)'
                            }
                          : {}
                      }
                    >
                      {activity}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Apply Button */}
            <div className="mt-8 flex gap-3">
              <button
                onClick={clearAllFilters}
                className="flex-1 py-3 rounded-xl font-semibold transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                Clear All
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="flex-1 py-3 rounded-xl bg-forest-500 hover:bg-forest-600 text-white font-semibold transition"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

// Park Card Component
const ParkCard = ({ park, viewMode, rating, location }) => {
  if (viewMode === 'list') {
    return (
      <Link
        to={{
          pathname: `/parks/${park.parkCode}`,
          search: location.search,
        }}
        state={{ from: { pathname: '/explore', search: location.search } }}
        className="group flex gap-6 p-6 rounded-2xl backdrop-blur hover:-translate-y-1 transition-all duration-300"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow)'
        }}
      >
        <div className="w-48 h-32 flex-shrink-0 rounded-xl overflow-hidden">
          <OptimizedImage
            src={park.images[0]?.url}
            alt={park.fullName}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h3 className="text-xl font-bold group-hover:text-forest-500 transition"
              style={{ color: 'var(--text-primary)' }}
            >
              {park.fullName}
            </h3>
            <ArrowRight className="h-5 w-5 flex-shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
          <p className="text-sm line-clamp-2 mb-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            {park.description}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{park.states}</span>
            </div>
            {rating && rating.totalReviews > 0 ? (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {rating.averageRating.toFixed(1)}
                </span>
                <span className="text-sm"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  ({rating.totalReviews})
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={{
        pathname: `/parks/${park.parkCode}`,
        search: location.search,
      }}
      state={{ from: { pathname: '/explore', search: location.search } }}
      className="group rounded-2xl overflow-hidden backdrop-blur hover:-translate-y-1 transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow)'
      }}
    >
      <div className="relative h-56 overflow-hidden">
        <OptimizedImage
          src={park.images[0]?.url}
          alt={park.fullName}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)'
          }}
        >
          {park.states}
        </div>
      </div>

      <div className="p-6">
        <h3 className="text-xl font-bold mb-2 line-clamp-2 group-hover:text-forest-500 transition"
          style={{ color: 'var(--text-primary)' }}
        >
          {park.fullName}
        </h3>
        
        <p className="text-sm line-clamp-3 mb-4"
          style={{ color: 'var(--text-secondary)' }}
        >
          {park.description}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <MapPin className="h-4 w-4" />
            <span className="text-sm">{park.states}</span>
          </div>
          {rating && rating.totalReviews > 0 ? (
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {rating.averageRating.toFixed(1)}
              </span>
              <span className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                ({rating.totalReviews})
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
};

export default ExploreParksPage;