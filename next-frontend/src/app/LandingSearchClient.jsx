"use client";

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SearchBar from '@/components/explore/SearchBar';
import { ChevronRight, Mountain } from '@components/icons';
import { logSearch } from '@/utils/analytics';

export default function LandingSearchClient({ parks }) {
  const router = useRouter();
  const searchRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !parks.length) return [];

    const q = searchQuery.toLowerCase();
    return parks
      .filter((park) =>
        park.fullName?.toLowerCase().includes(q) ||
        park.parkCode?.toLowerCase().includes(q) ||
        park.states?.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [parks, searchQuery]);

  useEffect(() => {
    const handler = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchFocused(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={searchRef} className="relative z-30 w-full max-w-3xl mx-auto mb-10">
      <div onFocus={() => setSearchFocused(true)}>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
          placeholder="Search national parks..."
        />
      </div>

      {searchFocused && searchQuery.trim() && (
        <div
          className="absolute top-full left-0 right-0 mt-3 rounded-[1.5rem] overflow-hidden backdrop-blur-md z-[70] animate-fade-in"
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
              {searchResults.length > 0 ? 'Matching Parks' : 'No Exact Matches'}
            </p>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {searchResults.length > 0 ? `${searchResults.length} shown` : 'Try a broader search'}
            </p>
          </div>

          {searchResults.length > 0 ? (
            <div>
              {searchResults.map((park) => (
                <button
                  key={park.parkCode}
                  onClick={() => {
                    logSearch(searchQuery, searchResults.length, 'landing');
                    router.push(`/parks/${park.parkCode}`);
                    setSearchFocused(false);
                  }}
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
                Search by park name, state abbreviation, or park code.
              </p>
            </div>
          )}

          <button
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
      )}
    </div>
  );
}
