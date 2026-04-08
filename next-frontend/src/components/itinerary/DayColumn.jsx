'use client';

import React, { useState } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Trash2, Plus, Edit2, Check } from '@components/icons';
import StopCard from './StopCard';
import AddStopSearch from './AddStopSearch';

export default function DayColumn({
  day,
  dragHandleProps,
  onRemoveDay,
  onUpdateLabel,
  onAddStop,
  onRemoveStop,
  onUpdateStop,
}) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(day.label);
  const [showAddStop, setShowAddStop] = useState(false);

  const handleLabelSave = () => {
    onUpdateLabel(day.id, labelValue || day.label);
    setIsEditingLabel(false);
  };

  return (
    <div
      className="w-full lg:w-80 lg:flex-shrink-0 rounded-2xl flex flex-col"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Day Header */}
      <div
        className="flex items-center gap-2 px-3 py-3 rounded-t-2xl border-b"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--surface-hover)'
        }}
      >
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing p-0.5 rounded"
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
          <div className="flex-1 flex items-center gap-1 group">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {day.label}
            </span>
            <button
              onClick={() => setIsEditingLabel(true)}
              className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <Edit2 className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Stop count badge */}
        <span
          className="text-xs px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: 'rgba(67,160,106,0.1)',
            color: 'var(--accent-green)',
            fontSize: '10px'
          }}
        >
          {day.stops?.length || 0}
        </span>

        {/* Remove day */}
        <button
          onClick={() => onRemoveDay(day.id)}
          className="p-1 rounded-lg transition hover:opacity-80"
          style={{ color: 'var(--text-tertiary)' }}
          title="Remove day"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Stops list — scrollable on desktop, natural flow on mobile */}
      <div className="flex-1 overflow-y-auto p-2 lg:max-h-[calc(100vh-240px)]">
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
                        marginBottom: '6px',
                      }}
                    >
                      <StopCard
                        stop={stop}
                        dayId={day.id}
                        dragHandleProps={dragProvided.dragHandleProps}
                        onRemove={onRemoveStop}
                        onUpdate={onUpdateStop}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}

              {/* Empty state */}
              {(!day.stops || day.stops.length === 0) && !snapshot.isDraggingOver && (
                <div
                  className="flex items-center justify-center py-6 text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Drag stops here or add below
                </div>
              )}
            </div>
          )}
        </Droppable>
      </div>

      {/* Add Stop section */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--border)' }}>
        {showAddStop ? (
          <AddStopSearch
            onSelect={(stop) => {
              onAddStop(day.id, stop);
              setShowAddStop(false);
            }}
            onClose={() => setShowAddStop(false)}
          />
        ) : (
          <button
            onClick={() => setShowAddStop(true)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--surface-hover)',
              border: '1px dashed var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        )}
      </div>
    </div>
  );
}
