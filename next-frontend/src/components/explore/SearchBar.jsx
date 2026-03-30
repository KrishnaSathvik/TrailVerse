import React, { useState } from 'react';
import { Search, X, MapPin, Filter } from '@components/icons';

const SearchBar = ({ 
  value, 
  onChange, 
  onClear, 
  placeholder = "Search parks...",
  showFilters = false,
  onToggleFilters
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.02]' : ''}`}>
      <div className={`relative rounded-2xl transition-all ${
        isFocused ? 'ring-2 ring-forest-500/50' : ''
      }`}
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}
      >
        {/* Search Icon */}
        <Search 
          className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5"
          style={{ color: 'var(--text-tertiary)' }}
        />

        {/* Input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="w-full pl-14 pr-24 py-4 rounded-2xl text-base font-medium outline-none transition bg-transparent"
          style={{ color: 'var(--text-primary)' }}
        />

        {/* Actions */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {value && (
            <button
              onClick={onClear}
              className="p-1.5 rounded-lg hover:bg-white/5 transition"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          
          {showFilters && (
            <button
              onClick={onToggleFilters}
              className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 transition"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <Filter className="h-4 w-4" />
            </button>
          )}
        </div>
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
