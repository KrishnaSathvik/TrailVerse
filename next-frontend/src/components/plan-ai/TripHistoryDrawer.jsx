'use client';

import React from 'react';
import {
  X, Plus, MapPin, MessageCircle, Clock, FolderSimple,
  ArchiveRestore, Trash2
} from '@components/icons';
import TripSummaryCard from '@components/profile/TripSummaryCard';

const TripHistoryDrawer = ({
  isOpen,
  onClose,
  tripHistory,
  archivedTrips,
  activeTab,
  setActiveTab,
  onSelectTrip,
  onArchive,
  onRestore,
  onDelete,
  onNewChat,
  deletingTripId,
  restoringTripId
}) => {
  const trips = activeTab === 'active' ? tripHistory : archivedTrips;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col
          transition-transform duration-300 ease-in-out
          lg:relative lg:z-auto lg:translate-x-0 lg:border-r lg:flex-shrink-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'}
        `}
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Trip History
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close history"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex px-3 py-2 gap-1 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setActiveTab('active')}
            className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === 'active' ? 'var(--accent-green)' : 'transparent',
              color: activeTab === 'active' ? 'white' : 'var(--text-secondary)'
            }}
          >
            Active ({tripHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === 'archive' ? 'var(--accent-green)' : 'transparent',
              color: activeTab === 'archive' ? 'white' : 'var(--text-secondary)'
            }}
          >
            Archived ({archivedTrips.length})
          </button>
        </div>

        {/* Trip list */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {trips.length === 0 ? (
            <div className="text-center py-10">
              <FolderSimple className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {activeTab === 'active' ? 'No Active Trips' : 'No Archived Trips'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {activeTab === 'active'
                  ? 'Start a new chat to plan your trip!'
                  : 'Archive trips to see them here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {trips.map((trip) => {
                const tripId = trip._id || trip.id;
                const isDeleting = deletingTripId === tripId;
                const isRestoring = restoringTripId === tripId;

                return (
                  <div key={tripId} className="group relative">
                    <button
                      onClick={() => onSelectTrip(tripId)}
                      className="w-full text-left px-3 py-3 rounded-lg transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                      disabled={isDeleting || isRestoring}
                    >
                      <div className="flex items-start gap-2.5">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {trip.parkName || trip.title || 'Untitled Trip'}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              <Clock className="h-3 w-3" />
                              {formatDate(trip.updatedAt || trip.createdAt)}
                            </span>
                            {trip.messageCount > 0 && (
                              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                <MessageCircle className="h-3 w-3" />
                                {trip.messageCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Action buttons */}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                      {activeTab === 'active' && onArchive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onArchive(tripId); }}
                          className="p-1.5 rounded-md transition-colors hover:opacity-80"
                          style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--surface)' }}
                          title="Archive"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {activeTab === 'archive' && onRestore && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRestore(tripId); }}
                          className="p-1.5 rounded-md transition-colors hover:opacity-80"
                          style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--surface)' }}
                          title="Restore"
                          disabled={isRestoring}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(tripId); }}
                          className="p-1.5 rounded-md transition-colors hover:opacity-80"
                          style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--surface)' }}
                          title="Delete"
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-white"
            style={{ backgroundColor: 'var(--accent-green)' }}
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>
      </aside>
    </>
  );
};

export default TripHistoryDrawer;
