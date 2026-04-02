import React, { useRef, useState, useEffect } from 'react';
import { Info, Mountain, Camera, Calendar, MessageCircle, ChevronRight } from '@components/icons';

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
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = node;
      setCanScrollLeft(scrollLeft > 8);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 8);
    };

    update();
    node.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      node.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Auto-scroll active tab into view
  useEffect(() => {
    const node = scrollRef.current;
    const activeButton = node?.querySelector(`[data-tab-id="${activeTab}"]`);
    if (!node || !activeButton) return;

    activeButton.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  }, [activeTab]);

  return (
    <div className="sticky top-16 z-20 backdrop-blur-xl"
      style={{
        backgroundColor: 'var(--surface)',
      }}
    >
      <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Scroll hint — visible when at start and tabs overflow */}
        {canScrollRight && !canScrollLeft && (
          <div className="flex items-center justify-end pt-2 pb-0">
            <span className="flex items-center gap-0.5 text-[11px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Scroll for more
              <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        )}

        <div className="relative">
          {/* Scroll indicators */}
          {canScrollLeft && (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10"
              style={{ background: 'linear-gradient(to right, var(--surface), transparent)' }}
            />
          )}
          {canScrollRight && (
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12"
              style={{ background: 'linear-gradient(to left, var(--surface), transparent)' }}
            />
          )}

          <nav
            ref={scrollRef}
            className="flex gap-1 overflow-x-auto pb-0 scrollbar-hide park-tabs-scroll scroll-smooth"
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
                  data-tab-id={tab.id}
                  className="whitespace-nowrap flex-shrink-0 relative inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors"
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
                    backgroundColor: 'transparent',
                    borderBottomColor: activeTab === tab.id ? 'var(--text-primary)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="button-text-no-select" unselectable="on">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default ParkTabs;
