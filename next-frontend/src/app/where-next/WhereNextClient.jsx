'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X } from '@components/icons';
import DotSpinner from '@/components/common/DotSpinner';
import PublicPageHero from '@/components/common/PublicPageHero';
import { useDebounce } from '@/hooks/useDebounce';
import npsApi from '@/services/npsApi';
import {
  fetchWhereNextMe,
  fetchWhereNextStats,
  patchWhereNextWindow,
  submitWhereNextPick,
} from '@/services/whereNextService';
import {
  TRAVEL_WINDOWS,
  getWhereNextSessionId,
  landingCopy,
  resolveWhereNextSource,
  returningStep,
} from '@/lib/whereNext';
import { logWhereNext } from '@/utils/analytics';
import WhereNextResult from '@/components/where-next/WhereNextResult';

function pickLabel(pick) {
  return (pick?.canonicalName || pick?.displayName || pick?.rawInput || '').trim();
}

export default function WhereNextClient({ children }) {
  const searchParams = useSearchParams();
  const inputRef = useRef(null);
  const [step, setStep] = useState('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pick, setPick] = useState(null);
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const trimmed = query.trim();
  const debouncedQuery = useDebounce(trimmed, 300);
  const getSource = useCallback(
    () => resolveWhereNextSource(
      searchParams,
      typeof document !== 'undefined' ? document.referrer : ''
    ),
    [searchParams]
  );
  const selectedName = pickLabel(pick);
  const queryIsSelectedPick = Boolean(
    selectedName && trimmed.toLowerCase() === selectedName.toLowerCase()
  );
  const showSuggestions = Boolean(trimmed) && !queryIsSelectedPick;

  useEffect(() => {
    const source = getSource();
    logWhereNext('where_next_view', { source });
    const sessionId = getWhereNextSessionId();
    Promise.all([
      fetchWhereNextMe(sessionId).catch(() => null),
      fetchWhereNextStats().catch(() => null),
    ]).then(([me, publicStats]) => {
      if (me?.pick) {
        setPick(me.pick);
        setStats(me.stats);
        setQuery(pickLabel(me.pick));
        setStep(returningStep(me.pick));
        return;
      }
      if (publicStats?.stats) setStats(publicStats.stats);
    });
  }, [getSource]);

  useEffect(() => {
    if (!showSuggestions || debouncedQuery.length < 2) {
      setResults([]);
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    setSearchLoading(true);
    logWhereNext('where_next_search_query', {
      source: getSource(),
      queryLength: debouncedQuery.length,
    });
    npsApi
      .searchParks(debouncedQuery, null, 8)
      .then(({ parks }) => {
        if (!cancelled) setResults(parks || []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, getSource, showSuggestions]);

  const persistPick = useCallback(async ({ rawInput, parkCode }) => {
    setSaving(true);
    setError('');
    const source = getSource();
    try {
      const sessionId = getWhereNextSessionId();
      const data = await submitWhereNextPick({
        sessionId,
        rawInput,
        parkCode,
        source,
      });
      setPick(data.pick);
      setStats(data.stats);
      logWhereNext('where_next_destination_selected', {
        source,
        matched: Boolean(data.pick?.parkCode),
        parkCode: data.pick?.parkCode || null,
      });
      if (data.changed) {
        logWhereNext('where_next_destination_changed', {
          source,
          parkCode: data.pick?.parkCode || null,
        });
      }
      logWhereNext(
        data.pick?.parkCode ? 'where_next_destination_matched' : 'where_next_destination_unmatched',
        { source, parkCode: data.pick?.parkCode || null, matched: Boolean(data.pick?.parkCode) }
      );
      setQuery(pickLabel(data.pick) || rawInput);
      setResults([]);
      setStep('when');
    } catch (err) {
      setError(err.message || 'Unable to save destination');
    } finally {
      setSaving(false);
    }
  }, [getSource]);

  const saveWindow = async (travelWindow) => {
    setSaving(true);
    setError('');
    try {
      const sessionId = getWhereNextSessionId();
      const data = await patchWhereNextWindow({ sessionId, travelWindow });
      setPick(data.pick);
      setStats(data.stats);
      if (travelWindow) {
        logWhereNext('where_next_when_selected', {
          source: getSource(),
          travelWindow,
          parkCode: data.pick?.parkCode || null,
        });
      }
      setStep('result');
    } catch (err) {
      setError(err.message || 'Unable to save');
    } finally {
      setSaving(false);
    }
  };

  const displayName = selectedName;

  return (
    <main className="info-page">
      <PublicPageHero eyebrow="Trip Finder" icon="Compass" iconColor="var(--icon-discovery)" title="Where Next?" description="A place you’ve been dreaming of. A trip you haven’t planned yet. Start here." />
      <div className="where-next-page">
      <div className="where-next-layout">
      <section className="where-next-picker" aria-label="Choose your next destination">
        {step === 'search' && <>
        <h2 id="destination-heading">Where would you love to go?</h2>
        <p className="where-next-description">Pick one destination. Add a season if you have one in mind.</p>
        <div className="relative min-w-0 text-left">
          <label className="where-next-search flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <Search size={22} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => logWhereNext('where_next_search_started', { source: getSource() })}
              placeholder="Search any destination..."
              className="min-w-0 w-full appearance-none border-0 bg-transparent p-0 text-lg shadow-none outline-none ring-0"
              style={{
                color: 'var(--text-primary)',
                WebkitAppearance: 'none',
                appearance: 'none',
              }}
              autoComplete="off"
              enterKeyHint="search"
              aria-label="Search any destination"
            />
            {trimmed ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <X size={20} style={{ color: 'var(--text-secondary)' }} />
              </button>
            ) : null}
          </label>

          {showSuggestions ? (
            <div
              className="absolute left-0 right-0 z-10 mt-2 max-h-[min(50vh,22rem)] overflow-y-auto rounded-2xl border"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--text-secondary)',
              }}
            >
              {searchLoading ? (
                <div className="flex justify-center py-6">
                  <DotSpinner />
                </div>
              ) : null}
              {results.map((park) => (
                <button
                  key={park.parkCode}
                  type="button"
                  disabled={saving}
                  onClick={() => persistPick({
                    rawInput: park.fullName,
                    parkCode: park.parkCode,
                  })}
                  className="w-full px-5 py-4 text-left"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <div className="text-lg font-medium">{park.fullName}</div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {[park.states, park.designation].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
              <button
                type="button"
                disabled={saving}
                onClick={() => persistPick({ rawInput: trimmed })}
                className="w-full px-5 py-4 text-left"
                style={{ color: 'var(--text-primary)' }}
              >
                Choose “{trimmed}”
              </button>
            </div>
          ) : null}
        </div>

        </>}

        {step === 'when' && displayName ? (
          <div className="where-next-timing">
            <div className="where-next-selection">
              <div>
                <p className="where-next-caption">Your destination</p>
                <h2 id="destination-heading">{displayName}</h2>
              </div>
              <button type="button" className="where-next-text-button" disabled={saving} onClick={() => { setQuery(''); setResults([]); setStep('search'); }}>Change</button>
            </div>
            <fieldset disabled={saving} className="where-next-seasons">
              <legend>When would you like to go?</legend>
              <p className="where-next-description">A rough season is enough. You can also leave this open.</p>
              <div className="where-next-season-grid">
                {TRAVEL_WINDOWS.map((window) => (
                  <button key={window.id} type="button" onClick={() => saveWindow(window.id)} className={`where-next-season ${window.id === 'someday' ? 'where-next-season-flexible' : ''}`}>
                    {window.label}
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => saveWindow(null)} className="where-next-text-button where-next-skip">Skip for now</button>
            </fieldset>
          </div>
        ) : null}

        {step === 'result' && pick ? (
          <div className="w-full">
            <WhereNextResult
              pick={pick}
              stats={stats}
              onChangePick={() => {
                setQuery('');
                setResults([]);
                setStep('search');
                inputRef.current?.focus();
              }}
              onParkClick={() => logWhereNext('where_next_park_click', { source: getSource(), parkCode: pick.parkCode })}
              onTrailieClick={() => logWhereNext('where_next_trailie_click', { source: getSource(), parkCode: pick.parkCode })}
            />
          </div>
        ) : null}

        {step === 'search' && (
          <div className="where-next-community">
            <h3>From the community</h3>
            <p>{landingCopy(stats?.volumeTier)}</p>
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-[var(--text-secondary)]">{error}</p>}
      </section>
      {children}
      </div>
      </div>
    </main>
  );
}
