import { formatDurationMinutes, formatSharedTripDate, formatTime12, getSharedDayHeading } from '@/utils/sharedTripFormat';

function SharedTripStopRow({ stop }) {
  const time = formatTime12(stop.startTime);
  const duration = formatDurationMinutes(stop.duration);
  const note = stop.note || stop.why;

  return (
    <div className="flex gap-2.5 border-l-2 pl-3 sm:gap-3" style={{ borderColor: 'var(--border)' }}>
      <div className="w-12 shrink-0 pt-0.5 sm:w-14">
        <p className="text-[11px] font-semibold tabular-nums leading-tight sm:text-xs" style={{ color: 'var(--accent-green)' }}>
          {time || '—'}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug break-words" style={{ color: 'var(--text-primary)' }}>
          {stop.name}
        </p>
        {note ? (
          <p className="mt-1 text-xs leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>
            {note}
          </p>
        ) : null}
        {duration ? (
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Duration: {duration}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function SharedTripDayCard({ day, dayIndex }) {
  const { badge, title } = getSharedDayHeading(day, dayIndex);
  const stops = day.stops || [];

  return (
    <article
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'var(--surface-hover)',
        border: '1px solid var(--border)',
        borderLeftWidth: '4px',
        borderLeftColor: 'var(--accent-green)',
      }}
    >
      <div
        className="border-b px-4 py-4 sm:px-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span
            className="inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none"
            style={{ backgroundColor: 'var(--accent-green-light)', color: 'var(--accent-green-dark)' }}
          >
            {badge}
          </span>
          {day.date ? (
            <p className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
              {formatSharedTripDate(day.date)}
            </p>
          ) : null}
        </div>
        {title ? (
          <h3 className="text-sm font-semibold leading-snug sm:text-[15px]" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
        ) : null}
      </div>

      <div className="space-y-3.5 px-4 py-4 sm:space-y-4 sm:px-5">
        {stops.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No stops listed for this day.</p>
        ) : (
          stops.map((stop) => (
            <SharedTripStopRow key={stop.id || `${day.id}-${stop.name}`} stop={stop} />
          ))
        )}
      </div>
    </article>
  );
}
