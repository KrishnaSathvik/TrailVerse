'use client';

export default function TrailieDraftPreview({ preview, onCancel }) {
  if (!preview) return null;
  if (preview.status === 'withdrawn') return <p role="status" className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
    Draft preview withdrawn. Planning was interrupted or the draft could not be confirmed. Reload your trip to check whether a completed plan was saved.
  </p>;
  return <section aria-label="Draft itinerary preview" className="min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
    <header className="space-y-2">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">Draft preview</h2>
      <p className="text-sm text-[var(--text-secondary)]">Not yet validated or saved. Activities may change or disappear. Do not use this draft for booking or navigation.</p>
      <p role="status" className="text-sm text-[var(--text-secondary)]">{preview.days.length} {preview.days.length === 1 ? 'day' : 'days'} ready to preview · The remaining trip is being composed and checked.</p>
    </header>
    {preview.days.map(day => <article key={day.index} tabIndex={-1} aria-label={`Draft day ${day.dayNumber}`} className="min-w-0 space-y-2 rounded-xl bg-[var(--bg-primary)] p-4 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]">
      <h3 className="font-semibold text-[var(--text-primary)]">Day {day.dayNumber} — {day.label}</h3>
      <p className="text-xs font-medium text-[var(--text-secondary)]">Draft · Not yet validated</p>
      <p className="text-sm text-[var(--text-secondary)]">{day.summary}</p>
      <ul className="space-y-3 text-sm text-[var(--text-secondary)]">{day.activities.map((activity, index) => <li key={index}>
        <p className="font-medium text-[var(--text-primary)]">{activity.name}</p><p>{activity.note}</p>
      </li>)}</ul>
    </article>)}
    {onCancel && <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)]">Cancel generation</button>}
  </section>;
}
