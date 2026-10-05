import { describe, it, expect } from 'vitest';
import { resolveThinkingStageCopy, STAGE_THINKING_COPY } from '../thinkingStageCopy';

describe('resolveThinkingStageCopy', () => {
  it('renders the new buffered-verification thinking state', () => {
    expect(resolveThinkingStageCopy('checking_response_matches_plan')).toBe(
      'Checking that the response matches your plan…'
    );
  });

  it('maps the tool-first structured/validation/writing stages', () => {
    expect(resolveThinkingStageCopy('building_structured_itinerary')).toBe('Building a realistic plan...');
    expect(resolveThinkingStageCopy('validating_trip')).toBe('Checking the plan for timing and tradeoffs...');
    expect(resolveThinkingStageCopy('writing_response')).toBe('Putting your answer together…');
  });

  it('returns null for unknown/absent stages so callers fall back to source-based copy', () => {
    expect(resolveThinkingStageCopy('some_future_stage')).toBeNull();
    expect(resolveThinkingStageCopy('')).toBeNull();
    expect(resolveThinkingStageCopy(undefined)).toBeNull();
    expect(resolveThinkingStageCopy(null)).toBeNull();
  });

  it('never exposes internal codes, queue/job IDs, or a "reviewed" label', () => {
    for (const copy of Object.values(STAGE_THINKING_COPY)) {
      expect(copy).not.toMatch(/job|queue|review|issue_code|consistency_status|_id\b/i);
    }
  });
});
