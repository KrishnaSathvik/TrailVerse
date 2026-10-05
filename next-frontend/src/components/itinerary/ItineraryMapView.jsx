'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { isDrawableTransferEdge } from '@/lib/itineraryMapStops';
import {
  getGmapsMapId,
  getMapsRuntimeStatus,
  reportMapsRuntimeFailure,
  reportMapsRuntimeReady,
  subscribeMapsRuntimeStatus,
} from '@/lib/mapsRuntimeStatus';

export const ITINERARY_MAP_PATH_MODE = Object.freeze({
  DIRECTIONS: 'directions',
  ABSTRACT_EDGES: 'abstract-edges',
  NONE: 'none',
});

// Color cycle per day. Tuned to read on terrain map style.
const DAY_COLORS = [
  '#e63946', // red
  '#2a9d8f', // teal
  '#f4a261', // orange
  '#264653', // navy
  '#9d4edd', // purple
  '#06a77d', // green
  '#d62828', // crimson
  '#1d3557', // deep blue
];

export { DAY_COLORS };

export const DEFAULT_MAP_INIT_PADDING = { top: 60, right: 40, bottom: 60, left: 40 };
export const DEFAULT_MAP_FIT_PADDING = { top: 80, right: 40, bottom: 80, left: 40 };

function mergeMapPadding(override, fallback) {
  return {
    top: override?.top ?? fallback.top,
    right: override?.right ?? fallback.right,
    bottom: override?.bottom ?? fallback.bottom,
    left: override?.left ?? fallback.left,
  };
}

function trailieControlOptions(controlsPlacement) {
  if (controlsPlacement !== 'top-right' || !window.google?.maps?.ControlPosition) return undefined;
  const position = window.google.maps.ControlPosition.RIGHT_TOP;
  return {
    zoomControlOptions: { position },
    fullscreenControlOptions: { position },
  };
}

/**
 * Renders the itinerary as an interactive Google Map.
 *
 * `pathMode` isolates Trailie from the older PlanWorkspace:
 *   - `directions` (default) — existing workspace road polylines via DirectionsService
 *   - `abstract-edges` — Trailie semantic transfers only; never Directions
 *   - `none` — pins only (tests / fallback)
 *
 * Optional `fitPadding` / `controlsPlacement` are Trailie sheet presentation
 * only. PlanWorkspace omits them and keeps its existing camera/controls.
 *
 * The parent controls which day is visible via `activeDayId`.
 * Marker clicks fire `onMarkerClick` to sync with the card list.
 * InfoWindows are lightweight — just name + "Open in Maps" link.
 * All stop management (move, remove) is handled via cards.
 */
export default function ItineraryMapView({
  days,
  activeDayId = 'all',
  parkCenter,
  selectedStopId: externalSelectedStopId,
  onMarkerClick,
  isMobile = false,
  pathMode = ITINERARY_MAP_PATH_MODE.DIRECTIONS,
  fitPadding = null,
  controlsPlacement = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const edgeLabelsRef = useRef([]);
  const infoWindowRef = useRef(null);
  const directionsCacheRef = useRef(new Map());

  const [ready, setReady] = useState(false);
  const [runtimeBlocked, setRuntimeBlocked] = useState(
    () => getMapsRuntimeStatus().ok === false
  );

  // All stops, flat
  const allStops = useMemo(
    () => days.flatMap((d) => d.stops.map((s) => ({ ...s, _dayId: d.id }))),
    [days]
  );

  // Wait for Google Maps to be ready — or stop if the browser key/runtime failed.
  useEffect(() => {
    if (getMapsRuntimeStatus().ok === false) {
      setRuntimeBlocked(true);
      setReady(false);
      return undefined;
    }
    if (window.google?.maps?.marker) {
      setReady(true);
      return undefined;
    }
    const interval = setInterval(() => {
      if (getMapsRuntimeStatus().ok === false) {
        setRuntimeBlocked(true);
        setReady(false);
        clearInterval(interval);
        return;
      }
      if (window.google?.maps?.marker) {
        setReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return subscribeMapsRuntimeStatus((next) => {
      if (next.ok === false) {
        setRuntimeBlocked(true);
        setReady(false);
        mapRef.current = null;
      }
    });
  }, []);

  // Initialize the map once
  useEffect(() => {
    if (runtimeBlocked || !ready || !containerRef.current || mapRef.current) return;
    if (getMapsRuntimeStatus().ok === false) {
      setRuntimeBlocked(true);
      return;
    }

    const validStops = allStops.filter(
      (s) => typeof s.latitude === 'number' && typeof s.longitude === 'number'
    );

    let center = parkCenter || { lat: 39.5, lng: -98.35 };
    if (validStops.length > 0) {
      center = {
        lat: validStops.reduce((sum, s) => sum + s.latitude, 0) / validStops.length,
        lng: validStops.reduce((sum, s) => sum + s.longitude, 0) / validStops.length,
      };
    }

    const mapId = getGmapsMapId();
    if (!mapId) {
      reportMapsRuntimeFailure('missing_map_id');
      setRuntimeBlocked(true);
      return;
    }

    try {
      mapRef.current = new window.google.maps.Map(containerRef.current, {
        mapId,
        mapTypeId: 'terrain',
        center,
        zoom: 10,
        gestureHandling: 'greedy',
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        ...trailieControlOptions(controlsPlacement),
      });
      reportMapsRuntimeReady();
    } catch (_err) {
      reportMapsRuntimeFailure('map_init_error');
      setRuntimeBlocked(true);
      return;
    }

    if (validStops.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      validStops.forEach((s) => bounds.extend({ lat: s.latitude, lng: s.longitude }));
      mapRef.current.fitBounds(bounds, mergeMapPadding(fitPadding, DEFAULT_MAP_INIT_PADDING));
    }

    infoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 280 });
  }, [ready, runtimeBlocked, allStops, parkCenter]);

  // Render markers + routes whenever days or active filter changes
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    // Clear previous
    markersRef.current.forEach((m) => { m.map = null; });
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    edgeLabelsRef.current.forEach((m) => { m.map = null; });
    edgeLabelsRef.current = [];

    const visibleDays =
      activeDayId === 'all' ? days : days.filter((d) => d.id === activeDayId);

    visibleDays.forEach((day) => {
      const colorIdx = days.findIndex((d) => d.id === day.id);
      const color = DAY_COLORS[colorIdx % DAY_COLORS.length];

      day.stops.forEach((stop, stopIdx) => {
        if (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') return;

        const pinLabel = stop.pinNumber != null ? String(stop.pinNumber) : String(stopIdx + 1);
        const pin = buildPin(color, pinLabel, stop.source === 'user', Boolean(stop.hasBadge));
        const marker = new window.google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: stop.latitude, lng: stop.longitude },
          content: pin,
          title: stop.name,
        });

        marker.addListener('click', () => {
          onMarkerClick?.(stop.id);
          if (isMobile) {
            infoWindowRef.current.setContent(buildMobilePopup(stop, color));
            infoWindowRef.current.open(mapRef.current, marker);
          }
        });

        markersRef.current.push(marker);
      });

      if (pathMode === ITINERARY_MAP_PATH_MODE.ABSTRACT_EDGES) {
        drawAbstractTransferEdges(day, color, mapRef.current, polylinesRef.current, edgeLabelsRef.current);
      } else if (pathMode === ITINERARY_MAP_PATH_MODE.NONE) {
        // Pins only — no semantic connectors and no road geometry.
      } else if (day.stops.length >= 2) {
        drawDayRoute(day, color, mapRef.current, polylinesRef.current, directionsCacheRef.current);
      }
    });

    // Fit bounds to visible stops
    const visibleStops = visibleDays.flatMap((d) => d.stops).filter(
      (s) => typeof s.latitude === 'number' && typeof s.longitude === 'number'
    );
    if (visibleStops.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      visibleStops.forEach((s) =>
        bounds.extend({ lat: s.latitude, lng: s.longitude })
      );
      mapRef.current.fitBounds(bounds, mergeMapPadding(fitPadding, DEFAULT_MAP_FIT_PADDING));
    }
  }, [ready, days, activeDayId, pathMode]);

  useEffect(() => {
    if (!mapRef.current?.setOptions) return;
    const options = trailieControlOptions(controlsPlacement);
    if (options) mapRef.current.setOptions(options);
  }, [ready, controlsPlacement]);

  // Programmatic highlight: pan to selected stop + open InfoWindow
  useEffect(() => {
    if (!externalSelectedStopId || !ready || !mapRef.current) return;

    let targetStop = null;
    let targetDay = null;
    for (const d of days) {
      const s = d.stops.find(s => s.id === externalSelectedStopId);
      if (s) { targetStop = s; targetDay = d; break; }
    }
    if (!targetStop || typeof targetStop.latitude !== 'number') return;

    mapRef.current.panTo({ lat: targetStop.latitude, lng: targetStop.longitude });
    const extraBottom = Math.max(
      0,
      (fitPadding?.bottom ?? DEFAULT_MAP_FIT_PADDING.bottom) - DEFAULT_MAP_FIT_PADDING.bottom
    );
    if (extraBottom > 0 && typeof mapRef.current.panBy === 'function') {
      mapRef.current.panBy(0, extraBottom);
    }

    const markerIdx = markersRef.current.findIndex(m =>
      m.position?.lat === targetStop.latitude && m.position?.lng === targetStop.longitude
    );
    if (isMobile && markerIdx !== -1) {
      const marker = markersRef.current[markerIdx];
      const colorIdx = days.findIndex(d => d.id === targetDay.id);
      const color = DAY_COLORS[colorIdx % DAY_COLORS.length];
      infoWindowRef.current.setContent(buildMobilePopup(targetStop, color));
      infoWindowRef.current.open(mapRef.current, marker);
    }
  }, [externalSelectedStopId, ready, days, isMobile, fitPadding]);

  if (runtimeBlocked) {
    return (
      <div
        className="h-full w-full"
        data-testid="itinerary-map-runtime-blocked"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        minHeight: 300,
      }}
    />
  );
}

// ============================================================
// Helpers
// ============================================================

function buildPin(color, label, isUserAdded, hasBadge = false) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: relative;
    width: 32px; height: 32px; border-radius: 50%;
    background: ${isUserAdded ? '#fff' : color};
    color: ${isUserAdded ? color : '#fff'};
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; font-size: 13px;
    font-family: system-ui, -apple-system, sans-serif;
    border: 3px solid ${isUserAdded ? color : '#fff'};
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    cursor: pointer;
  `;
  div.textContent = label;
  // Restrained requirement marker (P1-6 action-required/condition-check
  // only — see itineraryMapStops.js). Optional, additive: absent when the
  // caller never sets `stop.hasBadge`, so unrelated map consumers
  // (PlanWorkspace's manual builder) are unaffected.
  if (hasBadge) {
    const badge = document.createElement('div');
    badge.style.cssText = `
      position: absolute; top: -3px; right: -3px;
      width: 12px; height: 12px; border-radius: 50%;
      background: #d97706; border: 2px solid #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    `;
    div.appendChild(badge);
  }
  return div;
}

function buildMobilePopup(stop, color) {
  const typeLabelMap = {
    trail: 'Hike', park: 'Park', landmark: 'Landmark', campground: 'Camp',
    visitor_center: 'Visitor Ctr', lodging: 'Lodging', restaurant: 'Dining',
    food: 'Dining', custom: 'Custom',
  };
  const typeLabel = typeLabelMap[stop.type] || '';
  const stats = [
    stop.distanceMiles > 0 ? `${stop.distanceMiles}mi` : null,
    stop.elevationGainFeet > 0 ? `↑${stop.elevationGainFeet.toLocaleString()}ft` : null,
    stop.duration ? (stop.duration >= 60 ? `${Math.floor(stop.duration / 60)}h${stop.duration % 60 ? stop.duration % 60 + 'm' : ''}` : `${stop.duration}m`) : null,
  ].filter(Boolean).join(' · ');
  const meta = [typeLabel, stop.difficulty].filter(Boolean).join(' · ');

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;max-width:240px;padding:4px;">
      <div style="font-weight:600;font-size:14px;line-height:1.3;color:#111;">
        ${escapeHtml(stop.name)}
      </div>
      ${meta ? `<div style="font-size:11px;color:${color};font-weight:600;margin-top:3px;">${escapeHtml(meta)}</div>` : ''}
      ${stats ? `<div style="font-size:12px;color:#555;margin-top:2px;">${escapeHtml(stats)}</div>` : ''}
      ${stop.why ? `<div style="font-size:12px;line-height:1.4;color:#555;margin-top:4px;">${escapeHtml(stop.why)}</div>` : ''}
    </div>
  `;
}

function drawAbstractTransferEdges(day, color, map, polylinesArr, labelsArr) {
  const byId = new Map((day.stops || []).map((stop) => [stop.id, stop]));
  const activityGroups = day.activityGroups || [];

  for (const edge of day.transferEdges || []) {
    if (!isDrawableTransferEdge(edge, activityGroups)) continue;
    const source = byId.get(edge.sourceStopId);
    const target = byId.get(edge.targetStopId);
    if (!source || !target) continue;
    if (typeof source.latitude !== 'number' || typeof source.longitude !== 'number') continue;
    if (typeof target.latitude !== 'number' || typeof target.longitude !== 'number') continue;

    // Straight dashed segment between authoritative pins. This is a semantic
    // transfer, not a Directions failure fallback and not a road path.
    polylinesArr.push(new window.google.maps.Polyline({
      path: [
        { lat: source.latitude, lng: source.longitude },
        { lat: target.latitude, lng: target.longitude },
      ],
      geodesic: false,
      strokeColor: color,
      strokeOpacity: 0,
      strokeWeight: 0,
      clickable: false,
      map,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 0.8,
            strokeColor: color,
            scale: 3,
          },
          offset: '0',
          repeat: '10px',
        },
        {
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 3,
            strokeColor: color,
            fillColor: color,
            fillOpacity: 0.9,
          },
          offset: '100%',
        },
      ],
    }));

    if (edge.status === 'unverified' || Number.isFinite(edge.minutes) && edge.minutes > 0) {
      const edgeText = edge.status === 'unverified' ? 'Travel time unverified' : `${Math.round(edge.minutes)} min ${edge.travelMode || 'drive'}`;
      const label = document.createElement('div');
      label.setAttribute('data-itinerary-edge-label', 'true');
      label.textContent = edgeText;
      label.style.cssText = `
        background: #fff;
        color: #111;
        border: 1px solid ${color};
        border-radius: 999px;
        padding: 2px 7px;
        font: 600 11px/1.2 system-ui, -apple-system, sans-serif;
        white-space: nowrap;
        pointer-events: none;
      `;
      labelsArr.push(new window.google.maps.marker.AdvancedMarkerElement({
        map,
        position: {
          lat: (source.latitude + target.latitude) / 2,
          lng: (source.longitude + target.longitude) / 2,
        },
        content: label,
        title: edgeText,
      }));
    }
  }
}

/**
 * PlanWorkspace default: live Google Directions geometry between consecutive
 * mapped stops. Trailie must not call this — it owns no road geometry.
 */
function drawDayRoute(day, color, map, polylinesArr, cache) {
  const validStops = day.stops.filter(
    (s) => typeof s.latitude === 'number' && typeof s.longitude === 'number'
  );
  if (validStops.length < 2) return;

  const cacheKey = validStops.map((s) => `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)}`).join('|');

  if (cache.has(cacheKey)) {
    const path = cache.get(cacheKey);
    const polyline = new window.google.maps.Polyline({
      path,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map,
    });
    polylinesArr.push(polyline);
    return;
  }

  const directionsService = new window.google.maps.DirectionsService();
  const origin = validStops[0];
  const destination = validStops[validStops.length - 1];
  const waypoints = validStops.slice(1, -1).map((s) => ({
    location: { lat: s.latitude, lng: s.longitude },
    stopover: true,
  }));

  directionsService.route(
    {
      origin: { lat: origin.latitude, lng: origin.longitude },
      destination: { lat: destination.latitude, lng: destination.longitude },
      waypoints,
      travelMode: window.google.maps.TravelMode.DRIVING,
    },
    (result, status) => {
      if (status !== 'OK' || !result?.routes?.[0]) {
        const path = validStops.map((s) => ({ lat: s.latitude, lng: s.longitude }));
        const polyline = new window.google.maps.Polyline({
          path,
          strokeColor: color,
          strokeOpacity: 0.5,
          strokeWeight: 2,
          map,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
              offset: '0',
              repeat: '12px',
            },
          ],
        });
        polylinesArr.push(polyline);
        return;
      }

      const path = result.routes[0].overview_path;
      cache.set(cacheKey, path);

      const polyline = new window.google.maps.Polyline({
        path,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map,
      });
      polylinesArr.push(polyline);
    }
  );
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}
