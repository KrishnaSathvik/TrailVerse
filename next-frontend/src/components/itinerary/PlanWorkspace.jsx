'use client';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/common/Header';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import usePlanWorkspace from '@/hooks/usePlanWorkspace';
import { useToast } from '@/context/ToastContext';
import { tripSurfacePath } from '@/lib/tripSurfacePath';
import { tripTitle } from '@/lib/tripPresentation';
import TripWorkspaceView from './TripWorkspaceView';
import DayCardList from './DayCardList';
import AddPlaceInput from '../maps/AddPlaceInput';

export default function PlanWorkspace({ tripId, view = 'itinerary' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { showToast } = useToast();
  const workspace = usePlanWorkspace(tripId);
  const {
    trip, days, isLoading, error, saveState, isDirty,
    addDay, removeDay, removeStop, updateStop, moveStopBetweenDays, addPlace,
  } = workspace;
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingDay, setAddingDay] = useState(null);
  const addPlaceRef = useRef(null);

  const requestAddStop = (dayId) => {
    setAddingDay(dayId);
    addPlaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    addPlaceRef.current?.querySelector('input')?.focus({ preventScroll: true });
  };

  if (isLoading) return <LoadingSpinner text="Loading your trip…" />;
  if (error || !trip) {
    return (
      <>
        <Header />
        <p className="p-6">Could not load this trip. Sign in to the account that owns it.</p>
      </>
    );
  }

  const plan = { ...trip.plan, days };
  const exportPdf = async () => {
    setExporting(true);
    try {
      const { exportTripPdf } = await import('@/lib/pdf/exportTripPdf');
      await exportTripPdf({ title: tripTitle(plan, trip.title), parkName: plan.parkName, tripId, plan });
    } catch {
      showToast('Could not export the trip. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const actions = (
    <div className="flex w-full flex-wrap gap-3 text-sm sm:w-auto">
      <button className="min-h-11 text-[var(--accent-green)]" onClick={() => router.push(`/plan-ai/${tripId}?chat=true`)}>
        ← Back to chat
      </button>
      <button
        className="min-h-11 px-2 text-[var(--text-secondary)]"
        onClick={exportPdf}
        disabled={exporting || isDirty || saveState === 'saving'}
      >
        {exporting ? 'Preparing your trip…' : isDirty || saveState === 'saving' ? 'Saving changes…' : 'Export PDF'}
      </button>
    </div>
  );

  const editor = (
    <section className="mt-8 border-t border-[var(--border)] pt-4">
      <button
        className="min-h-11 text-sm font-semibold text-[var(--text-secondary)]"
        aria-expanded={editing}
        onClick={() => setEditing(!editing)}
      >
        {editing ? 'Done editing' : 'Edit trip'}
      </button>
      {saveState === 'saving' && <span role="status" className="ml-3 text-xs">Saving…</span>}
      {editing && (
        <div className="space-y-6">
          <p className="text-sm text-[var(--text-secondary)]">
            Add places by name — TrailVerse resolves them on the server. Ask Trailie in chat for pinless experiences or conversational edits.
          </p>
          <div ref={addPlaceRef}>
            <AddPlaceInput
              days={days}
              activeDayId={addingDay || days[0]?.id}
              onAddQuery={addPlace}
              placeholder="Add a place…"
              disabled={saveState === 'saving'}
            />
          </div>
          {days.map((day, i) => (
            <DayCardList
              key={day.id}
              day={day}
              dayIndex={i}
              allDays={days}
              isLastDay={false}
              onRequestAddStop={requestAddStop}
              onRemoveStop={removeStop}
              onUpdateStop={updateStop}
              onMoveStop={moveStopBetweenDays}
              onRemoveDay={removeDay}
              addDay={addDay}
              tripId={tripId}
              router={router}
              dayColor="var(--accent-green)"
            />
          ))}
          <button className="min-h-11 text-sm text-[var(--accent-green)]" onClick={addDay}>
            + Add day
          </button>
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header />
      <main>
        <TripWorkspaceView
          sampleReadingMode
          plan={plan}
          title={trip.title}
          view={view}
          initialDayId={params.get('day') || 'all'}
          actions={actions}
          editor={editor}
          onViewChange={(next, day = 'all') => router.push(`${tripSurfacePath(tripId, next)}?day=${encodeURIComponent(day)}`)}
        />
      </main>
    </div>
  );
}
