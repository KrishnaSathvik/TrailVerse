import {
  buildIntentPlanAiContext,
  buildIntentPlanAiHref,
  formatIntentGuideContextForPrompt,
  intentPlanAiHeaderTitle,
  resolveIntentPathFromSearchParams,
} from '@/lib/intentPlanAi';
import { getIntentWelcomeMessage } from '@/lib/planAiWelcomeCopy';
import { resolvePlanAiEntryMode, PLAN_AI_ENTRY } from '@/lib/planAiHeaderMeta';

describe('intentPlanAi', () => {
  test('buildIntentPlanAiHref encodes vibe guide slug', () => {
    expect(buildIntentPlanAiHref('/parks-for-couples')).toBe(
      '/plan-ai?from=intent&intent=parks-for-couples'
    );
  });

  test('resolveIntentPathFromSearchParams reads from=intent', () => {
    const params = new URLSearchParams('from=intent&intent=parks-for-couples');
    expect(resolveIntentPathFromSearchParams(params)).toBe('/parks-for-couples');
  });

  test('buildIntentPlanAiContext includes standouts and quickAnswer', () => {
    const ctx = buildIntentPlanAiContext({
      path: '/parks-for-couples',
      title: 'Best National Parks for Couples',
      searchQuery: 'best parks for couples',
      quickAnswer: 'Scenic and relaxed picks rank well.',
      standouts: [{
        fullName: 'Acadia National Park',
        label: 'Acadia',
        description: 'Couple-friendly coast and carriage roads.',
      }],
    });
    expect(ctx.standouts[0].fullName).toBe('Acadia National Park');
    expect(ctx.standouts[0].description).toContain('Couple-friendly');
    expect(ctx.quickAnswer).toContain('Scenic');
  });

  test('buildIntentPlanAiContext merges ranked parks with matchReason', () => {
    const ctx = buildIntentPlanAiContext(
      {
        path: '/parks-for-couples',
        title: 'Best National Parks for Couples',
        searchQuery: 'best parks for couples',
        quickAnswer: '',
        standouts: [],
      },
      {
        rankedParks: [{
          parkCode: 'acad',
          fullName: 'Acadia National Park',
          states: 'ME',
          matchReason: 'Scenic drives and quiet trails',
        }],
      }
    );
    expect(ctx.rankedParks[0].matchReason).toContain('Scenic');
  });

  test('formatIntentGuideContextForPrompt includes standouts and ranked picks', () => {
    const block = formatIntentGuideContextForPrompt({
      path: '/parks-for-couples',
      title: 'Best National Parks for Couples',
      searchQuery: 'best parks for couples',
      quickAnswer: 'Scenic picks.',
      standouts: [{
        fullName: 'Acadia National Park',
        label: 'Acadia',
        description: 'Sunrise from Cadillac Mountain.',
      }],
      rankedParks: [{
        parkCode: 'acad',
        fullName: 'Acadia National Park',
        states: 'ME',
        matchReason: 'Romantic coast drives',
      }],
    });
    expect(block).toContain('EDITORIAL STANDOUTS');
    expect(block).toContain('Sunrise from Cadillac Mountain');
    expect(block).toContain('INTENT GUIDE RANKED PICKS');
    expect(block).toContain('Romantic coast drives');
  });

  test('intent welcome mentions guide title and picks', () => {
    const msg = getIntentWelcomeMessage(null, {
      title: 'Best National Parks for Couples',
      quickAnswer: 'Top picks lean scenic.',
      standouts: [
        { fullName: 'Acadia National Park', label: 'Acadia' },
        { fullName: 'Grand Teton National Park', label: 'Grand Teton' },
      ],
    });
    expect(msg).toContain('Best National Parks for Couples');
    expect(msg).toContain('Acadia');
    expect(msg).toContain('Top picks lean scenic');
  });

  test('resolvePlanAiEntryMode returns intent for vibe deep link', () => {
    const params = new URLSearchParams('from=intent&intent=wildlife-national-parks');
    expect(resolvePlanAiEntryMode({ searchParams: params })).toBe(PLAN_AI_ENTRY.INTENT);
  });

  test('intentPlanAiHeaderTitle shortens guide H1', () => {
    expect(intentPlanAiHeaderTitle('Best National Parks for Couples')).toBe('Couples trip');
  });
});
