import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SharedTripPageClient from '../SharedTripPageClient';

vi.mock('@/components/common/Header', () => ({ default: () => null }));
vi.mock('@/components/common/Footer', () => ({ default: () => null }));
vi.mock('@/components/common/ReturnNavLink', () => ({ default: () => null }));
vi.mock('@/components/common/ShareButtons', () => ({ default: () => null }));
vi.mock('@/components/ai-chat/SharedConversation', () => ({ default: () => <div data-testid="conversation" /> }));
vi.mock('@/components/plan-ai/TrailiePlanCtaCard', () => ({ default: () => null }));
vi.mock('@/components/shared-trip/SharedTripDayCard', () => ({
  default: ({ day }) => <div data-testid="day-card">{day.title}</div>,
}));

afterEach(cleanup);

const baseTrip = {
  title: 'New Trip Plan',
  createdAt: '2026-11-18T12:00:00.000Z',
  sharedBy: { firstName: 'Sam' },
  conversation: [],
};

describe('SharedTripPageClient', () => {
  it('renders the day-by-day itinerary when the plan has days', () => {
    render(
      <SharedTripPageClient
        shareId="abc"
        trip={{ ...baseTrip, plan: { days: [{ id: 'd1', title: 'Arrive', stops: [] }] } }}
      />
    );
    expect(screen.getByText('Day-by-day itinerary')).toBeInTheDocument();
    expect(screen.getByTestId('day-card')).toHaveTextContent('Arrive');
    expect(screen.queryByTestId('shared-trip-empty')).not.toBeInTheDocument();
  });

  it('shows an explicit empty state instead of a blank page when nothing is shared', () => {
    render(<SharedTripPageClient shareId="abc" trip={{ ...baseTrip, plan: null }} />);
    expect(screen.getByTestId('shared-trip-empty')).toBeInTheDocument();
    expect(screen.getByText('No itinerary in this plan yet')).toBeInTheDocument();
  });

  it('does not leave a dangling separator in the meta line when there are no trip details', () => {
    render(<SharedTripPageClient shareId="abc" trip={{ ...baseTrip, plan: null }} />);
    const meta = screen.getByText(/^Shared by Sam/);
    expect(meta.textContent.trim().endsWith('·')).toBe(false);
  });
});
