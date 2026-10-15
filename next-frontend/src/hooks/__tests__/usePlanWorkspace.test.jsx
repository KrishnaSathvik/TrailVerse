import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import usePlanWorkspace from '../usePlanWorkspace';

const mockGetTrip = vi.fn();
const mockApplyManualMutation = vi.fn();
const mockUpdateTrip = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../services/tripService', () => ({
  default: {
    getTrip: (...args) => mockGetTrip(...args),
    applyManualMutation: (...args) => mockApplyManualMutation(...args),
    updateTrip: (...args) => mockUpdateTrip(...args),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const tripFixture = {
  data: {
    _id: 'trip-1',
    title: 'Zion',
    plan: {
      days: [{
        id: 'day-1',
        dayNumber: 1,
        label: 'Day 1',
        stops: [{ id: 's1', name: 'Overlook' }],
      }],
    },
  },
};

beforeEach(() => {
  mockGetTrip.mockReset();
  mockApplyManualMutation.mockReset();
  mockUpdateTrip.mockReset();
  mockShowToast.mockReset();
  mockGetTrip.mockResolvedValue(tripFixture);
  mockApplyManualMutation.mockResolvedValue({
    data: {
      ...tripFixture.data,
      plan: {
        days: [{
          id: 'day-1',
          dayNumber: 1,
          label: 'Day 1',
          stops: [],
        }],
      },
    },
  });
});

afterEach(cleanup);

it('removeStop posts a typed mutation and never whole-plan PUTs', async () => {
  const { result } = renderHook(() => usePlanWorkspace('trip-1'));
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  await act(async () => {
    await result.current.removeStop('day-1', 's1');
  });

  expect(mockApplyManualMutation).toHaveBeenCalledWith('trip-1', {
    op: 'remove_stop',
    stopId: 's1',
  });
  expect(mockUpdateTrip).not.toHaveBeenCalled();
  expect(result.current.days[0].stops).toEqual([]);
});

it('addPlace posts query-only add_place without coordinates', async () => {
  mockApplyManualMutation.mockResolvedValue({
    data: {
      ...tripFixture.data,
      plan: {
        days: [{
          id: 'day-1',
          dayNumber: 1,
          label: 'Day 1',
          stops: [{ id: 's2', name: 'Tunnel View', canonicalPlaceId: 'google:place:tunnel' }],
        }],
      },
    },
  });
  const { result } = renderHook(() => usePlanWorkspace('trip-1'));
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  let outcome;
  await act(async () => {
    outcome = await result.current.addPlace({ dayId: 'day-1', query: 'Tunnel View' });
  });

  expect(outcome).toEqual({ ok: true });
  expect(mockApplyManualMutation).toHaveBeenCalledWith('trip-1', {
    op: 'add_place',
    dayId: 'day-1',
    query: 'Tunnel View',
  });
  const body = mockApplyManualMutation.mock.calls[0][1];
  expect(body.latitude).toBeUndefined();
  expect(body.location).toBeUndefined();
  expect(mockUpdateTrip).not.toHaveBeenCalled();
});

it('addPlace surfaces place_ambiguous choices to the caller', async () => {
  mockApplyManualMutation.mockRejectedValue({
    response: {
      status: 400,
      data: {
        code: 'place_ambiguous',
        query: 'Pine Loop',
        choices: [
          { candidateId: 'a', name: 'Pine Loop' },
          { candidateId: 'b', name: 'Pine Loop' },
        ],
      },
    },
  });
  const { result } = renderHook(() => usePlanWorkspace('trip-1'));
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  let outcome;
  await act(async () => {
    outcome = await result.current.addPlace({ dayId: 'day-1', query: 'Pine Loop' });
  });

  expect(outcome.ok).toBe(false);
  expect(outcome.code).toBe('place_ambiguous');
  expect(outcome.choices).toHaveLength(2);
  expect(mockShowToast).not.toHaveBeenCalled();
});
