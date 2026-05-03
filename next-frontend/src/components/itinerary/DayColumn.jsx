'use client';

import React, { useState } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Trash2, Plus, Edit2, Check, MapPin } from '@components/icons';
import StopCard from './StopCard';

export default function DayColumn({
  day,
  dragHandleProps,
  onRemoveDay,
  onUpdateLabel,
  onRequestAddStop,
  onRemoveStop,
  onUpdateStop,
  highlightedStopId,
  onStopClick,
}) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(day.label);

  const handleLabelSave = () => {
    onUpdateLabel(day.id, labelValue || day.label);
    setIsEditingLabel(false);
  };

  return (
    <div
      className="w-full rounded-2xl flex flex-col"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Day Header */}
      <div
        className="px-3.5 py-3 rounded-t-2xl border-b"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--surface-hover)'
        }}
      >
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing p-0.5 rounded mt-0.5"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Editable label */}
          {isEditingLabel ? (
            <div className="flex-1 flex items-center gap-1">
              <input
                value={labelValue}
                onChange={e => setLabelValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLabelSave(); if (e.key === 'Escape') setIsEditingLabel(false); }}
                autoFocus
                className="flex-1 text-sm font-semibold bg-transparent outline-none border-b"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--accent-green)' }}
              />
              <button onClick={handleLabelSave} style={{ color: 'var(--accent-green)' }}>
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex-1 min-w-0 group">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {day.label.match(/^Day\s*\d+/)?.[0] || day.label}
                </span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'rgba(67,160,106,0.1)',
                    color: 'var(--accent-green)',
                  }}
                >
                  {day.stops?.length || 0} {day.stops?.length === 1 ? 'stop' : 'stops'}
                </span>
                <button
                  onClick={() => setIsEditingLabel(true)}
                  className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded ml-auto"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </div>
              {/* Subtitle — the part after "Day N — " */}
              {day.label.includes('—') && (
                <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                  {day.label.replace(/^Day\s*\d+\s*[—–-]\s*/, '')}
                </p>
              )}
            </div>
          )}

          {/* Remove day */}
          <button
            onClick={() => onRemoveDay(day.id)}
            className="p-1 rounded-lg transition hover:opacity-80 flex-shrink-0 mt-0.5"
            style={{ color: 'var(--text-tertiary)' }}
            title="Remove day"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Stops list — scrollable on desktop, natural flow on mobile */}
      <div className="flex-1 overflow-y-auto p-2.5 lg:max-h-[calc(100vh-240px)]">
        <Droppable droppableId={day.id} type="STOP">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="min-h-12 rounded-xl transition"
              style={{
                backgroundColor: snapshot.isDraggingOver
                  ? 'rgba(67,160,106,0.05)'
                  : 'transparent',
                minHeight: '48px'
              }}
            >
              {(day.stops || []).map((stop, index) => (
                <Draggable key={stop.id} draggableId={stop.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      style={{
                        ...dragProvided.draggableProps.style,
                        opacity: dragSnapshot.isDragging ? 0.85 : 1,
                        marginBottom: '8px',
                      }}
                    >
                      <StopCard
                        stop={stop}
                        dayId={day.id}
                        dragHandleProps={dragProvided.dragHandleProps}
                        onRemove={onRemoveStop}
                        onUpdate={onUpdateStop}
                        isHighlighted={stop.id === highlightedStopId}
                        onClick={onStopClick}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}

              {/* Empty state */}
              {(!day.stops || day.stops.length === 0) && !snapshot.isDraggingOver && (
                <div
                  className="flex flex-col items-center justify-center py-8 gap-1"
                >
                  <MapPin className="h-5 w-5 mb-1" style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No stops yet</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>Drag stops here or add below</span>
                </div>
              )}
            </div>
          )}
        </Droppable>
      </div>

      {/* Add Stop button — opens modal at parent level */}
      <div className="p-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={onRequestAddStop}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition hover:border-[var(--accent-green)] hover:text-[var(--accent-green)]"
          style={{
            backgroundColor: 'transparent',
            border: '1px dashed var(--border)',
            color: 'var(--text-secondary)'
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Stop
        </button>
      </div>
    </div>
  );
}
