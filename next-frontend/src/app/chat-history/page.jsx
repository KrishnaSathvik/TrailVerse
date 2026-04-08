'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useTrips } from '@/hooks/useTrips';
import {
  Sparkles, Clock, MessageCircle, MapPin, ArchiveRestore, Trash2, CheckCircle
} from '@components/icons';

const formatDate = (dateString) => {
  if (!dateString) return 'Recently updated';

  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const getPreviewText = (trip) => {
  if (trip.summary?.planPreview) return trip.summary.planPreview;

  const assistantMessage = [...(trip.conversation || [])]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content);

  if (assistantMessage?.content) {
    return assistantMessage.content.slice(0, 140);
  }

  const userMessage = [...(trip.conversation || [])]
    .reverse()
    .find((message) => message.role === 'user' && message.content);

  if (userMessage?.content) {
    return userMessage.content.slice(0, 140);
  }

  return 'Open this conversation to keep planning where you left off.';
};

const ChatHistoryCard = ({
  trip,
  onArchive,
  onRestore,
  onDelete,
  pendingAction
}) => {
  const router = useRouter();
  const tripId = trip._id || trip.id;
  const isArchived = trip.status === 'archived';
  const messageCount = trip.conversation?.length || trip.summary?.totalMessages || 0;
  const previewText = getPreviewText(trip);

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
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              backgroundColor: isArchived ? 'rgba(148, 163, 184, 0.12)' : 'rgba(67, 160, 106, 0.12)',
              color: isArchived ? 'var(--text-secondary)' : 'var(--accent-green)'
            }}
          >
            {isArchived ? 'Archived Chat' : 'Active Chat'}
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {trip.parkName || trip.title || 'Untitled Chat'}
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

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => router.push(`/plan-ai/${tripId}?chat=true`)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition"
          style={{
            backgroundColor: 'var(--accent-green)',
            boxShadow: '0 14px 28px rgba(67, 160, 106, 0.22)'
          }}
        >
          <MessageCircle className="h-4 w-4" />
          Continue Chat
        </button>

        {isArchived ? (
          <button
            type="button"
            onClick={() => onRestore(tripId)}
            disabled={pendingAction === `restore:${tripId}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--surface)'
            }}
          >
            <ArchiveRestore className="h-4 w-4" />
            {pendingAction === `restore:${tripId}` ? 'Restoring...' : 'Restore'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onArchive(tripId)}
            disabled={pendingAction === `archive:${tripId}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--surface)'
            }}
          >
            <ArchiveRestore className="h-4 w-4" />
            {pendingAction === `archive:${tripId}` ? 'Archiving...' : 'Archive'}
          </button>
        )}

        <button
          type="button"
          onClick={() => onDelete(tripId)}
          disabled={pendingAction === `delete:${tripId}`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition"
          style={{
            borderColor: 'rgba(239, 68, 68, 0.18)',
            color: '#b91c1c',
            backgroundColor: 'rgba(239, 68, 68, 0.06)'
          }}
        >
          <Trash2 className="h-4 w-4" />
          {pendingAction === `delete:${tripId}` ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </article>
  );
};

export default function ChatHistoryPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useToast();
  const { trips, loading, archiveTrip, restoreTrip, deleteTrip } = useTrips();
  const [activeTab, setActiveTab] = useState('active');
  const [pendingAction, setPendingAction] = useState(null);

  const activeTrips = useMemo(
    () => trips.filter((trip) => trip.status === 'active').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [trips]
  );

  const archivedTrips = useMemo(
    () => trips.filter((trip) => trip.status === 'archived').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [trips]
  );

  const visibleTrips = activeTab === 'active' ? activeTrips : archivedTrips;

  const handleArchive = async (tripId) => {
    setPendingAction(`archive:${tripId}`);
    try {
      await archiveTrip(tripId);
      showToast('Chat archived successfully', 'success');
      setActiveTab('archived');
    } catch (error) {
      console.error('Error archiving chat:', error);
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
    } catch (error) {
      console.error('Error restoring chat:', error);
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
    } catch (error) {
      console.error('Error deleting chat:', error);
      showToast('Failed to delete chat', 'error');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <section className="relative overflow-hidden py-8 sm:py-16">
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
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Chat History
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Reopen older planning sessions, archive finished trips, and keep your active chats organized in one place.
            </p>
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              onClick={() => router.push('/plan-ai')}
              variant="secondary"
              size="lg"
              icon={Sparkles}
            >
              Start New Chat
            </Button>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-10 xl:px-12">
          {!isAuthenticated ? (
            <div
              className="rounded-[2rem] border p-8 text-center sm:p-12"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)'
              }}
            >
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                Sign in to view chat history
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                Your saved AI trip conversations live in your account. Sign in to continue older chats or archive finished plans.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button onClick={() => router.push('/login')} variant="ghost" size="lg">
                  Sign In
                </Button>
                <Button onClick={() => router.push('/signup')} variant="primary" size="lg" icon={Sparkles}>
                  Create Account
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('active')}
                    className="px-3 py-1.5 text-sm font-semibold transition"
                    style={{
                      color: activeTab === 'active' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      borderBottom: activeTab === 'active' ? '2px solid var(--accent-green)' : '2px solid transparent'
                    }}
                  >
                    Active ({activeTrips.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('archived')}
                    className="px-3 py-1.5 text-sm font-semibold transition"
                    style={{
                      color: activeTab === 'archived' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      borderBottom: activeTab === 'archived' ? '2px solid var(--accent-green)' : '2px solid transparent'
                    }}
                  >
                    Archived ({archivedTrips.length})
                  </button>
                </div>

                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Showing {visibleTrips.length} {activeTab} chat{visibleTrips.length === 1 ? '' : 's'}
                </div>
              </div>

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
              ) : visibleTrips.length === 0 ? (
                <div
                  className="rounded-[2rem] border p-8 sm:p-12"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
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

                    {/* "New Chat" button lives in the page header — no duplicate here */}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  {visibleTrips.map((trip) => (
                    <ChatHistoryCard
                      key={trip._id || trip.id}
                      trip={trip}
                      onArchive={handleArchive}
                      onRestore={handleRestore}
                      onDelete={handleDelete}
                      pendingAction={pendingAction}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

    </div>
  );
}
