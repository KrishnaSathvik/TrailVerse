import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const login = vi.fn().mockResolvedValue({});
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ signup: vi.fn(), login }) }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
import SaveTripModal from '../SaveTripModal';
import { SIGNUP_PROMPT_REASONS } from '@/lib/planAiSignupPrompts';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('frames Open trip as a ready trip and carries the requested workspace into migration', async () => {
  render(<SaveTripModal isOpen onClose={vi.fn()} anonymousId="anon_123" conversationId="conv-1" messages={[]}
    reason={SIGNUP_PROMPT_REASONS.OPEN_TRIP} initialMode="login" surface="itinerary" />);
  expect(screen.getByRole('heading', { name: 'Your trip is ready' })).toBeInTheDocument();
  expect(screen.getByText(/open the full itinerary, map and keep planning/)).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.co' } });
  fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'secret123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in and open trip' }));
  await waitFor(() => expect(login).toHaveBeenCalled());
  const stored = JSON.parse(localStorage.getItem('returnToChat'));
  expect(stored).toMatchObject({ anonymousId: 'anon_123', conversationId: 'conv-1', surface: 'itinerary' });
});

it('uses limit copy that never claims a trip when none exists', () => {
  render(<SaveTripModal isOpen onClose={vi.fn()} anonymousId="anon_123" messages={[]} reason={SIGNUP_PROMPT_REASONS.LIMIT_WITHOUT_TRIP} />);
  expect(screen.getByRole('heading', { name: 'Keep planning with Trailie' })).toBeInTheDocument();
  expect(screen.queryByText(/trip is ready/i)).not.toBeInTheDocument();
});

it('labels account fields and switches modes without submitting the form', () => {
  render(<SaveTripModal isOpen onClose={vi.fn()} messages={[]} />);
  expect(screen.getByLabelText('First name')).toHaveAttribute('autocomplete', 'given-name');
  expect(screen.getByLabelText('Confirm password')).toHaveAttribute('autocomplete', 'new-password');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
});
