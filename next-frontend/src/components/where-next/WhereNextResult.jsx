'use client';

import Link from 'next/link';
import {
  exploreParkHref,
  landingCopy,
  resultRankCopy,
  trailieHref,
  travelWindowLabel,
} from '@/lib/whereNext';

export default function WhereNextResult({
  pick,
  stats,
  onChangePick,
  onParkClick,
  onTrailieClick,
}) {
  const matched = Boolean(pick?.parkCode);
  const name = pick?.canonicalName || pick?.displayName || pick?.rawInput;
  const windowLabel = travelWindowLabel(pick?.travelWindow);
  const rankLine = resultRankCopy({
    volumeTier: stats?.volumeTier,
    destinationCount: stats?.destinationCount,
    weeklyRank: stats?.weeklyRank,
    matched,
  });
  const explore = matched ? exploreParkHref(pick.canonicalName || name) : null;
  const trailie = matched ? trailieHref(pick.parkCode, pick.canonicalName || name) : null;
  const leaders = stats?.leaders || [];
  const showLeaders = leaders.length > 0;
  const othersCopy = landingCopy(stats?.volumeTier);

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 pb-4 text-center">
      <p
        className="text-sm uppercase tracking-[0.2em]"
        style={{ color: 'var(--text-secondary)' }}
      >
        Your pick
      </p>
      <h2
        className="mt-4 font-display text-4xl sm:text-5xl leading-tight"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
      >
        {name}
      </h2>
      {windowLabel ? (
        <p className="mt-3 text-lg" style={{ color: 'var(--text-secondary)' }}>
          {windowLabel}
        </p>
      ) : null}
      <p className="mt-6 text-lg" style={{ color: 'var(--text-primary)' }}>
        {rankLine}
      </p>

      {matched && explore && trailie ? (
        <div className="mt-10 flex flex-col gap-3">
          <Link
            href={explore}
            onClick={onParkClick}
            className="rounded-full px-6 py-4 text-lg font-medium"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: 'var(--bg-primary)',
            }}
          >
            Explore {name.replace(/ National Park.*$/i, '')}
          </Link>
          <Link
            href={trailie}
            onClick={onTrailieClick}
            className="rounded-full px-6 py-4 text-lg font-medium border"
            style={{
              borderColor: 'var(--accent-green)',
              color: 'var(--text-primary)',
            }}
          >
            Plan {name.replace(/ National Park.*$/i, '')} with Trailie
          </Link>
        </div>
      ) : null}

      <div className="mt-14">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          See what others picked
        </p>
        {showLeaders ? (
          <ol className="mt-4 space-y-2 text-left">
            {leaders.map((row) => (
              <li
                key={row.parkCode}
                className="flex justify-between text-base"
                style={{ color: 'var(--text-primary)' }}
              >
                <span>
                  {row.rank}. {row.name}
                </span>
                {row.count != null ? <span>{row.count}</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-base" style={{ color: 'var(--text-secondary)' }}>
            {othersCopy}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onChangePick}
        className="mt-10 text-sm underline"
        style={{ color: 'var(--text-secondary)' }}
      >
        Pick a different destination
      </button>
    </div>
  );
}
