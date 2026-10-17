import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GuestAccountCard from '../GuestAccountCard';

afterEach(cleanup);
it('says the trip is ready only when a canonical trip exists, with both account actions', () => {
  const create = vi.fn(); const signIn = vi.fn();
  render(<GuestAccountCard plan={{ parkName: 'Yellowstone', days: [{}, {}, {}] }} onCreateAccount={create} onSignIn={signIn} />);
  expect(screen.getByText('Your trip is ready')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Yellowstone · 3 days' })).toBeInTheDocument();
  expect(screen.getByText(/open your itinerary and map, and continue planning/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create free account' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(create).toHaveBeenCalledOnce();
  expect(signIn).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('never claims a trip exists when the limit is reached without one', () => {
  render(<GuestAccountCard timeUntilReset="12 hours" onCreateAccount={vi.fn()} onSignIn={vi.fn()} />);
  expect(screen.getByText('Keep planning with Trailie')).toBeInTheDocument();
  expect(screen.getByText('Create a free account to continue this conversation.')).toBeInTheDocument();
  expect(screen.getByText('You’ll get 5 more guest messages in 12 hours.')).toBeInTheDocument();
  expect(screen.queryByText(/trip is ready/i)).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(2);
});
