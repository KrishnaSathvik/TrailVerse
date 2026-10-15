'use client';

import { useEffect, useState } from 'react';
import { Search, MapPin, Check, X } from '@components/icons';
import Spinner from '../common/Spinner';

/**
 * Phase 2 grounded Add place — query-only.
 * The browser never sends coordinates, provider IDs, or provenance.
 * Server resolves via named_place; ambiguity returns structured choices.
 *
 * Props:
 *   - days
 *   - onAddQuery: async ({ dayId, query, candidateId? }) =>
 *       { ok: true } | { ok: false, code, choices?, query? }
 *   - activeDayId
 *   - placeholder
 *   - disabled
 */
export default function AddPlaceInput({
  days,
  onAddQuery,
  activeDayId: externalDayId,
  placeholder = 'Add a place…',
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [selectedDayId, setSelectedDayId] = useState(externalDayId || days?.[0]?.id || null);
  const [loading, setLoading] = useState(false);
  const [choices, setChoices] = useState(null);
  const [pendingQuery, setPendingQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (externalDayId) setSelectedDayId(externalDayId);
  }, [externalDayId]);

  useEffect(() => {
    if (!selectedDayId && days?.[0]?.id) setSelectedDayId(days[0].id);
  }, [days, selectedDayId]);

  const resetAmbiguity = () => {
    setChoices(null);
    setPendingQuery('');
  };

  const submit = async ({ candidateId } = {}) => {
    const text = (candidateId ? pendingQuery : query).trim();
    if (!text || !selectedDayId || typeof onAddQuery !== 'function' || disabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onAddQuery({
        dayId: selectedDayId,
        query: text,
        ...(candidateId ? { candidateId } : {}),
      });
      if (result?.ok) {
        setQuery('');
        resetAmbiguity();
        return;
      }
      if (result?.code === 'place_ambiguous' && Array.isArray(result.choices) && result.choices.length) {
        setPendingQuery(result.query || text);
        setChoices(result.choices);
        return;
      }
      setError(
        result?.code === 'place_unresolved'
          ? 'Could not find that place. Try a more specific name.'
          : result?.error || 'Could not add that place.',
      );
      resetAmbiguity();
    } catch {
      setError('Could not add that place.');
      resetAmbiguity();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <input
          type="search"
          value={query}
          disabled={disabled || loading || Boolean(choices)}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="min-w-[12rem] flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
          aria-label="Place name"
        />
        {days?.length > 1 && (
          <select
            value={selectedDayId || ''}
            disabled={disabled || loading}
            onChange={(e) => setSelectedDayId(e.target.value)}
            className="rounded-lg border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
            aria-label="Day"
          >
            {days.map((day) => (
              <option key={day.id} value={day.id}>
                {day.label || `Day ${day.dayNumber}`}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={disabled || loading || !query.trim() || Boolean(choices)}
          onClick={() => submit()}
          className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-green)' }}
        >
          {loading ? <Spinner size={14} /> : <Check className="h-3.5 w-3.5" />}
          Add
        </button>
      </div>

      {choices && (
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          role="listbox"
          aria-label="Which place did you mean?"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Which one did you mean for “{pendingQuery}”?
            </p>
            <button
              type="button"
              onClick={resetAmbiguity}
              className="min-h-8 rounded p-1"
              aria-label="Cancel place choices"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {choices.map((choice) => (
              <li key={choice.candidateId}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => submit({ candidateId: choice.candidateId })}
                  className="flex w-full min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:opacity-90"
                  style={{ background: 'var(--surface-hover)', color: 'var(--text-primary)' }}
                >
                  <MapPin className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-green)' }} />
                  <span>
                    <span className="font-medium">{choice.name}</span>
                    {choice.subtitle && (
                      <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {choice.subtitle}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--accent-red, #b91c1c)' }} role="status">
          {error}
        </p>
      )}
    </div>
  );
}
