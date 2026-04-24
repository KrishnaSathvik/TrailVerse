'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, MapPin, Mountain, Tent, Home, Utensils, Clock, Loader2, ChevronLeft, Plus } from '@components/icons';
import { getApiBaseUrl } from '../../lib/apiBase';

const STOP_TYPES = [
  { id: 'park', label: 'Park', Icon: MapPin, color: 'var(--accent-green)' },
  { id: 'trail', label: 'Trail', Icon: Mountain, color: '#3B82F6' },
  { id: 'campground', label: 'Camp', Icon: Tent, color: '#8B6914' },
  { id: 'lodging', label: 'Lodging', Icon: Home, color: '#7C3AED' },
  { id: 'food', label: 'Food', Icon: Utensils, color: '#F59E0B' },
  { id: 'custom', label: 'Custom', Icon: MapPin, color: 'var(--text-tertiary)' },
];

// Types that require a park selection first, then show sub-resources
const SUB_RESOURCE_TYPES = {
  trail: { endpoint: 'places', nameField: 'title' },
  campground: { endpoint: 'campgrounds', nameField: 'name' },
  visitor_center: { endpoint: 'visitorcenters', nameField: 'name' },
};

const DURATION_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hr' },
  { value: 90, label: '1.5 hr' },
  { value: 120, label: '2 hr' },
  { value: 180, label: '3 hr' },
  { value: 240, label: 'Half day (4 hr)' },
  { value: 480, label: 'Full day (8 hr)' },
];

export default function AddStopSearch({ onSelect, onClose }) {
  const [selectedType, setSelectedType] = useState('park');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customName, setCustomName] = useState('');

  // Multi-source: after park selection for trail/camp types
  const [selectedPark, setSelectedPark] = useState(null);
  const [subResults, setSubResults] = useState([]);
  const [isLoadingSub, setIsLoadingSub] = useState(false);

  // Time picker
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState('');

  const inputRef = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    // Small delay to let modal animation finish before focusing
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [selectedType]);

  // Park search debounce
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchParks(query), 300);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  const searchParks = async (q) => {
    setIsSearching(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/parks/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults((json.data || []).slice(0, 8));
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Fetch sub-resources after park is selected
  const fetchSubResources = async (parkCode) => {
    const config = SUB_RESOURCE_TYPES[selectedType];
    if (!config) return;

    setIsLoadingSub(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/parks/${parkCode}/${config.endpoint}`);
      const json = await res.json();
      setSubResults(json.data || []);
    } catch {
      setSubResults([]);
    } finally {
      setIsLoadingSub(false);
    }
  };

  const needsSubResource = selectedType in SUB_RESOURCE_TYPES;
  const isCustomEntry = selectedType === 'lodging' || selectedType === 'food' || selectedType === 'custom';

  const buildTimeFields = () => ({
    startTime: startTime || null,
    duration: duration ? Number(duration) : null,
  });

  const handleSelectPark = (park) => {
    if (needsSubResource) {
      setSelectedPark(park);
      setQuery('');
      setResults([]);
      fetchSubResources(park.parkCode);
    } else {
      onSelect({
        type: 'park',
        name: park.fullName,
        parkCode: park.parkCode,
        note: '',
        ...buildTimeFields(),
      });
    }
  };

  const handleSelectSubResource = (item) => {
    const config = SUB_RESOURCE_TYPES[selectedType];
    const name = item[config.nameField] || item.name || item.title || 'Unnamed';
    onSelect({
      type: selectedType,
      name,
      parkCode: selectedPark.parkCode,
      note: '',
      ...buildTimeFields(),
    });
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    onSelect({
      type: selectedType,
      name: customName.trim(),
      note: '',
      ...buildTimeFields(),
    });
  };

  const handleTypeChange = (typeId) => {
    setSelectedType(typeId);
    setQuery('');
    setResults([]);
    setCustomName('');
    setSelectedPark(null);
    setSubResults([]);
  };

  const handleBackFromSub = () => {
    setSelectedPark(null);
    setSubResults([]);
    setQuery('');
  };

  const activeType = STOP_TYPES.find(t => t.id === selectedType);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl shadow-2xl animate-scale-up"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="border-b px-5 py-4 sm:px-6"
          style={{
            borderColor: 'var(--border)',
            background: 'linear-gradient(180deg, rgba(67, 160, 106, 0.05) 0%, rgba(255,255,255,0) 100%)'
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  backgroundColor: 'rgba(67, 160, 106, 0.12)',
                  color: 'var(--accent-green)'
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Stop
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
                {selectedPark ? `Choose from ${selectedPark.fullName}` : 'Add a stop to your day'}
              </h2>
              <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                {isCustomEntry
                  ? 'Enter a name for your stop'
                  : needsSubResource && !selectedPark
                    ? 'Search for a park first, then pick a specific spot'
                    : selectedPark
                      ? `Select a ${selectedType} or type a custom name`
                      : 'Search for a park or choose a stop type'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl transition-colors"
              style={{
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)'
              }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Type selector */}
        <div className="px-5 py-3 sm:px-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STOP_TYPES.map(({ id, label, Icon, color }) => {
              const isActive = selectedType === id;
              return (
                <button
                  key={id}
                  onClick={() => handleTypeChange(id)}
                  className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-medium transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? `${color}18` : 'var(--surface-hover)',
                    border: isActive ? `2px solid ${color}` : '2px solid var(--border)',
                    color: isActive ? color : 'var(--text-secondary)',
                    boxShadow: isActive ? `0 0 0 1px ${color}30` : 'none'
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content area */}
        <div
          className="max-h-[calc(80vh-300px)] overflow-y-auto px-5 py-4 sm:px-6"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {isCustomEntry ? (
            /* Custom name input for lodging, food, custom */
            <div>
              <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                {selectedType === 'food' ? 'Restaurant Name' :
                 selectedType === 'lodging' ? 'Lodging Name' :
                 'Stop Name'}
              </label>
              <div className="relative">
                {activeType && <activeType.Icon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                  style={{ color: 'var(--text-tertiary)' }}
                />}
                <input
                  ref={inputRef}
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCustom(); if (e.key === 'Escape') onClose(); }}
                  placeholder={
                    selectedType === 'food' ? 'e.g. Lodge Grill, Campfire Cafe' :
                    selectedType === 'lodging' ? 'e.g. El Tovar Hotel, Canyon Lodge' :
                    'e.g. Scenic Viewpoint, Gas Station'
                  }
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl text-sm font-medium outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
            </div>
          ) : selectedPark ? (
            /* Sub-resource phase: show selected park + sub-results */
            <div>
              <button
                onClick={handleBackFromSub}
                className="flex items-center gap-2 mb-4 text-sm font-medium transition hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ChevronLeft className="h-4 w-4" />
                Back to park search
              </button>

              {isLoadingSub ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--accent-green)' }} />
                </div>
              ) : subResults.length > 0 ? (
                <div className="space-y-2">
                  {subResults.map((item, i) => {
                    const config = SUB_RESOURCE_TYPES[selectedType];
                    const name = item[config.nameField] || item.name || item.title || 'Unnamed';
                    const TypeIcon = STOP_TYPES.find(t => t.id === selectedType)?.Icon || MapPin;
                    const typeColor = STOP_TYPES.find(t => t.id === selectedType)?.color;
                    return (
                      <button
                        key={item.id || i}
                        onClick={() => handleSelectSubResource(item)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-150 hover:scale-[1.01]"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0"
                          style={{ backgroundColor: `${typeColor}15` }}>
                          <TypeIcon className="h-4 w-4" style={{ color: typeColor }} />
                        </div>
                        <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    No {selectedType === 'trail' ? 'trails/places' : selectedType + 's'} found for this park.
                  </p>
                </div>
              )}

              {/* Fallback: custom name */}
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <label className="block text-xs font-medium mb-2 uppercase tracking-wider"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Or type a custom name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCustom(); }}
                    placeholder="Custom stop name..."
                    className="flex-1 text-sm px-4 py-3 rounded-xl outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    onClick={handleAddCustom}
                    disabled={!customName.trim()}
                    className="px-4 py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      color: '#fff'
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Park search input (for park/trail/camp/vc types) */
            <div>
              <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                {needsSubResource ? 'Search a park first' : 'Search parks'}
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                  style={{ color: 'var(--text-tertiary)' }}
                />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={needsSubResource ? 'Type a park name to find its trails, camps...' : 'Type a park name...'}
                  className="w-full pl-12 pr-10 py-3.5 rounded-xl text-sm font-medium outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  onKeyDown={e => e.key === 'Escape' && onClose()}
                />
                {isSearching && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin"
                    style={{ color: 'var(--text-tertiary)' }} />
                )}
              </div>

              {/* Park results */}
              {results.length > 0 && (
                <div className="mt-3 space-y-2">
                  {results.map(park => (
                    <button
                      key={park.parkCode}
                      onClick={() => handleSelectPark(park)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-150 hover:scale-[1.01]"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: 'rgba(67, 160, 106, 0.1)' }}>
                        <MapPin className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {park.fullName}
                        </p>
                        {park.states && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            {park.states}
                          </p>
                        )}
                      </div>
                      {needsSubResource && (
                        <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--accent-green)' }}>
                          Select &rarr;
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* No results hint */}
              {query.length >= 2 && !isSearching && results.length === 0 && (
                <div className="mt-4 text-center py-4">
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    No parks found for &ldquo;{query}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — time picker + actions */}
        <div className="border-t px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
          {/* Time picker */}
          <div className="flex items-center gap-4 mb-4">
            <Clock className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Start</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg outline-none"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Duration</label>
              <select
                value={duration}
                onChange={e => setDuration(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg outline-none appearance-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  colorScheme: 'dark',
                }}
              >
                <option value="">--</option>
                {DURATION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition"
              style={{
                backgroundColor: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)'
              }}
            >
              Cancel
            </button>
            {isCustomEntry && (
              <button
                onClick={handleAddCustom}
                disabled={!customName.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--accent-green)',
                  color: '#fff'
                }}
              >
                <span className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add {activeType?.label || 'Stop'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { STOP_TYPES };
