'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, MapPin } from '@components/icons';
import { getApiBaseUrl } from '../../lib/apiBase';
import Button from '../common/Button';

export default function AddStopSearch({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const inputRef = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const handleSelectPark = (park) => {
    onSelect({
      type: 'park',
      name: park.fullName,
      parkCode: park.parkCode,
      note: '',
      startTime: null,
      duration: null,
    });
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    onSelect({
      type: 'custom',
      name: customName.trim(),
      note: '',
      startTime: null,
      duration: null,
    });
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--accent-green)', backgroundColor: 'var(--surface)' }}
    >
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setCustomMode(false); }}
          placeholder="Search parks..."
          className="flex-1 text-xs bg-transparent outline-none"
          style={{ color: 'var(--text-primary)' }}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />
        <button onClick={onClose} style={{ color: 'var(--text-tertiary)' }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Results */}
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
            </button>
          ))}
        </div>
      )}

      {/* Custom stop option */}
      <div className="p-2">
        {customMode ? (
          <div className="flex items-center gap-2">
            <input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCustom(); if (e.key === 'Escape') setCustomMode(false); }}
              autoFocus
              placeholder="Stop name (e.g. Lunch, Hotel, Viewpoint)"
              className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
              style={{
                backgroundColor: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            />
            <Button variant="success" size="xs" onClick={handleAddCustom} disabled={!customName.trim()}>Add</Button>
          </div>
        ) : (
          <button
            onClick={() => setCustomMode(true)}
            className="w-full text-xs py-1.5 rounded-lg transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--surface-hover)',
              border: '1px dashed var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            + Custom stop (restaurant, hotel, viewpoint...)
          </button>
        )}
      </div>
    </div>
  );
}
