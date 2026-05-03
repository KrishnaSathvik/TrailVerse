'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import tripService from '../services/tripService';

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

/**
 * Shared state management for the plan workspace.
 *
 * Extracts trip loading, days state, auto-save, and all mutation
 * handlers that were previously duplicated between ItineraryBuilder
 * and the map page route.
 */
export default function usePlanWorkspace(tripId) {
  const { showToast } = useToast();

  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [isDirty, setIsDirty] = useState(false);
  const saveTimerRef = useRef(null);
  const daysRef = useRef(days);
  const tripRef = useRef(trip);
  const isDirtyRef = useRef(isDirty);

  // Keep refs in sync for the unmount flush
  useEffect(() => { daysRef.current = days; }, [days]);
  useEffect(() => { tripRef.current = trip; }, [trip]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // Load trip on mount
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    async function loadTrip() {
      try {
        setIsLoading(true);
        const data = await tripService.getTrip(tripId);
        const tripData = data.data || data;
        if (cancelled) return;
        setTrip(tripData);

        if (tripData.plan?.days && tripData.plan.days.length > 0) {
          setDays(tripData.plan.days);
        } else {
          setDays([{
            id: `day-${uid()}`,
            dayNumber: 1,
            label: 'Day 1',
            stops: []
          }]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
          showToast('Failed to load trip', 'error');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadTrip();
    return () => { cancelled = true; };
  }, [tripId]);

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

  // Flush unsaved changes immediately on unmount (e.g. navigating to chat)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (isDirtyRef.current && tripId) {
        const updatedPlan = {
          ...(tripRef.current?.plan || {}),
          type: 'itinerary',
          version: 1,
          days: daysRef.current,
          updatedAt: new Date().toISOString(),
        };
        // Fire-and-forget — navigator.sendBeacon isn't suitable for JSON APIs,
        // so we use a plain fetch. The page isn't unloading (it's a SPA route
        // change), so this will complete.
        tripService.updateTrip(tripId, { plan: updatedPlan }).catch(() => {});
      }
    };
  }, [tripId]);

  // Park center for map biasing — memoized
  const parkCenter = useMemo(() => {
    if (trip?.parkLatitude && trip?.parkLongitude) {
      return { lat: trip.parkLatitude, lng: trip.parkLongitude };
    }
    const stops = days.flatMap(d => d.stops).filter(
      s => typeof s.latitude === 'number' && typeof s.longitude === 'number'
    );
    if (stops.length === 0) return undefined;
    return {
      lat: stops.reduce((sum, s) => sum + s.latitude, 0) / stops.length,
      lng: stops.reduce((sum, s) => sum + s.longitude, 0) / stops.length,
    };
  }, [trip, days]);

  // Drag end handler
  const onDragEnd = useCallback((result) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId &&
        source.index === destination.index) return;

    const newDays = [...days];

    if (type === 'DAY') {
      const reordered = reorder(newDays, source.index, destination.index);
      const renumbered = reordered.map((d, i) => ({
        ...d,
        dayNumber: i + 1,
        label: d.label.replace(/^Day \d+/, `Day ${i + 1}`)
      }));
      setDays(renumbered);
    } else {
      const srcIdx = newDays.findIndex(d => d.id === source.droppableId);
      const dstIdx = newDays.findIndex(d => d.id === destination.droppableId);
      if (srcIdx === -1 || dstIdx === -1) return;

      if (srcIdx === dstIdx) {
        newDays[srcIdx] = {
          ...newDays[srcIdx],
          stops: reorder(newDays[srcIdx].stops, source.index, destination.index)
        };
      } else {
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

  const addDay = useCallback(() => {
    const newDayNum = days.length + 1;
    setDays(prev => [...prev, {
      id: `day-${uid()}`,
      dayNumber: newDayNum,
      label: `Day ${newDayNum}`,
      stops: []
    }]);
    setIsDirty(true);
  }, [days.length]);

  const removeDay = useCallback((dayId) => {
    if (days.length <= 1) {
      showToast('Trip must have at least one day', 'info');
      return;
    }
    setDays(prev => {
      const filtered = prev.filter(d => d.id !== dayId);
      return filtered.map((d, i) => ({
        ...d,
        dayNumber: i + 1,
        label: d.label.replace(/^Day \d+/, `Day ${i + 1}`)
      }));
    });
    setIsDirty(true);
  }, [days.length]);

  const updateDayLabel = useCallback((dayId, newLabel) => {
    setDays(prev => prev.map(d =>
      d.id === dayId ? { ...d, label: newLabel } : d
    ));
    setIsDirty(true);
  }, []);

  const addStop = useCallback((dayId, stop) => {
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
  }, []);

  const removeStop = useCallback((dayId, stopId) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d;
      return { ...d, stops: d.stops.filter(s => s.id !== stopId) };
    }));
    setIsDirty(true);
  }, []);

  const updateStop = useCallback((dayId, stopId, updates) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d;
      return {
        ...d,
        stops: d.stops.map(s => s.id === stopId ? { ...s, ...updates } : s)
      };
    }));
    setIsDirty(true);
  }, []);

  // Map-style remove: takes only stopId, searches all days
  const removeStopById = useCallback((stopId) => {
    setDays(prev => prev.map(d => ({
      ...d,
      stops: d.stops
        .filter(s => s.id !== stopId)
        .map((s, i) => ({ ...s, order: i })),
    })));
    setIsDirty(true);
  }, []);

  // Map-style update: takes stopId + patch, searches all days
  const updateStopById = useCallback((stopId, patch) => {
    setDays(prev => prev.map(d => ({
      ...d,
      stops: d.stops.map(s => s.id === stopId ? { ...s, ...patch } : s),
    })));
    setIsDirty(true);
  }, []);

  const moveStopBetweenDays = useCallback((stopId, toDayId) => {
    setDays(prev => {
      let movedStop = null;
      const withoutStop = prev.map(d => ({
        ...d,
        stops: d.stops.filter(s => {
          if (s.id === stopId) {
            movedStop = s;
            return false;
          }
          return true;
        }).map((s, i) => ({ ...s, order: i })),
      }));

      if (!movedStop) return prev;

      return withoutStop.map(d => {
        if (d.id !== toDayId) return d;
        return {
          ...d,
          stops: [...d.stops, { ...movedStop, order: d.stops.length }],
        };
      });
    });
    setIsDirty(true);
  }, []);

  // Add a stop via the map AddPlaceInput: (stop, dayId) shape
  const addStopFromMap = useCallback((stop, dayId) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d;
      return {
        ...d,
        stops: [...d.stops, { ...stop, order: d.stops.length }],
      };
    }));
    setIsDirty(true);
  }, []);

  return {
    trip,
    days,
    isLoading,
    error,
    saveState,
    isDirty,
    parkCenter,
    onDragEnd,
    addDay,
    removeDay,
    updateDayLabel,
    addStop,
    removeStop,
    updateStop,
    removeStopById,
    updateStopById,
    moveStopBetweenDays,
    addStopFromMap,
  };
}
