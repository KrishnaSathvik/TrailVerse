import { describe, expect, it } from 'vitest';
import {
  attachCanonicalPlanToConversation,
  toDemoTrailieResponseModel,
  toLiveTrailieResponseModel,
  toRestoredTrailieResponseModel,
} from '@/lib/trailieResponseModel';
import { normalizeTrailiePresentation } from '@/lib/normalizeTrailiePresentation';
import { mapServerMessagesToUi } from '@/utils/serverMessagesToUi';

const PLAN = {
  responseId: 'response-1',
  itineraryHash: 'itinerary-1',
  parkName: 'Zion National Park',
  days: [
    {
      dayNumber: 1,
      label: 'Day 1 · Virgin River',
      stops: [
        {
          name: 'Pa’rus Trail',
          timeWindow: 'Late afternoon',
          duration: 90,
          note: 'Easy paved walk beside the Virgin River.',
          alternatives: [{ name: 'Visitor Center river corridor' }],
        },
      ],
    },
  ],
  alternatives: [
    { name: 'Visitor Center river corridor', note: 'Use this if trail access changes.' },
    { name: 'Watchman viewpoint', note: 'A separate sunset option.' },
  ],
};

const DUPLICATED_CONTENT = [
  'Here’s a relaxed Zion plan with low exposure.',
  '',
  '**At a glance**',
  '',
  '**Day 1 · Virgin River**',
  '- **Pa’rus Trail** — Easy paved walk beside the Virgin River.',
  '',
  '**Important caveat**',
  'Check same-day access and river advisories.',
].join('\n');

const ITINERARY_PRESENTATION = {
  schemaVersion: 1,
  presentationKind: 'itinerary',
  refinement: { isRefinement: false, changes: [] },
  primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
  supportingModules: [],
  prosePolicy: 'full',
  ending: {
    caveat: null,
    beforeYouGo: null,
    followups: [],
  },
};

describe('Trailie response adapters', () => {
  it('produces the same response model for live, demo, and restored sources', () => {
    const live = toLiveTrailieResponseModel({
      message: {
        role: 'assistant',
        content: DUPLICATED_CONTENT,
        itineraryPlan: PLAN,
        itineraryHash: PLAN.itineraryHash,
        hasLiveData: true,
        parkName: PLAN.parkName,
        intent: { primaryIntent: 'trip_planning', verticals: [], reasonCodes: [] },
        presentation: ITINERARY_PRESENTATION,
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    const demo = toDemoTrailieResponseModel({
      turn: {
        prose: DUPLICATED_CONTENT,
        plan: PLAN,
        liveData: { nps: true, web: false },
        intent: { primaryIntent: 'trip_planning', verticals: [], reasonCodes: [] },
        presentation: ITINERARY_PRESENTATION,
      },
    });

    const restored = toRestoredTrailieResponseModel({
      message: {
        role: 'assistant',
        content: DUPLICATED_CONTENT,
        itineraryPlan: PLAN,
        itineraryHash: PLAN.itineraryHash,
        hasLiveData: true,
        parkName: PLAN.parkName,
        intent: { primaryIntent: 'trip_planning', verticals: [], reasonCodes: [] },
        presentation: ITINERARY_PRESENTATION,
      },
      lifecycle: { showProse: true, showPlan: true },
    });

    expect(demo).toEqual(live);
    expect(restored).toEqual(live);
    expect(normalizeTrailiePresentation(demo)).toEqual(normalizeTrailiePresentation(live));
    expect(normalizeTrailiePresentation(restored)).toEqual(normalizeTrailiePresentation(live));
  });

  it('restores after_plan closing from the persisted canonical plan', () => {
    const plan = {
      ...PLAN,
      intro: 'With two relaxed days in Zion, I would keep the trip on canyon scenery.',
      narrativeSections: [{
        placement: 'after_plan',
        heading: 'Why this trip works',
        markdown: 'The days stay light enough that shuttle waits will not force a rush.',
      }],
    };
    const message = {
      role: 'assistant',
      content: plan.intro,
      itineraryPlan: plan,
      presentation: ITINERARY_PRESENTATION,
    };
    const live = toLiveTrailieResponseModel({ message, lifecycle: { showProse: true, showPlan: true } });
    const restored = toRestoredTrailieResponseModel({ message, lifecycle: { showProse: true, showPlan: true } });
    const livePresentation = normalizeTrailiePresentation(live);
    const restoredPresentation = normalizeTrailiePresentation(restored);
    expect(livePresentation.narrativeSections).toEqual(plan.narrativeSections);
    expect(restoredPresentation).toEqual(livePresentation);
    expect(restoredPresentation.intro).toContain('relaxed days in Zion');
  });

  it('uses persisted plan.intro when the restored bubble is empty', () => {
    const plan = { ...PLAN, intro: 'A short Zion opening that still names the trip.' };
    const restored = toRestoredTrailieResponseModel({
      message: {
        role: 'assistant',
        content: '',
        itineraryPlan: plan,
        presentation: ITINERARY_PRESENTATION,
      },
      lifecycle: { showProse: true, showPlan: true },
    });
    expect(normalizeTrailiePresentation(restored).intro).toBe(plan.intro);
  });

  it('reattaches the stored top-level plan to its owning assistant response', () => {
    const conversation = [
      { id: 1, role: 'user', content: 'Plan Zion' },
      {
        id: 2,
        role: 'assistant',
        responseId: PLAN.responseId,
        itineraryHash: PLAN.itineraryHash,
        content: DUPLICATED_CONTENT,
      },
    ];

    const attached = attachCanonicalPlanToConversation(conversation, PLAN);

    expect(attached[1].itineraryPlan).toBe(PLAN);
    expect(attached[0].itineraryPlan).toBeUndefined();
  });

  it('never attaches an identity-bearing plan to a different response revision', () => {
    const conversation = [{
      role: 'assistant',
      responseId: 'response-other',
      responseVersion: 2,
      responseRevision: 2,
      itineraryHash: 'itinerary-other',
      content: 'Other answer',
    }];
    const attached = attachCanonicalPlanToConversation(conversation, {
      ...PLAN,
      responseVersion: 1,
      responseRevision: 1,
    });
    expect(attached[0].itineraryPlan).toBeUndefined();
  });

  it('keeps per-message plan ownership when a later trip.plan belongs to a different response', () => {
    const firstPlan = { ...PLAN, responseId: 'response-1', itineraryHash: 'itinerary-1' };
    const secondPlan = {
      ...PLAN,
      responseId: 'response-2',
      itineraryHash: 'itinerary-2',
      parkName: 'Yellowstone National Park',
      days: [{ dayNumber: 1, label: 'Day 1', stops: [{ name: 'Old Faithful' }] }],
    };
    const conversation = [
      { id: 1, role: 'user', content: 'Plan Zion' },
      {
        id: 2,
        role: 'assistant',
        responseId: 'response-1',
        itineraryHash: 'itinerary-1',
        canonicalPlan: firstPlan,
        itineraryPlan: firstPlan,
        content: 'Zion day.',
      },
      { id: 3, role: 'user', content: 'Now Yellowstone' },
      {
        id: 4,
        role: 'assistant',
        responseId: 'response-2',
        itineraryHash: 'itinerary-2',
        canonicalPlan: secondPlan,
        itineraryPlan: secondPlan,
        content: 'Yellowstone day.',
      },
    ];
    const attached = attachCanonicalPlanToConversation(conversation, firstPlan);
    expect(attached[1].itineraryPlan.parkName).toBe('Zion National Park');
    expect(attached[3].itineraryPlan.parkName).toBe('Yellowstone National Park');
    expect(attached[3].itineraryPlan.responseId).toBe('response-2');
  });
});

describe('normalizeTrailiePresentation', () => {
  it('renders only exact changed refinement days while retaining the full canonical plan', () => {
    const canonicalPlan = {
      ...PLAN,
      days: [1, 2, 3].map((dayNumber) => ({
        dayNumber,
        label: `Day ${dayNumber}`,
        stops: [{ id: `stop-${dayNumber}`, name: `Stop ${dayNumber}` }],
      })),
    };
    const original = structuredClone(canonicalPlan);
    const presentation = {
      ...ITINERARY_PRESENTATION,
      refinement: {
        isRefinement: true,
        changes: ['slower_pace'],
        changedDayNumbers: [3, 2],
      },
    };
    const [restoredMessage] = mapServerMessagesToUi([{
      role: 'assistant',
      content: 'Updated Days 2 and 3.',
      canonicalPlan,
      presentation,
    }]);
    const model = toRestoredTrailieResponseModel({
      message: restoredMessage,
      lifecycle: { showProse: true, showPlan: true },
    });

    const result = normalizeTrailiePresentation(model);

    expect(result.primaryArtifact.plan.days.map((day) => day.dayNumber)).toEqual([2, 3]);
    expect(model.canonicalPlan.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
    expect(canonicalPlan).toEqual(original);
  });

  it('renders every day when exact refinement metadata names every canonical day', () => {
    const canonicalPlan = {
      ...PLAN,
      days: [1, 2, 3].map((dayNumber) => ({ dayNumber, stops: [{ name: `Stop ${dayNumber}` }] })),
    };
    const presentation = {
      ...ITINERARY_PRESENTATION,
      refinement: { isRefinement: true, changes: ['pace'], changedDayNumbers: [1, 2, 3] },
    };
    const result = normalizeTrailiePresentation(toLiveTrailieResponseModel({
      message: { role: 'assistant', itineraryPlan: canonicalPlan, presentation },
      lifecycle: { showProse: false, showPlan: true },
    }));

    expect(result.primaryArtifact.plan.days).toHaveLength(3);
  });

  it('hides a confidently matched itinerary restatement while preserving unique context', () => {
    const result = normalizeTrailiePresentation(
      toLiveTrailieResponseModel({
        message: {
          role: 'assistant',
          content: DUPLICATED_CONTENT,
          itineraryPlan: PLAN,
          itineraryHash: PLAN.itineraryHash,
          hasLiveData: true,
          parkName: PLAN.parkName,
          presentation: ITINERARY_PRESENTATION,
        },
        lifecycle: { showProse: true, showPlan: true },
      })
    );

    expect(result.intro).toContain('relaxed Zion plan');
    expect(result.context).toContain('Important caveat');
    expect(result.context).toContain('river advisories');
    expect(result.context).not.toContain('At a glance');
    expect(result.context).not.toContain('Pa’rus Trail');
    expect(result.primaryArtifact.kind).toBe('itinerary');
  });

  it('keeps prose intact when the structured block cannot be matched confidently', () => {
    const content = 'Use the east entrance and verify the road opening before departure.';
    const result = normalizeTrailiePresentation(
      toLiveTrailieResponseModel({
        message: { role: 'assistant', content, itineraryPlan: PLAN },
        lifecycle: { showProse: true, showPlan: true },
        presentation: ITINERARY_PRESENTATION,
      })
    );

    expect(`${result.intro}\n${result.context}`).toContain(content);
  });

  it('deduplicates plan-level and stop-level alternatives without mutating the canonical plan', () => {
    const original = structuredClone(PLAN);
    const result = normalizeTrailiePresentation(
      toLiveTrailieResponseModel({
        message: { role: 'assistant', content: '', itineraryPlan: PLAN, presentation: ITINERARY_PRESENTATION },
        lifecycle: { showProse: false, showPlan: true },
      })
    );

    expect(result.planB).toBeNull();
    expect(result.primaryArtifact.plan.days[0].stops[0].alternatives).toEqual([]);
    expect(PLAN).toEqual(original);
  });

  it('turns a composite logistics backup into a condition plus scannable steps', () => {
    const logisticsPlan = {
      ...PLAN,
      alternatives: [
        { name: 'Non-pass backup: Many Glacier + Wild Goose Island', when: 'Use if pass access fails.' },
        { name: 'Many Glacier', note: 'Start at the lakeshore.' },
        { name: 'Wild Goose Island', note: 'Add the scenic stop.' },
      ],
    };
    const result = normalizeTrailiePresentation(toLiveTrailieResponseModel({
      message: { itineraryPlan: logisticsPlan, presentation: ITINERARY_PRESENTATION },
      lifecycle: { showProse: false, showPlan: true },
    }));

    expect(result.planB.condition).toBe('Use if pass access fails.');
    expect(result.planB.items.map((item) => item.name)).toEqual(['Many Glacier', 'Wild Goose Island']);
  });

  it('represents a refinement as a change summary followed by the updated artifact', () => {
    const result = normalizeTrailiePresentation(
      toLiveTrailieResponseModel({
        message: {
          role: 'assistant',
          content: '',
          itineraryPlan: PLAN,
          presentation: {
            ...ITINERARY_PRESENTATION,
            refinement: {
              isRefinement: true,
              changes: ['slower_pace', 'less_shuttle_reliance', 'sunset_added'],
            },
          },
        },
        lifecycle: { showProse: false, showPlan: true },
      })
    );

    expect(result.refinement.changes).toEqual([
      'slower_pace',
      'less_shuttle_reliance',
      'sunset_added',
    ]);
    expect(result.primaryArtifact.kind).toBe('itinerary');
  });
});

describe('presentation manifest authority', () => {
  it('keeps intent separate and never uses primaryIntent as presentationKind', () => {
    const result = toLiveTrailieResponseModel({
      message: {
        content: 'Updated plan',
        itineraryPlan: PLAN,
        intent: { primaryIntent: 'trip_refinement' },
        presentation: ITINERARY_PRESENTATION,
      },
    });

    expect(result.intent.primaryIntent).toBe('trip_refinement');
    expect(result.presentation.presentationKind).toBe('itinerary');
    expect(result.presentationKind).toBe('itinerary');
  });

  it('uses bounded legacy inference only when a v1 manifest is absent', () => {
    expect(toLiveTrailieResponseModel({
      message: { content: 'Compare them', presentationKind: 'compare' },
    }).presentationKind).toBe('comparison');
    expect(toLiveTrailieResponseModel({
      message: { content: 'A plan', itineraryPlan: PLAN, intent: { primaryIntent: 'trip_refinement' } },
    }).presentationKind).toBe('itinerary');
    expect(toLiveTrailieResponseModel({
      message: {
        content: 'Here is the 10-day shape without day-by-day.',
        itineraryPlan: PLAN,
        intent: { primaryIntent: 'general_qa', travelerJob: 'trip_skeleton' },
      },
    }).presentationKind).toBe('plain_answer');
  });

  it('does not render leftover Yellowstone airports on a Zion itinerary', () => {
    const logistics = {
      schemaVersion: 1,
      inventoryMode: 'planning',
      destination: { parkCode: 'yell', parkName: 'Yellowstone National Park' },
      transport: {
        airports: [{
          airportCode: 'BZN',
          name: 'Bozeman',
          groundTransfer: { destinationLabel: 'Yellowstone National Park' },
        }],
        routeLegs: [],
      },
      stays: { gateway: { properties: [{ name: 'West Yellowstone' }] } },
    };
    const model = toLiveTrailieResponseModel({
      message: {
        itineraryPlan: PLAN,
        parkName: PLAN.parkName,
        travelLogistics: logistics,
        presentation: {
          ...ITINERARY_PRESENTATION,
          supportingModules: [{ kind: 'getting_there', source: 'travelLogistics.transport.airports' }],
        },
      },
    });
    const result = normalizeTrailiePresentation(model);

    expect(model.travelLogistics).toBeNull();
    expect(result.supportingModules).toEqual([]);
  });
});
