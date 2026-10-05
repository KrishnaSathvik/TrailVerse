/**
 * The capture path is where a private, approved Trailie answer becomes public
 * demo content. These tests assert the allowlist actually holds.
 */
import { describe, expect, it } from 'vitest';
import {
  assertNoInternalFields,
  buildPlaybackFixture,
  buildPlaybackScenario,
  sanitizeApprovedTurn,
  sanitizePlan,
} from '../trailieDemoCapture';
import { SCENARIO_KIND, turnHasItinerary } from '../trailieDemoPlaybackSchema';

/** A realistic approved result, complete with everything that must be stripped. */
const approvedItineraryTurn = {
  question: 'Plan a realistic 2-day Zion trip for a couple.',
  content: 'Here is your Zion weekend.',
  hasLiveData: true,
  hasWebSearch: false,
  // Everything below is internal and must not survive.
  responseId: 'resp_abc123',
  responseVersion: 4,
  responseRevision: 2,
  lifecycleStatus: 'done',
  contentHash: 'sha256:deadbeef',
  itineraryHash: 'sha256:cafebabe',
  provider: 'claude',
  model: 'claude-sonnet-5',
  usage: { inputTokens: 12000, outputTokens: 3000 },
  costUsd: 0.42,
  tripId: '68f0aa11bb22cc33dd44ee55',
  userId: '68f0aa11bb22cc33dd44ee66',
  canonicalPlan: {
    parkName: 'Zion National Park',
    itineraryHash: 'sha256:cafebabe',
    responseId: 'resp_abc123',
    days: [
      {
        day: 1,
        title: 'Scenic Drive & easy walks',
        _id: 'day_1',
        createdAt: '2026-08-08T00:00:00.000Z',
        stops: [
          {
            name: 'Riverside Walk',
            startTime: '08:30',
            duration: 90,
            note: 'Flat and shaded.',
            _id: 'stop_1',
            providerRequestId: 'req_zzz',
          },
        ],
      },
    ],
    feasibilityIssues: [{ code: 'TIGHT_WINDOW', message: 'Day 1 is a little tight.' }],
  },
};

describe('sanitizeApprovedTurn', () => {
  const turn = sanitizeApprovedTurn(approvedItineraryTurn);

  it('keeps only the public playback surface', () => {
    expect(Object.keys(turn).sort()).toEqual(['liveData', 'plan', 'prose', 'question']);
  });

  it('preserves the question verbatim', () => {
    expect(turn.question).toBe('Plan a realistic 2-day Zion trip for a couple.');
  });

  it('carries the plan through so an itinerary can play early', () => {
    expect(turnHasItinerary(turn)).toBe(true);
    expect(turn.plan.parkName).toBe('Zion National Park');
    expect(turn.plan.days[0].stops[0].name).toBe('Riverside Walk');
  });

  it('reduces live-data signals to a coarse public hint', () => {
    expect(turn.liveData).toEqual({ nps: true, web: false });
  });

  it('strips every internal identifier, hash, cost and provider name', () => {
    expect(assertNoInternalFields(turn)).toEqual([]);
    const serialized = JSON.stringify(turn);
    for (const secret of ['resp_abc123', 'sha256:', 'claude-sonnet-5', 'req_zzz', 'day_1', 'stop_1', '0.42']) {
      expect({ secret, present: serialized.includes(secret) }).toEqual({ secret, present: false });
    }
  });

  it('drops feasibility notes entirely — they are diagnostics, not travel advice', () => {
    expect(turn.plan.feasibilityIssues).toBeUndefined();
    expect(JSON.stringify(turn)).not.toMatch(/TIGHT_WINDOW|a little tight/);
  });

  it('is deterministic — same input, same output', () => {
    expect(sanitizeApprovedTurn(approvedItineraryTurn)).toEqual(
      sanitizeApprovedTurn(approvedItineraryTurn)
    );
  });
});

describe('sanitizePlan', () => {
  it('returns null when there is no real plan, so none can be invented', () => {
    expect(sanitizePlan(null)).toBeNull();
    expect(sanitizePlan({ days: [] })).toBeNull();
    expect(sanitizePlan({ parkName: 'Zion' })).toBeNull();
  });

  it('keeps traveler intro and after_plan closing on the public itinerary plan', () => {
    const plan = sanitizePlan({
      parkName: 'Valley of Fire State Park',
      intro: 'A simple two-day Valley of Fire weekend.',
      itineraryHash: 'sha256:secret',
      days: [{ dayNumber: 1, label: 'Mouse Tank', stops: [{ name: "Mouse's Tank" }] }],
      narrativeSections: [{
        placement: 'after_plan',
        heading: 'Why this trip works',
        markdown: 'The days stay light so heat and the drive from Vegas do not force a rush.',
        evidenceId: 'ev-private',
      }],
    });
    expect(plan.intro).toBe('A simple two-day Valley of Fire weekend.');
    expect(plan.narrativeSections).toEqual([{
      placement: 'after_plan',
      heading: 'Why this trip works',
      markdown: 'The days stay light so heat and the drive from Vegas do not force a rush.',
    }]);
    expect(JSON.stringify(plan)).not.toMatch(/sha256:secret|ev-private/);
  });

  it('drops stops with no name rather than rendering an empty row', () => {
    const plan = sanitizePlan({ days: [{ day: 1, stops: [{ name: 'A' }, { duration: 30 }] }] });
    expect(plan.days[0].stops).toEqual([{ name: 'A' }]);
  });

  it('keeps only public backup-plan fields from approved structured alternatives', () => {
    const plan = sanitizePlan({
      days: [{
        dayNumber: 1,
        stops: [{
          name: 'Logan Pass wildlife viewing',
          alternatives: [{
            name: 'Many Glacier lakeshore',
            note: 'Independent of Logan Pass parking.',
            parent: 'internal-parent',
            evidenceId: 'ev-private',
          }],
        }],
      }],
      alternatives: [{
        name: 'Non-Logan-Pass backup',
        when: 'If Logan Pass parking is full.',
        note: 'Use the lakeshore and Wild Goose Island.',
        evidenceId: 'ev-private',
      }],
    });

    expect(plan.days[0].stops[0].alternatives).toEqual([{
      name: 'Many Glacier lakeshore',
      note: 'Independent of Logan Pass parking.',
    }]);
    expect(plan.alternatives).toEqual([{
      name: 'Non-Logan-Pass backup',
      when: 'If Logan Pass parking is full.',
      note: 'Use the lakeshore and Wild Goose Island.',
    }]);
    expect(JSON.stringify(plan)).not.toMatch(/evidenceId|internal-parent|ev-private/);
  });
});

describe('buildPlaybackScenario', () => {
  it('classifies as itinerary only when a plan was actually captured', () => {
    const { scenario, problems } = buildPlaybackScenario({
      id: 'zion-couple-itinerary',
      label: 'Itinerary',
      chatTitle: 'Zion weekend',
      approvedTurns: [approvedItineraryTurn],
    });

    expect(problems).toEqual([]);
    expect(scenario.kind).toBe(SCENARIO_KIND.ITINERARY);
    expect(scenario.id).toBe('zion-couple-itinerary');
  });

  it('classifies a prose-only capture as conversation', () => {
    const { scenario, problems } = buildPlaybackScenario({
      id: 'glacier-one-day-july',
      label: 'Logistics',
      chatTitle: 'Glacier in one day',
      approvedTurns: [{ question: 'One day in Glacier?', content: 'Start at Logan Pass.' }],
    });

    expect(problems).toEqual([]);
    expect(scenario.kind).toBe(SCENARIO_KIND.CONVERSATION);
    expect(turnHasItinerary(scenario.turns[0])).toBe(false);
  });

  it('produces a fixture with nothing internal in it', () => {
    const { scenario } = buildPlaybackScenario({
      id: 'zion-couple-itinerary',
      label: 'Itinerary',
      chatTitle: 'Zion weekend',
      approvedTurns: [approvedItineraryTurn],
    });
    expect(assertNoInternalFields(buildPlaybackFixture([scenario]))).toEqual([]);
  });
});

describe('assertNoInternalFields', () => {
  it('finds forbidden fields at any depth and reports where', () => {
    expect(assertNoInternalFields({ a: { b: [{ responseId: 'x' }] } })).toEqual(['$.a.b[0].responseId']);
  });

  it('passes a clean fixture', () => {
    expect(assertNoInternalFields({ question: 'q', prose: 'p', plan: null })).toEqual([]);
  });
});
