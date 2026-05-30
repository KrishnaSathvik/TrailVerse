'use client';

import { useEffect, useRef, useState } from 'react';
import SearchBar from '@/components/explore/SearchBar';
import { MapPin } from '@components/icons';

export default function ParkSearch({
  query,
  suggestions,
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
      <div onFocus={() => setIsFocused(true)}>
        <SearchBar
          variant="hero"
          compact={compact}
          value={query}
          onChange={onQueryChange}
          onClear={onClear}
          placeholder="Search national parks..."
        />
      </div>

      {shouldShowSuggestions && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 max-h-80 overflow-y-auto rounded-2xl border p-2 backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.25)',
          }}
        >
          {suggestions.length > 0 ? (
            suggestions.map((park) => (
              <button
                key={park.parkCode}
                type="button"
                onClick={() => {
                  onSelectPark(park);
                  setIsFocused(false);
                }}
                className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
              >
                <div
                  className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: 'var(--accent-green-light)',
                    color: 'var(--accent-green)',
                  }}
                >
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{park.fullName}</p>
                  <p className="mt-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {park.states} · {park.designation}
                  </p>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              No parks matched your search.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
