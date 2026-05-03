'use client';

import React, { useState, useRef, useEffect } from 'react';
import { GripVertical, X, Edit2, Check, MapPin, Mountain, Tent, Info, Home, Utensils, Clock } from '@components/icons';

const TYPE_ICONS = {
  park: MapPin,
  landmark: MapPin,
  trail: Mountain,
  campground: Tent,
  visitor_center: Info,
  lodging: Home,
  restaurant: Utensils,
  food: Utensils,
  custom: MapPin,
};

const TYPE_COLORS = {
  park: 'var(--accent-green)',
  landmark: 'var(--accent-green)',
  trail: '#3B82F6',
  campground: '#8B6914',
  visitor_center: '#7C3AED',
  lodging: '#7C3AED',
  restaurant: '#F59E0B',
  food: '#F59E0B',
  custom: 'var(--text-tertiary)',
};

const DIFFICULTY_COLORS = {
  easy: { bg: 'rgba(34,197,94,0.12)', text: '#16a34a' },
  moderate: { bg: 'rgba(234,179,8,0.12)', text: '#ca8a04' },
  hard: { bg: 'rgba(249,115,22,0.12)', text: '#ea580c' },
  strenuous: { bg: 'rgba(239,68,68,0.12)', text: '#dc2626' },
};

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

export default function StopCard({ stop, dayId, dragHandleProps, onRemove, onUpdate, isHighlighted, onClick }) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteValue, setNoteValue] = useState(stop.note || '');
  const textareaRef = useRef(null);

  const Icon = TYPE_ICONS[stop.type] || MapPin;
  const typeColor = TYPE_COLORS[stop.type] || 'var(--text-tertiary)';

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Auto-resize
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleNoteSave = () => {
    onUpdate(dayId, stop.id, { note: noteValue });
    setIsEditing(false);
  };

  const hasTime = stop.startTime || stop.duration;

  return (
    <div
      data-stop-id={stop.id}
      onClick={() => onClick?.(stop.id)}
      className={`rounded-xl p-3 lg:p-3.5 group transition-shadow hover:shadow-sm cursor-pointer ${isHighlighted ? 'ring-2 ring-[var(--accent-green)] animate-pulse' : ''}`}
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${typeColor}`,
      }}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing mt-0.5 flex-shrink-0"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>

        {/* Type icon */}
        <div
          className="mt-0.5 flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-md"
          style={{ backgroundColor: `${typeColor}15` }}
        >
          <Icon className="h-3 w-3" style={{ color: typeColor }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {stop.name}
          </p>

          {/* Time + driving time display */}
          {hasTime && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Clock className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {stop.startTime ? formatTime12(stop.startTime) : ''}
                {stop.startTime && stop.duration ? ' · ' : ''}
                {stop.duration ? formatDuration(stop.duration) : ''}
              </p>
              {stop.drivingTimeFromPreviousMin > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-tertiary)' }}>
                  {stop.drivingTimeFromPreviousMin}min drive
                </span>
              )}
            </div>
          )}

          {/* Trail stats: difficulty, distance, elevation */}
          {(stop.difficulty || stop.distanceMiles || stop.elevationGainFeet) && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {stop.difficulty && (
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: DIFFICULTY_COLORS[stop.difficulty]?.bg || 'rgba(0,0,0,0.06)',
                    color: DIFFICULTY_COLORS[stop.difficulty]?.text || 'var(--text-tertiary)'
                  }}>
                  {stop.difficulty}
                </span>
              )}
              {stop.distanceMiles > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {stop.distanceMiles}mi
                </span>
              )}
              {stop.elevationGainFeet > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  ↑{stop.elevationGainFeet.toLocaleString()}ft
                </span>
              )}
              {stop.permitRequired && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                  Permit
                </span>
              )}
            </div>
          )}

          {/* Note — expandable */}
          {isEditing ? (
            <div className="mt-2">
              <textarea
                ref={textareaRef}
                value={noteValue}
                onChange={e => {
                  setNoteValue(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNoteSave(); }
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                placeholder="Add a note..."
                rows={2}
                className="w-full text-xs bg-transparent outline-none border rounded-lg p-2 resize-none"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--accent-green)' }}
              />
              <div className="flex justify-end mt-1">
                <button onClick={handleNoteSave} style={{ color: 'var(--accent-green)' }}>
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : stop.note ? (
            <p
              className="text-[11px] mt-1.5 cursor-pointer hover:opacity-80 leading-relaxed"
              style={{ color: 'var(--text-tertiary)' }}
              onClick={() => setIsEditing(true)}
            >
              {stop.note}
            </p>
          ) : null}

          {/* Booking link */}
          {stop.bookingUrl && (
            <a
              href={stop.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-medium mt-1.5 hover:underline"
              style={{ color: 'var(--accent-green)' }}
              onClick={e => e.stopPropagation()}
            >
              Book / Reserve &rarr;
            </a>
          )}
        </div>

        {/* Actions — show on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 rounded hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-tertiary)' }}
            title="Edit note"
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => onRemove(dayId, stop.id)}
            className="p-1 rounded hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-tertiary)' }}
            title="Remove stop"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export { TYPE_COLORS, TYPE_ICONS };
