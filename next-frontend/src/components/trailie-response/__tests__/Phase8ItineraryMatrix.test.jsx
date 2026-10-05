import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EarlyItineraryCard from '@/components/plan-ai/EarlyItineraryCard';
import TrailieItinerary from '@/components/trailie-response/TrailieItinerary';

function days(count, prefix, stopFactory = null) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-day-${index + 1}`,
    dayNumber: index + 1,
    label: `${prefix} day ${index + 1}`,
    overnightLocation: index < count - 1 ? `${prefix} base ${index + 1}` : null,
    stops: stopFactory ? stopFactory(index) : [{
      id: `${prefix}-stop-${index + 1}`,
      name: `${prefix} experience ${index + 1}`,
      type: 'landmark',
      timeWindow: 'Morning',
      duration: 90,
      note: `Practical guidance for ${prefix} day ${index + 1}.`,
    }],
  }));
}

const MATRIX = [
  { id: 'simple-2day', plan: { parkName: 'Pinnacles National Park', days: days(2, 'Pinnacles') } },
  { id: 'normal-3day', plan: { parkName: 'Olympic National Park', days: days(3, 'Olympic') } },
  { id: 'long-5day', plan: { parkName: 'Yellowstone National Park', days: days(5, 'Yellowstone') } },
  {
    id: 'driving-heavy',
    plan: {
      parkName: 'Big Bend National Park',
      days: days(3, 'Big Bend', (index) => [{
        id: `big-bend-${index}`,
        name: `Big Bend experience ${index + 1}`,
        type: 'trail',
        drivingTimeFromPreviousMin: 45 + index * 15,
      }]),
    },
  },
  {
    id: 'hike-heavy',
    plan: {
      parkName: 'Glacier National Park',
      days: days(3, 'Glacier', (index) => [{
        id: `glacier-${index}`,
        name: `Glacier hike ${index + 1}`,
        type: 'trail',
        physicalDifficulty: 'strenuous',
        exposureLevel: 'high',
      }]),
    },
  },
  {
    id: 'lodging-logistics',
    plan: {
      parkName: 'Yellowstone National Park',
      days: days(3, 'Lodging', (index) => [
        { id: `sight-${index}`, name: `Lodging experience ${index + 1}`, type: 'geothermal' },
        { id: `stay-${index}`, name: `Check-in ${index + 1}`, type: 'lodging', note: 'Keep the confirmation number handy.' },
      ]),
    },
  },
  {
    id: 'refinement-full-plan',
    plan: { parkName: 'Zion National Park', days: days(3, 'Refined Zion') },
  },
  {
    id: 'multi-destination-road-trip',
    plan: {
      parkName: 'Zion, Bryce Canyon, and Capitol Reef',
      days: days(4, 'Road trip', (index) => [
        { id: `park-${index}`, name: `Road trip experience ${index + 1}`, type: 'landmark' },
        { id: `transfer-${index}`, name: `Transfer ${index + 1}`, type: 'transit', drivingTimeFromPreviousMin: 75 },
      ]),
    },
  },
];

describe('Phase 8 itinerary fixture matrix', () => {
  afterEach(cleanup);

  for (const scenario of MATRIX) {
    it(`renders ${scenario.id} through both final and early presentation paths without inventing anchors`, () => {
      const firstStop = scenario.plan.days[0].stops[0].name;
      const lastStop = scenario.plan.days.at(-1).stops.at(-1).name;

      const final = render(<TrailieItinerary plan={scenario.plan} />);
      for (const day of scenario.plan.days) {
        for (const stop of day.stops) expect(screen.getByText(stop.name)).toBeInTheDocument();
        if (day.overnightLocation) expect(screen.getByText(day.overnightLocation)).toBeInTheDocument();
      }
      expect(screen.queryByText(/primary anchor/i)).not.toBeInTheDocument();
      final.unmount();

      render(<EarlyItineraryCard plan={scenario.plan} pendingLabel="Preparing trip notes…" />);
      expect(screen.getByText(firstStop)).toBeInTheDocument();
      expect(screen.getByText(lastStop)).toBeInTheDocument();
      expect(screen.getByText('Preparing trip notes…')).toBeInTheDocument();
      expect(screen.queryByText(/primary anchor/i)).not.toBeInTheDocument();
    });
  }
});
