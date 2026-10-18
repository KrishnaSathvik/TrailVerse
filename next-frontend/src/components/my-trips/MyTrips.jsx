'use client';

import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/common/Button';
import { useTrips } from '@/hooks/useTrips';
import { logTripArchiveChanged } from '@/utils/analytics';
import { useToast } from '@/context/ToastContext';
import tripService from '@/services/tripService';
import { selectTravelerOwnedFormData } from '@/lib/formDataProvenance';
import { hasSavedItinerary, hasTripConversation, myTripDestination, myTripPreview, myTripTitle, selectMyTrips, tripConversationHref, tripRecordId, tripWorkspaceHref } from '@/lib/myTrips';

const PAGE_SIZE = 12;
const FILTERS = [['all', 'All'], ['saved', 'Saved trips'], ['conversations', 'Conversations'], ['archived', 'Archived']];
const controlClass = 'min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-green)]';
const linkClass = 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-green)]';

function dateLabel(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
}

function TripCard({ trip, pending, onAction }) {
  const saved = hasSavedItinerary(trip);
  const destination = myTripDestination(trip);
  const updated = dateLabel(trip.updatedAt || trip.createdAt);
  const dates = selectTravelerOwnedFormData(trip.formData) || {};
  const startDate = dateLabel(dates.startDate);
  const endDate = dateLabel(dates.endDate);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(myTripTitle(trip));
  return (
    <article className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
        <span className="rounded-full bg-[var(--bg-secondary)] px-3 py-1.5 font-medium">{saved ? 'Saved itinerary' : 'Conversation'}{trip.status === 'archived' ? ' · Archived' : ''}</span>
        {updated && <span>Updated {updated}</span>}
      </div>
      <h2 className="mt-4 break-words text-xl font-semibold tracking-tight">{myTripTitle(trip)}</h2>
      {saved ? <p className="mt-2 break-words text-sm text-[var(--text-secondary)]">{trip.plan.days.length}-day itinerary{destination ? ` · ${destination}` : ''}</p>
        : <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-[var(--text-secondary)]">{myTripPreview(trip) || 'Resume your conversation with Trailie.'}</p>}
      {saved && startDate && <p className="mt-1 text-sm text-[var(--text-secondary)]">{startDate}{endDate ? ` — ${endDate}` : ''}</p>}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {saved && <Link href={tripWorkspaceHref(trip)} className={`${linkClass} bg-[var(--accent-green)] text-white`}>Open trip</Link>}
        {(!saved || hasTripConversation(trip)) && <Link href={tripConversationHref(trip)} className={linkClass}>{saved ? 'Continue chat' : 'Resume conversation'}</Link>}
      </div>
      {editing && <form className="mt-4 flex flex-wrap gap-2" onSubmit={async event => {
        event.preventDefault();
        if (await onAction('rename', trip, title.trim())) setEditing(false);
      }}>
        <label className="w-full text-sm" htmlFor={`title-${tripRecordId(trip)}`}>Trip or conversation title</label>
        <input id={`title-${tripRecordId(trip)}`} value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required className={`${controlClass} min-w-0 flex-1`} />
        <button type="submit" disabled={pending || !title.trim()} className={controlClass}>Save title</button>
        <button type="button" onClick={() => setEditing(false)} className={controlClass}>Cancel</button>
      </form>}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border)] pt-3">
        {[
          ['rename', 'Rename'], ['share', 'Share'],
          [trip.status === 'archived' ? 'restore' : 'archive', trip.status === 'archived' ? 'Restore' : 'Archive'], ['delete', 'Delete'],
        ].map(([action, label]) => <button key={action} type="button" disabled={pending} onClick={() => action === 'rename' ? setEditing(true) : onAction(action, trip)}
          className="min-h-11 text-sm text-[var(--text-secondary)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent-green)] disabled:opacity-50">{label}</button>)}
      </div>
    </article>
  );
}

export default function MyTrips() {
  const { trips, loading, error, archiveTrip, restoreTrip, deleteTrip, refreshTrips } = useTrips();
  const { showToast } = useToast();
  const [kind, setKind] = useState('all');
  const archived = kind === 'archived';
  const [count, setCount] = useState(PAGE_SIZE);
  const [pending, setPending] = useState(null);
  const records = selectMyTrips(trips, { kind, archived });
  const visible = records.slice(0, count);
  const change = (setter, value) => { setter(value); setCount(PAGE_SIZE); };
  const action = async (type, trip, title) => {
    const id = tripRecordId(trip);
    if (type === 'delete' && !window.confirm(`Delete “${myTripTitle(trip)}” and its saved conversation? This cannot be undone.`)) return false;
    setPending(id);
    try {
      if (type === 'archive') await archiveTrip(id);
      if (type === 'restore') await restoreTrip(id);
      if (type === 'delete') await deleteTrip(id);
      if (type === 'rename') { await tripService.updateTripMetadata(id, { title }); await refreshTrips(); }
      if (type === 'share') {
        const response = await tripService.shareTrip(id);
        const shareId = response.shareId || response.data?.shareId;
        if (!shareId) throw new Error('Share link unavailable');
        const url = `${window.location.origin}/plan-ai/shared/${shareId}`;
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
        else {
          const field = document.createElement('textarea');
          field.value = url;
          document.body.appendChild(field);
          field.select();
          const copied = document.execCommand('copy');
          field.remove();
          if (!copied) throw new Error('Could not copy share link');
        }
      }
      if (type === 'archive' || type === 'restore' || type === 'delete') logTripArchiveChanged(type === 'delete' ? 'deleted' : type);
      showToast({ archive: 'Archived', restore: 'Restored', delete: 'Deleted', rename: 'Title updated', share: 'Share link copied' }[type], 'success');
      return true;
    } catch {
      showToast(`Could not ${type}. Please try again.`, 'error');
      return false;
    } finally { setPending(null); }
  };
  const emptyTitle = archived ? 'Nothing archived here yet'
      : kind === 'saved' ? 'No saved trips yet'
        : kind === 'conversations' ? 'No conversation-only history yet' : 'Your next trip starts here';
  return <>
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">My Trips</h1>
        <p className="mt-3 text-base text-[var(--text-secondary)]">Your trips and conversations with Trailie, all in one place.</p>
      </div>
      <Link href="/plan-ai?entry=new-trip" className={`${linkClass} shrink-0 bg-[var(--accent-green)] text-white`}>Plan with Trailie</Link>
    </header>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter trips and conversations">
      {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => change(setKind, value)}
        className={`${controlClass} ${kind === value ? '!border-[var(--accent-green)] font-semibold' : ''}`}>{label} ({selectMyTrips(trips, { kind: value, archived: value === 'archived' }).length})</button>)}
    </div>
    {loading ? <div role="status" className="py-12">Loading your trips and conversations…</div>
      : error ? <div role="alert" className="rounded-2xl border border-[var(--border)] p-6"><h2 className="text-xl font-semibold">Could not load your trips</h2><p className="my-3">Please try again.</p><Button onClick={refreshTrips}>Try again</Button></div>
        : records.length === 0 ? <section className="rounded-2xl border border-[var(--border)] p-6 sm:p-8"><h2 className="text-xl font-semibold">{emptyTitle}</h2><p className="mt-3 text-[var(--text-secondary)]">{kind === 'saved' ? 'When you create an itinerary with Trailie, it will appear here. Your earlier conversations are still available under All or Conversations.' : kind === 'conversations' ? 'Chats without a saved itinerary appear here. You can continue a saved trip’s chat from All or Saved trips.' : archived ? 'Use Archive on a card to move it here. Choose Restore to bring it back to your main list.' : 'Start planning with Trailie. Your saved trips and conversations will appear here.'}</p></section>
          : <><p role="status" className="mb-4 text-sm text-[var(--text-secondary)]">Showing {visible.length} of {records.length}</p><div className="grid min-w-0 gap-4 lg:grid-cols-2">{visible.map(trip => <TripCard key={tripRecordId(trip)} trip={trip} pending={pending !== null} onAction={action} />)}</div>{count < records.length && <Button className="mt-6" onClick={() => setCount(previous => previous + PAGE_SIZE)}>Load more ({records.length - count} remaining)</Button>}</>}
  </>;
}
