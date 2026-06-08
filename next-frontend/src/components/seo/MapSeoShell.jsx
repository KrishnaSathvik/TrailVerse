import Link from 'next/link';
import SeoBrowseLinks from './SeoBrowseLinks';

/**
 * Crawlable map page copy — always in first HTML (map UI loads client-side).
 */
export default function MapSeoShell() {
  return (
    <section
      className="sr-only"
      aria-label="Interactive national parks map guide"
    >
      <h1>Interactive National Parks Map — 470+ U.S. Parks &amp; Sites</h1>
      <p>
        Use the TrailVerse interactive map to explore 470+ U.S. parks, monuments, historic sites,
        seashores, rivers, trails, and recreation areas. Search by state, activity, or park name,
        then open any park to check alerts, weather, events, and planning details.
      </p>
      <p>
        <Link href="/explore">Browse all parks</Link>
        {' · '}
        <Link href="/discover">Explore by activity</Link>
        {' · '}
        <Link href="/compare">Compare parks</Link>
        {' · '}
        <Link href="/plan-ai">Plan with Trailie</Link>
      </p>
      <SeoBrowseLinks compact />
    </section>
  );
}
