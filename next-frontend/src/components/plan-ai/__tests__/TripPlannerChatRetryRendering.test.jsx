import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { toLiveTrailieResponseModel } from '@/lib/trailieResponseModel';
import Button from '@/components/common/Button';
import { RefreshCw } from '@components/icons';
import {
  classifyTrailieTurnOutcome,
  resolveTrailieTurnDisplayContent,
  canRetryTrailieTurn,
  TRAILIE_TURN_OUTCOME,
} from '@/utils/trailieTurnOutcome';

/**
 * Phase 6C / 6C.1 — a RENDERED-DOM test for the "Try again" action, composed
 * the same way Phase 6A.1's failure-rendering suite is: the real
 * `<TrailieResponse>` component, the real `canRetryTrailieTurn` gate, and
 * the exact `afterContent` shape TripPlannerChat.jsx's render loop actually
 * builds (a `<Button icon={RefreshCw} disabled={isGenerating}>` when the
 * gate says yes, `null` otherwise) — not a synthetic stand-in for it.
 *
 * Phase 6C.1 widened `canRetryTrailieTurn` to no longer read `isAnonymous`
 * (the persistence seam that used to make authenticated retry unsafe is now
 * closed at the source — see persistCanonicalPlan.js's
 * `shouldSaveConversationForTurn`). `isAnonymous` is still threaded through
 * this test's helpers to prove the SAME outcome for both audiences, not
 * because it still changes anything.
 */

function buildRenderedMessage(data) {
  const outcomeClass = classifyTrailieTurnOutcome(data);
  const content = resolveTrailieTurnDisplayContent({ content: data.content, outcomeClass });
  return { role: 'assistant', content, outcomeClass };
}

/** Mirrors TripPlannerChat.jsx's afterContent ternary for the Retry button, verbatim. */
function retryAfterContent({ outcomeClass, isGenerating, onClick }) {
  return canRetryTrailieTurn({ outcomeClass }) ? (
    <Button onClick={onClick} variant="secondary" size="sm" icon={RefreshCw} disabled={isGenerating}>
      Try again
    </Button>
  ) : null;
}

function renderTurn(data, { isAnonymous = true, isGenerating = false, onClick = vi.fn() } = {}) {
  const message = buildRenderedMessage(data);
  const response = toLiveTrailieResponseModel({ message, lifecycle: { showProse: true, showPlan: false } });
  render(
    <TrailieResponse
      response={response}
      afterContent={retryAfterContent({ outcomeClass: message.outcomeClass, isAnonymous, isGenerating, onClick })}
    />
  );
  return { message, onClick };
}

describe('rendered Retry action — Phase 6C', () => {
  afterEach(cleanup);

  it('a guest genuine failure shows an enabled "Try again" button', () => {
    renderTurn({
      content: 'raw fallback text',
      trailieV2: { status: 'failed', terminalReason: 'routing_exhausted' },
    }, { isAnonymous: true });

    const button = screen.getByRole('button', { name: /try again/i });
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
  });

  it('clicking "Try again" fires the retry handler exactly once', () => {
    const onClick = vi.fn();
    renderTurn({
      content: 'raw fallback text',
      trailieV2: { status: 'failed', terminalReason: 'unknown' },
    }, { isAnonymous: true, onClick });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('the button is disabled while a retry (or any turn) is in flight', () => {
    renderTurn({
      content: 'raw fallback text',
      trailieV2: { status: 'failed', terminalReason: 'routing_exhausted' },
    }, { isAnonymous: true, isGenerating: true });

    const button = screen.getByRole('button', { name: /try again/i });
    expect(button.disabled).toBe(true);
  });

  it('Phase 6C.1 — an authenticated genuine failure ALSO shows an enabled "Try again" button (persistence seam closed)', () => {
    renderTurn({
      content: 'raw fallback text',
      trailieV2: { status: 'failed', terminalReason: 'routing_exhausted' },
    }, { isAnonymous: false });

    const button = screen.getByRole('button', { name: /try again/i });
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
  });

  it('Phase 6C.1 — an authenticated retry button is disabled while a turn is in flight, same as a guest', () => {
    renderTurn({
      content: 'raw fallback text',
      trailieV2: { status: 'failed', terminalReason: 'routing_exhausted' },
    }, { isAnonymous: false, isGenerating: true });

    const button = screen.getByRole('button', { name: /try again/i });
    expect(button.disabled).toBe(true);
  });

  it('Phase 6C.1 — clicking Try again as an authenticated traveler fires the retry handler exactly once, same as a guest', () => {
    const onClick = vi.fn();
    renderTurn({
      content: 'raw fallback text',
      trailieV2: { status: 'failed', terminalReason: 'unknown' },
    }, { isAnonymous: false, onClick });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a semantic fail-closed conversation_outcome (historical not_found) shows NO Retry button, guest or authenticated', () => {
    const data = {
      content: "I couldn't find a saved trip for that — nothing was changed.",
      trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_not_found' },
    };
    renderTurn(data, { isAnonymous: true });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    cleanup();
    renderTurn(data, { isAnonymous: false });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('an ambiguous historical reference shows NO Retry button either, guest or authenticated', () => {
    const data = {
      content: "I found more than one saved trip that could match — tell me which one.",
      trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_ambiguous' },
    };
    renderTurn(data, { isAnonymous: true });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    cleanup();
    renderTurn(data, { isAnonymous: false });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('a genuine success shows NO Retry button, guest or authenticated', () => {
    const data = {
      content: 'Late September is a great time to visit.',
      trailieV2: { status: 'complete' },
    };
    renderTurn(data, { isAnonymous: true });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    cleanup();
    renderTurn(data, { isAnonymous: false });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('a guest quota-exhaustion (action_required) message shows NO Retry button', () => {
    const message = { role: 'assistant', content: 'You have used all your free messages.', outcomeClass: TRAILIE_TURN_OUTCOME.ACTION_REQUIRED };
    const response = toLiveTrailieResponseModel({ message, lifecycle: { showProse: true, showPlan: false } });
    render(
      <TrailieResponse
        response={response}
        afterContent={retryAfterContent({ outcomeClass: message.outcomeClass, isAnonymous: true, isGenerating: false, onClick: vi.fn() })}
      />
    );
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('an uncertain_outcome (client-only disconnect) message shows NO Retry button, guest or authenticated', () => {
    const message = { role: 'assistant', content: "The connection was interrupted. I couldn't confirm whether that finished.", outcomeClass: TRAILIE_TURN_OUTCOME.UNCERTAIN_OUTCOME };
    const response = toLiveTrailieResponseModel({ message, lifecycle: { showProse: true, showPlan: false } });

    const { unmount } = render(
      <TrailieResponse
        response={response}
        afterContent={retryAfterContent({ outcomeClass: message.outcomeClass, isAnonymous: true, isGenerating: false, onClick: vi.fn() })}
      />
    );
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    unmount();

    render(
      <TrailieResponse
        response={response}
        afterContent={retryAfterContent({ outcomeClass: message.outcomeClass, isAnonymous: false, isGenerating: false, onClick: vi.fn() })}
      />
    );
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
