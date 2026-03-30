import React from 'react';
import { Info, Mountain, Camera, Calendar, MessageCircle } from '@components/icons';

const ParkTabs = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'activities', label: 'Activities', icon: Mountain },
    { id: 'photos', label: 'Photos', icon: Camera },
    { id: 'alerts', label: 'Alerts', icon: Calendar },
    { id: 'reviews', label: 'Reviews', icon: MessageCircle }
  ];

  return (
    <div className="sticky top-16 z-20 backdrop-blur-xl border-b"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-2 overflow-x-auto py-4 scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'bg-forest-500 text-white'
                    : 'hover:bg-white/5'
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
                  ...(activeTab !== tab.id
                    ? { color: 'var(--text-secondary)' }
                    : {})
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
