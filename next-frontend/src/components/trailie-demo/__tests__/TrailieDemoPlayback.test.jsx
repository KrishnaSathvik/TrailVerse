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

const ITINERARY_PLAN = {
  parkName: 'Zion National Park',
  days: [
    { dayNumber: 1, label: 'Scenic drive', stops: [{ name: 'Riverside Walk', startTime: '08:30', duration: 90 }] },
    { dayNumber: 2, label: 'Easy walks', stops: [{ name: 'Pa’rus Trail', startTime: '09:00' }] },
  ],
};

/** Runs long enough for any scenario to finish typing and revealing. */
function runPlaybackToCompletion() {
  act(() => {
    vi.advanceTimersByTime(120000);
  });
}

describe('TrailieDemoPlaybackStage', () => {
  afterEach(cleanup);

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

    const card = screen.getByLabelText('Trip itinerary');
    expect(within(card).getByText('Riverside Walk')).toBeInTheDocument();
    expect(screen.getByText('Here you go.')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Trip itinerary')).toBeInTheDocument();
    expect(screen.getAllByText('Riverside Walk')).toHaveLength(1);
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

describe('frozen Q1–Q5 presentation manifests', () => {
  it('uses one valid primary artifact and removes confident itinerary restatements', () => {
    const byId = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario]));
    const turns = [
      byId['valley-of-fire-weekend'].turns[0],
      byId['compare-acadia-shenandoah'].turns[0],
      byId['yellowstone-relaxed'].turns[0],
      byId['rocky-mountain-one-day'].turns[0],
      byId['zion-couple-itinerary'].turns[0],
    ];
    const views = turns.map((turn) => normalizeTrailiePresentation(toDemoTrailieResponseModel({ turn })));

    expect(views.map((view) => view.kind)).toEqual([
      'itinerary', 'comparison', 'itinerary', 'plain_answer', 'itinerary',
    ]);
    for (const view of views.filter((item) => item.kind === 'itinerary')) {
      expect(`${view.intro}\n${view.context}`).not.toMatch(/at a glance/i);
      expect(view.primaryArtifact?.plan?.days?.length).toBeGreaterThan(0);
    }
    for (const view of views) {
      expect(view.beforeYouGo).toBeNull();
      expect(view.followups).toEqual([]);
    }
  });

  it('renders captured Q1–Q5 without automatic footers, chips, or cross-park logistics', () => {
    const byId = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario]));
    const turns = [
      byId['valley-of-fire-weekend'].turns[0],
      byId['compare-acadia-shenandoah'].turns[0],
      byId['yellowstone-relaxed'].turns[0],
      byId['rocky-mountain-one-day'].turns[0],
      byId['zion-couple-itinerary'].turns[0],
    ];

    const { rerender } = render(
      <TrailieResponse response={toDemoTrailieResponseModel({ turn: turns[0] })} hideActions />
    );
    for (const turn of turns) {
      rerender(<TrailieResponse response={toDemoTrailieResponseModel({ turn })} hideActions />);
      expect(screen.queryByText('Before you go')).not.toBeInTheDocument();
      expect(screen.queryByText('Refine this')).not.toBeInTheDocument();
      expect(screen.queryByText('Updated your plan')).not.toBeInTheDocument();
      expect(screen.queryByText('FAT')).not.toBeInTheDocument();
      expect(screen.queryByText('Fresno Yosemite International')).not.toBeInTheDocument();
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
      '/plan-ai?ask=Plan%20a%20realistic%202-day%20Zion%20trip'
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
      'Valley of Fire',
      'Compare',
      'Yellowstone',
      'Rocky Mountain',
      'Zion',
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

  it('shows the captured itinerary card on the Valley of Fire sample', () => {
    render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    expect(screen.getByLabelText('Trip itinerary')).toBeInTheDocument();
    expect(screen.getByText('Rainbow Vista')).toBeInTheDocument();
  });

  it('points the CTA at the active scenario question', () => {
    render(<TrailieInteractiveDemo />);
    runPlaybackToCompletion();
    expect(screen.getByRole('link', { name: /plan your trip/i })).toHaveAttribute(
      'href',
      `/plan-ai?ask=${encodeURIComponent(SCENARIOS[0].turns[0].question)}`
    );
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
    expect(screen.getByText(SCENARIOS[0].chatTitle)).toBeInTheDocument();
  });
});
