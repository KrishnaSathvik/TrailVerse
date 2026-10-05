import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { toLiveTrailieResponseModel } from '@/lib/trailieResponseModel';

const PLAN = {
  parkName: 'Zion National Park',
  parkCode: 'zion',
  days: [
    {
      dayNumber: 1,
      label: 'Day 1 · Virgin River + sunset',
      stops: [
        {
          name: 'Pa’rus Trail',
          timeWindow: 'Late afternoon',
          duration: 90,
          note: 'Easy paved walk along the Virgin River with Watchman views.',
        },
      ],
    },
  ],
  alternatives: [{ name: 'Visitor Center river corridor', note: 'Use if access changes.' }],
};

function manifest(kind, source, overrides = {}) {
  return {
    schemaVersion: 1,
    presentationKind: kind,
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: { kind, source },
    supportingModules: [],
    prosePolicy: 'full',
    ending: { caveat: null, beforeYouGo: null, followups: [] },
    ...overrides,
  };
}

describe('TrailieResponse', () => {
  afterEach(cleanup);

  it('exposes restrained visual tones without changing response content', () => {
    const response = toLiveTrailieResponseModel({
      message: { role: 'assistant', content: "I couldn't finish that one." },
      lifecycle: { showProse: true, showPlan: false },
    });

    const { rerender } = render(<TrailieResponse response={response} tone="failure" />);
    expect(screen.getByLabelText('Assistant message')).toHaveClass('trailie-response--failure');
    expect(screen.getByText("I couldn't finish that one.")).toBeInTheDocument();

    rerender(<TrailieResponse response={response} tone="uncertain" />);
    expect(screen.getByLabelText('Assistant message')).toHaveClass('trailie-response--uncertain');
    expect(screen.getByLabelText('Assistant message')).not.toHaveClass('trailie-response--failure');
  });

  it('renders natural prose plus an editorial itinerary without automatic footers', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: [
          'Here’s a relaxed Zion plan.',
          '',
          '**At a glance**',
          '',
          '**Day 1 · Virgin River + sunset**',
          '- **Pa’rus Trail** — Easy paved walk.',
          '',
          '**Important context**',
          'Stay out of the river if an advisory is active.',
        ].join('\n'),
        itineraryPlan: PLAN,
        hasLiveData: true,
        parkName: 'Zion National Park',
        presentation: manifest('itinerary', 'canonicalPlan', {
          ending: {
            caveat: null,
            beforeYouGo: 'Check same-day trail and park alerts.',
            followups: ['Make it more relaxed'],
          },
        }),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);

    const itinerary = screen.getByLabelText('Trip itinerary');
    expect(within(itinerary).getByText('Pa’rus Trail')).toBeInTheDocument();
    expect(screen.getAllByText('Pa’rus Trail')).toHaveLength(1);
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
    expect(screen.getByText('Important context')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Plan B' })).not.toBeInTheDocument();
    expect(screen.queryByText('Before you go')).not.toBeInTheDocument();
    expect(screen.queryByText('Refine this')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make it more relaxed' })).not.toBeInTheDocument();
    expect(screen.queryByText('Checked live info')).not.toBeInTheDocument();
    expect(screen.queryByText('Checked park info')).not.toBeInTheDocument();
  });

  it('renders only exact changed refinement days while retaining the full canonical plan', () => {
    const fullPlan = {
      ...PLAN,
      narrativeSections: [{
        placement: 'after_plan',
        heading: 'A note on the final day',
        markdown: 'Keep Day 3 open for changing ridge conditions.',
      }],
      days: [
        { dayNumber: 1, label: 'Day 1', stops: [{ name: 'Canyon Overlook' }] },
        { dayNumber: 2, label: 'Day 2', stops: [{ name: 'Easy Riverside Walk' }] },
        { dayNumber: 3, label: 'Day 3', stops: [{ name: 'Kolob Canyons' }] },
      ],
    };
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'I eased up Day 2 and kept the rest of the trip intact.',
        itineraryPlan: fullPlan,
        presentation: manifest('itinerary', 'canonicalPlan', {
          refinement: {
            isRefinement: true,
            changes: ['slower_pace'],
            changedDayNumbers: [2],
          },
        }),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);

    expect(screen.getByText('I eased up Day 2 and kept the rest of the trip intact.')).toBeInTheDocument();
    expect(screen.getByText('Day 2')).toBeInTheDocument();
    expect(screen.queryByText('Day 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Day 3')).not.toBeInTheDocument();
    expect(screen.getByText('Easy Riverside Walk')).toBeInTheDocument();
    expect(screen.queryByText('Canyon Overlook')).not.toBeInTheDocument();
    expect(screen.queryByText('Kolob Canyons')).not.toBeInTheDocument();
    expect(screen.queryByText('A note on the final day')).not.toBeInTheDocument();
    expect(screen.queryByText('Keep Day 3 open for changing ridge conditions.')).not.toBeInTheDocument();
    expect(response.canonicalPlan.days).toHaveLength(3);
    expect(response.canonicalPlan.narrativeSections).toHaveLength(1);
  });

  it('suppresses unscoped canonical narrative for a partial refinement but preserves current-turn prose', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'I eased up Day 2 and kept the rest of the trip intact.',
        itineraryPlan: {
          ...PLAN,
          days: [
            { dayNumber: 1, stops: [{ name: 'Day 1 stop' }] },
            { dayNumber: 2, stops: [{ name: 'Day 2 stop' }] },
            { dayNumber: 3, stops: [{ name: 'Day 3 stop' }] },
          ],
          narrativeSections: [{
            placement: 'after_plan',
            heading: 'A note on the final day',
            markdown: 'Keep Day 3 open for changing ridge conditions.',
          }],
        },
        presentation: manifest('itinerary', 'canonicalPlan', {
          refinement: {
            isRefinement: true,
            changes: ['slower_pace'],
            changedDayNumbers: [2],
          },
        }),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);

    expect(screen.getByText('I eased up Day 2 and kept the rest of the trip intact.')).toBeInTheDocument();
    expect(screen.queryByText('A note on the final day')).not.toBeInTheDocument();
    expect(screen.queryByText('Keep Day 3 open for changing ridge conditions.')).not.toBeInTheDocument();
  });

  it('keeps canonical narrative when a refinement presents every day', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'I relaxed the pacing across the whole trip.',
        itineraryPlan: {
          ...PLAN,
          days: [
            { dayNumber: 1, stops: [{ name: 'Day 1 stop' }] },
            { dayNumber: 2, stops: [{ name: 'Day 2 stop' }] },
          ],
          narrativeSections: [{
            placement: 'after_plan',
            heading: 'Across the trip',
            markdown: 'Both afternoons now have extra room.',
          }],
        },
        presentation: manifest('itinerary', 'canonicalPlan', {
          refinement: {
            isRefinement: true,
            changes: ['slower_pace'],
            changedDayNumbers: [1, 2],
          },
        }),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);

    expect(screen.getByText('Across the trip')).toBeInTheDocument();
    expect(screen.getByText('Both afternoons now have extra room.')).toBeInTheDocument();
  });

  it('renders optional narrative around the itinerary without a canned footer', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'For a relaxed weekend, I’d keep Valley of Fire simple.',
        itineraryPlan: {
          ...PLAN,
          intro: 'For a relaxed weekend, I’d keep Valley of Fire simple.',
          narrativeSections: [
            {
              placement: 'before_plan',
              heading: 'A couple of things I’d know first',
              markdown: 'It’s a short drive from Vegas, so I’d structure both days around morning and evening outdoor time.',
            },
            {
              placement: 'after_plan',
              markdown: 'This leaves the middle of both days loose, so it should feel like a weekend rather than a checklist.',
            },
          ],
        },
        presentation: manifest('itinerary', 'canonicalPlan'),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);
    expect(screen.getByText(/short drive from Vegas/i)).toBeInTheDocument();
    expect(screen.getByText(/feel like a weekend/i)).toBeInTheDocument();
    expect(screen.queryByText('Before you go')).not.toBeInTheDocument();
  });

  it('shows a tool intro as spoken opening without an At a glance restatement', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'For a relaxed weekend, I’d keep Valley of Fire simple: one scenic afternoon after the drive from Vegas, then an early second morning before the heat builds.',
        itineraryPlan: {
          ...PLAN,
          intro: 'For a relaxed weekend, I’d keep Valley of Fire simple: one scenic afternoon after the drive from Vegas, then an early second morning before the heat builds.',
        },
        presentation: manifest('itinerary', 'canonicalPlan'),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);

    expect(screen.getByText(/keep Valley of Fire simple/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Trip itinerary')).toBeInTheDocument();
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
  });

  it('keeps comparison tables inside the prose instead of a giant comparison card', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: [
          '**Pick Sequoia National Park.**',
          '',
          '| Criterion | Yosemite | Sequoia |',
          '| --- | --- | --- |',
          '| Easy hiking | Valley paths | Giant sequoias |',
        ].join('\n'),
        presentation: manifest('comparison', 'content'),
      },
      lifecycle: { showProse: true, showPlan: false },
    });

    render(<TrailieResponse response={response} hideActions />);

    const region = screen.getByRole('region', { name: 'Comparison table' });
    expect(region).toHaveClass('max-md:overflow-x-auto', 'md:overflow-visible');
    expect(within(region).getByRole('table')).toHaveClass(
      'min-w-[34rem]',
      'md:min-w-0',
      'w-full',
      'table-fixed'
    );
    expect(region).toHaveAttribute('data-column-count', '3');
    expect(screen.getByText('Swipe to compare →')).toHaveClass('md:hidden');
    expect(screen.getByText('Pick Sequoia National Park.')).toBeInTheDocument();
  });

  it('lets four-column comparison tables use the wider breakout instead of 3-column widths', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: [
          '**Pick Sequoia.**',
          '',
          '| What matters | Yosemite | Sequoia | Better fit |',
          '| --- | --- | --- | --- |',
          '| Crowds | Busy | Quieter | Sequoia |',
        ].join('\n'),
        presentation: manifest('comparison', 'content'),
      },
      lifecycle: { showProse: true, showPlan: false },
    });

    render(<TrailieResponse response={response} hideActions />);
    const region = screen.getByRole('region', { name: 'Comparison table' });
    expect(region).toHaveAttribute('data-column-count', '4');
    expect(region.parentElement).toHaveClass('max-w-[68rem]');
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
  });

  it('does not render Yosemite airports on a Zion answer', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'For Zion, LAS is the usual gateway.',
        parkName: 'Zion National Park',
        parkNames: ['Zion National Park'],
        itineraryPlan: PLAN,
        travelLogistics: {
          schemaVersion: 1,
          destination: { parkCode: 'yose', parkName: 'Yosemite National Park' },
          transport: {
            airports: [{
              airportCode: 'FAT',
              name: 'Fresno Yosemite International',
              groundTransfer: { destinationLabel: 'Yosemite National Park' },
            }],
          },
        },
        presentation: manifest('itinerary', 'canonicalPlan', {
          supportingModules: [{ kind: 'flight_planning', source: 'travelLogistics.transport.airports' }],
        }),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);
    expect(screen.queryByText('Fresno Yosemite International')).not.toBeInTheDocument();
    expect(screen.queryByText('FAT')).not.toBeInTheDocument();
    expect(screen.getByText(/LAS is the usual gateway/)).toBeInTheDocument();
  });

  it('shows a backup only when the traveler asked for one', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'If Logan Pass parking fails, use Many Glacier.',
        itineraryPlan: {
          ...PLAN,
          parkName: 'Glacier National Park',
          alternatives: [{
            name: 'Non-pass backup: Many Glacier',
            when: 'Use if Logan Pass parking fails.',
          }],
        },
        parkName: 'Glacier National Park',
        presentation: manifest('itinerary', 'canonicalPlan'),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);
    expect(screen.getByRole('region', { name: 'Plan B' })).toBeInTheDocument();
    expect(screen.getByText('Use if Logan Pass parking fails.')).toBeInTheDocument();
  });

  it('shows a repeated normalized Plan B condition only once', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'Keep Many Glacier as the weather backup.',
        itineraryPlan: {
          ...PLAN,
          parkName: 'Glacier National Park',
          alternatives: [
            {
              name: 'Trail of the Cedars',
              when: 'Use if Logan Pass parking fails.',
            },
            {
              name: 'Lake McDonald shoreline',
              when: ' use if logan pass parking fails! ',
            },
          ],
        },
        presentation: manifest('itinerary', 'canonicalPlan'),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);
    expect(screen.getAllByText(/use if logan pass parking fails/i)).toHaveLength(1);
  });

  it('does not send automatic follow-up chips', () => {
    const onFollowup = vi.fn();
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'Sequoia is the stronger fit.',
        presentation: manifest('plain_answer', 'content', {
          ending: { caveat: null, beforeYouGo: null, followups: ['Plan the winner'] },
        }),
      },
      lifecycle: { showProse: true, showPlan: false },
    });

    render(<TrailieResponse response={response} hideActions onFollowup={onFollowup} />);
    expect(screen.queryByRole('button', { name: 'Plan the winner' })).not.toBeInTheDocument();
    expect(onFollowup).not.toHaveBeenCalled();
  });

  it('uses a ranked stay list when the question is about lodging', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'For a Zion weekend, I would stay in Springdale.',
        parkName: 'Zion National Park',
        parkNames: ['Zion National Park'],
        travelLogistics: {
          schemaVersion: 1,
          destination: { parkCode: 'zion', parkName: 'Zion National Park' },
          stays: {
            gateway: {
              areaLabel: 'Springdale',
              properties: [{ name: 'Cable Mountain Lodge', address: 'Springdale, UT' }],
            },
          },
        },
        presentation: manifest('stay_options', 'travelLogistics.stays'),
      },
      lifecycle: { showProse: true, showPlan: false },
    });

    render(<TrailieResponse response={response} hideActions />);
    expect(screen.getByLabelText('Stay options')).toBeInTheDocument();
    expect(screen.getByText('Cable Mountain Lodge')).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip itinerary')).not.toBeInTheDocument();
  });

  it('does not attach lodging rows to a normal itinerary just because stay data exists', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'Here is a relaxed two-day Zion plan.',
        itineraryPlan: PLAN,
        parkName: 'Zion National Park',
        travelLogistics: {
          schemaVersion: 1,
          destination: { parkCode: 'zion', parkName: 'Zion National Park' },
          stays: {
            gateway: {
              areaLabel: 'Springdale',
              properties: [{ name: 'Cable Mountain Lodge' }],
            },
          },
        },
        presentation: manifest('itinerary', 'canonicalPlan'),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(<TrailieResponse response={response} hideActions />);
    expect(screen.getByLabelText('Trip itinerary')).toBeInTheDocument();
    expect(screen.queryByLabelText('Stay options')).not.toBeInTheDocument();
    expect(screen.queryByText('Cable Mountain Lodge')).not.toBeInTheDocument();
  });

  it('renders after_plan closing after the last day and before afterContent CTA', () => {
    const response = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: 'With two relaxed days in Zion, I would keep the trip on canyon scenery.',
        itineraryPlan: {
          ...PLAN,
          narrativeSections: [{
            placement: 'after_plan',
            heading: 'Why this trip works',
            markdown: 'The days stay light enough that shuttle waits will not force a rush.',
          }],
        },
        parkName: 'Zion National Park',
        presentation: manifest('itinerary', 'canonicalPlan'),
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    render(
      <TrailieResponse
        response={response}
        hideActions
        afterContent={<button type="button">Want to try your own trip?</button>}
      />,
    );

    const article = screen.getByLabelText('Assistant message');
    const text = article.textContent;
    const introAt = text.indexOf('With two relaxed days in Zion');
    const dayAt = text.indexOf('Pa’rus Trail');
    const closingAt = text.indexOf('Why this trip works');
    const ctaAt = text.indexOf('Want to try your own trip?');
    expect(introAt).toBeGreaterThanOrEqual(0);
    expect(dayAt).toBeGreaterThan(introAt);
    expect(closingAt).toBeGreaterThan(dayAt);
    expect(ctaAt).toBeGreaterThan(closingAt);
    expect(screen.queryByText('Before you go')).not.toBeInTheDocument();
  });
});
