import React from 'react';

/**
 * @param {{ id: string, label: string, count?: number }[]} options
 */
export default function ParkContentFilterChips({ options, activeId, onChange }) {
  if (!options?.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
      {options.map((option) => {
        const isActive = activeId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition"
            style={{
              backgroundColor: isActive ? 'var(--text-primary)' : 'var(--surface-hover)',
              color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
              borderWidth: '1px',
              borderColor: isActive ? 'var(--text-primary)' : 'var(--border)',
            }}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px]"
                style={{
                  backgroundColor: isActive ? 'rgba(0,0,0,0.15)' : 'var(--surface)',
                  color: isActive ? 'inherit' : 'var(--text-tertiary)',
                }}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
