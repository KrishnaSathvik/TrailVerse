'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTravelMinutes, groundedPlaceType } from '@/lib/tripPresentation';
import { isDrawableTransferEdge } from '@/lib/itineraryMapStops';
import {
  getGmapsMapId,
  getMapsRuntimeStatus,
  reportMapsRuntimeFailure,
  reportMapsRuntimeReady,
  subscribeMapsRuntimeStatus,
} from '@/lib/mapsRuntimeStatus';
import MapFailureBoundary from '@/components/itinerary/MapFailureBoundary';

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
function ItineraryMapViewInner({
  days,
  activeDayId = 'all',
  parkCenter,
  selectedStopId: externalSelectedStopId,
  selectedDayId: externalSelectedDayId,
  onMarkerClick,
  isMobile = false,
  pathMode = ITINERARY_MAP_PATH_MODE.DIRECTIONS,
  fitPadding = null,
  controlsPlacement = null,
  preview = false,
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
        gestureHandling: preview ? 'none' : 'greedy',
        keyboardShortcuts: !preview,
        zoomControl: !preview,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: !preview,
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
  }, [ready, runtimeBlocked, allStops, parkCenter, preview]);

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

        const number = stop.pinNumber != null ? String(stop.pinNumber) : String(stopIdx + 1);
        const pinLabel = number;
        const pin = buildPin(color, pinLabel, stop.source === 'user', Boolean(stop.hasBadge), activeDayId === 'all');
        const marker = new window.google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: stop.latitude, lng: stop.longitude },
          content: pin,
          title: `Day ${day.dayNumber || colorIdx + 1} · Stop ${number} · ${stop.name}`,
          gmpClickable: true,
        });

        marker._stopId = stop.id;
        marker._dayId = day.id;
        marker._color = color;
        marker._select = () => {
          markersRef.current.forEach(m => { m.zIndex = m === marker ? 1000 : 1; m.content.style.outline = m === marker ? '3px solid #172f25' : ''; });
          onMarkerClick?.(stop.id, day.id);
          if (isMobile) {
            infoWindowRef.current.setContent(buildMobilePopup({ ...stop, dayNumber: day.dayNumber || colorIdx + 1, pinNumber: number }, color));
            infoWindowRef.current.open(mapRef.current, marker);
          }
        };
        marker.addListener('click', marker._select);

        markersRef.current.push(marker);
      });

      if (pathMode === ITINERARY_MAP_PATH_MODE.ABSTRACT_EDGES) {
        drawAbstractTransferEdges(day, color, mapRef.current, polylinesRef.current, edgeLabelsRef.current, activeDayId !== 'all');
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
    // Cluster marker UI in screen space; every stop retains its original coordinates.
    const clusters = [];
    const regroup = () => {
      clusters.splice(0).forEach(marker => { marker.map = null; });
      markersRef.current.forEach(marker => { marker.map = mapRef.current; });
      if (activeDayId !== 'all') return;
      const projection = mapRef.current.getProjection?.();
      const zoom = mapRef.current.getZoom?.();
      if (!projection || !Number.isFinite(zoom)) return;
      const remaining = [...markersRef.current];
      const point = marker => projection.fromLatLngToPoint(new window.google.maps.LatLng(marker.position.lat, marker.position.lng));
      while (remaining.length) {
        const anchor = remaining.shift();
        const origin = point(anchor);
        const group = [anchor];
        for (let i = remaining.length - 1; i >= 0; i--) {
          const p = point(remaining[i]);
          if (Math.hypot(p.x - origin.x, p.y - origin.y) * 2 ** zoom < 40) group.push(...remaining.splice(i, 1));
        }
        if (group.length < 2) continue;
        group.forEach(marker => { if (marker.zIndex !== 1000) marker.map = null; });
        const badge = document.createElement('div');
        badge.textContent = `${group.length} stops`;
        badge.style.cssText = 'border:2px solid white;border-radius:24px;background:#243b32;color:white;padding:10px 12px;font:600 12px system-ui;box-shadow:0 2px 6px #0003;cursor:pointer;white-space:nowrap';
        const cluster = new window.google.maps.marker.AdvancedMarkerElement({ map: mapRef.current, position: anchor.position, content: badge, title: `${group.length} overlapping stops. Choose a stop`, gmpClickable: true, zIndex: 500 });
        cluster.addListener('click', () => {
          const list = document.createElement('div');
          list.style.cssText = 'max-height:260px;overflow-y:auto;max-width:260px';
          group.forEach(marker => {
            const button = document.createElement('button');
            button.textContent = marker.title;
            button.style.cssText = `display:block;width:100%;min-height:44px;text-align:left;background:white;color:#172f25;border:0;border-left:4px solid ${marker._color};padding:8px 12px;margin:4px 0;font:500 13px system-ui;cursor:pointer`;
            button.onclick = () => {
              infoWindowRef.current.close();
              marker.map = mapRef.current;
              marker._select();
            };
            list.appendChild(button);
          });
          infoWindowRef.current.setContent(list);
          infoWindowRef.current.open(mapRef.current, cluster);
        });
        clusters.push(cluster);
      }
    };
    const listener = mapRef.current.addListener?.('idle', regroup);
    regroup();
    return () => { listener?.remove(); clusters.forEach(marker => { marker.map = null; }); infoWindowRef.current?.close(); };
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
      const s = (!externalSelectedDayId || d.id === externalSelectedDayId) && d.stops.find(s => s.id === externalSelectedStopId);
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
      m._stopId === targetStop.id && m._dayId === targetDay.id
    );
    markersRef.current.forEach((m, i) => { m.zIndex = i === markerIdx ? 1000 : 1; m.content.style.outline = i === markerIdx ? '3px solid #172f25' : ''; });
    if (markerIdx !== -1) markersRef.current[markerIdx].map = mapRef.current;
    if (isMobile && markerIdx !== -1) {
      const marker = markersRef.current[markerIdx];
      const colorIdx = days.findIndex(d => d.id === targetDay.id);
      const color = DAY_COLORS[colorIdx % DAY_COLORS.length];
      infoWindowRef.current.setContent(buildMobilePopup(targetStop, color));
      infoWindowRef.current.open(mapRef.current, marker);
    }
  }, [externalSelectedStopId, externalSelectedDayId, ready, days, isMobile, fitPadding]);

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

function buildPin(color, label, isUserAdded, hasBadge = false, compact = false) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: relative;
    width: ${compact ? 26 : 32}px; height: ${compact ? 26 : 32}px; border-radius: 50%;
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
  const typeLabel = groundedPlaceType(stop) || '';
  const stats = [
    stop.distanceMiles > 0 ? `${stop.distanceMiles}mi` : null,
    stop.elevationGainFeet > 0 ? `↑${stop.elevationGainFeet.toLocaleString()}ft` : null,
    stop.duration ? (stop.duration >= 60 ? `${Math.floor(stop.duration / 60)}h${stop.duration % 60 ? stop.duration % 60 + 'm' : ''}` : `${stop.duration}m`) : null,
  ].filter(Boolean).join(' · ');
  const meta = [typeLabel, stop.difficulty].filter(Boolean).join(' · ');

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;max-width:240px;padding:4px;">
      <div style="font-size:11px;color:#555;margin-bottom:4px">Day ${escapeHtml(String(stop.dayNumber || ''))} · Stop ${escapeHtml(String(stop.pinNumber || ''))}</div>
      <div style="font-weight:600;font-size:14px;line-height:1.3;color:#111;">
        ${escapeHtml(stop.name)}
      </div>
      ${stop.mapAnchor?.name ? `<div style="font-size:12px;color:#555;margin-top:2px;">Map pin: ${escapeHtml(stop.mapAnchor.name)}</div>` : ''}
      ${meta ? `<div style="font-size:11px;color:${color};font-weight:600;margin-top:3px;">${escapeHtml(meta)}</div>` : ''}
      ${stats ? `<div style="font-size:12px;color:#555;margin-top:2px;">${escapeHtml(stats)}</div>` : ''}
      ${stop.why ? `<div style="font-size:12px;line-height:1.4;color:#555;margin-top:4px;">${escapeHtml(stop.why)}</div>` : ''}
    </div>
  `;
}

function drawAbstractTransferEdges(day, color, map, polylinesArr, labelsArr, showDurations) {
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
            strokeOpacity: showDurations ? 0.8 : 0.35,
            strokeColor: color,
            scale: showDurations ? 3 : 2,
          },
          offset: '0',
          repeat: '10px',
        },
        {
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: showDurations ? 3 : 2,
            strokeOpacity: showDurations ? 0.8 : 0.35,
            strokeColor: color,
            fillColor: color,
            fillOpacity: showDurations ? 0.9 : 0.35,
          },
          offset: '100%',
        },
      ],
    }));

    if (showDurations && (edge.displayLabel || (Number.isFinite(edge.minutes) && edge.minutes >= 0))) {
      const edgeText = edge.displayLabel || `${formatTravelMinutes(edge.minutes)} ${{ driving: 'drive', walking: 'walk', bicycling: 'bike ride' }[edge.travelMode] || edge.travelMode || 'by road'}`;
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

export default function ItineraryMapView(props) {
  return <MapFailureBoundary><ItineraryMapViewInner {...props} /></MapFailureBoundary>;
}
