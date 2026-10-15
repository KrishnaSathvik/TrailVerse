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
    <div className="where-next-result">
      <div className="where-next-saved">
        <p className="where-next-caption">Your next destination</p>
        <h2>{name}</h2>
        <p className="where-next-window">{windowLabel || 'Travel dates open'}</p>
        {matched && explore && trailie && (
          <div className="where-next-actions">
            <Link href={explore} onClick={onParkClick} className="where-next-action where-next-action-primary">Explore {name.replace(/ National Park.*$/i, '')}</Link>
            <Link href={trailie} onClick={onTrailieClick} className="where-next-action">Plan with Trailie</Link>
          </div>
        )}
        <button type="button" onClick={onChangePick} className="where-next-text-button">Pick a different destination</button>
      </div>
      <section className="where-next-community" aria-label="Community destination picks">
        <h3>From the community</h3>
        <p>{rankLine}</p>
        {showLeaders ? (
          <ol className="where-next-leaders">
            {leaders.map(row => (
              <li key={row.parkCode}>
                <span>{row.rank}. {row.name}</span>
                {row.count != null && <span>{row.count}</span>}
              </li>
            ))}
          </ol>
        ) : <p className="mt-2">{othersCopy}</p>}
      </section>
    </div>
  );
}
