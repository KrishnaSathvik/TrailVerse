import React from 'react';

export default function ParkExploreTabs({
  tabs,
  activeTab,
  onTabChange,
  sectionLabel = 'Explore this park',
  ariaLabel = 'Park detail sections',
  onKeyDown,
  getTabId,
  getAriaControls,
  alertCount = 0,
  permitCount = 0,
  reviewCount = 0,
  showParkBadges = true,
  gridClassName = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2',
  className = 'mb-6 sm:mb-8',
}) {
  return (
    <div className={className} data-park-explore-tabs>
      <p
        className="text-xs font-medium uppercase tracking-[0.2em] mb-3"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {sectionLabel}
      </p>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={gridClassName}
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = Boolean(activeTab) && activeTab === tab.id;
          const noTabSelected = !activeTab;
          const showAlertBadge = showParkBadges && tab.id === 'alerts' && alertCount > 0;
          const showPermitBadge = showParkBadges && tab.id === 'permits' && permitCount > 0;
          const showReviewBadge = showParkBadges && tab.id === 'reviews' && reviewCount > 0;
          const showReviewInvite = showParkBadges && tab.id === 'reviews' && reviewCount === 0;

          return (
            <button
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => onTabChange(tab.id)}
              type="button"
              role="tab"
              aria-selected={isActive}
              id={getTabId ? getTabId(tab) : undefined}
              aria-controls={getAriaControls ? getAriaControls(tab) : undefined}
              tabIndex={noTabSelected ? (index === 0 ? 0 : -1) : (isActive ? 0 : -1)}
              className="relative grid h-12 grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium leading-none transition hover:shadow-sm"
              style={{
                backgroundColor: isActive ? 'var(--text-primary)' : 'var(--surface-hover)',
                color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                borderWidth: '1px',
                borderColor: isActive ? 'var(--text-primary)' : 'var(--border)',
              }}
            >
              <span className="flex h-6 w-6 items-center justify-center">
                <Icon
                  className="h-6 w-6"
                  weight="fill"
                  aria-hidden
                />
              </span>
              <span className="line-clamp-2 leading-tight">{tab.label}</span>
              {showAlertBadge && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: '#ef4444' }}
                >
                  {alertCount}
                </span>
              )}
              {showPermitBadge && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  {permitCount}
                </span>
              )}
              {showReviewBadge && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: '#facc15', color: '#1a1a1a' }}
                >
                  {reviewCount}
                </span>
              )}
              {showReviewInvite && (
                <span
                  className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--accent-green)',
                    color: 'var(--bg-primary)',
                  }}
                >
                  Add review
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
