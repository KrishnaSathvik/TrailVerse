import Link from 'next/link';
import { buildParkMetaDescription } from '@/lib/parkSeo';
import { parkToSlug } from '@/utils/parkSlug';
import { htmlToPlainText } from '@/utils/htmlUtils';
import { seoParkHref } from '@/lib/seoBrowseHub';

function truncateText(text, max = 320) {
  if (!text || text.length <= max) return text;
  const trimmed = text.slice(0, max);
  const lastSpace = trimmed.lastIndexOf(' ');
  return `${(lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed).trim()}…`;
}

/**
 * Server-rendered park overview for crawlers — rendered before ParkDetailClient bailout.
 */
export default function ParkSeoOverview({
  park,
  parkSlug,
  seoLeadLine = null,
  stateHubSlug = null,
  relatedParks = [],
}) {
  if (!park?.fullName) return null;

  const slug = parkSlug || parkToSlug(park.fullName);
  const description =
    truncateText(htmlToPlainText(park.description)) ||
    buildParkMetaDescription(park, slug);
  const states = park.states?.split(',').map((s) => s.trim()).filter(Boolean).join(', ');

  return (
    <section className="sr-only" aria-label={`${park.fullName} planning guide`}>
      <h1>{park.fullName} — Live Alerts, Weather &amp; Trip Planning</h1>
      {states ? <p>Located in {states}.</p> : null}
      {seoLeadLine ? <p>{seoLeadLine}</p> : null}
      <p>{description}</p>
      <p>
        Use this page to check live NPS alerts, weather, things to do, events, fees, campgrounds,
        and build a day-by-day itinerary with Trailie.
      </p>
      <nav aria-label={`Plan ${park.fullName}`}>
        <ul>
          <li>
            <Link href={`/parks/${slug}?tab=overview`}>Overview</Link>
          </li>
          <li>
            <Link href={`/parks/${slug}?tab=alerts`}>Current alerts</Link>
          </li>
          <li>
            <Link href={`/parks/${slug}?tab=activities`}>Things to do</Link>
          </li>
          <li>
            <Link href={`/plan-ai?park=${encodeURIComponent(park.parkCode)}&name=${encodeURIComponent(park.fullName)}`}>
              Plan with Trailie
            </Link>
          </li>
          <li>
            <Link href={`/compare?parks=${park.parkCode}`}>Compare this park</Link>
          </li>
          {stateHubSlug ? (
            <li>
              <Link href={`/parks/state/${stateHubSlug}`}>More parks in {states}</Link>
            </li>
          ) : null}
        </ul>
      </nav>
      {relatedParks.length > 0 && (
        <div>
          <h2>Nearby parks to explore</h2>
          <ul>
            {relatedParks.map((related) => (
              <li key={related.parkCode}>
                <Link href={seoParkHref(related.fullName)}>{related.fullName}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
