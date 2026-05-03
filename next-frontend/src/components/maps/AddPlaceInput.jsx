'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, MapPin, Check, X, ArrowRight, Loader2 } from '@components/icons';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Polished Google Places search input with custom dropdown.
 *
 * Three states: Idle → Active (typing + suggestions) → Pending (place selected, pick day).
 * Uses AutocompleteService + PlacesService for full styling control.
 * Session tokens keep billing efficient.
 *
 * Props:
 *   - days:        current days array
 *   - onAdd:       (stop, dayId) => void
 *   - biasCenter:  { lat, lng } — soft-biases suggestions toward trip area
 *   - biasRadius:  meters (default 50km)
 *   - activeDayId: pre-selected day id (optional, defaults to first day)
 *   - placeholder:  input placeholder text
 */
export default function AddPlaceInput({
  days,
  onAdd,
  biasCenter,
  biasRadius = 50000,
  activeDayId: externalDayId,
  placeholder = 'Add a place to your trip...',
}) {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedDayId, setSelectedDayId] = useState(externalDayId || days?.[0]?.id || null);
  const [isFocused, setIsFocused] = useState(false);

  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Sync external day selection
  useEffect(() => {
    if (externalDayId) setSelectedDayId(externalDayId);
  }, [externalDayId]);

  // Wait for Google Maps to load
  useEffect(() => {
    if (window.google?.maps?.places) {
      setReady(true);
      return;
    }
    const interval = setInterval(() => {
      if (window.google?.maps?.places) {
        setReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Initialize Google Places services
  useEffect(() => {
    if (!ready) return;
    autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    const dummyDiv = document.createElement('div');
    placesServiceRef.current = new window.google.maps.places.PlacesService(dummyDiv);
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  }, [ready]);

  // Update default day when days change
  useEffect(() => {
    if (!selectedDayId && days?.[0]?.id) {
      setSelectedDayId(days[0].id);
    }
  }, [days, selectedDayId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch predictions (debounced)
  const fetchPredictions = useCallback(
    (input) => {
      if (!input.trim() || !autocompleteServiceRef.current) {
        setPredictions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const request = {
        input,
        sessionToken: sessionTokenRef.current,
        types: ['establishment', 'geocode'],
      };

      if (biasCenter) {
        request.location = new window.google.maps.LatLng(biasCenter.lat, biasCenter.lng);
        request.radius = biasRadius;
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (results, status) => {
        setLoading(false);
        if (status !== 'OK' || !results) {
          setPredictions([]);
          return;
        }
        setPredictions(results.slice(0, 5));
      });
    },
    [biasCenter, biasRadius]
  );

  function handleQueryChange(e) {
    const value = e.target.value;
    setQuery(value);
    setSelectedPlace(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(value), 200);
  }

  function handlePredictionSelect(prediction) {
    if (!placesServiceRef.current) return;

    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['place_id', 'name', 'geometry', 'formatted_address', 'photos', 'types'],
        sessionToken: sessionTokenRef.current,
      },
      (place, status) => {
        if (status !== 'OK' || !place?.geometry?.location) return;

        const photoUrl = place.photos?.[0]?.getUrl({ maxWidth: 600 });
        setSelectedPlace({
          name: place.name,
          address: place.formatted_address,
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng(),
          placeId: place.place_id,
          photoUrl,
        });
        setQuery(place.name);
        setPredictions([]);
        setIsFocused(false);

        // Refresh session token after a successful place lookup
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }
    );
  }

  function commitPlace() {
    if (!selectedPlace || !selectedDayId) return;
    const targetDay = days.find((d) => d.id === selectedDayId);
    if (!targetDay) return;

    const stop = {
      id: `stop-${uid()}`,
      order: targetDay.stops.length,
      name: selectedPlace.name,
      type: 'custom',
      startTime: '',
      duration: 60,
      difficulty: 'easy',
      latitude: selectedPlace.latitude,
      longitude: selectedPlace.longitude,
      why: '',
      drivingTimeFromPreviousMin: null,
      alternatives: [],
      source: 'user',
      _placeId: selectedPlace.placeId,
      _photoUrl: selectedPlace.photoUrl,
    };

    onAdd(stop, selectedDayId);
    reset();
  }

  function reset() {
    setQuery('');
    setPredictions([]);
    setSelectedPlace(null);
    setIsFocused(false);
    if (inputRef.current) inputRef.current.blur();
  }

  const showDropdown = isFocused && (predictions.length > 0 || loading) && !selectedPlace;
  const showConfirm = !!selectedPlace;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Main input row */}
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-all"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: showDropdown || showConfirm ? 'var(--accent-green)' : 'var(--border)',
          boxShadow: showDropdown || showConfirm ? '0 0 0 3px rgba(67,160,106,0.15)' : 'none',
        }}
      >
        {/* Leading icon */}
        <div className="shrink-0">
          {selectedPlace ? (
            <Check className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
          ) : loading ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <Search className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          )}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          onFocus={() => setIsFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') reset();
            if (e.key === 'Enter' && selectedPlace) commitPlace();
          }}
          placeholder={placeholder}
          disabled={!ready || !!selectedPlace}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none disabled:cursor-default placeholder:text-[var(--text-tertiary)]"
          style={{ color: 'var(--text-primary)' }}
        />

        {/* Confirm controls (place selected) */}
        {showConfirm && (
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={selectedDayId || ''}
              onChange={(e) => setSelectedDayId(e.target.value)}
              className="rounded-md border px-1.5 py-1 text-[11px] font-medium cursor-pointer"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-primary)',
              }}
            >
              {days.map((d, i) => (
                <option key={d.id} value={d.id}>Day {i + 1}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={commitPlace}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
            >
              Add
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Clear button */}
        {(query || selectedPlace) && (
          <button
            type="button"
            onClick={reset}
            className="shrink-0 rounded-full p-0.5 transition hover:bg-[var(--surface-hover)]"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" style={{ color: 'var(--text-secondary)' }} />
          </button>
        )}
      </div>

      {/* Predictions dropdown */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border shadow-lg"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          {predictions.length === 0 && loading && (
            <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Searching...
            </div>
          )}
          {predictions.map((p, idx) => {
            const main = p.structured_formatting?.main_text || p.description;
            const secondary = p.structured_formatting?.secondary_text || '';
            return (
              <button
                key={p.place_id}
                type="button"
                onClick={() => handlePredictionSelect(p)}
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-[var(--surface-hover)]"
                style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: 'var(--text-tertiary)' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {main}
                  </div>
                  {secondary && (
                    <div className="truncate text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {secondary}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
}
