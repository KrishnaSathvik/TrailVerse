import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import React, { useEffect } from 'react';

/**
 * P0-1 reproduction (audit 2026-08-31): a guest's live conversation is
 * destroyed ~60s after a send because <TripPlannerChat> is remounted by its
 * parent. The mount key in PlanAIContent derives from mutable guest-session
 * state (localStorage messageCount via guestChatSessionKey) and from
 * conversation-resolved context (parkCode). When the first completed turn
 * writes messageCount: 1, the key flips chat-generic -> chat-anon_* on the
 * next parent re-render and React unmounts the chat — transcript state gone.
 * A stale cached /ai/session-status response then writes messageCount back to
 * 0, flipping the key AGAIN (the observed mid-stream wipe).
 *
 * These tests pin the invariant: once mounted, organic state transitions must
 * never remount the chat. Only explicit resets (newChatKey via Start New
 * Chat, or navigating to a different tripId) may change the key.
 */

const mountLog = { count: 0, unmounts: 0, lastProps: null };

vi.mock('@components/plan-ai/TripPlannerChat', () => ({
  default: function TripPlannerChatStub(props) {
    mountLog.lastProps = props;
    useEffect(() => {
      mountLog.count += 1;
      return () => {
        mountLog.unmounts += 1;
      };
    }, []);
    return <div data-testid="chat-stub" />;
  },
}));

vi.mock('@components/plan-ai/PlanAIShell', () => ({
  default: ({ children }) => <div data-testid="shell">{children}</div>,
}));
vi.mock('@components/plan-ai/QuickFillModal', () => ({ default: () => null }));
vi.mock('@components/plan-ai/MyRecommendationsButton', () => ({ default: () => null }));
vi.mock('@components/icons', () => {
  const IconStub = () => null;
  return {
  NotePencil: IconStub,
  Mountain: IconStub,
  Camera: IconStub,
  Trees: IconStub,
  Tent: IconStub,
  Car: IconStub,
  Route: IconStub,
  Star: IconStub,
  Landmark: IconStub,
  };
});
vi.mock('@/hooks/useTrailieCompletionSound', () => {
  const sound = { playCompletion: () => {}, prime: () => {} };
  return { useAutoTrailieCompletionSound: () => sound };
});
vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {}, prefetch: () => {} };
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => router,
    usePathname: () => '/plan-ai',
    useSearchParams: () => searchParams,
  };
});
vi.mock('@hooks/useParks', () => {
  const parks = { data: [], isLoading: false };
  return { useAllParksLite: () => parks };
});
vi.mock('@hooks/useTrips', () => {
  const trips = { data: [], refetch: () => {} };
  return { useTrips: () => trips };
});
vi.mock('@/context/AuthContext', () => {
  const auth = { user: null, isAuthenticated: false, loading: false };
  return { useAuth: () => auth };
});
vi.mock('@/context/ToastContext', () => {
  const toast = { showToast: () => {} };
  return { useToast: () => toast };
});
vi.mock('@/services/tripService', () => ({
  default: { getTrip: vi.fn(), getUserTrips: vi.fn().mockResolvedValue({ data: [] }) },
}));
vi.mock('@/services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn().mockResolvedValue({ data: {} }) },
}));
vi.mock('@/lib/intentLandingApi', () => ({
  fetchIntentLandingParksClient: vi.fn().mockResolvedValue([]),
}));

import PlanAIContent from '../PlanAIContent';

const GUEST_SESSION = {
  anonymousId: 'guest_v2_123e4567-e89b-42d3-a456-426614174000',
  messageCount: 1,
  canSendMore: true,
  avatarUrl: null,
  parkName: 'Canyonlands National Park',
  formData: null,
  activeTripContext: null,
  timestamp: Date.now(),
};

const simulateCompletedTurnSideEffects = () => {
  // Exactly what saveAnonymousSession/persistSessionToStorage do when the
  // first guest turn completes: the server-linked session lands in
  // localStorage with messageCount > 0 …
  localStorage.setItem('anonymousSession', JSON.stringify(GUEST_SESSION));
  // … and the chat reports resolved header meta to the parent, which updates
  // parent state and re-renders PlanAIContent.
  mountLog.lastProps.onShellMetaChange({
    title: 'Planning Canyonlands',
    subtitle: '',
    showSubHeader: true,
  });
};

describe('PlanAIContent chat mount stability (P0-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    mountLog.count = 0;
    mountLog.unmounts = 0;
    mountLog.lastProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not remount the chat when the first completed guest turn links the anonymous session', () => {
    render(<PlanAIContent tripId={null} />);
    expect(screen.getByTestId('chat-stub')).toBeInTheDocument();
    expect(mountLog.count).toBe(1);

    act(() => {
      simulateCompletedTurnSideEffects();
    });

    expect(mountLog.unmounts).toBe(0);
    expect(mountLog.count).toBe(1);
  });

  it('does not remount the chat when stale session data flips messageCount back to zero', () => {
    render(<PlanAIContent tripId={null} />);
    act(() => {
      simulateCompletedTurnSideEffects();
    });

    // The observed oscillation: validateSessionWithBackend served a stale
    // cached session-status (messageCount 0) and wrote it back over the
    // linked session, flipping the mount key in the other direction.
    act(() => {
      localStorage.setItem(
        'anonymousSession',
        JSON.stringify({ ...GUEST_SESSION, messageCount: 0 })
      );
      mountLog.lastProps.onShellMetaChange({
        title: 'Trailie',
        subtitle: '',
        showSubHeader: true,
      });
    });

    expect(mountLog.unmounts).toBe(0);
    expect(mountLog.count).toBe(1);
  });

  it('keeps one chat instance across the session-status cache window (fake timers)', () => {
    vi.useFakeTimers();
    render(<PlanAIContent tripId={null} />);
    act(() => {
      simulateCompletedTurnSideEffects();
    });

    // The audit's acceptance window: wait beyond the ~60s cadence at which
    // the wipe reproduced, with parent re-renders happening as they do live.
    act(() => {
      vi.advanceTimersByTime(70_000);
    });
    act(() => {
      mountLog.lastProps.onShellMetaChange({
        title: 'Planning Canyonlands',
        subtitle: 'Updated',
        showSubHeader: true,
      });
    });

    expect(mountLog.unmounts).toBe(0);
    expect(mountLog.count).toBe(1);
    expect(screen.getByTestId('chat-stub')).toBeInTheDocument();
  });

});
