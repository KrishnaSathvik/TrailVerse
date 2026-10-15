import { formatTravelMinutes, groundedPlaceType } from '@/lib/tripPresentation';
import { formatDurationMinutes, formatSharedTripDate, formatTime12, getSharedDayHeading } from '@/utils/sharedTripFormat';
import { AlertTriangle, AlertCircle, Info } from '@/components/icons';

const SUPPORTING_STOP_TYPES = new Set([
  'meal',
  'restaurant',
  'picnic',
  'lodging',
  'check-in',
  'check_in',
  'transit',
  'transfer',
  'transport',
  'recovery',
  'rest',
  'break',
  'logistics',
]);

const EVIDENCE_COPY = {
  confirmed_current: 'Confirmed current',
  official_guidance: 'Official guidance',
  estimated: 'Estimated',
  not_verified: 'Not verified',
};

const REQUIREMENT_STYLE = {
  blocking: { Icon: AlertTriangle, accent: '#dc2626' },
  required: { Icon: AlertCircle, accent: '#b45309' },
  check: { Icon: Info, accent: 'var(--accent-green-dark)' },
  advisory: { Icon: Info, accent: 'var(--text-tertiary)' },
};

export function normalizeDisplayText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isSupportingItineraryStop(stop) {
  return SUPPORTING_STOP_TYPES.has(String(stop?.type || '').trim().toLocaleLowerCase());
}

export function itineraryStopCopy(stop) {
  const note = String(stop?.note || '').trim();
  const why = String(stop?.why || '').trim();
  return {
    note: note || null,
    why: why && normalizeDisplayText(why) !== normalizeDisplayText(note) ? why : null,
  };
}

export function ItineraryDayHeading({ day, index, action = null }) {
  const { badge, title } = getSharedDayHeading(day, index);
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--accent-green-dark)' }}>
          {badge}{day.dayStructure?.type ? ` · ${{ sightseeing: 'Sightseeing day', arrival: 'Arrival day', departure: 'Departure day', transfer: 'Transfer day', rest: 'Relaxed day' }[day.dayStructure.type] || day.dayStructure.type}` : ''}
          {action}
        </p>
        {title ? (
          <h3 className="mt-1.5 text-xl font-semibold leading-snug" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {title}
          </h3>
        ) : null}
        {day.dayStructure?.summary && <p className="mt-2 max-w-[var(--public-rich-width)] text-sm leading-6 text-[var(--text-secondary)]">{day.dayStructure.summary}</p>}
      </div>
      {day.date ? (
        <p className="pb-0.5 text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {formatSharedTripDate(day.date)}
        </p>
      ) : null}
    </header>
  );
}

export function ItineraryRequirements({ requirements, compact = false }) {
  const list = Array.isArray(requirements) ? requirements.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <aside className={`${compact ? 'mt-3' : 'mb-5'} border-l-2 py-0.5 pl-3.5`} style={{ borderColor: 'var(--border-strong, var(--border))' }} aria-label="Good to know">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
        Good to know
      </p>
      <div className="space-y-2.5">
        {list.map((requirement, index) => {
          const style = REQUIREMENT_STYLE[requirement.severity] || REQUIREMENT_STYLE.required;
          const { Icon } = style;
          return (
            <div key={requirement.id || `${requirement.title}-${index}`} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: style.accent }} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-snug" style={{ color: style.accent }}>{requirement.title}</p>
                {requirement.requirement ? (
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{requirement.requirement}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export function ItineraryDriveTransition({ minutes }) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return null;
  const duration = formatTravelMinutes(value);
  return (
    <li className="relative -mt-2 mb-3 ml-2 flex min-h-7 items-center pl-8" aria-label={`${duration} drive`}>
      <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-px" style={{ backgroundColor: 'var(--border)' }} />
      <span aria-hidden="true" className="absolute left-[-0.18rem] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" style={{ backgroundColor: 'var(--text-tertiary)' }} />
      <p data-drive-transition="true" className="text-[11px] font-medium tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
        {duration} drive
      </p>
    </li>
  );
}

function StopMeta({ stop, supporting }) {
  const time = stop.timingReason && stop.startTime ? [stop.timeWindow, formatTime12(stop.startTime)].filter(Boolean).join(' · ') : stop.timeWindow || formatTime12(stop.startTime);
  const duration = formatDurationMinutes(stop.duration);
  const difficulty = stop.physicalDifficulty || stop.difficulty;
  const exposure = stop.exposureLevel || stop.exposure;
  const secondary = [duration, difficulty, exposure ? `${exposure} exposure` : null].filter(Boolean);
  const evidence = EVIDENCE_COPY[stop.evidenceStatus];
  if (!time && !secondary.length && !evidence) return null;
  return (
    <div className={supporting ? 'flex flex-wrap items-center gap-x-2 gap-y-0.5' : 'space-y-0.5'}>
      {time ? <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--accent-green-dark)' }}>{time}</p> : null}
      {stop.timingReason && <p className="text-[11px] leading-5 text-[var(--text-secondary)]">{stop.timingReason}</p>}
      {secondary.length ? (
        <p className="text-[11px] font-medium leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{secondary.join(' · ')}</p>
      ) : null}
      {evidence ? <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{evidence}</span> : null}
    </div>
  );
}

export function ItineraryStopRow({
  stop,
  index = 0,
  numbered = true,
  titleAction = null,
  domId = null,
  flashed = false,
}) {
  const supporting = isSupportingItineraryStop(stop);
  const copy = itineraryStopCopy(stop);
  const alternatives = Array.isArray(stop.alternatives)
    ? stop.alternatives.filter((item) => String(typeof item === 'string' ? item : item?.name || '').trim())
    : [];
  return (
    <li
      id={domId || undefined}
      data-stop-treatment={supporting ? 'supporting' : 'experience'}
      className={`relative grid min-w-0 transition-colors duration-700 sm:grid-cols-[9rem_minmax(0,1fr)] ${supporting
        ? 'mb-2 gap-1 py-2 pl-8 sm:gap-x-6 sm:pl-9'
        : 'gap-1 pb-7 pl-8 sm:gap-x-6 sm:pl-9'}`}
      style={{ backgroundColor: flashed ? 'var(--surface-hover)' : 'transparent' }}
    >
      <span
        aria-hidden="true"
        className={`absolute z-10 flex items-center justify-center rounded-full ${supporting
          ? 'left-[0.2rem] top-[0.9rem] h-4 w-4 text-[9px] font-semibold'
          : 'left-[0.28rem] top-1.5 h-4 w-4 border-2 text-[9px] font-bold sm:left-[0.34rem]'}`}
        style={supporting
          ? { backgroundColor: 'var(--text-tertiary)', color: 'var(--surface)' }
          : { backgroundColor: 'var(--surface)', borderColor: 'var(--accent-green)', color: 'var(--accent-green-dark)' }}
      >
        {numbered ? index + 1 : ''}
      </span>
      {!supporting ? (
        <span aria-hidden="true" className="absolute bottom-0 left-[0.72rem] top-5 w-px last:hidden sm:left-[0.82rem]" style={{ backgroundColor: 'var(--border)' }} />
      ) : null}
      <div className="min-w-0 sm:pt-0.5"><StopMeta stop={stop} supporting={supporting} /></div>
      <div className="min-w-0 sm:col-start-2 sm:row-start-1">
        <h4 className={`${supporting ? 'text-sm' : 'text-[15px] sm:text-base'} font-semibold leading-snug`} style={{ color: 'var(--text-primary)' }}>
          {stop.name}
          {titleAction}
        </h4>
        {groundedPlaceType(stop) && <p className="mt-1 text-xs text-[var(--text-secondary)]">{groundedPlaceType(stop)}</p>}
        {copy.note ? <p className={`${supporting ? 'mt-0.5 text-xs leading-5' : 'mt-1 text-sm leading-6'}`} style={{ color: 'var(--text-secondary)' }}>{copy.note}</p> : null}
        {copy.why ? <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>{copy.why}</p> : null}
        <ItineraryRequirements requirements={stop.requirements} compact />
        {alternatives.length ? (
          <div className="mt-2 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>Backup if this fails</p>
            <div className="mt-1 space-y-1">
              {alternatives.map((item, alternativeIndex) => {
                const value = typeof item === 'string' ? { name: item } : item;
                return (
                  <p key={`${value.name}-${alternativeIndex}`} className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{value.name}</span>
                    {value.note ? ` — ${value.note}` : ''}
                  </p>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ItineraryOvernightBase({ location }) {
  if (!String(location || '').trim()) return null;
  return (
    <footer className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-3.5" style={{ borderColor: 'var(--border)' }}>
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>Stay</p>
      <p className="min-w-0 flex-1 text-sm font-semibold leading-snug break-words" style={{ color: 'var(--text-primary)' }}>{location}</p>
    </footer>
  );
}
