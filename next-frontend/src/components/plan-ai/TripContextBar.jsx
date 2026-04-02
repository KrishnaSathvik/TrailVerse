'use client';

import React from 'react';
import { MapPin, Calendar, Users, DollarSign, Edit2 } from '@components/icons';

const TripContextBar = ({ parkName, formData, onEdit, selectedProvider, providers, onProviderChange }) => {
  const hasContext = parkName || formData?.startDate || (formData?.groupSize && formData.groupSize > 1) || formData?.budget;

  if (!hasContext) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dateRange = formData?.startDate && formData?.endDate
    ? `${formatDate(formData.startDate)} - ${formatDate(formData.endDate)}`
    : formData?.startDate
      ? formatDate(formData.startDate)
      : null;

  return (
    <div
      className="sticky top-0 z-20 px-4 py-2.5 border-b"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
        {/* Chips */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {parkName && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'var(--accent-green)/10',
                color: 'var(--accent-green)',
                border: '1px solid',
                borderColor: 'var(--accent-green)/20'
              }}
            >
              <MapPin className="h-3 w-3" />
              {parkName}
            </span>
          )}

          {dateRange && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-secondary)',
                border: '1px solid',
                borderColor: 'var(--border)'
              }}
            >
              <Calendar className="h-3 w-3" />
              {dateRange}
            </span>
          )}

          {formData?.groupSize > 1 && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-secondary)',
                border: '1px solid',
                borderColor: 'var(--border)'
              }}
            >
              <Users className="h-3 w-3" />
              {formData.groupSize} people
            </span>
          )}

          {formData?.budget && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-secondary)',
                border: '1px solid',
                borderColor: 'var(--border)'
              }}
            >
              <DollarSign className="h-3 w-3" />
              {formData.budget.charAt(0).toUpperCase() + formData.budget.slice(1)}
            </span>
          )}

          {/* Edit button */}
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80"
            style={{
              color: 'var(--text-tertiary)',
              backgroundColor: 'var(--surface-hover)'
            }}
            title="Edit trip details"
          >
            <Edit2 className="h-3 w-3" />
            Edit
          </button>
        </div>

        {/* Provider selector (compact) */}
        {providers && providers.length > 0 && onProviderChange && (
          <select
            value={selectedProvider || ''}
            onChange={(e) => onProviderChange(e.target.value)}
            className="text-xs px-2 py-1 rounded-md outline-none cursor-pointer flex-shrink-0"
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={p.available === false}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

export default TripContextBar;
