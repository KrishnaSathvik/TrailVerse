'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import { useToast } from '@/context/ToastContext';
import { useTrips } from '@/hooks/useTrips';
import tripService from '@/services/tripService';
import { stripMarkdown, truncatePlainText } from '@/utils/stripMarkdown';
import {
  Sparkles, NotePencil, Clock, MessageCircle, MapPin, ArchiveRestore, Trash2, CheckCircle,
  Search, X, Share2, Route, AlertCircle, RefreshCw
} from '@components/icons';

const TRIPS_PER_PAGE = 12;

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'messages', label: 'Most messages' },
  { id: 'park', label: 'Park (A–Z)' },
];

const formatDate = (dateString) => {
  if (!dateString) return 'Recently updated';

  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const getMessageCount = (trip) => trip.conversation?.length || trip.summary?.totalMessages || 0;

const getTripTitle = (trip) => {
  if (trip.title && trip.title !== 'New Trip Plan' && trip.title !== 'General Planning Session') {
    return trip.title;
  }
  const firstUserMsg = (trip.conversation || []).find((m) => m.role === 'user');
  if (firstUserMsg?.content) {
    const text = stripMarkdown(firstUserMsg.content.trim());
    if (text.length <= 60) return text;
    return `${text.substring(0, 57).replace(/\s+\S*$/, '')}...`;
  }
  return trip.parkName || 'Untitled Chat';
};

const getPreviewText = (trip) => {
  let raw = '';
  if (trip.summary?.planPreview) {
    raw = trip.summary.planPreview;
  } else {
    const assistantMessage = [...(trip.conversation || [])]
      .reverse()
      .find((message) => message.role === 'assistant' && message.content);
    if (assistantMessage?.content) {
      raw = assistantMessage.content;
    } else {
      const userMessage = [...(trip.conversation || [])]
        .reverse()
        .find((message) => message.role === 'user' && message.content);
      if (userMessage?.content) {
        raw = userMessage.content;
      }
    }
  }

  const cleaned = truncatePlainText(raw, 140);
  return cleaned || 'Open this conversation to keep planning where you left off.';
};

/** True only when the trip has a saved structured itinerary (not summary.hasPlan from chat keywords). */
const tripHasItinerary = (trip) => {
  const days = trip.plan?.days;
  if (!Array.isArray(days) || days.length === 0) return false;
  return days.some((day) => Array.isArray(day.stops) && day.stops.length > 0);
};

const isActiveTrip = (trip) => {
  const { status } = trip;
  if (status === 'archived' || status === 'deleted' || status === 'temp') return false;
  return true;
};

const isArchivedTrip = (trip) => trip.status === 'archived';

const sortTrips = (trips, sortBy) => {
  const copy = [...trips];
  switch (sortBy) {
    case 'oldest':
      return copy.sort(
        (a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt)
      );
    case 'messages':
      return copy.sort((a, b) => getMessageCount(b) - getMessageCount(a));
    case 'park':
      return copy.sort((a, b) =>
        (a.parkName || a.parkCode || '').localeCompare(b.parkName || b.parkCode || '', undefined, {
          sensitivity: 'base'
        })
      );
    case 'newest':
    default:
      return copy.sort(
        (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
      );
  }
};

const matchesSearch = (trip, query) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    getTripTitle(trip),
    trip.parkName,
    trip.parkCode,
    getPreviewText(trip),
    ...(trip.summary?.keyTopics || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
};

const ChatHistoryCard = ({
  trip,
  onArchive,
  onRestore,
  onDelete,
  onShare,
  pendingAction
}) => {
  const router = useRouter();
  const tripId = trip._id || trip.id;
  const isArchived = isArchivedTrip(trip);
  const messageCount = getMessageCount(trip);
  const previewText = getPreviewText(trip);
  const hasItinerary = tripHasItinerary(trip);

  return (
    <article
      className="rounded-[1.75rem] border p-5 transition hover:-translate-y-1 sm:p-6"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 16px 34px rgba(15, 23, 42, 0.05)'
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              backgroundColor: isArchived ? 'rgba(148, 163, 184, 0.12)' : 'rgba(67, 160, 106, 0.12)',
              color: isArchived ? 'var(--text-secondary)' : 'var(--accent-green)'
            }}
          >
            {isArchived ? 'Archived Chat' : 'Active Chat'}
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {getTripTitle(trip)}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {formatDate(trip.updatedAt || trip.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" />
              {messageCount} messages
            </span>
            {(trip.parkName || trip.parkCode) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {trip.parkName || trip.parkCode}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-5 min-h-[4.5rem] line-clamp-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
        {previewText}
      </p>

      {trip.summary?.keyTopics?.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {trip.summary.keyTopics.slice(0, 3).map((topic) => (
            <span
              key={topic}
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-secondary)' }}
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={() => router.push(`/plan-ai/${tripId}?chat=true`)}
            variant="primary"
            size="md"
            icon={MessageCircle}
            className="flex-1 w-full sm:w-auto"
          >
            Continue Chat
          </Button>
          {hasItinerary && (
            <Button
              onClick={() => router.push(`/plan-ai/${tripId}/itinerary`)}
              variant="secondary"
              size="md"
              icon={Route}
              className="w-full sm:w-auto"
            >
              View Itinerary
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            onClick={() => onShare(tripId)}
            variant="secondary"
            size="md"
            icon={Share2}
            disabled={pendingAction === `share:${tripId}`}
            className="w-full sm:w-auto"
          >
            {pendingAction === `share:${tripId}` ? 'Sharing...' : 'Share'}
          </Button>

          {isArchived ? (
            <Button
              onClick={() => onRestore(tripId)}
              variant="secondary"
              size="md"
              icon={ArchiveRestore}
              disabled={pendingAction === `restore:${tripId}`}
              className="w-full sm:w-auto"
            >
              {pendingAction === `restore:${tripId}` ? 'Restoring...' : 'Restore'}
            </Button>
          ) : (
            <Button
              onClick={() => onArchive(tripId)}
              variant="secondary"
              size="md"
              icon={ArchiveRestore}
              disabled={pendingAction === `archive:${tripId}`}
              className="w-full sm:w-auto"
            >
              {pendingAction === `archive:${tripId}` ? 'Archiving...' : 'Archive'}
            </Button>
          )}

          <Button
            onClick={() => onDelete(tripId)}
            variant="secondary"
            size="md"
            icon={Trash2}
            disabled={pendingAction === `delete:${tripId}`}
            className="w-full sm:w-auto"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.06)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'rgba(239, 68, 68, 0.22)',
              color: 'var(--error-red, #b91c1c)',
            }}
          >
            {pendingAction === `delete:${tripId}` ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </article>
  );
};

export default function ChatHistoryPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { trips, loading, error, archiveTrip, restoreTrip, deleteTrip, refreshTrips } = useTrips();
  const [activeTab, setActiveTab] = useState('active');
  const [pendingAction, setPendingAction] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [displayCount, setDisplayCount] = useState(TRIPS_PER_PAGE);

  const activeTrips = useMemo(
    () => trips.filter(isActiveTrip),
    [trips]
  );

  const archivedTrips = useMemo(
    () => trips.filter(isArchivedTrip),
    [trips]
  );

  const tabTrips = activeTab === 'active' ? activeTrips : archivedTrips;

  const visibleTrips = useMemo(() => {
    const filtered = tabTrips.filter((trip) => matchesSearch(trip, searchQuery));
    return sortTrips(filtered, sortBy);
  }, [tabTrips, searchQuery, sortBy]);

  const displayedTrips = useMemo(
    () => visibleTrips.slice(0, displayCount),
    [visibleTrips, displayCount]
  );

  const remainingCount = Math.max(0, visibleTrips.length - displayedTrips.length);
  const hasMoreTrips = remainingCount > 0;

  useEffect(() => {
    setDisplayCount(TRIPS_PER_PAGE);
  }, [activeTab, searchQuery, sortBy]);

  const handleArchive = async (tripId) => {
    setPendingAction(`archive:${tripId}`);
    try {
      await archiveTrip(tripId);
      showToast('Chat archived successfully', 'success');
      setActiveTab('archived');
    } catch (err) {
      console.error('Error archiving chat:', err);
      showToast('Failed to archive chat', 'error');
    } finally {
      setPendingAction(null);
    }
  };

  const handleRestore = async (tripId) => {
    setPendingAction(`restore:${tripId}`);
    try {
      await restoreTrip(tripId);
      showToast('Chat restored successfully', 'success');
      setActiveTab('active');
    } catch (err) {
      console.error('Error restoring chat:', err);
      showToast('Failed to restore chat', 'error');
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async (tripId) => {
    if (!window.confirm('Delete this chat permanently? This cannot be undone.')) {
      return;
    }

    setPendingAction(`delete:${tripId}`);
    try {
      await deleteTrip(tripId);
      showToast('Chat deleted successfully', 'success');
    } catch (err) {
      console.error('Error deleting chat:', err);
      showToast('Failed to delete chat', 'error');
    } finally {
      setPendingAction(null);
    }
  };

  const handleShare = async (tripId) => {
    setPendingAction(`share:${tripId}`);
    try {
      const data = await tripService.shareTrip(tripId);
      const shareId = data?.shareId || data?.data?.shareId;
      if (!shareId) {
        throw new Error('Share ID missing from response');
      }
      const url = `${window.location.origin}/plan-ai/shared/${shareId}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = document.createElement('textarea');
        el.value = url;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      showToast('Share link copied', 'success');
    } catch (err) {
      console.error('Error sharing chat:', err);
      showToast('Failed to copy share link', 'error');
    } finally {
      setPendingAction(null);
    }
  };

  const showEmptyTab = !loading && !error && tabTrips.length === 0;
  const showNoSearchResults = !loading && !error && tabTrips.length > 0 && visibleTrips.length === 0;

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-primary)',
        backgroundImage:
          'radial-gradient(circle at top left, color-mix(in srgb, var(--accent-green-light) 18%, transparent 82%) 0%, transparent 30%), radial-gradient(circle at top right, color-mix(in srgb, var(--accent-blue) 10%, transparent 90%) 0%, transparent 24%)'
      }}
    >
      <Header />

      <section className="relative overflow-hidden py-8 sm:py-12">
        <div className="relative z-10 mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-10 xl:px-12">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Saved Conversations
            </span>
          </div>

          <div className="mt-6 max-w-4xl">
            <h1
              className="mb-4 text-4xl font-semibold leading-none tracking-tighter sm:text-5xl lg:text-6xl"
              style={{ color: 'var(--text-primary)' }}
            >
              Chat History
            </h1>
            <p className="max-w-3xl text-lg sm:text-xl" style={{ color: 'var(--text-secondary)' }}>
              Reopen older planning sessions, archive finished trips, and keep your active chats organized in one place.
            </p>
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              onClick={() => router.push('/plan-ai')}
              variant="secondary"
              size="lg"
              icon={NotePencil}
            >
              Chat
            </Button>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-10 xl:px-12">
          {error && !loading && (
            <div
              className="mb-8 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                borderColor: 'rgba(239, 68, 68, 0.2)'
              }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: '#b91c1c' }} />
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Could not load chat history
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {error}
                  </p>
                </div>
              </div>
              <Button onClick={() => refreshTrips()} variant="secondary" size="md" icon={RefreshCw}>
                Try Again
              </Button>
            </div>
          )}

          <>
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div
                className="grid max-w-md grid-cols-2 gap-2 rounded-2xl p-1"
                style={{ backgroundColor: 'var(--surface-hover)' }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('active')}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                  style={{
                    backgroundColor: activeTab === 'active' ? 'var(--accent-green)' : 'transparent',
                    color: activeTab === 'active' ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  Active ({activeTrips.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('archived')}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                  style={{
                    backgroundColor: activeTab === 'archived' ? 'var(--accent-green)' : 'transparent',
                    color: activeTab === 'archived' ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  Archived ({archivedTrips.length})
                </button>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-2xl">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search chats, parks, topics..."
                    className="w-full rounded-2xl py-3 pl-10 pr-10 text-sm outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition hover:opacity-80"
                      style={{ color: 'var(--text-tertiary)' }}
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-2xl px-4 py-3 text-sm font-medium outline-none"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  aria-label="Sort chats"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {loading
                ? 'Loading your chats...'
                : hasMoreTrips
                  ? `Showing ${displayedTrips.length} of ${visibleTrips.length} ${activeTab} chat${visibleTrips.length === 1 ? '' : 's'}`
                  : `Showing ${visibleTrips.length} of ${tabTrips.length} ${activeTab} chat${tabTrips.length === 1 ? '' : 's'}`}
              {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
            </p>

            {loading ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-72 animate-pulse rounded-[1.75rem]"
                    style={{ backgroundColor: 'var(--surface)' }}
                  />
                ))}
              </div>
            ) : showNoSearchResults ? (
              <div
                className="rounded-[2rem] border p-8 sm:p-12"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)'
                }}
              >
                <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No chats match your search
                </h2>
                <p className="mt-3 text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                  Try a different keyword or clear the search to see all {activeTab} conversations.
                </p>
                <Button onClick={() => setSearchQuery('')} variant="secondary" size="md" className="mt-6">
                  Clear Search
                </Button>
              </div>
            ) : showEmptyTab ? (
              <div
                className="rounded-[2rem] border p-8 sm:p-12"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="max-w-2xl">
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
                    style={{ backgroundColor: 'rgba(67, 160, 106, 0.12)', color: 'var(--accent-green)' }}
                  >
                    <CheckCircle className="h-4 w-4" />
                    {activeTab === 'active' ? 'No active chats' : 'No archived chats'}
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {activeTab === 'active' ? 'Start your next planning conversation' : 'Nothing archived yet'}
                  </h2>
                  <p className="mt-3 text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                    {activeTab === 'active'
                      ? 'Your AI trip conversations will appear here once they have been saved to your account.'
                      : 'Archive a finished trip from the Active tab when you want to keep history without cluttering your main list.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  {displayedTrips.map((trip) => (
                    <ChatHistoryCard
                      key={trip._id || trip.id}
                      trip={trip}
                      onArchive={handleArchive}
                      onRestore={handleRestore}
                      onDelete={handleDelete}
                      onShare={handleShare}
                      pendingAction={pendingAction}
                    />
                  ))}
                </div>
                {hasMoreTrips && (
                  <div className="mt-8 flex flex-col items-center gap-2">
                    <Button
                      onClick={() => setDisplayCount((count) => count + TRIPS_PER_PAGE)}
                      variant="secondary"
                      size="lg"
                    >
                      Load more ({remainingCount} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        </div>
      </section>
    </div>
  );
}
