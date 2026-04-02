import React from 'react';
import { Info, Mountain, Camera, Calendar, MessageCircle } from '@components/icons';

const defaultTabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'activities', label: 'Activities', icon: Mountain },
    { id: 'photos', label: 'Photos', icon: Camera },
    { id: 'alerts', label: 'Alerts', icon: Calendar },
    { id: 'reviews', label: 'Reviews', icon: MessageCircle }
];

const ParkTabs = ({
  activeTab,
  onTabChange,
  tabs = defaultTabs,
  ariaLabel = 'Section tabs',
  onKeyDown,
  getTabId = (tab) => `${ariaLabel.toLowerCase().replace(/\s+/g, '-')}-tab-${tab.id}`,
  getAriaControls
}) => {
  return (
    <div className="sticky top-16 z-20 backdrop-blur-xl border-b"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav
          className="flex gap-2 overflow-x-auto py-4 scrollbar-hide park-tabs-scroll"
          role="tablist"
          aria-label={ariaLabel}
          onKeyDown={onKeyDown}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? ''
                    : 'hover:bg-white/5'
                }`}
                id={getTabId(tab)}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={getAriaControls ? getAriaControls(tab) : undefined}
                tabIndex={activeTab === tab.id ? 0 : -1}
                unselectable="on"
                draggable="false"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  outline: 'none',
                  ...(activeTab === tab.id
                    ? {
                        backgroundColor: 'var(--surface-active)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: 'var(--border-hover)',
                        color: 'var(--text-primary)',
                        boxShadow: 'var(--shadow)'
                      }
                    : {
                        color: 'var(--text-secondary)'
                      })
                }}
              >
                <Icon className="h-4 w-4" />
                <span className="button-text-no-select" unselectable="on">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default ParkTabs;
