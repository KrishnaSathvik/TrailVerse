'use strict';

/**
 * Probe A retest field-level reproduction (offline, no providers).
 *
 * POST 201 persisted revision-1 with contentHash = hash('').
 * Terminal PUT rebuilt conversation from response_finalized (no contentHash)
 * at the same version+revision → same_version_different_hash.
 */

const { buildRevisionOneOutbound } = require('../earlyRevisionEvents');
const { resolveCanonicalResponsePersistence } = require('../canonicalPersistence');
const { hashPayload } = require('../canonicalResponse');

const RID = '49389cd6-5751-4679-9cfb-416ff35e18d9';
const DAYS = {
  days: [
    { day: 1, title: 'Day 1', stops: [{ name: 'The Beehives' }] },
    { day: 2, title: 'Day 2', stops: [{ name: "Mouse's Tank Trail" }] },
  ],
  parkName: 'Valley of Fire State Park',
};

describe('Probe A itinerary-only terminal persistence conflict', () => {
  const outbound = buildRevisionOneOutbound({
    responseIdentity: { responseId: RID, responseVersion: 1 },
    finalizedItinerary: DAYS,
    parkName: 'Valley of Fire State Park',
    provider: 'openai',
    model: 'gpt-5.6-terra',
  });

  const postPlan = outbound.canonicalPlan;
  const postConversation = [
    { role: 'user', content: 'Plan a relaxed weekend at Valley of Fire…', id: 1 },
    {
      role: 'assistant',
      content: '',
      responseId: RID,
      responseVersion: 1,
      responseRevision: 1,
      lifecycleStatus: 'itinerary_ready',
      contentHash: outbound.response.contentHash,
      itineraryHash: outbound.response.itineraryHash,
      id: 2,
    },
  ];

  /** Mirrors TripPlannerChat persistTerminal rebuild from done (Probe A shape). */
  function buildBuggyTerminalPut() {
    const done = {
      contentUnchanged: true,
      content: '**At a glance**\nDay 1 display text…',
      responseId: RID,
      responseVersion: 1,
      itineraryHash: outbound.response.itineraryHash,
      canonicalPlan: DAYS,
    };
    const putConversation = [
      postConversation[0],
      {
        role: 'assistant',
        content: '',
        responseId: done.responseId,
        responseVersion: done.responseVersion,
        responseRevision: 1,
        lifecycleStatus: done.lifecycleStatus || 'itinerary_ready',
        contentHash: done.contentHash ?? null,
        itineraryHash: done.itineraryHash,
        id: 2,
      },
    ];
    return {
      done,
      resolution: resolveCanonicalResponsePersistence({
        incomingPlan: done.canonicalPlan,
        incomingConversation: putConversation,
        existingPlan: postPlan,
        existingConversation: postConversation,
      }),
    };
  }

  it('documents POST vs PUT field delta that caused same_version_different_hash', () => {
    expect(postPlan.contentHash).toBe(hashPayload(''));
    expect(postPlan.responseRevision).toBe(1);

    const { resolution } = buildBuggyTerminalPut();
    expect(resolution.outcome).toBe('conflict');
    expect(resolution.reason).toBe('same_version_different_hash');
    expect(resolution.success).toBe(false);

    expect(resolution.storedIdentity).toMatchObject({
      responseId: RID,
      responseVersion: 1,
      responseRevision: 1,
      contentHash: hashPayload(''),
      itineraryHash: outbound.response.itineraryHash,
    });
    expect(resolution.incomingIdentity).toMatchObject({
      responseId: RID,
      responseVersion: 1,
      responseRevision: 1,
      contentHash: null,
      itineraryHash: outbound.response.itineraryHash,
    });
  });

  it('accepts an identical revision-1 rewrite as idempotent (no conflict)', () => {
    const resolution = resolveCanonicalResponsePersistence({
      incomingPlan: postPlan,
      incomingConversation: postConversation,
      existingPlan: postPlan,
      existingConversation: postConversation,
    });
    expect(resolution.outcome).toBe('idempotent');
    expect(resolution.reason).toBe('identical_write');
    expect(resolution.success).toBe(true);
    expect(resolution.writeResponseCoupled).toBe(false);
  });
});
