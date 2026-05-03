'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, MapPin, Map as MapIcon, Loader2, Check, Plus, ExternalLink } from '@components/icons';
import Header from '../common/Header';
import usePlanWorkspace from '../../hooks/usePlanWorkspace';
import ItineraryMapView, { DAY_COLORS } from './ItineraryMapView';
import DayCardList from './DayCardList';
import AddPlaceInput from '../maps/AddPlaceInput';

function buildDayMapsUrl(day) {
  const stops = (day?.stops || [])
    .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number');
  if (stops.length === 0) return null;
  const waypoints = stops.map(s => encodeURIComponent(s.name || `${s.latitude},${s.longitude}`));
  return `https://www.google.com/maps/dir/${waypoints.join('/')}`;
}

export default function PlanWorkspace({ tripId }) {
  const router = useRouter();

  const {
    trip, days, isLoading, error, saveState, parkCenter,
    addDay, removeDay, updateDayLabel,
    addStop, removeStop, updateStop,
    removeStopById, moveStopBetweenDays, addStopFromMap,
  } = usePlanWorkspace(tripId);

  // ── Unified day selection — default to first day ──
  const [activeDayId, setActiveDayId] = useState(null);

  // Set initial activeDayId once days load
  useEffect(() => {
    if (days.length > 0 && !activeDayId) {
      setActiveDayId(days[0].id);
    }
  }, [days, activeDayId]);

  // If active day gets deleted, fallback to first
  useEffect(() => {
    if (activeDayId && activeDayId !== 'all' && !days.find(d => d.id === activeDayId)) {
      setActiveDayId(days[0]?.id || null);
    }
  }, [days, activeDayId]);

  // ── Cross-view selection sync ──
  const [selectedStopId, setSelectedStopId] = useState(null);
  const addPlaceRef = useRef(null);

  // Mobile responsiveness
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState('map');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Active day object
  const activeDayIndex = days.findIndex(d => d.id === activeDayId);
  const activeDay = activeDayIndex !== -1 ? days[activeDayIndex] : null;

  // ── Cross-view handlers ──

  // Card clicked → pan map to that stop
  const handleStopClick = (stopId) => {
    setSelectedStopId(stopId);
    if (isMobile && activeTab === 'list') {
      setActiveTab('map');
    }
  };

  // Marker clicked → highlight card, stay on map (InfoWindow shows the details)
  const handleMarkerClick = (stopId) => {
    setSelectedStopId(stopId);
  };

  // Clear selection after 3s
  useEffect(() => {
    if (!selectedStopId) return;
    const t = setTimeout(() => setSelectedStopId(null), 3000);
    return () => clearTimeout(t);
  }, [selectedStopId]);

  // ── Loading / error ──

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" style={{ color: 'var(--accent-green)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading your trip...</p>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Could not load this trip.
          </div>
        </main>
      </div>
    );
  }

  const tripTitle = trip?.title || trip?.parkName || 'Untitled Trip';
  const hasStops = days.some(d => d.stops?.length > 0);

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* ─── Sub-header: PLAN label + title + Chat/Plan toggle + save ─── */}
      <section
        className="relative z-10 border-b px-4 py-2 sm:px-6 sm:py-2.5 lg:px-10 xl:px-12 flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] sm:text-xs" style={{ color: 'var(--text-secondary)' }}>
              Plan
            </p>
            <h1 className="mt-0.5 truncate text-base font-semibold sm:text-lg" style={{ color: 'var(--text-primary)' }}>
              {tripTitle}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saveState !== 'idle' && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:text-xs"
                style={{
                  backgroundColor: saveState === 'saved' ? 'rgba(34,197,94,0.1)' : 'var(--surface-hover)',
                  color: saveState === 'saved' ? 'var(--accent-green)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border)',
                }}
              >
                {saveState === 'saving' && (
                  <><span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent-orange, #f97316)' }} />Saving...</>
                )}
                {saveState === 'saved' && (
                  <><Check className="h-3 w-3" />Saved</>
                )}
              </span>
            )}
            <div
              className="inline-flex items-center rounded-full p-0.5"
              style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}
            >
              <button
                onClick={() => router.push(`/plan-ai/${tripId}`)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition sm:px-3 sm:text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <MessageSquare className="h-3.5 w-3.5" />Chat
              </button>
              <button
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:px-3 sm:text-xs"
                style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
              >
                <MapPin className="h-3.5 w-3.5" />Plan
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Day pills bar + Add place ─── */}
      <div
        className="flex items-center gap-2 px-4 py-2 sm:px-6 lg:px-10 xl:px-12 border-b flex-shrink-0 overflow-x-auto"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Day pills */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {days.map((d, i) => {
            const isActive = activeDayId === d.id;
            const color = DAY_COLORS[i % DAY_COLORS.length];
            return (
              <button
                key={d.id}
                onClick={() => setActiveDayId(d.id)}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:text-xs whitespace-nowrap"
                style={isActive
                  ? { backgroundColor: color, color: '#fff' }
                  : { backgroundColor: 'var(--surface-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                }
              >
                Day {i + 1}
              </button>
            );
          })}
          <button
            onClick={() => setActiveDayId('all')}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium transition sm:px-3 sm:text-xs whitespace-nowrap"
            style={activeDayId === 'all'
              ? { backgroundColor: 'var(--accent-green)', color: '#fff' }
              : { backgroundColor: 'var(--surface-hover)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }
            }
          >
            All
          </button>
          <button
            onClick={addDay}
            className="rounded-full p-1 transition hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-tertiary)', border: '1px dashed var(--border)' }}
            title="Add day"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Open Day in Google Maps */}
        {activeDayId !== 'all' && activeDay && buildDayMapsUrl(activeDay) && (
          <a
            href={buildDayMapsUrl(activeDay)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:opacity-90 whitespace-nowrap flex-shrink-0 sm:text-xs"
            style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
          >
            <ExternalLink className="h-3 w-3" />
            Open Day {activeDayIndex + 1} in Maps
          </a>
        )}

      </div>

      {/* ─── Mobile tab bar ─── */}
      {isMobile && (
        <div
          className="flex border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
        >
          <button
            onClick={() => setActiveTab('map')}
            className="flex-1 py-2 text-xs font-semibold uppercase tracking-wider text-center transition"
            style={{
              color: activeTab === 'map' ? 'var(--accent-green)' : 'var(--text-tertiary)',
              borderBottom: activeTab === 'map' ? '2px solid var(--accent-green)' : '2px solid transparent',
            }}
          >
            <MapIcon className="h-3.5 w-3.5 inline mr-1" />Map
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className="flex-1 py-2 text-xs font-semibold uppercase tracking-wider text-center transition"
            style={{
              color: activeTab === 'list' ? 'var(--accent-green)' : 'var(--text-tertiary)',
              borderBottom: activeTab === 'list' ? '2px solid var(--accent-green)' : '2px solid transparent',
            }}
          >
            <MapPin className="h-3.5 w-3.5 inline mr-1" />List
          </button>
        </div>
      )}

      {/* ─── Main split: Map (left 58%) + Cards (right 42%) ─── */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

        {/* Map panel */}
        <div
          className={`${isMobile
            ? (activeTab === 'map' ? 'flex flex-col w-full' : 'hidden')
            : 'flex flex-col'
          } overflow-hidden`}
          style={!isMobile ? { width: '58%' } : undefined}
        >
          {/* Mobile: add place input inside map tab */}
          {isMobile && days.length > 0 && (
            <div ref={addPlaceRef} className="relative z-20 flex-shrink-0 px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <AddPlaceInput
                days={days}
                onAdd={addStopFromMap}
                biasCenter={parkCenter}
                activeDayId={activeDayId !== 'all' ? activeDayId : undefined}
                placeholder="Add a place..."
              />
            </div>
          )}
          <div className="flex-1 min-h-0 p-3">
            {hasStops ? (
              <ItineraryMapView
                days={days}
                activeDayId={activeDayId || 'all'}
                parkCenter={parkCenter}
                selectedStopId={selectedStopId}
                onMarkerClick={handleMarkerClick}
                isMobile={isMobile}
              />
            ) : (
              <div
                className="flex items-center justify-center h-full rounded-xl border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <p className="text-sm text-center px-6">
                  No stops yet. Add stops or go back to chat to generate an itinerary.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Card list panel */}
        <div
          className={`${isMobile
            ? (activeTab === 'list' ? 'flex flex-col w-full' : 'hidden')
            : 'flex flex-col border-l'
          } min-h-0`}
          style={{
            ...(!isMobile ? { width: '42%' } : {}),
            borderColor: 'var(--border)',
          }}
        >
          {/* Add place input — sticky at top of card panel */}
          {!isMobile && days.length > 0 && (
            <div
              ref={addPlaceRef}
              className="relative z-20 flex-shrink-0 px-4 py-2.5 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <AddPlaceInput
                days={days}
                onAdd={addStopFromMap}
                biasCenter={parkCenter}
                activeDayId={activeDayId !== 'all' ? activeDayId : undefined}
                placeholder="Add a place to your trip..."
              />
            </div>
          )}
          {activeDayId === 'all' ? (
            // All-days overview: show each day's stop count
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
                All Days Overview
              </p>
              {days.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDayId(d.id)}
                  className="w-full text-left rounded-xl p-3.5 transition hover:shadow-sm"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: DAY_COLORS[i % DAY_COLORS.length] }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {d.label}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {d.stops?.length || 0} {(d.stops?.length || 0) === 1 ? 'stop' : 'stops'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <DayCardList
              day={activeDay}
              dayIndex={activeDayIndex}
              allDays={days}
              selectedStopId={selectedStopId}
              onStopClick={handleStopClick}
              onRemoveStop={removeStop}
              onUpdateStop={updateStop}
              onMoveStop={moveStopBetweenDays}
              onRequestAddStop={() => {
                const input = addPlaceRef.current?.querySelector('input');
                if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus(); }
              }}
              onRemoveDay={(dayId) => {
                removeDay(dayId);
                setActiveDayId(days[0]?.id !== dayId ? days[0]?.id : days[1]?.id || null);
              }}
              addDay={addDay}
              tripId={tripId}
              router={router}
            />
          )}
        </div>
      </div>
    </div>
  );
}
