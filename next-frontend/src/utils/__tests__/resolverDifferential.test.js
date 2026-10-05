import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { resolve } from 'path';
import { deriveTrailieStoredPresentation as browserResolver } from '@/utils/trailieStoredPresentation';

const serverRequire = createRequire(resolve(process.cwd(), '../server/src/utils/_x.js'));
const { deriveTrailieStoredPresentation: serverResolver } = serverRequire('./trailieStoredPresentation');

/**
 * Stage 14.6 §8 — the 17 hand-authored fixtures pin named regressions, but they
 * cannot prove the two implementations stay equivalent as either changes. This
 * enumerates the full bounded input space and compares NORMALIZED RESULTS —
 * never function source text.
 */
const PLAN = {
  responseId: 'r1',
  responseVersion: 2,
  itineraryHash: 'hash-match',
  days: [{ id: 'd1', day: 1, title: 'Day 1', stops: [{ id: 's1', name: 'Stop' }] }],
};

const REVISIONS = [undefined, 1, 2, 7];
const LIFECYCLES = [undefined, 'itinerary_ready', 'prose_ready', 'fallback_complete', 'prose_failed'];
const CONTENTS = ['', 'Some prose.'];
const PLANS = [true, false];
const HASHES = ['hash-match', 'hash-moved'];
const VIEWERS = ['owner', 'shared', 'export'];
const CAPABILITIES = [true, false];

function* combinations() {
  for (const responseRevision of REVISIONS)
    for (const lifecycleStatus of LIFECYCLES)
      for (const content of CONTENTS)
        for (const withPlan of PLANS)
          for (const itineraryHash of HASHES)
            for (const viewerContext of VIEWERS)
              for (const recoveryCapability of CAPABILITIES)
                yield {
                  response: {
                    role: 'assistant',
                    content,
                    responseId: 'r1',
                    responseVersion: 2,
                    ...(responseRevision === undefined ? {} : { responseRevision }),
                    ...(lifecycleStatus === undefined ? {} : { lifecycleStatus }),
                    itineraryHash,
                  },
                  canonicalPlan: withPlan ? PLAN : null,
                  viewerContext,
                  recoveryCapability,
                };
}

const normalize = (r) => ({
  state: r.state,
  showItinerary: r.showItinerary,
  showProse: r.showProse,
  showEmptyAssistantBubble: r.showEmptyAssistantBubble,
  showRecoveryAction: r.showRecoveryAction,
  publicNotesStatus: r.publicNotesStatus,
  notesLabel: r.notesLabel,
  content: r.content,
  lifecycleDiagnosticCode: r.lifecycleDiagnosticCode,
});

describe('Stage 14.6 §8 — server/browser resolver differential', () => {
  const inputs = [...combinations()];

  it('covers the full bounded input space', () => {
    expect(inputs.length).toBe(
      REVISIONS.length * LIFECYCLES.length * CONTENTS.length * PLANS.length *
      HASHES.length * VIEWERS.length * CAPABILITIES.length
    );
    expect(inputs.length).toBe(960);
  });

  it('produces identical normalized results for every input', () => {
    const divergences = [];
    for (const input of inputs) {
      const a = normalize(serverResolver(input));
      const b = normalize(browserResolver(input));
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        divergences.push({
          revision: input.response.responseRevision,
          lifecycle: input.response.lifecycleStatus,
          viewer: input.viewerContext,
          server: a,
          browser: b,
        });
      }
    }
    expect(divergences).toEqual([]);
  });

  it('never yields an empty assistant bubble, on any input', () => {
    for (const input of inputs) {
      expect(serverResolver(input).showEmptyAssistantBubble).toBe(false);
      expect(browserResolver(input).showEmptyAssistantBubble).toBe(false);
    }
  });

  it('never offers recovery to a shared or export viewer, on any input', () => {
    for (const input of inputs.filter((i) => i.viewerContext !== 'owner')) {
      expect(serverResolver(input).showRecoveryAction).toBe(false);
      expect(browserResolver(input).showRecoveryAction).toBe(false);
    }
  });

  it('never shows prose alongside an invalid state, on any input', () => {
    for (const input of inputs) {
      const r = serverResolver(input);
      if (r.state === 'invalid') expect(r.showProse).toBe(false);
    }
  });

  it('only ever emits the bounded coarse notes status', () => {
    for (const input of inputs) {
      expect(['complete', 'not_available']).toContain(serverResolver(input).publicNotesStatus);
    }
  });
});
