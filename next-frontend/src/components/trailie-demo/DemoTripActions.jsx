'use client';

import PlanYourVersion, { tripOutline } from '@/components/itinerary/PlanYourVersion';
import { tripTitle } from '@/lib/tripPresentation';
import { getSharedDayHeading } from '@/utils/sharedTripFormat';

// Local choices describe a new conversation. They never write to the sample.
export default function DemoTripActions({ plan, onOpen }) {
  const title = tripTitle(plan);
  const days = plan.days?.length || 0;
  const outline = tripOutline(plan, (day, i) => getSharedDayHeading(day, i).title || day.title || (day.stops || []).map(s => s.name).filter(Boolean).join(', '));
  return (
    <div className="mt-8">
      <PlanYourVersion title={title} days={days} outline={outline} onExplore={onOpen ? () => onOpen('itinerary') : null} />
    </div>
  );
}
