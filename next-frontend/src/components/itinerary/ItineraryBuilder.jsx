'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, ArrowLeft, MessageSquare, Loader2, Check, MapPin } from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import tripService from '../../services/tripService';
import Header from '../common/Header';
import DayColumn from './DayColumn';
import AddStopSearch from './AddStopSearch';

// Generate a simple unique id
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function reorder(list, startIndex, endIndex) {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

export default function ItineraryBuilder({ tripId }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [isDirty, setIsDirty] = useState(false);
  const [addStopForDayId, setAddStopForDayId] = useState(null); // day ID for AddStopSearch modal
  const saveTimerRef = useRef(null);

  // Load trip on mount
  useEffect(() => {
    if (!tripId) return;
    loadTrip();
  }, [tripId]);

  const loadTrip = async () => {
    try {
      setIsLoading(true);
      const data = await tripService.getTrip(tripId);
      const tripData = data.data || data;
      setTrip(tripData);

      // Initialize days from plan.days or start fresh
      if (tripData.plan?.days && tripData.plan.days.length > 0) {
        setDays(tripData.plan.days);
      } else {
        // Fresh — start with one empty day
        setDays([{
          id: `day-${uid()}`,
          dayNumber: 1,
          label: 'Day 1',
          stops: []
        }]);
      }
    } catch (err) {
      showToast('Failed to load trip', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save with 2s debounce
  useEffect(() => {
    if (!isDirty || !tripId) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');

    saveTimerRef.current = setTimeout(async () => {
      try {
        const updatedPlan = {
          ...(trip?.plan || {}),
          type: 'itinerary',
          version: 1,
          days,
          updatedAt: new Date().toISOString(),
        };
        await tripService.updateTrip(tripId, { plan: updatedPlan });
        setSaveState('saved');
        setIsDirty(false);
        setTimeout(() => setSaveState('idle'), 2000);
      } catch (err) {
        setSaveState('idle');
        showToast('Failed to save', 'error');
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [days, isDirty]);

  // Drag end handler
  const onDragEnd = useCallback((result) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId &&
        source.index === destination.index) return;

    const newDays = [...days];

    if (type === 'DAY') {
      const reordered = reorder(newDays, source.index, destination.index);
      // Re-number days
      const renumbered = reordered.map((d, i) => ({
        ...d,
        dayNumber: i + 1,
        label: d.label.replace(/^Day \d+/, `Day ${i + 1}`)
      }));
      setDays(renumbered);
    } else {
      // Moving stops
      const srcIdx = newDays.findIndex(d => d.id === source.droppableId);
      const dstIdx = newDays.findIndex(d => d.id === destination.droppableId);

      if (srcIdx === -1 || dstIdx === -1) return;

      if (srcIdx === dstIdx) {
        // Same day — reorder
        newDays[srcIdx] = {
          ...newDays[srcIdx],
          stops: reorder(newDays[srcIdx].stops, source.index, destination.index)
        };
      } else {
        // Different day — move
        const srcStops = Array.from(newDays[srcIdx].stops);
        const dstStops = Array.from(newDays[dstIdx].stops);
        const [movedStop] = srcStops.splice(source.index, 1);
        dstStops.splice(destination.index, 0, movedStop);
        newDays[srcIdx] = { ...newDays[srcIdx], stops: srcStops };
        newDays[dstIdx] = { ...newDays[dstIdx], stops: dstStops };
      }
      setDays(newDays);
    }
    setIsDirty(true);
  }, [days]);

  const addDay = () => {
    const newDayNum = days.length + 1;
    setDays(prev => [...prev, {
      id: `day-${uid()}`,
      dayNumber: newDayNum,
      label: `Day ${newDayNum}`,
      stops: []
    }]);
    setIsDirty(true);
  };

  const removeDay = (dayId) => {
    if (days.length <= 1) {
      showToast('Trip must have at least one day', 'info');
      return;
    }
    setDays(prev => {
      const filtered = prev.filter(d => d.id !== dayId);
      // Re-number
      return filtered.map((d, i) => ({
        ...d,
        dayNumber: i + 1,
        label: d.label.replace(/^Day \d+/, `Day ${i + 1}`)
      }));
    });
    setIsDirty(true);
  };

  const updateDayLabel = (dayId, newLabel) => {
    setDays(prev => prev.map(d =>
      d.id === dayId ? { ...d, label: newLabel } : d
    ));
    setIsDirty(true);
  };

  const addStop = (dayId, stop) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d;
      return {
        ...d,
        stops: [...d.stops, {
          id: `stop-${uid()}`,
          order: d.stops.length,
          ...stop
        }]
      };
    }));
    setIsDirty(true);
  };

  const removeStop = (dayId, stopId) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d;
      return { ...d, stops: d.stops.filter(s => s.id !== stopId) };
    }));
    setIsDirty(true);
  };

  const updateStop = (dayId, stopId, updates) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d;
      return {
        ...d,
        stops: d.stops.map(s => s.id === stopId ? { ...s, ...updates } : s)
      };
    }));
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent-green)' }} />
      </div>
    );
  }

  const tripTitle = trip?.title || trip?.parkName || 'Untitled Trip';
  const totalStops = days.reduce((sum, d) => sum + (d.stops?.length || 0), 0);
  const hasStops = totalStops > 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Page Header — matches PlanAIContent pattern */}
      <section
        className="relative z-10 border-b px-4 py-2 sm:px-6 sm:py-4 lg:px-10 xl:px-12"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between gap-3">
          {/* Left: Label + Title */}
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] font-medium uppercase tracking-[0.18em] sm:text-xs sm:tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Itinerary Builder
            </p>
            <h1 className="mt-1 truncate text-base font-semibold sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
              {tripTitle}
            </h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Save state badge */}
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
                  <>
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent-orange, #f97316)' }} />
                    Saving...
                  </>
                )}
                {saveState === 'saved' && (
                  <>
                    <Check className="h-3 w-3" />
                    Saved
                  </>
                )}
              </span>
            )}

            {/* View toggle pills — Chat / Itinerary */}
            <div
              className="inline-flex items-center rounded-full p-0.5"
              style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}
            >
              <button
                onClick={() => router.push(`/plan-ai/${tripId}`)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition sm:px-3 sm:text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </button>
              <button
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:px-3 sm:text-xs"
                style={{
                  backgroundColor: 'var(--accent-green)',
                  color: '#fff',
                }}
              >
                <MapPin className="h-3.5 w-3.5" />
                Itinerary
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Board — responsive: vertical on mobile, horizontal on desktop */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:px-10 xl:px-12">

          {/* Empty state — when no stops exist yet */}
          {!hasStops && (
            <div
              className="mx-auto max-w-lg rounded-2xl p-6 sm:p-8 text-center mb-6"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}
              >
                <MapPin className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
              </div>
              <h3 className="text-base font-semibold sm:text-lg" style={{ color: 'var(--text-primary)' }}>
                Build your itinerary
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Drag and drop to organize your trip. Add stops from parks, trails, campgrounds, and more — or go back to chat and ask the AI to generate a full itinerary.
              </p>
              <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  onClick={() => router.push(`/plan-ai/${tripId}`)}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Chat
                </button>
                <button
                  onClick={addDay}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--accent-green)',
                    color: '#fff',
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Your First Stop
                </button>
              </div>
            </div>
          )}

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="board" type="DAY" direction="vertical">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex flex-col gap-4 lg:flex-row lg:items-start lg:overflow-x-auto pb-4"
                  style={{ minHeight: hasStops ? '60vh' : 'auto' }}
                >
                  {days.map((day, index) => (
                    <Draggable key={day.id} draggableId={day.id} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className="w-full lg:min-w-[320px] lg:max-w-[420px] lg:flex-1"
                          style={{
                            ...dragProvided.draggableProps.style,
                            opacity: dragSnapshot.isDragging ? 0.9 : 1,
                          }}
                        >
                          <DayColumn
                            day={day}
                            dragHandleProps={dragProvided.dragHandleProps}
                            onRemoveDay={removeDay}
                            onUpdateLabel={updateDayLabel}
                            onRequestAddStop={() => setAddStopForDayId(day.id)}
                            onRemoveStop={removeStop}
                            onUpdateStop={updateStop}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}

                  {/* Add Day card */}
                  <button
                    onClick={addDay}
                    className="w-full lg:min-w-[200px] lg:max-w-[240px] lg:flex-shrink-0 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-8 lg:py-16 transition hover:border-[var(--accent-green)] hover:text-[var(--accent-green)]"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <Plus className="h-7 w-7" />
                    <span className="text-sm font-medium">Add Day</span>
                  </button>
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>

      {/* Add Stop modal — rendered at root level so position:fixed works */}
      {addStopForDayId && (
        <AddStopSearch
          onSelect={(stop) => {
            addStop(addStopForDayId, stop);
            setAddStopForDayId(null);
          }}
          onClose={() => setAddStopForDayId(null)}
        />
      )}
    </div>
  );
}
