"use client";

import React, { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SearchBar from '@/components/explore/SearchBar';
import { ChevronRight, Mountain, Loader2 } from '@components/icons';
import { logSearch, logSearchResultClick } from '@/utils/analytics';
import { parkToSlug } from '@/utils/parkSlug';
import { useDebounce } from '@/hooks/useDebounce';
import npsApi from '@/services/npsApi';
import { saveParkSearchSession } from '@/lib/parkSearchSession';

export default function LandingSearchClient({ variant = 'default' }) {
  const router = useRouter();
  const searchRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [lastSearchId, setLastSearchId] = useState(null);

  const debouncedQuery = useDebounce(searchQuery.trim(), 300);
  const showDropdown = searchFocused && searchQuery.trim();

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (!searchRef.current?.contains(target)) {
        setSearchFocused(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);

    npsApi
      .searchParks(debouncedQuery, null, 8)
      .then(({ parks, count, searchId }) => {
        if (cancelled) return;
        setSearchResults(parks);
        setLastSearchId(searchId);
        saveParkSearchSession({
          searchTerm: debouncedQuery,
          searchId,
          resultCount: count,
          surface: 'landing',
        });
        logSearch(debouncedQuery, count, 'landing', { searchId });
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const handleParkSelect = (park, index) => {
    const code = park.parkCode;
    saveParkSearchSession({
      searchTerm: debouncedQuery || searchQuery,
      searchId: lastSearchId,
      resultCount: searchResults.length,
      surface: 'landing',
      clickedParkCode: code,
    });
    logSearchResultClick({
      searchTerm: debouncedQuery || searchQuery,
      searchId: lastSearchId,
      parkCode: code,
      parkName: park.fullName,
      surface: 'landing',
      position: index + 1,
    });
    logSearch(debouncedQuery || searchQuery, searchResults.length, 'landing', {
      searchId: lastSearchId,
    });
    router.push(`/parks/${parkToSlug(park.fullName)}`);
    setSearchFocused(false);
  };

  return (
    <div ref={searchRef} className="relative z-40 w-full">
      <div onFocus={() => setSearchFocused(true)}>
        <SearchBar
          variant={variant}
          useExternalResults
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
          placeholder="Search parks — try “relaxing ocean” or “photography”"
        />
      </div>

      {showDropdown ? (
        <div
          id="landing-search-dropdown"
          className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-[100] min-h-[18rem] max-h-[min(24rem,calc(100dvh-6rem))] overflow-y-auto rounded-[1.5rem] shadow-xl"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          }}
        >
          <div
            className="flex items-center justify-between gap-3 px-5 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>
              {searchLoading ? 'Searching…' : searchResults.length > 0 ? 'Matching Parks' : 'No Matches'}
            </p>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {searchLoading ? '' : searchResults.length > 0 ? `${searchResults.length} shown` : 'Try different words'}
            </p>
          </div>

          {searchLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Finding parks for you…</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div>
              {searchResults.map((park, index) => (
                <button
                  key={park.parkCode}
                  type="button"
                  onClick={() => handleParkSelect(park, index)}
                  className="w-full flex items-center gap-4 px-4 sm:px-6 py-4 text-left transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  {park.images?.[0]?.url ? (
                    <img
                      src={park.images[0].url}
                      alt=""
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover flex-shrink-0 shadow-sm"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <Mountain className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: 'var(--text-tertiary)' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {park.fullName}
                    </p>
                    <p className="text-xs sm:text-sm truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {park.states} • {park.designation}
                    </p>
                    {park.matchReason ? (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--accent-green)' }}>
                        {park.matchReason}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              ))}
            </div>
          ) : (
            <div className="px-5 py-5 text-left">
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                No parks matched &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Try intent like relaxing ocean, easy hikes, or photography.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              router.push(`/explore?search=${encodeURIComponent(searchQuery)}`);
              setSearchFocused(false);
            }}
            className="w-full px-5 sm:px-6 py-4 text-sm font-bold text-left sm:text-center transition-colors"
            style={{ color: 'var(--accent-green)', backgroundColor: 'var(--surface-hover)' }}
          >
            Open full explore results for &ldquo;{searchQuery}&rdquo; →
          </button>
        </div>
      ) : null}
    </div>
  );
}
