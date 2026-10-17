import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ params: null, replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }), useSearchParams: () => state.params }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, loading: false }) }));
vi.mock('@/app/plan-ai/PlanAIContent', () => ({ default: () => <div data-testid="planner" /> }));
vi.mock('../PlanAIShell', () => ({ default: () => <div data-testid="loading" /> }));
import PlanningEntryBoundary from '../PlanningEntryBoundary';
beforeEach(() => { sessionStorage.clear(); state.replace.mockClear(); });
afterEach(cleanup);
describe('new-trip action is consumed before mounting a conversation', () => {
  it('discards both supplied and active IDs, then selects a freshly allocated conversation', async () => {
    sessionStorage.setItem('trailieActiveConversation', 'yellowstone');
    state.params = new URLSearchParams('entry=new-trip&ask=Glacier&conversation=old-test-id');
    const view = render(<PlanningEntryBoundary />);
    expect(screen.queryByTestId('planner')).toBeNull();
    await waitFor(() => expect(state.replace).toHaveBeenCalled());
    const next = new URL(state.replace.mock.calls.at(-1)[0], 'http://localhost');
    expect(next.searchParams.get('entry')).toBe('continue');
    expect(next.searchParams.get('ask')).toBe('Glacier');
    expect(next.searchParams.get('conversation')).not.toBe('old-test-id');
    expect(next.searchParams.get('conversation')).not.toBe('yellowstone');
    state.params = next.searchParams;
    view.rerender(<PlanningEntryBoundary />);
    expect(screen.getByTestId('planner')).toBeTruthy();
    expect(sessionStorage.getItem('trailieActiveConversation')).toBe(next.searchParams.get('conversation'));
  });
  it('clicking the same sample again creates another conversation rather than reusing the previous allocation', async () => {
    const sample = 'entry=new-trip&ask=Glacier';
    state.params = new URLSearchParams(sample);
    const view = render(<PlanningEntryBoundary />);
    const first = new URL(state.replace.mock.calls.at(-1)[0], 'http://localhost');
    state.params = first.searchParams;
    view.rerender(<PlanningEntryBoundary />);
    state.params = new URLSearchParams(sample);
    view.rerender(<PlanningEntryBoundary />);
    const second = new URL(state.replace.mock.calls.at(-1)[0], 'http://localhost');
    expect(second.searchParams.get('conversation')).not.toBe(first.searchParams.get('conversation'));
  });
  it('refreshing an active conversation never allocates a replacement', () => {
    state.params = new URLSearchParams('entry=continue&conversation=yellowstone&ask=original');
    render(<PlanningEntryBoundary />);
    expect(screen.getByTestId('planner')).toBeTruthy();
    expect(state.replace).not.toHaveBeenCalled();
  });
});
