import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useTrips } from '../useTrips';

const mocks = vi.hoisted(() => ({
  user: { _id: 'owner' },
  list: vi.fn(), metadata: vi.fn(), update: vi.fn(),
  socket: { subscribe: vi.fn(), unsubscribe: vi.fn(), subscribeToTrips: vi.fn() },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, isAuthenticated: true }) }));
vi.mock('../useWebSocket', () => ({ useWebSocket: () => mocks.socket }));
vi.mock('@/services/tripService', () => ({ default: { getUserTrips: mocks.list, updateTripMetadata: mocks.metadata, updateTrip: mocks.update } }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('clears a load error on retry and requests only the current owner', async () => {
  mocks.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: [{ _id: 'trip' }] });
  const { result } = renderHook(() => useTrips());
  await waitFor(() => expect(result.current.error).toBe('offline'));
  await act(() => result.current.refreshTrips());
  expect(result.current.error).toBeNull();
  expect(result.current.trips).toEqual([{ _id: 'trip' }]);
  expect(mocks.list.mock.calls).toEqual([['owner'], ['owner']]);
});

it('archives and restores through metadata without writing plan or conversation content', async () => {
  const trip = { _id: 'trip', status: 'active', plan: { days: [{}] }, conversation: [{ role: 'user', content: 'Hello' }] };
  mocks.list.mockResolvedValue({ data: [trip] });
  mocks.metadata.mockImplementation(async (id, metadata) => ({ data: { ...trip, ...metadata } }));
  const { result } = renderHook(() => useTrips());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.archiveTrip('trip'));
  expect(result.current.trips[0].status).toBe('archived');
  await act(() => result.current.restoreTrip('trip'));
  expect(result.current.trips[0].status).toBe('active');
  expect(mocks.metadata.mock.calls).toEqual([['trip', { status: 'archived' }], ['trip', { status: 'active' }]]);
  expect(mocks.update).not.toHaveBeenCalled();
});
