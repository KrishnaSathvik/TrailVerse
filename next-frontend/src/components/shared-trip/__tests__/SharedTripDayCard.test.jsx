import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SharedTripDayCard from '@/components/shared-trip/SharedTripDayCard';

describe('SharedTripDayCard itinerary presentation', () => {
  afterEach(cleanup);

  it('uses the open day grammar with the same trusted-data treatments as the final itinerary', () => {
    render(
      <SharedTripDayCard
        dayIndex={0}
        day={{
          id: 'day-1',
          dayNumber: 1,
          label: 'Canyon and Hayden Valley',
          overnightLocation: 'Canyon Village',
          requirements: [{
            id: 'day-1-road',
            severity: 'check',
            title: 'Check Dunraven Pass',
            requirement: 'Confirm the road is open before leaving Canyon Village.',
          }],
          stops: [
            { id: 'artist', name: 'Artist Point', type: 'viewpoint', note: 'Start with Lower Falls.' },
            { id: 'lunch', name: 'Lunch at Canyon Village', type: 'restaurant', drivingTimeFromPreviousMin: 18 },
          ],
        }}
      />
    );

    const day = screen.getByRole('article');
    expect(day).not.toHaveClass('rounded-xl');
    expect(screen.getByText('Artist Point').closest('li')).toHaveAttribute('data-stop-treatment', 'experience');
    expect(screen.getByText('Lunch at Canyon Village').closest('li')).toHaveAttribute('data-stop-treatment', 'supporting');
    expect(screen.getByText('18 min drive')).toBeInTheDocument();
    expect(screen.getByText('Good to know')).toBeInTheDocument();
    expect(screen.getByText('Canyon Village')).toBeInTheDocument();
  });

  it('keeps stop-level backup content visible in the early durable presentation', () => {
    render(
      <SharedTripDayCard
        dayIndex={0}
        day={{
          id: 'd1',
          dayNumber: 1,
          stops: [{
            id: 's1',
            name: 'Highline Trail',
            type: 'trail',
            alternatives: [{ name: 'Trail of the Cedars', note: 'Use if Logan Pass closes.' }],
          }],
        }}
      />
    );

    expect(screen.getByText('Backup if this fails')).toBeInTheDocument();
    expect(screen.getByText('Trail of the Cedars')).toBeInTheDocument();
    expect(screen.getByText(/Use if Logan Pass closes/i)).toBeInTheDocument();
  });
});
