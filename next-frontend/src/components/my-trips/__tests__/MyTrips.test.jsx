import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import MyTrips from '../MyTrips';
import MyTripsPage from '@/app/chat-history/page';
import { selectMyTrips } from '@/lib/myTrips';

const mocks = vi.hoisted(() => ({ state: {}, auth: {}, metadata: vi.fn(), share: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/useTrips', () => ({ useTrips: () => mocks.state }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/components/common/Header', () => ({ default: () => <nav>Navigation</nav> }));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('@/services/tripService', () => ({ default: { updateTripMetadata: mocks.metadata, shareTrip: mocks.share } }));
const saved = { _id: 'trip-one', title: 'Yellowstone wildlife trip', parkName: 'Yellowstone National Park', updatedAt: '2026-10-15', plan: { days: [{ dayStructure: { blocks: [{ kind: 'experience', title: 'Rest' }] }, stops: [] }] }, conversation: [{ role: 'user', content: 'Plan Yellowstone' }] };
const chat = { _id: 'chat-one', title: 'Acadia or Shenandoah?', updatedAt: '2026-10-14', conversation: [{ role: 'user', content: 'Compare these parks' }], summary: { hasPlan: true } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { user: { _id: 'owner' }, isAuthenticated: true, loading: false };
  mocks.state = { trips: [saved, chat], loading: false, error: null, archiveTrip: vi.fn(), restoreTrip: vi.fn(), deleteTrip: vi.fn(), refreshTrips: vi.fn() };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('renders plans including pinless days and conversation-only history once with correct destinations', () => {
  render(<MyTrips />);
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Open trip' })).toHaveAttribute('href', '/plan-ai/trip-one/plan');
  expect(screen.getByRole('link', { name: 'Continue chat' })).toHaveAttribute('href', '/plan-ai/trip-one?chat=true');
  expect(screen.getByRole('link', { name: 'Resume conversation' })).toHaveAttribute('href', '/plan-ai/chat-one?chat=true');
  expect(screen.getByText('1-day itinerary · Yellowstone National Park')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Conversations (1)' }));
  expect(screen.queryByText(saved.title)).not.toBeInTheDocument();
  expect(screen.getByText(chat.title)).toBeInTheDocument();
});

it('does not fabricate a chat association or collapse distinct trips', () => {
  mocks.state.trips = [{ ...saved, conversation: [] }, { ...saved, _id: 'trip-two', conversationId: 'legacy-chat' }];
  render(<MyTrips />);
  expect(screen.getAllByRole('link', { name: 'Open trip' })).toHaveLength(2);
  expect(screen.getAllByRole('link', { name: 'Continue chat' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Continue chat' })).toHaveAttribute('href', '/plan-ai/trip-two?chat=true');
});

it('paginates and keeps archive records accessible in a separate tab', () => {
  mocks.state.trips = [...Array.from({ length: 14 }, (_, index) => ({ ...saved, _id: `trip-${index}`, title: `Trip ${index}` })), { ...chat, status: 'archived' }];
  render(<MyTrips />);
  expect(screen.getAllByRole('article')).toHaveLength(12);
  fireEvent.click(screen.getByRole('button', { name: /Load more/ }));
  expect(screen.getAllByRole('article')).toHaveLength(14);
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText(chat.title)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  expect(mocks.state.restoreTrip).toHaveBeenCalledWith('chat-one');
});

it('renames through metadata and keeps archive, share and delete functional', async () => {
  mocks.share.mockResolvedValue({ shareId: 'share-one' });
  const writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MyTrips />);
  const card = within(screen.getAllByRole('article')[0]);
  fireEvent.click(card.getByRole('button', { name: 'Rename' }));
  fireEvent.change(card.getByLabelText('Trip or conversation title'), { target: { value: 'Autumn wildlife' } });
  fireEvent.click(card.getByRole('button', { name: 'Save title' }));
  await waitFor(() => expect(mocks.metadata).toHaveBeenCalledWith('trip-one', { title: 'Autumn wildlife' }));
  await waitFor(() => expect(card.queryByRole('button', { name: 'Save title' })).not.toBeInTheDocument());
  fireEvent.click(card.getByRole('button', { name: 'Share' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/plan-ai/shared/share-one')));
  await waitFor(() => expect(card.getByRole('button', { name: 'Archive' })).toBeEnabled());
  fireEvent.click(card.getByRole('button', { name: 'Archive' }));
  await waitFor(() => expect(mocks.state.archiveTrip).toHaveBeenCalledWith('trip-one'));
  await waitFor(() => expect(card.getByRole('button', { name: 'Delete' })).toBeEnabled());
  fireEvent.click(card.getByRole('button', { name: 'Delete' }));
  expect(mocks.state.deleteTrip).toHaveBeenCalledWith('trip-one');
});

it('handles empty filters, archives, loading, errors and retry', () => {
  mocks.state.trips = [chat];
  const { rerender } = render(<MyTrips />);
  fireEvent.click(screen.getByRole('button', { name: 'Saved trips (0)' }));
  expect(screen.getByText('No saved trips yet')).toBeInTheDocument();
  expect(screen.getByText(/earlier conversations are still available/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Archived (0)' }));
  expect(screen.getByText('Nothing archived here yet')).toBeInTheDocument();
  mocks.state.loading = true;
  rerender(<MyTrips />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  mocks.state.loading = false;
  mocks.state.error = 'offline';
  rerender(<MyTrips />);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(mocks.state.refreshTrips).toHaveBeenCalled();
});

it('unmounts private history on logout and resets UI when the owner changes', () => {
  const { rerender } = render(<MyTripsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Saved trips (1)' }));
  mocks.auth.user = { _id: 'another-owner' };
  mocks.state.trips = [chat];
  rerender(<MyTripsPage />);
  expect(screen.getByRole('button', { name: 'All (1)' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByText(saved.title)).not.toBeInTheDocument();
  mocks.auth = { user: null, isAuthenticated: false, loading: false };
  rerender(<MyTripsPage />);
  expect(screen.queryByText(chat.title)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
});

it('sorts without mutating records and excludes deleted records', () => {
  const records = [chat, saved, { ...chat, _id: 'deleted', status: 'deleted' }];
  expect(selectMyTrips(records).map(trip => trip._id)).toEqual(['trip-one', 'chat-one']);
  expect(selectMyTrips(records, { sort: 'oldest' }).map(trip => trip._id)).toEqual(['chat-one', 'trip-one']);
  expect(records[0]).toBe(chat);
});
