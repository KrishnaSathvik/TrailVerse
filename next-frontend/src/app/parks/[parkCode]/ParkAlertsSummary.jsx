import { AlertTriangle, ExternalLink } from '@components/icons';

const MAX_LISTED_ALERTS = 3;

/**
 * Overview-tab alert summary plus NPS source attribution. Rendered in the
 * initial HTML from the park page's server data; `asOfLabel` is formatted on
 * the server so the client renders the identical string during hydration.
 */
export default function ParkAlertsSummary({
  parkName,
  alerts = [],
  asOfLabel = null,
  isLive = false,
  npsUrl = null,
  onViewAll,
}) {
  const list = Array.isArray(alerts) ? alerts : [];
  const listed = list.slice(0, MAX_LISTED_ALERTS);
  const remaining = list.length - listed.length;
  const freshness = isLive
    ? 'updated live from the NPS'
    : (asOfLabel ? `as of ${asOfLabel}` : null);

  return (
    <section
      className="not-prose mb-6 rounded-xl p-4 sm:p-5"
      style={{
        backgroundColor: 'var(--surface-hover)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
      aria-labelledby="park-alerts-summary-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3
          id="park-alerts-summary-heading"
          className="text-base font-semibold flex items-center gap-2 m-0"
          style={{ color: 'var(--text-primary)' }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--icon-warning)' }} />
          {list.length > 0
            ? `${list.length} current NPS alert${list.length === 1 ? '' : 's'}`
            : 'No current NPS alerts'}
        </h3>
        {list.length > 0 && onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold hover:underline"
            style={{ color: 'var(--accent-green, #22c55e)' }}
          >
            See all alerts
          </button>
        ) : null}
      </div>

      {listed.length > 0 ? (
        <ul className="m-0 p-0 list-none space-y-1.5">
          {listed.map((alert, index) => (
            <li
              key={alert.id || `${alert.title}-${index}`}
              className="text-sm leading-snug"
              style={{ color: 'var(--text-secondary)' }}
            >
              {alert.category ? (
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {alert.category}:{' '}
                </span>
              ) : null}
              {alert.title}
            </li>
          ))}
          {remaining > 0 ? (
            <li className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              +{remaining} more in the Alerts tab
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-sm m-0" style={{ color: 'var(--text-secondary)' }}>
          The National Park Service has no active alerts listed for {parkName}. Conditions change
          quickly — check again before you go.
        </p>
      )}

      <p className="text-xs mt-3 mb-0" style={{ color: 'var(--text-tertiary)' }}>
        Source: National Park Service
        {freshness ? ` (${freshness})` : ''}.{' '}
        {npsUrl ? (
          <a
            href={npsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold hover:underline"
            style={{ color: 'var(--accent-green, #22c55e)' }}
          >
            Official {parkName} page on nps.gov
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </p>
    </section>
  );
}
