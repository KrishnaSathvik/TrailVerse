'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, MapPin, Mountain, Tent, Home, Utensils, Clock, Loader2, ChevronLeft } from '@components/icons';
import { getApiBaseUrl } from '../../lib/apiBase';
import Button from '../common/Button';

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
    inputRef.current?.focus();
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
      const res = await fetch(`${apiUrl}/parks?q=${encodeURIComponent(q)}&limit=6`);
      const json = await res.json();
      setResults(json.data || []);
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
      // Park selected → now fetch sub-resources
      setSelectedPark(park);
      setQuery('');
      setResults([]);
      fetchSubResources(park.parkCode);
    } else {
      // Direct park stop
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

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--accent-green)', backgroundColor: 'var(--surface)' }}
    >
      {/* Type selector pills */}
      <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {STOP_TYPES.map(({ id, label, Icon, color }) => {
          const isActive = selectedType === id;
          return (
            <button
              key={id}
              onClick={() => handleTypeChange(id)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition"
              style={{
                backgroundColor: isActive ? color : 'var(--surface-hover)',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${isActive ? color : 'var(--border)'}`,
              }}
            >
              <Icon className="h-3 w-3" style={{ color: isActive ? '#fff' : color }} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Search / custom input area */}
      {isCustomEntry ? (
        /* Custom name input for lodging, food, custom */
        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <input
            ref={inputRef}
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCustom(); if (e.key === 'Escape') onClose(); }}
            placeholder={
              selectedType === 'food' ? 'Restaurant name (e.g. Lodge Grill)' :
              selectedType === 'lodging' ? 'Lodging name (e.g. El Tovar Hotel)' :
              'Stop name (e.g. Scenic Viewpoint)'
            }
            className="w-full text-xs bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      ) : selectedPark ? (
        /* Sub-resource phase: show selected park + sub-results */
        <div>
          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-hover)' }}
          >
            <button onClick={handleBackFromSub} style={{ color: 'var(--text-tertiary)' }}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <MapPin className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
            <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {selectedPark.fullName}
            </span>
          </div>

          {isLoadingSub ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          ) : subResults.length > 0 ? (
            <div className="max-h-40 overflow-y-auto">
              {subResults.map((item, i) => {
                const config = SUB_RESOURCE_TYPES[selectedType];
                const name = item[config.nameField] || item.name || item.title || 'Unnamed';
                const TypeIcon = STOP_TYPES.find(t => t.id === selectedType)?.Icon || MapPin;
                const typeColor = STOP_TYPES.find(t => t.id === selectedType)?.color;
                return (
                  <button
                    key={item.id || i}
                    onClick={() => handleSelectSubResource(item)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80 transition"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <TypeIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: typeColor }} />
                    <p className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {name}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No {selectedType === 'trail' ? 'trails/places' : selectedType + 's'} found for this park.
            </div>
          )}

          {/* Fallback: custom name */}
          <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCustom(); }}
                placeholder="Or type a custom name..."
                className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <Button variant="success" size="xs" onClick={handleAddCustom} disabled={!customName.trim()}>
                Add
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Park search input (for park/trail/camp/vc types) */
        <>
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={needsSubResource ? 'Search a park first...' : 'Search parks...'}
              className="flex-1 text-xs bg-transparent outline-none"
              style={{ color: 'var(--text-primary)' }}
              onKeyDown={e => e.key === 'Escape' && onClose()}
            />
            {isSearching && <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--text-tertiary)' }} />}
            <button onClick={onClose} style={{ color: 'var(--text-tertiary)' }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Park results */}
          {results.length > 0 && (
            <div className="max-h-40 overflow-y-auto">
              {results.map(park => (
                <button
                  key={park.parkCode}
                  onClick={() => handleSelectPark(park)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80 transition"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {park.fullName}
                    </p>
                    {park.states && (
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                        {park.states}
                      </p>
                    )}
                  </div>
                  {needsSubResource && (
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                      Select →
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Time picker */}
      <div className="flex items-center gap-3 px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <Clock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <div className="flex items-center gap-1.5">
          <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Start</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="text-xs px-1.5 py-1 rounded-md outline-none"
            style={{
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              colorScheme: 'dark',
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Duration</label>
          <select
            value={duration}
            onChange={e => setDuration(e.target.value)}
            className="text-xs px-1.5 py-1 rounded-md outline-none appearance-none cursor-pointer"
            style={{
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              colorScheme: 'dark',
            }}
          >
            <option value="">—</option>
            {DURATION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Add button for custom types */}
      {isCustomEntry && (
        <div className="px-3 pb-2">
          <Button
            variant="success"
            size="xs"
            onClick={handleAddCustom}
            disabled={!customName.trim()}
            className="w-full"
          >
            Add {STOP_TYPES.find(t => t.id === selectedType)?.label || 'Stop'}
          </Button>
        </div>
      )}

      {/* Close button (for non-custom when no search active) */}
      {!isCustomEntry && !selectedPark && results.length === 0 && !query && (
        <div className="px-3 pb-2">
          <button
            onClick={onClose}
            className="w-full text-xs py-1.5 rounded-lg transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--surface-hover)',
              border: '1px dashed var(--border)',
              color: 'var(--text-tertiary)',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export { STOP_TYPES };
