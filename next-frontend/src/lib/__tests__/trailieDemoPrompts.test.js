/**
 * Guards the /plan-ai welcome chips.
 *
 * These are general live starters. They are not the /trailie-demo playback set.
 */
import { describe, expect, it } from 'vitest';
import {
  TRAILIE_DEMO_PROMPTS,
  TRAILIE_PERSONALIZED_PROMPTS,
  promptRequestsLiveData,
} from '../trailieDemoPrompts';

const ALL = [...TRAILIE_DEMO_PROMPTS, ...TRAILIE_PERSONALIZED_PROMPTS];

const PLAN_AI_STARTERS = [
  'Plan a 5-day trip to Yellowstone for a family',
  'Best national parks for stargazing in the Southwest',
  'Weekend hiking trip from Denver under $500',
  'Compare Zion and Bryce Canyon for beginners',
];

describe('Trailie plan-ai starter prompts', () => {
  it('keeps the default set small enough to scan', () => {
    expect(TRAILIE_DEMO_PROMPTS).toHaveLength(4);
    expect(TRAILIE_PERSONALIZED_PROMPTS).toHaveLength(4);
  });

  it('gives every prompt a stable id and a renderable icon key', () => {
    for (const prompt of ALL) {
      expect(prompt.id).toMatch(/^[a-z0-9-]+$/);
      expect(['sparkles', 'mapPin', 'calendar', 'compare']).toContain(prompt.icon);
      expect(typeof prompt.text).toBe('string');
      expect(prompt.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids and prompt text', () => {
    expect(new Set(ALL.map((p) => p.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map((p) => p.text)).size).toBe(ALL.length);
  });

  it('never asks for open-now / inventory phrasing on the chips', () => {
    for (const prompt of ALL) {
      if (prompt.id === 'weekend-denver-budget') continue;
      expect({ id: prompt.id, live: promptRequestsLiveData(prompt.text) }).toEqual({
        id: prompt.id,
        live: false,
      });
    }
  });

  it('covers more than itinerary generation', () => {
    const capabilities = new Set(TRAILIE_DEMO_PROMPTS.map((p) => p.capability));
    expect(capabilities.has('itinerary')).toBe(true);
    expect(capabilities.has('comparison')).toBe(true);
  });

  it('keeps the general /plan-ai starters, not the /trailie-demo questions', () => {
    expect(TRAILIE_DEMO_PROMPTS.map((prompt) => prompt.text)).toEqual(PLAN_AI_STARTERS);
    expect(TRAILIE_DEMO_PROMPTS.some((prompt) => prompt.label)).toBe(false);
  });

  it('keeps starter wording ordinary and short enough to scan', () => {
    for (const prompt of ALL) {
      expect(prompt.text).not.toMatch(/do not ask clarifying questions/i);
      expect(prompt.text).not.toMatch(/\bdemo\b|\btest\b|\bstage ?\d/i);
      expect(prompt.text.length).toBeLessThanOrEqual(140);
    }
  });

  it('flags live-data phrasing when it does appear', () => {
    expect(promptRequestsLiveData('Is Going-to-the-Sun Road open right now?')).toBe(true);
    expect(promptRequestsLiveData('Weekend hiking trip from Denver under $500')).toBe(true);
    expect(promptRequestsLiveData("What's trending near parks I've already visited?")).toBe(true);
    expect(promptRequestsLiveData('Plan a 5-day trip to Yellowstone for a family')).toBe(false);
  });
});
