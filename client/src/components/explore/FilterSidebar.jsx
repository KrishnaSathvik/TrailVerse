import React from 'react';
import { X, SlidersHorizontal } from 'lucide-react';

const FilterSidebar = ({ 
  filters, 
  onFilterChange, 
  onClear, 
  states,
  activities,
  show,
  onClose 
}) => {
  const handleStateToggle = (state) => {
    const newStates = filters.states.includes(state)
      ? filters.states.filter(s => s !== state)
      : [...filters.states, state];
    onFilterChange({ ...filters, states: newStates });
  };

  const handleActivityToggle = (activity) => {
    const newActivities = filters.activities.includes(activity)
      ? filters.activities.filter(a => a !== activity)
      : [...filters.activities, activity];
    onFilterChange({ ...filters, activities: newActivities });
  };

  const activeFiltersCount = filters.states.length + filters.activities.length;

  return (
    <>
      {/* Mobile Overlay */}
      {show && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen lg:h-auto
        w-80 lg:w-full flex-shrink-0
        transition-transform duration-300 z-50 lg:z-0
        ${show ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-full lg:h-auto overflow-y-auto rounded-2xl p-6 backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
              <h3 className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Filters
              </h3>
              {activeFiltersCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-forest-500 text-white text-xs font-semibold">
                  {activeFiltersCount}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {activeFiltersCount > 0 && (
                <button
                  onClick={onClear}
                  className="text-xs font-medium text-forest-400 hover:text-forest-300"
                  unselectable="on"
                  draggable="false"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    outline: 'none'
                  }}
                >
                  <span className="button-text-no-select" unselectable="on">Clear all</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="lg:hidden p-1 rounded-lg hover:bg-white/5"
                unselectable="on"
                draggable="false"
                style={{ 
                  color: 'var(--text-primary)',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  outline: 'none'
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* States Filter */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              States
            </h4>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
              {states.map(state => (
                <label key={state} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={filters.states.includes(state)}
                    onChange={() => handleStateToggle(state)}
                    className="rounded border-2 w-4 h-4 text-forest-500 focus:ring-forest-500/50"
                    style={{ borderColor: 'var(--border)' }}
                  />
                  <span className="text-sm group-hover:text-forest-400 transition"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {state}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Activities Filter */}
          <div>
            <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Activities
            </h4>
            <div className="flex flex-wrap gap-2">
              {activities.map(activity => (
                <button
                  key={activity}
                  onClick={() => handleActivityToggle(activity)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    filters.activities.includes(activity)
                      ? 'bg-forest-500 text-white'
                      : 'ring-1 hover:bg-white/5'
                  }`}
                  unselectable="on"
                  draggable="false"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    outline: 'none',
                    ...(!filters.activities.includes(activity)
                      ? {
                          backgroundColor: 'var(--surface-hover)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-secondary)'
                        }
                      : {
                          backgroundColor: '#059669',
                          color: 'white'
                        })
                  }}
                >
                  <span className="button-text-no-select" unselectable="on">{activity}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default FilterSidebar;
