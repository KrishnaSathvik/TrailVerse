'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, X } from '@components/icons';

export default function ParkSearch({
  query,
  suggestions,
  totalResults,
  isDark,
  onQueryChange,
  onSelectPark,
  onClear,
  compact = false,
  className = '',
}) {
  const containerRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const shouldShowSuggestions = isFocused && query.trim().length > 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-3 rounded-[28px] shadow-[0_20px_60px_-20px_rgba(15,23,42,0.55)] backdrop-blur-xl transition ${compact ? 'px-4 py-2.5' : 'px-4 py-3'}`}
        style={{
          backgroundColor: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)'
        }}
      >
        <div
          className={`flex flex-shrink-0 items-center justify-center rounded-2xl ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}
          style={{
            backgroundColor: 'var(--accent-green-light)',
            color: 'var(--accent-green)'
          }}
        >
          <Search className="h-5 w-5" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search parks, states, or park code"
          className={`w-full min-w-0 bg-transparent font-medium outline-none ${compact ? 'text-sm' : 'text-[15px]'}`}
          style={{ color: 'var(--text-primary)' }}
        />
        {query ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full p-2 transition"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'transparent'
            }}
            aria-label="Clear search"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : !compact ? (
          <div
            className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              backgroundColor: 'var(--surface-hover)',
              color: 'var(--text-secondary)'
            }}
          >
            {totalResults} parks
          </div>
        ) : null}
      </div>

      {shouldShowSuggestions && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 max-h-80 overflow-y-auto rounded-[28px] border p-2 shadow-[0_32px_80px_-28px_rgba(15,23,42,0.65)] backdrop-blur-xl"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--surface)',
            color: 'var(--text-primary)'
          }}
        >
          {suggestions.length > 0 ? suggestions.map((park) => (
            <button
              key={park.parkCode}
              type="button"
              onClick={() => {
                onSelectPark(park);
                setIsFocused(false);
              }}
              className="flex w-full items-start gap-3 rounded-[20px] px-4 py-3 text-left transition"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div
                className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: 'var(--accent-green-light)',
                  color: 'var(--accent-green)'
                }}
              >
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{park.fullName}</p>
                <p className="truncate text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {park.states} · {park.designation}
                </p>
              </div>
              <div
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--text-secondary)'
                }}
              >
                View
              </div>
            </button>
          )) : (
            <div className="px-4 py-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              No parks matched your search.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
