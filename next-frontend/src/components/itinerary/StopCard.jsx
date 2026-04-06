'use client';

import React, { useState } from 'react';
import { GripVertical, X, Edit2, Check, MapPin, Mountain, Tent, Info } from '@components/icons';

const TYPE_ICONS = {
  park: MapPin,
  landmark: MapPin,
  trail: Mountain,
  campground: Tent,
  visitor_center: Info,
  custom: MapPin,
};

const TYPE_COLORS = {
  park: 'var(--accent-green)',
  landmark: 'var(--accent-green)',
  trail: '#3B82F6',
  campground: '#8B6914',
  visitor_center: '#7C3AED',
  custom: 'var(--text-tertiary)',
};

export default function StopCard({ stop, dayId, dragHandleProps, onRemove, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteValue, setNoteValue] = useState(stop.note || '');

  const Icon = TYPE_ICONS[stop.type] || MapPin;
  const iconColor = TYPE_COLORS[stop.type] || 'var(--text-tertiary)';

  const handleNoteSave = () => {
    onUpdate(dayId, stop.id, { note: noteValue });
    setIsEditing(false);
  };

  return (
    <div
      className="rounded-xl p-3 group"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
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
        <div className="mt-0.5 flex-shrink-0">
          <Icon className="h-3.5 w-3.5" style={{ color: iconColor }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {stop.name}
          </p>

          {/* Note — editable */}
          {isEditing ? (
            <div className="flex items-center gap-1 mt-1">
              <input
                value={noteValue}
                onChange={e => setNoteValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleNoteSave();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                autoFocus
                placeholder="Add a note..."
                className="flex-1 text-xs bg-transparent outline-none border-b"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              />
              <button onClick={handleNoteSave} style={{ color: 'var(--accent-green)' }}>
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <p
              className="text-xs mt-0.5 cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-tertiary)' }}
              onClick={() => setIsEditing(true)}
            >
              {stop.note || <span className="italic">Add a note...</span>}
            </p>
          )}

          {/* Time meta */}
          {stop.startTime && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
              ⏱ {stop.startTime}
              {stop.duration ? ` · ${Math.floor(stop.duration / 60)}h${stop.duration % 60 > 0 ? `${stop.duration % 60}m` : ''}` : ''}
            </p>
          )}
        </div>

        {/* Actions — show on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 rounded"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => onRemove(dayId, stop.id)}
            className="p-1 rounded"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
