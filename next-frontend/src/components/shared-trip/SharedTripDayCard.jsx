import { Fragment } from 'react';
import {
  ItineraryDayHeading,
  ItineraryDriveTransition,
  ItineraryOvernightBase,
  ItineraryRequirements,
  ItineraryStopRow,
} from '@/components/itinerary/ItineraryPresentationPrimitives';

export default function SharedTripDayCard({ day, dayIndex }) {
  const stops = day.stops || [];

  return (
    <article
      className="py-7 first:pt-2 last:pb-2"
      style={{ borderTop: dayIndex ? '1px solid var(--border)' : undefined }}
    >
      <ItineraryDayHeading day={day} index={dayIndex} />
      <ItineraryRequirements requirements={day.requirements} />
      <div>
        {stops.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No stops listed for this day.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {stops.map((stop, index) => (
              <Fragment key={stop.id || `${day.id}-${stop.name}`}>
                <ItineraryDriveTransition minutes={stop.drivingTimeFromPreviousMin} />
                <ItineraryStopRow stop={stop} index={index} numbered />
              </Fragment>
            ))}
          </ol>
        )}
      </div>
      <ItineraryOvernightBase location={day.overnightLocation} />
    </article>
  );
}
