'use strict';

const { resolveTravelerJob, jobToPrimaryIntent } = require('../trailieTravelerJobResolver');

/**
 * P0-3 (audit 2026-08-31): "3 days in Zion, easy walks, bad knee, sunrise/
 * sunset, no scary exposure" routed to general_qa — the traveler who shared
 * the most got prose instead of the itinerary product. Constraints must
 * enrich the planning job, never demote it.
 *
 * The semantic rule: destination + multi-day visit scope, declared rather
 * than asked, is a request to organize the visit. Constraint language is a
 * modifier. Duration alone does NOT force an itinerary: a message whose
 * point is a question ("Is Angels Landing worth it?", "How crowded…?")
 * stays Q&A even when a trip length is mentioned.
 */

const job = (userPrompt, priorTripState = null) =>
  resolveTravelerJob({ userPrompt, priorTripState });

describe('constrained itinerary routing (P0-3)', () => {
  describe('planning shorthand resolves to itinerary creation', () => {
    test('the verbatim audit prompt', () => {
      const resolved = job(
        '3 days in Zion, easy walks only, I have a bad knee, love sunrise and sunset views, and no scary exposure please.'
      );
      expect(resolved.job).toBe('day_by_day_itinerary');
      expect(jobToPrimaryIntent(resolved)).not.toBe('general_qa');
    });

    test('explicit plan verb (unchanged behavior)', () => {
      expect(job('Plan me 3 days in Zion.').job).toBe('day_by_day_itinerary');
    });

    test('scope plus a couple of constraints', () => {
      expect(job('3 days in Zion, easy walks, bad knee.').job).toBe('day_by_day_itinerary');
    });

    test('scope with preferences, different park, spelled-out duration', () => {
      expect(job('Two days in Acadia with my parents, mostly scenic drives and short walks.').job)
        .toBe('day_by_day_itinerary');
    });

    test('weekend shorthand counts as multi-day scope', () => {
      expect(job('A weekend in Great Smoky Mountains, waterfalls and easy hikes.').job)
        .toBe('day_by_day_itinerary');
    });
  });

  describe('questions stay questions even with a trip length mentioned', () => {
    test('specific-attraction question with duration context', () => {
      const resolved = job("I'll be in Zion for 3 days. Is Angels Landing worth it?");
      expect(resolved.job).not.toBe('day_by_day_itinerary');
    });

    test('crowding question with duration context', () => {
      const resolved = job('How crowded is Zion on a 3-day Labor Day trip?');
      expect(resolved.job).not.toBe('day_by_day_itinerary');
    });

    test('easy-hikes question stays Q&A', () => {
      const resolved = job('What are some easy hikes in Zion for a bad knee?');
      expect(resolved.job).not.toBe('day_by_day_itinerary');
      expect(jobToPrimaryIntent(resolved)).toBe('general_qa');
    });

    test('suitability question stays Q&A', () => {
      const resolved = job('Is Zion good for someone with a bad knee?');
      expect(resolved.job).not.toBe('day_by_day_itinerary');
      expect(jobToPrimaryIntent(resolved)).toBe('general_qa');
    });

    test('duration-sufficiency question stays duration advice', () => {
      expect(job('Is 3 days enough for Zion?').job).toBe('trip_duration_advice');
    });
  });

  describe('comparison and refinement contrasts hold', () => {
    test('either-or comparison stays a comparison', () => {
      const resolved = job('Should I spend 3 days in Zion or Bryce?');
      expect(resolved.job).toBe('destination_compare');
    });

    test('refinement against an existing plan stays a refinement', () => {
      const priorTripState = {
        hasItinerary: true,
        hasActiveTrip: true,
        existingCanonicalPlan: {
          days: [
            { day: 1, stops: [{ id: 's1', name: 'Visitor Center' }] },
            { day: 2, stops: [{ id: 's2', name: 'Riverside Walk' }] },
          ],
        },
      };
      const resolved = job('Make the second morning easier on my knee.', priorTripState);
      expect(['itinerary_refinement', 'constraint_update']).toContain(resolved.job);
    });

    test('explicit not-day-by-day still forbids the artifact', () => {
      const resolved = job("3 days in Zion, easy walks — don't build a day-by-day itinerary yet.");
      expect(resolved.job).not.toBe('day_by_day_itinerary');
    });
  });

  describe('declarations without scope stay conservative', () => {
    test('constraints with no destination do not force a plan', () => {
      expect(job('Easy walks only, I have a bad knee.').job).not.toBe('day_by_day_itinerary');
    });

    test('negated-auxiliary opener is a declaration, not a question', () => {
      expect(job("Can't do big hikes. 3 days in Zion, sunrise and sunset views.").job)
        .toBe('day_by_day_itinerary');
    });
  });
});
