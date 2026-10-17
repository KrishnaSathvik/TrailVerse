import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ItineraryOvernightBase } from '@/components/itinerary/ItineraryPresentationPrimitives';

const LONG_STAY = 'North Campground near the Zion Canyon Visitor Center and Shuttle Stop';

describe('ItineraryOvernightBase — Phase 10C wrapping', () => {
  afterEach(cleanup);

  it('keeps the STAY grammar while allowing long copy to wrap', () => {
    const { container } = render(<ItineraryOvernightBase location={LONG_STAY} />);
    const footer = container.querySelector('footer');
    expect(footer.className).toMatch(/flex-wrap/);
    expect(screen.getByText('Stay')).toBeInTheDocument();
    const location = screen.getByText(LONG_STAY);
    expect(location.className).toMatch(/min-w-0/);
    expect(location.className).toMatch(/break-words/);
    expect(location.className).toMatch(/flex-1/);
  });
});
