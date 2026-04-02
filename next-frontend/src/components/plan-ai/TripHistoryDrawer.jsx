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
          fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[320px] flex-col
          transition-transform duration-300 ease-in-out
          lg:relative lg:z-auto lg:w-[320px] lg:max-w-none lg:translate-x-0 lg:border-r lg:flex-shrink-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'}
        `}
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-4 flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Trip History
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Reopen saved conversations or start fresh.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border p-2 transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
            aria-label="Close history"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="border-b px-3 py-3 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div
          className="grid grid-cols-2 gap-2 rounded-2xl p-1"
          style={{ backgroundColor: 'var(--surface-hover)' }}
        >
          <button
            onClick={() => setActiveTab('active')}
            className="rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === 'active' ? 'var(--accent-green)' : 'transparent',
              color: activeTab === 'active' ? 'white' : 'var(--text-secondary)'
            }}
          >
            Active ({tripHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className="rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === 'archive' ? 'var(--accent-green)' : 'transparent',
              color: activeTab === 'archive' ? 'white' : 'var(--text-secondary)'
            }}
          >
            Archived ({archivedTrips.length})
          </button>
        </div>
        </div>

        {/* Trip list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {trips.length === 0 ? (
            <div
              className="rounded-2xl border px-4 py-10 text-center"
              style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}
            >
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
            <div className="space-y-2.5">
              {trips.map((trip) => {
                const tripId = trip._id || trip.id;
                const isDeleting = deletingTripId === tripId;
                const isRestoring = restoringTripId === tripId;

                return (
                  <div key={tripId} className="group relative">
                    <button
                      onClick={() => onSelectTrip(tripId)}
                      className="w-full rounded-2xl border px-3.5 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:opacity-95"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.76)',
                        borderColor: 'var(--border)',
                        boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)'
                      }}
                      disabled={isDeleting || isRestoring}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
                          style={{ backgroundColor: 'rgba(67, 160, 106, 0.12)' }}
                        >
                          <MapPin className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {trip.parkName || trip.title || 'Untitled Trip'}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                            {activeTab === 'active' ? 'Continue this planning conversation.' : 'Restore this archived trip to keep planning.'}
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
                    <div className="absolute right-2 top-2 hidden items-center gap-1 md:flex md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                      {activeTab === 'active' && onArchive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onArchive(tripId); }}
                          className="rounded-lg border p-1.5 transition-colors hover:opacity-80"
                          style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--surface)' }}
                          title="Archive"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {activeTab === 'archive' && onRestore && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRestore(tripId); }}
                          className="rounded-lg border p-1.5 transition-colors hover:opacity-80"
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
                          className="rounded-lg border p-1.5 transition-colors hover:opacity-80"
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
        <div className="border-t px-3 py-3 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-colors"
            style={{
              backgroundColor: 'var(--accent-green)',
              boxShadow: '0 14px 28px rgba(67, 160, 106, 0.22)'
            }}
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
