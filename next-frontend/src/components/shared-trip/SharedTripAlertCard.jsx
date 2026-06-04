import Link from 'next/link';
import { ExternalLink } from '@components/icons';

export default function SharedTripAlertCard({
  accentColor = 'var(--accent-green)',
  badgeBg = 'var(--accent-green-light)',
  badgeColor = 'var(--accent-green-dark)',
  badgeLabel,
  title,
  body,
  buttonLabel,
  href,
  external = false,
}) {
  const ButtonInner = (
    <>
      {buttonLabel}
      {external ? <ExternalLink className="h-3 w-3" /> : null}
    </>
  );

  const buttonClassName = 'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-90';

  return (
    <div
      className="rounded-xl p-5 sm:p-6"
      style={{
        backgroundColor: 'var(--surface-hover)',
        border: '1px solid var(--border)',
        borderLeftWidth: '4px',
        borderLeftColor: accentColor,
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-base font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClassName}
            style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
          >
            {ButtonInner}
          </a>
        ) : (
          <Link
            href={href}
            className={buttonClassName}
            style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
          >
            {ButtonInner}
          </Link>
        )}
      </div>

      {badgeLabel ? (
        <span
          className="mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ backgroundColor: badgeBg, color: badgeColor }}
        >
          {badgeLabel}
        </span>
      ) : null}

      {body ? (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {body}
        </p>
      ) : null}
    </div>
  );
}
