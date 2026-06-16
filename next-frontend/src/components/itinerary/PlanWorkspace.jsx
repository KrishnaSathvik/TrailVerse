'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Map as MapIcon, Check, Plus, ExternalLink, Download, List, ArrowLeft } from '@components/icons';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useToast } from '@/context/ToastContext';
import Header from '../common/Header';
import usePlanWorkspace from '../../hooks/usePlanWorkspace';
import ItineraryMapView, { DAY_COLORS } from './ItineraryMapView';
import DayCardList from './DayCardList';
import AddPlaceInput from '../maps/AddPlaceInput';

function buildTripMapsUrl(dayList) {
  const stops = (dayList || []).flatMap((day) => day?.stops || [])
    .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number');
  if (stops.length === 0) return null;

  const waypoints = stops.map((s) => encodeURIComponent(s.name || `${s.latitude},${s.longitude}`));
  // Google Maps directions URLs support a limited number of stops in one link.
  const maxWaypoints = 10;
  const limited = waypoints.length > maxWaypoints
    ? [...waypoints.slice(0, maxWaypoints - 1), waypoints[waypoints.length - 1]]
    : waypoints;

  return `https://www.google.com/maps/dir/${limited.join('/')}`;
}

export default function PlanWorkspace({ tripId }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isExportingPDF, setIsExportingPDF] = useState(false);

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
        <LoadingSpinner size="md" text="Loading your trip…" />
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
  const itinerarySubtitle = trip?.parkName || (tripTitle !== 'Untitled Trip' ? tripTitle : null);
  const hasStops = days.some(d => d.stops?.length > 0);
  const tripMapsUrl = buildTripMapsUrl(days);
  const listDayIndex = activeDayId === 'all' ? 0 : activeDayIndex;
  const listDay = listDayIndex >= 0 ? days[listDayIndex] : null;

  const handleExportPDF = async () => {
    if (!hasStops) {
      showToast('Add stops to your plan before exporting as PDF', 'info');
      return;
    }

    setIsExportingPDF(true);
    try {
      const { exportTripPdf } = await import('@/lib/pdf/exportTripPdf');
      await exportTripPdf({
        title: tripTitle,
        parkName: trip?.parkName || null,
        parkCode: trip?.parkCode || null,
        tripId,
        shareId: trip?.shareId || null,
        formData: trip?.formData || {},
        plan: { ...(trip?.plan || {}), days },
      });
      showToast('Trip plan exported as PDF!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to export PDF. Please try again.', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const dayPills = (
    <>
      {days.map((d, i) => {
        const isActive = activeDayId === d.id;
        const color = DAY_COLORS[i % DAY_COLORS.length];
        return (
          <button
            key={d.id}
            onClick={() => setActiveDayId(d.id)}
            className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition sm:px-3 sm:text-xs"
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
        className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition sm:px-3 sm:text-xs"
        style={activeDayId === 'all'
          ? { backgroundColor: 'var(--accent-green)', color: '#fff' }
          : { backgroundColor: 'var(--surface-hover)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }
        }
      >
        All
      </button>
      <button
        onClick={addDay}
        className="flex-shrink-0 rounded-full p-1 transition hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text-tertiary)', border: '1px dashed var(--border)' }}
        title="Add day"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </>
  );

  const backToChatButton = (
    <button
      type="button"
      onClick={() => router.push(`/plan-ai/${tripId}`)}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition hover:opacity-90 lg:min-w-[7.5rem] lg:flex-none lg:px-4"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent-green) 12%, var(--bg-primary))',
        border: '1px solid color-mix(in srgb, var(--accent-green) 35%, var(--border))',
        color: 'var(--accent-green)',
      }}
      title="Back to chat"
    >
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Back to Chat</span>
    </button>
  );

  const exportPdfButton = (
    <button
      type="button"
      onClick={handleExportPDF}
      disabled={isExportingPDF || !hasStops}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition hover:opacity-90 disabled:opacity-50 lg:min-w-[7.5rem] lg:flex-none lg:px-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      <Download className="h-3.5 w-3.5" />
      {isExportingPDF ? 'Exporting…' : 'PDF'}
    </button>
  );

  const planChrome = (
    <div
      className="relative z-10 flex-shrink-0 border-b"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="mx-auto grid w-full max-w-[92rem] grid-cols-1 gap-2.5 px-3 py-2.5 lg:grid-cols-2 lg:gap-x-5 lg:gap-y-3 lg:px-10 lg:py-3 xl:gap-x-6 xl:px-12">
        {/* Title — left column on desktop */}
        <div className="flex items-start gap-2 lg:col-start-1 lg:row-start-1">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-snug lg:text-lg" style={{ color: 'var(--text-primary)' }}>
              Day-by-Day Itinerary
            </h1>
            {itinerarySubtitle ? (
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed lg:text-sm" style={{ color: 'var(--text-secondary)' }}>
                {itinerarySubtitle}
              </p>
            ) : null}
          </div>
          {saveState === 'saving' && (
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--accent-orange, #f97316)' }}
              aria-label="Saving"
            />
          )}
          {saveState === 'saved' && (
            <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--accent-green)' }} aria-label="Saved" />
          )}
        </div>

        {/* Actions — right column on desktop */}
        <div className="flex items-center gap-2 lg:col-start-2 lg:row-start-1 lg:justify-end">
          {backToChatButton}
          {exportPdfButton}
        </div>

        {/* Day pills — left column on desktop */}
        <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] lg:col-start-1 lg:row-start-2 [&::-webkit-scrollbar]:hidden">
          {dayPills}
        </div>

        {/* Google Map — right column on desktop */}
        {tripMapsUrl ? (
          <a
            href={tripMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition hover:opacity-90 lg:col-start-2 lg:row-start-2 lg:min-w-[10rem] lg:w-auto lg:justify-self-end lg:px-4"
            style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
            title="Open full trip route in Google Maps"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Google Map
          </a>
        ) : (
          <div className="hidden lg:col-start-2 lg:row-start-2 lg:block" aria-hidden="true" />
        )}

        {/* Map / List toggle — mobile only, full width */}
        {isMobile && (
          <div
            className="col-span-1 grid grid-cols-2 gap-0.5 rounded-xl p-0.5 lg:hidden"
            style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className="flex items-center justify-center gap-1.5 rounded-[10px] py-2 text-xs font-semibold transition"
              style={{
                backgroundColor: activeTab === 'map' ? 'var(--bg-primary)' : 'transparent',
                color: activeTab === 'map' ? 'var(--accent-green)' : 'var(--text-tertiary)',
                boxShadow: activeTab === 'map' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
              }}
            >
              <MapIcon className="h-4 w-4" />
              Map
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className="flex items-center justify-center gap-1.5 rounded-[10px] py-2 text-xs font-semibold transition"
              style={{
                backgroundColor: activeTab === 'list' ? 'var(--bg-primary)' : 'transparent',
                color: activeTab === 'list' ? 'var(--accent-green)' : 'var(--text-tertiary)',
                boxShadow: activeTab === 'list' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
              }}
            >
              <List className="h-4 w-4" />
              List
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {planChrome}

      {/* ─── Main content: mobile tabs · desktop two-column map + list ─── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto grid min-h-0 w-full max-w-[92rem] flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2 lg:gap-5 lg:px-10 lg:py-3 xl:gap-6 xl:px-12">

          {/* Map column */}
          <div
            className={`${
              isMobile && activeTab !== 'map' ? 'hidden' : 'flex'
            } min-h-0 flex-col overflow-hidden ${isMobile ? 'flex-1' : ''}`}
          >
            {isMobile && days.length > 0 && (
              <div
                ref={activeTab === 'map' ? addPlaceRef : undefined}
                className="relative z-20 flex-shrink-0 border-b px-3 py-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <AddPlaceInput
                  days={days}
                  onAdd={addStopFromMap}
                  biasCenter={parkCenter}
                  activeDayId={activeDayId !== 'all' ? activeDayId : days[listDayIndex]?.id}
                  placeholder="Add a place..."
                />
              </div>
            )}
            <div
              className="min-h-0 flex-1 overflow-hidden rounded-xl border p-2 lg:p-3"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
            >
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
                  className="flex h-full items-center justify-center rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <p className="px-6 text-center text-sm">
                    No stops yet. Add stops or go back to chat to generate an itinerary.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* List column */}
          <div
            className={`${
              isMobile && activeTab !== 'list' ? 'hidden' : 'flex'
            } min-h-0 flex-col overflow-hidden border-t lg:border-t-0`}
            style={{ borderColor: 'var(--border)' }}
          >
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border lg:border lg:p-0"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
            >
              {days.length > 0 && (!isMobile || activeTab === 'list') && (
                <div
                  ref={!isMobile || activeTab === 'list' ? addPlaceRef : undefined}
                  className="relative z-20 flex-shrink-0 border-b px-3 py-2.5 lg:px-4"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <AddPlaceInput
                    days={days}
                    onAdd={addStopFromMap}
                    biasCenter={parkCenter}
                    activeDayId={activeDayId !== 'all' ? activeDayId : days[listDayIndex]?.id}
                    placeholder={isMobile ? 'Add a place...' : 'Add a place to your trip...'}
                  />
                </div>
              )}
              {activeDayId === 'all' && (
                <p className="flex-shrink-0 px-3 pt-2 text-[11px] lg:px-4" style={{ color: 'var(--text-tertiary)' }}>
                  Showing Day {listDayIndex + 1} in list — select a day pill to switch
                </p>
              )}
              <DayCardList
                day={listDay}
                dayIndex={listDayIndex}
                allDays={days}
                selectedStopId={selectedStopId}
                onStopClick={handleStopClick}
                onRemoveStop={removeStop}
                onUpdateStop={updateStop}
                onMoveStop={moveStopBetweenDays}
                onRequestAddStop={() => {
                  if (activeDayId === 'all' && listDay?.id) setActiveDayId(listDay.id);
                  const input = addPlaceRef.current?.querySelector('input');
                  if (input) {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    input.focus();
                  }
                }}
                onRemoveDay={(dayId) => {
                  removeDay(dayId);
                  setActiveDayId(days[0]?.id !== dayId ? days[0]?.id : days[1]?.id || null);
                }}
                addDay={addDay}
                tripId={tripId}
                router={router}
                dayColor={DAY_COLORS[listDayIndex % DAY_COLORS.length]}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
