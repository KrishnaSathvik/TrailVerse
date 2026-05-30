import React, { useState } from 'react';
import { Search, X, Filter } from '@components/icons';
import {
  HERO_SEARCH_FIELD_STYLE,
  HERO_SEARCH_FOCUS_RING,
  HERO_SEARCH_ICON_COLOR,
  HERO_SEARCH_MUTED_COLOR,
  HERO_SEARCH_TEXT_COLOR,
} from '@/lib/heroSearchStyles';

const SearchBar = ({ 
  value, 
  onChange, 
  onClear, 
  placeholder = "Search parks...",
  showFilters = false,
  onToggleFilters,
  variant = 'default',
  compact = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const isHero = variant === 'hero';

  return (
    <div className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.02]' : ''}`}>
      <div className={`relative rounded-2xl transition-all ${
        isFocused ? (isHero ? HERO_SEARCH_FOCUS_RING : 'ring-2 ring-forest-500/50') : ''
      }`}
        style={isHero ? HERO_SEARCH_FIELD_STYLE : {
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        {/* Search Icon */}
        <Search 
          className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 ${compact ? 'left-4' : 'left-5'}`}
          style={{ color: isHero ? HERO_SEARCH_ICON_COLOR : 'var(--text-tertiary)' }}
        />

        {/* Input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className={`w-full min-w-0 font-medium outline-none transition rounded-2xl ${
            compact ? 'pl-11 pr-12 py-2.5 text-sm' : 'pl-14 pr-12 py-4 text-base'
          } ${isHero ? 'placeholder:text-slate-500 bg-transparent' : 'placeholder:text-[color:var(--text-tertiary)] bg-transparent'}`}
          style={{ color: isHero ? HERO_SEARCH_TEXT_COLOR : 'var(--text-primary)' }}
        />

        {/* Actions */}
        {(value || showFilters) ? (
          <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 ${compact ? 'right-2.5' : 'right-3'}`}>
            {value ? (
              <button
                onClick={onClear}
                className={`p-1.5 rounded-lg transition ${isHero ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                style={{ color: isHero ? HERO_SEARCH_MUTED_COLOR : 'var(--text-tertiary)' }}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            {showFilters ? (
              <button
                onClick={onToggleFilters}
                className={`lg:hidden p-1.5 rounded-lg transition ${isHero ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                style={{ color: isHero ? HERO_SEARCH_MUTED_COLOR : 'var(--text-tertiary)' }}
              >
                <Filter className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Search Suggestions (optional) */}
      {isFocused && value && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden backdrop-blur shadow-lg z-10"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="p-2">
            <p className="text-xs font-medium uppercase tracking-wider px-3 py-2"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Suggestions
            </p>
            {/* Add suggestion items here */}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
