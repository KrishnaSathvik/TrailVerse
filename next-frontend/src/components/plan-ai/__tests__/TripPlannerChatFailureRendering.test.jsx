import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { toLiveTrailieResponseModel } from '@/lib/trailieResponseModel';
import { classifyTrailieTurnOutcome, resolveTrailieTurnDisplayContent } from '@/utils/trailieTurnOutcome';

/**
 * Phase 6A.1 — a RENDERED-DOM test, not a classifier-function test. This
 * composes the exact same real steps TripPlannerChat.jsx's response handling
 * now takes — classify the server payload, resolve what to actually display,
 * build the response model, render the real `<TrailieResponse>` component —
 * and asserts what a traveler would actually see in the DOM.
 *
 * `<TripPlannerChat>` itself cannot be mounted in isolation (see its own
 * bare-import smoke test in this directory); `<TrailieResponse>` is the real
 * production component every non-conversion assistant turn renders through
 * (see the `usesSharedTrailieResponse` branch in TripPlannerChat.jsx), so
 * rendering it with the same inputs is a faithful proxy for "what the
 * traveler sees", not a synthetic stand-in.
 */

/** Mirrors exactly what TripPlannerChat.jsx builds for a rendered message. */
function buildRenderedMessage(data) {
  const outcomeClass = classifyTrailieTurnOutcome(data);
  const content = resolveTrailieTurnDisplayContent({ content: data.content, outcomeClass });
  return {
    role: 'assistant',
    content,
    outcomeClass,
    presentation: data.presentation ?? null,
    hasLiveData: false,
    hasWebSearch: false,
  };
}

function renderTurn(data) {
  const message = buildRenderedMessage(data);
  const response = toLiveTrailieResponseModel({ message, lifecycle: { showProse: true, showPlan: false } });
  render(<TrailieResponse response={response} />);
  return message;
}

describe('rendered turn — genuine failure vs ordinary outcome (Phase 6A.1)', () => {
  afterEach(cleanup);

  it('a genuine V2 failure renders calm, generic copy — never the raw fallback text or wire terminology', () => {
    renderTurn({
      content: 'INTERNAL: structured generation attempt exhausted after retries.',
      trailieV2: { status: 'failed', terminalReason: 'routing_exhausted' },
    });

    expect(screen.getByText("I couldn't finish that one.")).toBeTruthy();
    expect(screen.queryByText(/INTERNAL/i)).toBeNull();
    expect(screen.queryByText(/routing_exhausted/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /status|terminalReason|reasonCode|routing_exhausted|gpt|claude|openai|anthropic/i
    );
  });

  it('historical-plan not_found renders as an ordinary ai answer, completely unchanged from 6A', () => {
    const safeContent = "I couldn't find a saved trip for that — nothing was changed.";
    renderTurn({
      content: safeContent,
      trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_not_found' },
    });

    expect(screen.getByText(safeContent)).toBeTruthy();
    expect(screen.queryByText("I couldn't finish that one.")).toBeNull();
  });

  it('historical-plan ambiguous also renders as an ordinary answer, not error copy', () => {
    const safeContent = "I found more than one saved trip that could match — tell me which one.";
    renderTurn({
      content: safeContent,
      trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_ambiguous' },
    });

    expect(screen.getByText(safeContent)).toBeTruthy();
    expect(screen.queryByText("I couldn't finish that one.")).toBeNull();
  });

  it('a genuine success renders its real content, not the failure copy', () => {
    const realAnswer = 'Late September is a great time to visit — cooler weather and fewer crowds.';
    renderTurn({
      content: realAnswer,
      trailieV2: { status: 'complete', terminalReason: null },
    });

    expect(screen.getByText(realAnswer)).toBeTruthy();
    expect(screen.queryByText("I couldn't finish that one.")).toBeNull();
  });

  it('the rendered failure turn never shows a Try Again affordance (explicitly deferred)', () => {
    renderTurn({
      content: 'raw fallback text',
      trailieV2: { status: 'failed', terminalReason: 'unknown' },
    });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.queryByText(/try again/i)).toBeNull();
  });
});
