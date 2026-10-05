import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GuestLimitCard from '../GuestLimitCard';

vi.mock('@/components/trip-map/TripMapSheet', () => ({
  default: ({ plan, onClose }) => <div role="dialog" aria-label={plan.parkName}>
    <button onClick={onClose}>Close map</button>
  </div>,
}));

afterEach(cleanup);

describe('Guest limit access to existing results', () => {
  it('keeps factual conversations generic and puts the reset note after sign-in', () => {
    const onSignIn = vi.fn();
    render(<GuestLimitCard onSignIn={onSignIn} timeUntilReset="12 hours" />);
    expect(screen.getByText('You’ve used your 5 free messages.')).toBeInTheDocument();
    expect(screen.queryByText(/save your itinerary/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View itinerary' })).not.toBeInTheDocument();
    const signIn = screen.getByRole('button', { name: 'Sign in to continue' });
    const reset = screen.getByText('You’ll get 5 more guest messages in 12 hours.');
    expect(signIn.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(signIn);
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it('uses trip copy without exposing a guest map bypass', () => {
    render(<GuestLimitCard plan={{ days: [{ stops: [] }] }} />);
    expect(screen.getByText('Your trip is ready to continue.')).toBeInTheDocument();
    expect(screen.getByText(/Sign in free to open your itinerary and map/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View map' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeInTheDocument();
  });
});
