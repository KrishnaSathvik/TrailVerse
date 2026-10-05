import { describe, expect, it } from 'vitest';
import {
  isWelcomeProse,
  renderPlanAsAnswer,
  selectRecaptureAnswer,
  isRecaptureTurnSettled,
} from '../trailieDemoRecaptureCapture';

describe('trailieDemoRecaptureCapture', () => {
  const welcome = "Hey, I'm **Trailie**. Where are you thinking of going? Tell me the kind of trip you want and we'll plan it together.";
  const plan = {
    parkName: 'Glacier National Park',
    days: [{
      day: 1,
      title: 'One full day',
      stops: [
        { name: 'Logan Pass area', timeWindow: 'Morning' },
        { name: 'Backup: Lake McDonald', timeWindow: 'Afternoon' },
      ],
    }],
  };

  it('detects welcome prose', () => {
    expect(isWelcomeProse(welcome)).toBe(true);
    expect(isWelcomeProse('A real Glacier day plan with backup options.')).toBe(false);
  });

  it('prefers canonical plan over welcome prose', () => {
    const selected = selectRecaptureAnswer({
      expectedKind: 'itinerary',
      observer: { itineraryReadyObserved: true, planSnapshot: plan },
      cardPresent: false,
      proseCandidates: [welcome],
    });
    expect(selected.captureSource).toBe('canonical_plan');
    expect(selected.answer).toContain('Logan Pass area');
    expect(selected.answer).not.toContain("Hey Trailie, I'm Trailie");
    expect(selected.issues).not.toContain('welcome_prose_captured');
  });

  it('prefers mounted itinerary card when present', () => {
    const selected = selectRecaptureAnswer({
      expectedKind: 'itinerary',
      observer: { itineraryReadyObserved: true, planSnapshot: plan },
      cardPresent: true,
      cardText: 'Trip itinerary\nDay 1\n- Logan Pass',
      proseCandidates: [welcome, 'Some streaming prose'],
    });
    expect(selected.captureSource).toBe('itinerary_card');
    expect(selected.cardMounted).toBe(true);
    expect(selected.answer).toContain('Logan Pass');
  });

  it('fails loudly when only welcome prose is available for an itinerary turn', () => {
    const selected = selectRecaptureAnswer({
      expectedKind: 'itinerary',
      observer: { itineraryReadyObserved: false, planSnapshot: null },
      cardPresent: false,
      proseCandidates: [welcome],
    });
    expect(selected.captureSource).toBe('welcome_prose');
    expect(selected.issues).toEqual(
      expect.arrayContaining(['welcome_prose_captured', 'itinerary_card_missing', 'welcome_prose_for_itinerary_turn'])
    );
  });

  it('uses assistant prose when there is no plan/card', () => {
    const selected = selectRecaptureAnswer({
      expectedKind: 'conversation',
      observer: { itineraryReadyObserved: false, planSnapshot: null },
      proseCandidates: [welcome, 'Sequoia is the better pick for fewer crowds.'],
    });
    expect(selected.captureSource).toBe('assistant_prose');
    expect(selected.answer).toContain('Sequoia is the better pick');
  });

  it('does not settle on response_finalized alone while only welcome prose exists', () => {
    expect(isRecaptureTurnSettled({
      turnComplete: true,
      itineraryReady: true,
      cardMounted: false,
      hasNonWelcomeProse: false,
      composerEnabled: false,
      thinking: false,
    })).toBe(false);

    expect(isRecaptureTurnSettled({
      turnComplete: true,
      itineraryReady: true,
      cardMounted: true,
      hasNonWelcomeProse: false,
      composerEnabled: true,
      thinking: false,
    })).toBe(true);
  });

  it('prefers canonical plan when mounted card text does not match the accepted plan', () => {
    const selected = selectRecaptureAnswer({
      expectedKind: 'itinerary',
      observer: {
        itineraryReadyObserved: true,
        planSnapshot: {
          days: [{ day: 1, stops: [{ name: 'Pa’rus Trail' }, { name: 'Sunset overlook' }] }],
        },
      },
      cardPresent: true,
      cardText: 'Your trip plan\nDay 1\nEmerald Pools area hike',
      proseCandidates: [],
    });
    expect(selected.captureSource).toBe('canonical_plan');
    expect(selected.answer).toContain('Pa’rus Trail');
    expect(selected.issues).toContain('card_text_mismatch_vs_canonical_plan');
  });
});
