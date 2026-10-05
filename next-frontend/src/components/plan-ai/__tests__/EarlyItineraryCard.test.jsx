import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EarlyItineraryCard from '@/components/plan-ai/EarlyItineraryCard';

const PLAN = {
  type: 'itinerary',
  responseId: 'r1',
  itineraryHash: 'hash-1',
  parkName: 'Zion National Park',
  days: [
    { id: 'd1', day: 1, title: 'Canyon floor', stops: [{ id: 's1', name: 'Visitor Center', startTime: '09:00' }] },
    { id: 'd2', day: 2, title: 'Angels Landing', stops: [{ id: 's2', name: 'Scout Lookout', startTime: '07:30' }] },
  ],
  feasibilityIssues: [],
};

const mounts = { count: 0 };
vi.mock('@/components/shared-trip/SharedTripDayCard', () => ({
  default: ({ day }) => <div data-testid="day">{day.title}</div>,
}));

describe('EarlyItineraryCard', () => {
  beforeEach(() => {
    mounts.count = 0;
  });

  it('renders the persisted itinerary days', () => {
    render(<EarlyItineraryCard plan={PLAN} />);
    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.getByText('Zion National Park')).toBeInTheDocument();
  });

  it('shows the pending label while prose is still coming', () => {
    render(<EarlyItineraryCard plan={PLAN} pendingLabel="Preparing trip notes…" />);
    expect(screen.getByText('Preparing trip notes…')).toBeInTheDocument();
  });

  it('renders no pending label when prose has arrived', () => {
    render(<EarlyItineraryCard plan={PLAN} pendingLabel={null} />);
    expect(screen.queryByText('Preparing trip notes…')).not.toBeInTheDocument();
  });

  it('renders nothing without a plan that has days', () => {
    const { container } = render(<EarlyItineraryCard plan={{ days: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('surfaces feasibility warnings that came with the persisted plan', () => {
    render(
      <EarlyItineraryCard
        plan={{ ...PLAN, feasibilityIssues: [{ message: 'Day 2 has 14 hours of driving.' }] }}
      />
    );
    expect(screen.getByText('Day 2 has 14 hours of driving.')).toBeInTheDocument();
  });

  it('keeps collapse state across a prose-arrival re-render', () => {
    const { rerender } = render(
      <EarlyItineraryCard plan={PLAN} pendingLabel="Preparing trip notes…" />
    );
    expect(screen.getAllByTestId('day')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /hide days/i }));
    expect(screen.queryAllByTestId('day')).toHaveLength(0);

    // Prose arrives: same plan object identity, label cleared.
    rerender(<EarlyItineraryCard plan={PLAN} pendingLabel={null} />);
    expect(screen.queryAllByTestId('day')).toHaveLength(0);
  });

  it('does not remount when only the pending label changes', () => {
    const onMount = vi.fn();
    const { rerender } = render(
      <EarlyItineraryCard plan={PLAN} pendingLabel="Preparing trip notes…" onMount={onMount} />
    );
    expect(onMount).toHaveBeenCalledTimes(1);

    rerender(<EarlyItineraryCard plan={PLAN} pendingLabel={null} onMount={onMount} />);
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('does not remount when a byte-equivalent plan object is supplied', () => {
    const onMount = vi.fn();
    const { rerender } = render(<EarlyItineraryCard plan={PLAN} onMount={onMount} />);
    rerender(<EarlyItineraryCard plan={{ ...PLAN }} onMount={onMount} />);
    expect(onMount).toHaveBeenCalledTimes(1);
  });
});
