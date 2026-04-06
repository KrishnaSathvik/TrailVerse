'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, ArrowLeft, MessageSquare, Loader2 } from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import tripService from '../../services/tripService';
import Header from '../common/Header';
import Button from '../common/Button';
import DayColumn from './DayColumn';

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

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Toolbar */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          marginTop: '64px'
        }}
      >
        {/* Back */}
        <button
          onClick={() => router.push(`/plan-ai/${tripId}`)}
          className="flex items-center gap-1.5 text-sm transition"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Chat</span>
        </button>

        <div className="w-px h-5" style={{ backgroundColor: 'var(--border)' }} />

        {/* Trip title */}
        <h1 className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {tripTitle}
        </h1>

        {/* View toggle */}
        <div
          className="hidden sm:flex items-center rounded-xl p-1 gap-1"
          style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={() => router.push(`/plan-ai/${tripId}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition"
            style={{ color: 'var(--text-secondary)' }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--accent-green)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <span style={{ fontSize: '12px' }}>📋</span>
            Itinerary
          </button>
        </div>

        {/* Save state */}
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {saveState === 'saving' && 'Saving...'}
          {saveState === 'saved' && '✓ Saved'}
        </span>

        {/* Add Day */}
        <Button variant="success" size="sm" icon={Plus} onClick={addDay}>Add Day</Button>
      </div>

      {/* Board — horizontal scroll */}
      <div className="flex-1 overflow-x-auto">
        <div className="min-h-full p-4 sm:p-6">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="board" type="DAY" direction="horizontal">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex gap-4 items-start"
                  style={{ minHeight: '60vh' }}
                >
                  {days.map((day, index) => (
                    <Draggable key={day.id} draggableId={day.id} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
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
                            onAddStop={addStop}
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
                    className="flex-shrink-0 w-72 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-12 transition hover:opacity-80"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-tertiary)',
                      minHeight: '200px'
                    }}
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-sm font-medium">Add Day</span>
                  </button>
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>
    </div>
  );
}
