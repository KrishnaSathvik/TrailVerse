import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveThinkingStageCopy,
  resolveRefinementTargetCopy,
  STAGE_THINKING_COPY,
} from '@/utils/thinkingStageCopy';
import { CLIENT_EVENT, createTransportEventNormalizer } from '@/utils/transportEventNormalizer';

/**
 * HONEST PROGRESS — client half.
 *
 * The rule under test: progress copy corresponds to a state the server actually
 * reached. Nothing advances it because time passed, and nothing weaker than a
 * stage may overwrite a stage.
 */

const CHAT = resolve(__dirname, '../../components/plan-ai/TripPlannerChat.jsx');
const SOURCE = readFileSync(CHAT, 'utf8');

describe('A — the fabricated wall-clock progress rotation is gone', () => {
  it('nothing derives thinking copy from elapsed time', () => {
    expect(SOURCE).not.toMatch(/Math\.floor\(elapsed \/ 1000\)/);
    expect(SOURCE).not.toMatch(/seconds\s*<\s*\d+/);
  });

  it('no effect watches thinkingSources any more — the timer was the only one', () => {
    // The deleted effect was `[isGenerating, thinkingStartTime, thinkingSources]`.
    // Two unrelated setIntervals remain (session cleanup, guest reset countdown)
    // and neither touches progress copy, so asserting on `setInterval` itself
    // would be a false tripwire; the dependency is the precise signal.
    expect(SOURCE).not.toMatch(/thinkingSources\]/);
  });

  it('thinkingStartTime survives, because response-time telemetry is not progress', () => {
    expect(SOURCE).toMatch(/Date\.now\(\) - thinkingStartTime/);
  });

  it('setThinkingMessage is only reachable from event handlers and turn reset', () => {
    // 1 turn reset + 1 stage branch + 6 pre-stage source fallbacks + 1 finalizing.
    // The deleted timer alone accounted for 14 more.
    const calls = SOURCE.match(/setThinkingMessage\(/g) || [];
    expect(calls).toHaveLength(9);
  });
});

describe('B — a real stage owns the copy until the next real stage', () => {
  const stages = [
    ['understanding_request', 'Thinking through your question…'],
    ['checking_park_information', 'Checking park details…'],
    ['checking_current_conditions', 'Checking current conditions…'],
    ['checking_permits', 'Checking permits and reservations…'],
    ['checking_transport', 'Checking access and getting around…'],
    ['building_structured_itinerary', 'Building a realistic plan...'],
    ['validating_trip', 'Checking the plan for timing and tradeoffs...'],
  ];

  it.each(stages)('%s resolves to stable copy', (stage, copy) => {
    expect(resolveThinkingStageCopy(stage)).toBe(copy);
  });

  it('an unknown stage resolves to null so the caller leaves copy in place', () => {
    expect(resolveThinkingStageCopy('reticulating_splines')).toBeNull();
    expect(resolveThinkingStageCopy(null)).toBeNull();
    expect(resolveThinkingStageCopy('')).toBeNull();
  });

  it('no copy leaks model, provider, attempt or retry language', () => {
    for (const copy of Object.values(STAGE_THINKING_COPY)) {
      expect(copy).not.toMatch(/gpt|openai|claude|terra|luna|sol|model|provider|tier|attempt|retry|token/i);
    }
  });

  it('an evidence event may not overwrite a stage — it carries no stage', () => {
    const n = createTransportEventNormalizer();
    const [progress] = n.normalize({ type: 'thinking', stage: 'validating_trip' });
    const [evidence] = n.normalize({ type: 'thinking', sources: ['nps', 'web'] });
    expect(progress.kind).toBe(CLIENT_EVENT.PROGRESS);
    expect(evidence.kind).toBe(CLIENT_EVENT.EVIDENCE);
    // The UI branches on `stage` being present; evidence never supplies one.
    expect(evidence.stage).toBeUndefined();
  });

  it('the client refuses source-derived copy once a stage has been seen', () => {
    // The guard is a single early return in the evidence branch.
    expect(SOURCE).toMatch(/if \(sawServerStageRef\.current\) return;/);
    const stageBranch = SOURCE.indexOf('sawServerStageRef.current = true;');
    const evidenceGuard = SOURCE.indexOf('if (sawServerStageRef.current) return;');
    expect(stageBranch).toBeGreaterThan(-1);
    expect(evidenceGuard).toBeGreaterThan(stageBranch);
  });

  it('the flag resets per turn, so a stage cannot silence the next turn', () => {
    expect(SOURCE).toMatch(/sawServerStageRef\.current = false;/);
  });
});

describe('C — refinement copy says what is being worked on, never what will change', () => {
  it('mirrors a daypart reference', () => {
    expect(resolveRefinementTargetCopy({ level: 'daypart', dayNumber: 2, daypart: 'morning' }))
      .toBe('Adjusting the second morning…');
  });

  it('names a stop the traveler named', () => {
    expect(resolveRefinementTargetCopy({ level: 'stop', stopName: 'Kīlauea Overlook' }))
      .toBe('Adjusting Kīlauea Overlook…');
  });

  it('reworks a day', () => {
    expect(resolveRefinementTargetCopy({ level: 'day', dayNumber: 2 })).toBe('Reworking day 2…');
  });

  it('falls back to the whole itinerary', () => {
    expect(resolveRefinementTargetCopy({ level: 'whole_plan' })).toBe('Adjusting the itinerary…');
  });

  it('an unresolved or partial target yields nothing, so generic copy stands', () => {
    expect(resolveRefinementTargetCopy(null)).toBeNull();
    expect(resolveRefinementTargetCopy({ level: 'daypart', dayNumber: null, daypart: 'morning' })).toBeNull();
    expect(resolveRefinementTargetCopy({ level: 'route_leg' })).toBeNull();
  });

  it('never exposes internal scope terminology', () => {
    const all = [
      { level: 'daypart', dayNumber: 2, daypart: 'morning' },
      { level: 'day', dayNumber: 3 },
      { level: 'whole_plan' },
      { level: 'stop', stopName: 'Boicourt Overlook' },
    ].map(resolveRefinementTargetCopy);
    for (const copy of all) {
      expect(copy).not.toMatch(/daypart|whole_plan|scope|stopId|allowedStops|patch|operation/i);
    }
  });

  it('never predicts an outcome the patch has not earned', () => {
    const all = [
      { level: 'daypart', dayNumber: 2, daypart: 'morning' },
      { level: 'stop', stopName: 'Wind Canyon Trail' },
      { level: 'day', dayNumber: 1 },
      { level: 'whole_plan' },
    ].map(resolveRefinementTargetCopy);
    for (const copy of all) {
      // "Adjusting X" is about the request. "Removing/shortening/swapping X"
      // would be a claim about an answer that does not exist yet.
      expect(copy).not.toMatch(/remov|shorten|swap|replac|delet|shift|mov(e|ing)|添/i);
    }
  });

  it('sharpens only the stage that spans the long wait', () => {
    const target = { level: 'day', dayNumber: 2 };
    expect(resolveThinkingStageCopy('building_structured_itinerary', target)).toBe('Reworking day 2…');
    // A target must not relabel an unrelated stage.
    expect(resolveThinkingStageCopy('checking_permits', target))
      .toBe(STAGE_THINKING_COPY.checking_permits);
    expect(resolveThinkingStageCopy('validating_trip', target))
      .toBe(STAGE_THINKING_COPY.validating_trip);
  });
});

describe('D/F — the target rides progress; artifact bytes do not', () => {
  const run = (raw) => createTransportEventNormalizer().normalize(raw);

  it('legacy thinking carries the refinement target through', () => {
    const [ev] = run({
      type: 'thinking',
      stage: 'building_structured_itinerary',
      refinementTarget: { level: 'stop', stopName: 'Boicourt Overlook', dayNumber: 2, daypart: null },
    });
    expect(ev.kind).toBe(CLIENT_EVENT.PROGRESS);
    expect(resolveThinkingStageCopy(ev.stage, ev.refinementTarget)).toBe('Adjusting Boicourt Overlook…');
  });

  it('v2 progress carries it identically', () => {
    const [ev] = run({
      type: 'progress',
      stage: 'building_itinerary',
      refinementTarget: { level: 'daypart', dayNumber: 2, daypart: 'morning', stopName: null },
    });
    expect(resolveThinkingStageCopy(ev.stage, ev.refinementTarget)).toBe('Adjusting the second morning…');
  });

  it('a malformed target degrades to generic stage copy instead of throwing', () => {
    for (const bad of ['nonsense', 42, { nope: true }, { level: 7 }]) {
      const [ev] = run({ type: 'progress', stage: 'building_itinerary', refinementTarget: bad });
      expect(ev.refinementTarget).toBeNull();
      expect(resolveThinkingStageCopy(ev.stage, ev.refinementTarget))
        .toBe(STAGE_THINKING_COPY.building_structured_itinerary);
    }
  });

  it('the normalizer has no vocabulary for partial artifact content', () => {
    expect(Object.values(CLIENT_EVENT)).not.toContain('tool_argument_delta');
    const src = readFileSync(resolve(__dirname, '../transportEventNormalizer.js'), 'utf8');
    expect(src).not.toMatch(/tool_argument|partial_itinerary|partial_plan/);
  });

  it('no client module parses partial itinerary JSON for UX', () => {
    expect(SOURCE).not.toMatch(/tool_argument/);
  });
});
