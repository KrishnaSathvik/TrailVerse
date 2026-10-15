/**
 * Render-level guards for /trailie-demo.
 *
 * Playback is timer-driven, so these tests drive fake timers rather than
 * waiting. Nothing here touches the network: the fixture is static and the page
 * makes zero provider calls by construction — asserted explicitly below.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import TrailieInteractiveDemo, { SCENARIOS } from '../TrailieInteractiveDemo';
import TrailieDemoPlaybackStage from '../TrailieDemoPlaybackStage';
import TrailieDemoCta from '../TrailieDemoCta';
import DemoAnswerProse from '../DemoAnswerProse';
import { toDemoTrailieResponseModel } from '@/lib/trailieResponseModel';
import { normalizeTrailiePresentation } from '@/lib/normalizeTrailiePresentation';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';

// Optional park imagery stays offline in playback tests.
vi.mock('@/hooks/useTripImagery', () => ({ default: () => [] }));

const ITINERARY_PLAN = {
  parkName: 'Zion National Park',
  days: [
    { dayNumber: 1, label: 'Scenic drive', stops: [{ name: 'Riverside Walk', startTime: '08:30', duration: 90 }] },
    { dayNumber: 2, label: 'Easy walks', stops: [{ name: 'Pa’rus Trail', startTime: '09:00' }] },
  ],
};

/** Explicitly advance each question; time alone must never reveal follow-ups. */
function runPlaybackToCompletion() {
  for (let turn = 0; turn < 3; turn += 1) {
    act(() => { vi.advanceTimersByTime(120000); });
    const next = screen.queryByRole('button', { name: 'Next question' });
    if (!next) break;
    act(() => next.click());
  }
}

describe('TrailieDemoPlaybackStage', () => {
  afterEach(cleanup);

  it('offers one action panel for the latest trip in a multi-trip conversation', () => {
    const scenario = SCENARIOS.find(item => item.id === 'wildlife');
    render(<TrailieDemoPlaybackStage scenario={scenario} completedTurns={scenario.turns} showMessagePane />);
    expect(screen.getAllByRole('button', { name: /plan my version/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Explore this sample' })).toHaveLength(1);
    expect(screen.getAllByRole('group', { name: 'When' })).toHaveLength(1);
  });

  it('renders an itinerary card for a turn with a captured plan', () => {
    render(
      <TrailieDemoPlaybackStage
        scenario={{ id: 's', label: 'Itinerary', chatTitle: 'Zion weekend' }}
        completedTurns={[{
          question: 'Plan Zion',
          prose: 'Here you go.',
          plan: ITINERARY_PLAN,
          presentationKind: 'itinerary',
          liveData: {},
        }]}
        isTyping={false}
        typedQuestion=""
        activeTurn={null}
        showMessagePane
      />
    );

    const card = screen.getByLabelText('Trip created');
    expect(within(card).getByText('Scenic drive')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Explore this sample' })).toBeInTheDocument();
    // Chat confirms day purpose; stop details live in the workspace.
    expect(within(card).queryByText('Riverside Walk')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Fall' })).toBeEnabled();
    expect(screen.getByText('Here you go.')).toBeInTheDocument();
  });

  it('opens the captured trip in the public workspace and closes without navigation', () => {
    const show = vi.fn(function () { this.setAttribute('open', ''); });
    HTMLDialogElement.prototype.showModal = show;
    const close = vi.fn(function () { this.removeAttribute('open'); });
    HTMLDialogElement.prototype.close = close;
    render(<TrailieDemoPlaybackStage scenario={{ label: 'Zion' }} completedTurns={[{ question: 'Plan Zion', prose: 'Ready.', plan: ITINERARY_PLAN, presentationKind: 'itinerary' }]} showMessagePane />);
    act(() => screen.getByRole('button', { name: 'Explore this sample' }).click());
    const dialog = screen.getByRole('dialog', { name: 'Sample trip' });
    expect(within(dialog).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).queryByLabelText('Trip at a glance')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close sample trip' }).closest('header')).not.toBeNull();
    act(() => within(dialog).getByRole('tab', { name: 'Day 1' }).click());
    expect(within(dialog).getByText('Riverside Walk')).toBeInTheDocument();
    expect(within(dialog).queryByText('Pa’rus Trail')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Map' })).toBeInTheDocument();
    expect(dialog.querySelector('a[href*="/plan-ai/"]')).toBeNull();
    act(() => within(dialog).getByRole('button', { name: 'Close sample trip' }).click());
    expect(close).toHaveBeenCalled();
    delete HTMLDialogElement.prototype.showModal; delete HTMLDialogElement.prototype.close;
  });

  it('routes completed demo turns through the shared Trailie response renderer', () => {
    render(
      <TrailieDemoPlaybackStage
        scenario={{ id: 's', label: 'Itinerary', chatTitle: 'Zion weekend' }}
        completedTurns={[{
          question: 'Plan Zion',
          prose: 'Here is a low-exposure canyon weekend.',
          plan: ITINERARY_PLAN,
          presentationKind: 'itinerary',
          liveData: { nps: true },
        }]}
        isTyping={false}
        typedQuestion=""
        activeTurn={null}
        showMessagePane
      />
    );

    expect(screen.getByLabelText('Assistant message')).toBeInTheDocument();
    expect(screen.getByLabelText('Trip created')).toBeInTheDocument();
    expect(screen.getByText('Scenic drive')).toBeInTheDocument();
    expect(screen.queryByText('Riverside Walk')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Fall' })).toBeEnabled();
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
  });

  it('renders no itinerary card for a conversation turn', () => {
    render(
      <TrailieDemoPlaybackStage
        scenario={{ id: 's', label: 'Compare', chatTitle: 'Yosemite vs Sequoia' }}
        completedTurns={[{ question: 'Which one?', prose: 'Sequoia.', plan: null, liveData: {} }]}
        isTyping={false}
        typedQuestion=""
        activeTurn={null}
        showMessagePane
      />
    );

    expect(screen.queryByLabelText('Trip itinerary')).not.toBeInTheDocument();
    expect(screen.getByText('Sequoia.')).toBeInTheDocument();
  });

  it('shows the spoken intro before the itinerary card', () => {
    render(
      <TrailieDemoPlaybackStage
        scenario={{ id: 's', label: 'Itinerary', chatTitle: 'Zion weekend' }}
        completedTurns={[]}
        isTyping={false}
        typedQuestion=""
        activeTurn={{
          question: 'Plan Zion',
          prose: 'Start with the canyon, then keep the second day easy.',
          plan: ITINERARY_PLAN,
          presentationKind: 'itinerary',
          liveData: {},
          beat: 'intro',
        }}
        showMessagePane
      />
    );

    expect(screen.getByText('Start with the canyon, then keep the second day easy.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip itinerary')).not.toBeInTheDocument();
  });

  it('exposes no engineering internals in the rendered output', () => {
    const { container } = render(
      <TrailieDemoPlaybackStage
        scenario={{ id: 's', label: 'Itinerary', chatTitle: 'Zion weekend' }}
        completedTurns={[{ question: 'Plan Zion', prose: 'Here you go.', plan: ITINERARY_PLAN, liveData: { nps: true } }]}
        isTyping={false}
        typedQuestion=""
        activeTurn={null}
        showMessagePane
      />
    );

    const text = container.textContent;
    for (const forbidden of ['claude', 'sonnet', 'responseId', 'revision', 'hash', 'token', 'provider', 'itinerary_ready']) {
      expect({ forbidden, found: text.toLowerCase().includes(forbidden.toLowerCase()) }).toEqual({
        forbidden,
        found: false,
      });
    }
  });

  it('does not advertise live-data machinery on sample answers', () => {
    render(
      <TrailieDemoPlaybackStage
        scenario={{ id: 's', label: 'Itinerary', chatTitle: 'Zion weekend' }}
        completedTurns={[{ question: 'Plan Zion', prose: 'Here you go.', plan: ITINERARY_PLAN, liveData: { nps: true } }]}
        isTyping={false}
        typedQuestion=""
        activeTurn={null}
        showMessagePane
      />
    );

    expect(screen.getByText('Trailie')).toBeInTheDocument();
    expect(screen.getByText('Sample conversation')).toBeInTheDocument();
    expect(screen.queryByText('Example using live park data · Conditions change')).not.toBeInTheDocument();
    expect(screen.queryByText('Checked live info')).not.toBeInTheDocument();
    expect(screen.queryByText('Live park data')).not.toBeInTheDocument();
  });
});

describe('recorded multi-turn presentation', () => {
  it('keeps actual prose and saved plans through the demo adapter', () => {
    for (const scenario of SCENARIOS) {
      for (const turn of scenario.turns) {
        expect(turn.content).toBe(turn.prose);
        const view = normalizeTrailiePresentation(toDemoTrailieResponseModel({ turn }));
        if (turn.plan) {
          expect(view.kind).toBe('itinerary');
          expect(view.primaryArtifact.plan.days).toHaveLength(turn.plan.days.length);
        } else {
          expect(view.kind).toBe('plain_answer');
        }
      }
    }
  });

  it('renders all fifteen recorded turns through the shared response component', () => {
    const { rerender } = render(<div />);
    for (const scenario of SCENARIOS) {
      for (const turn of scenario.turns) {
        rerender(<TrailieResponse response={toDemoTrailieResponseModel({ turn })} hideActions />);
        expect(document.body.textContent.length).toBeGreaterThan(100);
        expect(screen.queryByText('Refine this')).not.toBeInTheDocument();
      }
    }
  });
});

describe('DemoAnswerProse', () => {
  afterEach(cleanup);

  it('makes wide comparison tables explicitly scrollable on narrow screens', () => {
    render(
      <DemoAnswerProse
        text={'| Criterion | Yosemite | Sequoia |\n| --- | --- | --- |\n| Easy hikes | Valley paths | Giant sequoias |'}
      />
    );

    const region = screen.getByRole('region', { name: 'Comparison table' });
    expect(region).toHaveClass('w-full', 'max-md:overflow-x-auto', 'md:overflow-visible');
    expect(within(region).getByRole('table')).toHaveClass('min-w-[34rem]', 'md:min-w-0');
    expect(screen.getByText('Swipe to compare →')).toHaveClass('md:hidden');
  });
});

describe('TrailieDemoCta', () => {
  afterEach(cleanup);

  it('sends the visitor to that same demo question in real Trailie', () => {
    render(<TrailieDemoCta askPrompt="Plan a realistic 2-day Zion trip" />);
    expect(screen.getByRole('link', { name: /plan your trip/i })).toHaveAttribute(
      'href',
      '/plan-ai?entry=new-trip&ask=Plan%20a%20realistic%202-day%20Zion%20trip'
    );
  });

  it('falls back to the bare planner with no scenario question', () => {
    render(<TrailieDemoCta />);
    expect(screen.getByRole('link', { name: /plan your trip/i })).toHaveAttribute('href', '/plan-ai');
  });
});

describe('TrailieInteractiveDemo', () => {
  let fetchSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('the demo must never make a network request');
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    fetchSpy.mockRestore();
  });

  it('renders a tab per existing scenario, in order', () => {
    render(<TrailieInteractiveDemo autoPlay={false} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Choose a park',
      'Plan a road trip',
      'Wildlife & photography',
      'Change one day',
      'Explore a city',
    ]);
  });

  it('makes zero provider calls during playback', () => {
    render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('plays the first scenario through to its answer', () => {
    render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    expect(screen.getByText(SCENARIOS[0].turns[0].question)).toBeInTheDocument();
  });

  it('resets playback when switching scenarios', () => {
    render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    const firstQuestion = SCENARIOS[0].turns[0].question;
    expect(screen.getByText(firstQuestion)).toBeInTheDocument();

    act(() => {
      screen.getAllByRole('tab')[2].click();
    });

    // The previous scenario's transcript is gone immediately on switch.
    expect(screen.queryByText(firstQuestion)).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');

    runPlaybackToCompletion();
    expect(screen.getByText(SCENARIOS[2].turns[0].question)).toBeInTheDocument();
  });

  it('shows the captured Shenandoah itinerary after discovery and comparison', () => {
    render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    const card = screen.getByLabelText('Trip created');
    expect(card).toBeInTheDocument();
    expect(screen.queryByText(/not mapped/)).not.toBeInTheDocument();
    // Stop details belong in the workspace, not the chat confirmation.
    expect(within(card).queryByText(/Stony Man Trail/)).not.toBeInTheDocument();
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
    act(() => screen.getByRole('button', { name: 'Explore this sample' }).click());
    const dialog = screen.getByRole('dialog', { name: 'Sample trip' });
    act(() => within(dialog).getByRole('tab', { name: 'Day 4' }).click());
    expect(within(dialog).getAllByText(/Stony Man Trail/).length).toBeGreaterThan(0);
    delete HTMLDialogElement.prototype.showModal;
    delete HTMLDialogElement.prototype.close;
  });

  it('restores a partial conversation paused, then advances only on request', () => {
    const first = render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    const key = 'trailie_demo_scenario_cache';
    const cache = JSON.parse(localStorage.getItem(key));
    cache.scenarios[SCENARIOS[0].id] = cache.scenarios[SCENARIOS[0].id].slice(0, 1);
    localStorage.setItem(key, JSON.stringify(cache));
    first.unmount();
    render(<TrailieInteractiveDemo />);
    act(() => { vi.advanceTimersByTime(120000); });
    expect(screen.getByText(SCENARIOS[0].turns[0].question)).toBeInTheDocument();
    expect(screen.queryByText(SCENARIOS[0].turns[1].question)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next question' })).toBeInTheDocument();
    runPlaybackToCompletion();
    for (const turn of SCENARIOS[0].turns) {
      expect(screen.getByText(turn.question)).toBeInTheDocument();
    }
  });

  it('waits indefinitely between questions and a click reveals only the next turn', () => {
    render(<TrailieInteractiveDemo />);
    act(() => { vi.advanceTimersByTime(120000); });
    expect(screen.getAllByLabelText('Assistant message')).toHaveLength(1);
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3600000); });
    expect(screen.queryByText(SCENARIOS[0].turns[1].question)).not.toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Next question' }).click());
    expect(screen.queryByRole('button', { name: 'Next question' })).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(120000); });
    expect(screen.getAllByLabelText('Assistant message')).toHaveLength(2);
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Next question' }).click());
    act(() => { vi.advanceTimersByTime(120000); });
    expect(screen.getAllByLabelText('Assistant message')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Next question' })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hands local preferences and the sample itinerary to a new trip without changing the fixture', () => {
    const before = JSON.stringify(SCENARIOS);
    render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    // No change yet → no version to plan.
    expect(screen.getByRole('button', { name: /plan my version/i })).toBeDisabled();
    for (const name of ['Fall', 'Couple', 'Scenic + relaxed']) {
      act(() => screen.getByRole('checkbox', { name }).click());
    }
    const url = new URL(screen.getByRole('link', { name: /plan my version/i }).getAttribute('href'), 'https://example.com');
    expect(url.pathname).toBe('/plan-ai');
    expect(url.searchParams.get('entry')).toBe('new-trip');
    expect(url.searchParams.get('ask')).toContain('Plan a fall 4-day Shenandoah National Park trip for two people, similar to this sample, with a scenic and relaxed pace.');
    expect(url.searchParams.get('ask')).toContain('Day 1:');
    expect(screen.getByText(/“Plan a fall 4-day Shenandoah National Park trip for two people/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /plan your trip/i })).not.toBeInTheDocument();
    expect(JSON.stringify(SCENARIOS)).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['mobile', 390],
    ['desktop', 1440],
  ])('renders without error at %s width', (_label, width) => {
    window.innerWidth = width;
    window.dispatchEvent(new Event('resize'));
    const { container } = render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    expect(container.querySelector('[role="tablist"]')).toBeInTheDocument();
    expect(screen.getAllByText(SCENARIOS[0].chatTitle).length).toBeGreaterThan(0);
  });
});
