import { describe, it, expect } from 'vitest';
import fixtures from '../../../../shared/trailieStoredPresentation.fixtures.json';
import {
  PRESENTATION_STATE,
  VIEWER_CONTEXT,
  deriveTrailieStoredPresentation,
} from '@/utils/trailieStoredPresentation';

// The SAME fixtures the server resolver runs. A divergence between the two
// implementations fails both suites, which is what makes "one interpretation"
// an enforced property rather than a convention.
describe('Stage 14.5 §1 — shared stored-presentation fixtures (browser twin)', () => {
  it.each(fixtures.cases.map((c) => [c.name, c]))('%s', (_name, c) => {
    const result = deriveTrailieStoredPresentation({
      response: c.response,
      canonicalPlan: c.withPlan ? fixtures.plan : null,
      viewerContext: c.viewerContext || VIEWER_CONTEXT.OWNER,
      recoveryCapability: c.recoveryCapability === true,
    });

    for (const [key, expected] of Object.entries(c.expect)) {
      expect({ [key]: result[key] }).toEqual({ [key]: expected });
    }
  });

  it('exposes the same bounded state enum as the server', () => {
    expect(Object.values(PRESENTATION_STATE).sort()).toEqual([
      'fallback_complete', 'invalid', 'itinerary_only', 'legacy_terminal', 'prose_complete',
    ]);
  });

  it('never asks for an empty assistant bubble on any fixture', () => {
    for (const c of fixtures.cases) {
      const r = deriveTrailieStoredPresentation({
        response: c.response,
        canonicalPlan: c.withPlan ? fixtures.plan : null,
      });
      expect(r.showEmptyAssistantBubble).toBe(false);
    }
  });
});
