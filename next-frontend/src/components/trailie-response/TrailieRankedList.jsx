'use client';

export default function TrailieRankedList({ items = [], ariaLabel = 'Recommendations' }) {
  const rows = (Array.isArray(items) ? items : []).filter((item) => item?.title || item?.name);
  if (!rows.length) return null;

  return (
    <ol className="m-0 list-none space-y-3 p-0" aria-label={ariaLabel}>
      {rows.map((item, index) => {
        const title = item.title || item.name;
        const meta = [item.code, item.kicker].filter(Boolean).join(' · ');
        const detail = item.detail || item.note || item.description;
        return (
          <li key={item.id || item.code || `${title}-${index}`} className="min-w-0">
            <p className="text-sm font-semibold leading-6" style={{ color: 'var(--text-primary)' }}>
              <span className="tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{index + 1}. </span>
              {title}
              {meta ? (
                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}> · {meta}</span>
              ) : null}
            </p>
            {detail ? (
              <p className="mt-0.5 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{detail}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
