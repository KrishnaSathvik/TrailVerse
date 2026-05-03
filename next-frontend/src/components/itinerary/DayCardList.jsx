'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Mountain, Tent, Info, Home, Utensils, Clock, MoreVertical, Plus, ArrowLeft, ExternalLink, Trash2 } from '@components/icons';

// ── Type metadata ────────────────────────────────────────────────
const TYPE_META = {
  park:           { icon: MapPin,   label: 'Park',      color: 'var(--accent-green)' },
  landmark:       { icon: MapPin,   label: 'Landmark',  color: 'var(--accent-green)' },
  trail:          { icon: Mountain, label: 'Hike',      color: '#3B82F6' },
  campground:     { icon: Tent,     label: 'Camp',      color: '#8B6914' },
  visitor_center: { icon: Info,     label: 'Visitor Ctr', color: '#7C3AED' },
  lodging:        { icon: Home,     label: 'Lodging',   color: '#7C3AED' },
  restaurant:     { icon: Utensils, label: 'Dining',    color: '#F59E0B' },
  food:           { icon: Utensils, label: 'Dining',    color: '#F59E0B' },
  custom:         { icon: MapPin,   label: 'Custom',    color: 'var(--text-tertiary)' },
};

const DIFFICULTY_COLORS = {
  easy:      { bg: 'rgba(34,197,94,0.12)',  text: '#16a34a' },
  moderate:  { bg: 'rgba(234,179,8,0.12)',  text: '#ca8a04' },
  hard:      { bg: 'rgba(249,115,22,0.12)', text: '#ea580c' },
  strenuous: { bg: 'rgba(239,68,68,0.12)',  text: '#dc2626' },
};

// ── Helpers ──────────────────────────────────────────────────────

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatDuration(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}hr`;
  return `${h}h${m}m`;
}

function groupStopsByPeriod(stops) {
  // Sort by order first, so cards always appear in the intended sequence
  const sorted = [...stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const morning = [];
  const afternoon = [];
  const evening = [];

  sorted.forEach(stop => {
    if (!stop.startTime) {
      afternoon.push(stop);  // unbucketed → middle
      return;
    }
    const hour = parseInt(stop.startTime.split(':')[0], 10);
    if (hour < 12) morning.push(stop);
    else if (hour < 17) afternoon.push(stop);
    else evening.push(stop);
  });

  return [
    { label: 'Morning', stops: morning },
    { label: 'Afternoon', stops: afternoon },
    { label: 'Evening', stops: evening },
  ].filter(g => g.stops.length > 0);
}

// ── Compact Stop Card ────────────────────────────────────────────

function CompactStopCard({ stop, dayId, allDays, selectedStopId, onStopClick, onRemoveStop, onMoveStop }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const meta = TYPE_META[stop.type] || TYPE_META.custom;
  const Icon = meta.icon;
  const isSelected = stop.id === selectedStopId;

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  const stats = [
    stop.distanceMiles > 0 ? `${stop.distanceMiles}mi` : null,
    stop.elevationGainFeet > 0 ? `↑${stop.elevationGainFeet.toLocaleString()}ft` : null,
    stop.duration ? formatDuration(stop.duration) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      data-stop-id={stop.id}
      onClick={() => onStopClick?.(stop.id)}
      className={`rounded-xl px-3.5 py-3 cursor-pointer transition-all duration-200 ${isSelected ? 'ring-2 ring-[var(--accent-green)]' : ''}`}
      style={{
        backgroundColor: isSelected ? 'rgba(67,160,106,0.06)' : 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Row 1: Time + type pill + difficulty pill + menu */}
      <div className="flex items-center gap-1.5 mb-1">
        {stop.startTime && (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            {formatTime12(stop.startTime)}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
        >
          <Icon className="h-2.5 w-2.5" />
          {meta.label}
        </span>
        {stop.difficulty && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: DIFFICULTY_COLORS[stop.difficulty]?.bg || 'rgba(0,0,0,0.06)',
              color: DIFFICULTY_COLORS[stop.difficulty]?.text || 'var(--text-tertiary)',
            }}
          >
            {stop.difficulty}
          </span>
        )}
        {stop.drivingTimeFromPreviousMin > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-tertiary)' }}>
            {stop.drivingTimeFromPreviousMin}min drive
          </span>
        )}

        {/* Spacer + menu */}
        <div className="ml-auto relative" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
            className="p-0.5 rounded hover:bg-[var(--surface-hover)] transition"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-6 z-50 w-40 rounded-lg shadow-lg py-1 border"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              {allDays.filter(d => d.id !== dayId).map((d, i) => (
                <button
                  key={d.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveStop(stop.id, d.id);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Move to Day {allDays.findIndex(dd => dd.id === d.id) + 1}
                </button>
              ))}
              <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveStop(dayId, stop.id);
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] transition"
                style={{ color: '#dc2626' }}
              >
                Remove stop
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Name + Google Maps link */}
      <div className="flex items-start gap-1.5">
        <p className="text-[13px] font-semibold leading-snug flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {stop.name}
        </p>
        {typeof stop.latitude === 'number' && typeof stop.longitude === 'number' && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name)}&query_place_id=&center=${stop.latitude},${stop.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 mt-0.5 p-0.5 rounded hover:bg-[var(--surface-hover)] transition"
            style={{ color: 'var(--text-tertiary)' }}
            title="Open in Google Maps"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Row 3: Stats */}
      {stats && (
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {stats}
        </p>
      )}

      {/* Row 4: Why / note */}
      {(stop.why || stop.note) && (
        <p className="text-[11px] mt-1 line-clamp-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {stop.why || stop.note}
        </p>
      )}

      {/* Permit badge */}
      {stop.permitRequired && (
        <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
          Permit required
        </span>
      )}
    </div>
  );
}

// ── Day Card List ────────────────────────────────────────────────

export default function DayCardList({
  day,
  dayIndex,
  allDays,
  selectedStopId,
  onStopClick,
  onRemoveStop,
  onUpdateStop,
  onMoveStop,
  onRequestAddStop,
  onRemoveDay,
  addDay,
  tripId,
  router,
}) {
  const listRef = useRef(null);

  // Scroll selected stop into view
  useEffect(() => {
    if (!selectedStopId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-stop-id="${selectedStopId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedStopId]);

  if (!day) return null;

  const groups = groupStopsByPeriod(day.stops || []);
  const hasStops = (day.stops?.length || 0) > 0;

  // Extract subtitle from "Day N — Subtitle"
  const subtitle = day.label?.includes('—')
    ? day.label.replace(/^Day\s*\d+\s*[—–-]\s*/, '')
    : null;

  return (
    <div ref={listRef} className="flex flex-col h-full overflow-y-auto">
      {/* Day header */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            Day {dayIndex + 1}
          </h2>
          {allDays.length > 1 && onRemoveDay && (
            <button
              onClick={() => onRemoveDay(day.id)}
              className="p-1 rounded hover:bg-[var(--surface-hover)] transition"
              style={{ color: 'var(--text-tertiary)' }}
              title={`Delete Day ${dayIndex + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {subtitle && (
          <p className="text-xs mt-0.5 leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        )}
        <div className="mt-2 border-b" style={{ borderColor: 'var(--border)' }} />
      </div>

      {/* Empty state */}
      {!hasStops && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}
          >
            <MapPin className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No stops yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Add stops to this day, or go back to chat and ask the AI to generate an itinerary.
            </p>
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => router.push(`/plan-ai/${tripId}`)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-90"
              style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Chat
            </button>
            <button
              onClick={() => onRequestAddStop(day.id)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Stop
            </button>
          </div>
        </div>
      )}

      {/* Time-of-day grouped stops */}
      {hasStops && (
        <div className="px-4 pb-4 flex-1">
          {groups.map((group) => (
            <div key={group.label} className="mt-3 first:mt-1">
              {/* Period header — quiet, small */}
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-2 px-0.5"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {group.label}
              </p>
              <div className="space-y-2">
                {group.stops.map(stop => (
                  <CompactStopCard
                    key={stop.id}
                    stop={stop}
                    dayId={day.id}
                    allDays={allDays}
                    selectedStopId={selectedStopId}
                    onStopClick={onStopClick}
                    onRemoveStop={onRemoveStop}
                    onMoveStop={onMoveStop}
                  />
                ))}
              </div>
            </div>
          ))}

        </div>
      )}
    </div>
  );
}
