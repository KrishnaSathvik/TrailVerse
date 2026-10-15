'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import tripService from '../services/tripService';

/**
 * Shared state for the plan workspace.
 * Structural edits + grounded add_place are server-authoritative via
 * POST /api/trips/:tripId/manual-mutations.
 */
export default function usePlanWorkspace(tripId) {
  const { showToast } = useToast();

  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [isDirty, setIsDirty] = useState(false);

  const applyTripResult = useCallback((tripData) => {
    setTrip(tripData);
    if (tripData.plan?.days && tripData.plan.days.length > 0) {
      setDays(tripData.plan.days);
    }
  }, []);

  const reloadTrip = useCallback(async () => {
    if (!tripId) return;
    const data = await tripService.getTrip(tripId);
    applyTripResult(data.data || data);
  }, [tripId, applyTripResult]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    async function loadTrip() {
      try {
        setIsLoading(true);
        const data = await tripService.getTrip(tripId);
        const tripData = data.data || data;
        if (cancelled) return;
        applyTripResult(tripData);
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
  }, [tripId, applyTripResult, showToast]);

  const runMutation = useCallback(async (body, { quiet = false } = {}) => {
    if (!tripId) return { ok: false, code: 'manual_mutation_invalid' };
    setSaveState('saving');
    setIsDirty(true);
    try {
      const result = await tripService.applyManualMutation(tripId, body);
      const tripData = result.data || result;
      applyTripResult(tripData);
      setIsDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      return { ok: true };
    } catch (err) {
      const payload = err?.response?.data || {};
      const code = payload.code || err?.code;
      if (err?.response?.status === 409 || code === 'canonical_write_conflict') {
        showToast('Trip changed elsewhere. Reloading…', 'error');
        try { await reloadTrip(); } catch { /* ignore */ }
      } else if (code === 'manual_mutation_last_day') {
        showToast('Trip must have at least one day', 'info');
      } else if (code === 'place_ambiguous' || code === 'place_unresolved') {
        // Caller (Add place) owns UX for these.
      } else if (!quiet) {
        showToast(payload.error || 'Failed to save', 'error');
      }
      setSaveState('idle');
      setIsDirty(false);
      return {
        ok: false,
        code,
        error: payload.error,
        query: payload.query,
        choices: payload.choices,
      };
    }
  }, [tripId, applyTripResult, reloadTrip, showToast]);

  const parkCenter = useMemo(() => {
    if (trip?.parkLatitude && trip?.parkLongitude) {
      return { lat: trip.parkLatitude, lng: trip.parkLongitude };
    }
    const stops = days.flatMap((d) => d.stops || []).filter(
      (s) => Number.isFinite(s?.location?.lat) && Number.isFinite(s?.location?.lon),
    );
    if (stops.length === 0) return undefined;
    return {
      lat: stops.reduce((sum, s) => sum + s.location.lat, 0) / stops.length,
      lng: stops.reduce((sum, s) => sum + s.location.lon, 0) / stops.length,
    };
  }, [trip, days]);

  const addDay = useCallback(async () => {
    await runMutation({ op: 'add_day', afterDayNumber: days.length });
  }, [runMutation, days.length]);

  const removeDay = useCallback(async (dayId) => {
    if (days.length <= 1) {
      showToast('Trip must have at least one day', 'info');
      return;
    }
    await runMutation({ op: 'remove_day', dayId });
  }, [runMutation, days.length, showToast]);

  const removeStop = useCallback(async (dayId, stopId) => {
    await runMutation({ op: 'remove_stop', stopId });
  }, [runMutation]);

  const removeStopById = useCallback(async (stopId) => {
    await runMutation({ op: 'remove_stop', stopId });
  }, [runMutation]);

  const moveStopBetweenDays = useCallback(async (stopId, toDayId) => {
    await runMutation({ op: 'move_stop', stopId, toDayId });
  }, [runMutation]);

  /** Grounded Add place — query (+ optional candidateId) only. */
  const addPlace = useCallback(async ({ dayId, query, candidateId } = {}) => {
    const body = {
      op: 'add_place',
      dayId,
      query,
      ...(candidateId ? { candidateId } : {}),
    };
    return runMutation(body, { quiet: true });
  }, [runMutation]);

  const onDragEnd = useCallback(() => {}, []);
  const updateDayLabel = useCallback(() => {
    showToast('Editing day labels is coming soon', 'info');
  }, [showToast]);
  const addStop = useCallback(() => {
    showToast('Use Add place with a place name', 'info');
  }, [showToast]);
  const updateStop = useCallback(() => {
    showToast('Editing stop details is coming soon', 'info');
  }, [showToast]);
  const updateStopById = useCallback(() => {
    showToast('Editing stop details is coming soon', 'info');
  }, [showToast]);
  const addStopFromMap = useCallback(() => {
    showToast('Use Add place with a place name', 'info');
  }, [showToast]);

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
    addPlace,
  };
}
