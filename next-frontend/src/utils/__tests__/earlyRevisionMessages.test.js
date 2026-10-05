import { describe, it, expect } from 'vitest';
import {
  STORED_PROSE_PENDING_LABEL,
  upsertItineraryTurn,
  updateProseTurn,
  applyPendingLabel,
  resolveAssistantPresentation,
} from '@/utils/earlyRevisionMessages';

const RID = 'resp-1';
const ITIN_HASH = 'hash-1';
const DAYS = [{ day: 1, title: 'Arrive', stops: [] }];

const userMsg = { id: 1, role: 'user', content: 'Plan me 3 days in Zion' };

const rev1Effect = {
  mode: 'upsert',
  responseId: RID,
  responseVersion: 2,
  itineraryHash: ITIN_HASH,
  content: '',
  pendingProse: true,
  response: {
    responseId: RID,
    responseVersion: 2,
    responseRevision: 1,
    lifecycleStatus: 'itinerary_ready',
    content: '',
    contentHash: 'empty',
    itineraryHash: ITIN_HASH,
    provider: 'claude',
    model: 'claude-model',
  },
  canonicalPlan: { responseId: RID, itineraryHash: ITIN_HASH, days: DAYS, parkName: 'Zion' },
};

const rev2Effect = {
  mode: 'update',
  responseId: RID,
  responseVersion: 2,
  itineraryHash: ITIN_HASH,
  content: 'Here are your trip notes.',
  pendingProse: false,
  response: {
    responseId: RID,
    responseVersion: 2,
    responseRevision: 2,
    lifecycleStatus: 'prose_ready',
    content: 'Here are your trip notes.',
    contentHash: 'prose',
    itineraryHash: ITIN_HASH,
  },
  canonicalPlan: { responseId: RID, itineraryHash: ITIN_HASH, days: DAYS, parkName: 'Zion' },
};

describe('upsertItineraryTurn', () => {
  it('appends exactly one assistant turn carrying the canonical identity', () => {
    const next = upsertItineraryTurn([userMsg], rev1Effect);

    expect(next).toHaveLength(2);
    const assistant = next[1];
    expect(assistant.role).toBe('assistant');
    expect(assistant.responseId).toBe(RID);
    expect(assistant.responseRevision).toBe(1);
    expect(assistant.itineraryHash).toBe(ITIN_HASH);
    expect(assistant.content).toBe('');
    expect(assistant.pendingProse).toBe(true);
    expect(assistant.itineraryPlan).toBe(rev1Effect.canonicalPlan);
  });

  it('does not duplicate the user message', () => {
    const next = upsertItineraryTurn([userMsg], rev1Effect);
    expect(next.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(next[0]).toBe(userMsg);
  });

  it('updates in place instead of appending when the responseId is already present', () => {
    const once = upsertItineraryTurn([userMsg], rev1Effect);
    const twice = upsertItineraryTurn(once, rev1Effect);

    expect(twice).toHaveLength(2);
    expect(twice.filter((m) => m.responseId === RID)).toHaveLength(1);
  });

  it('carries structured travel logistics with the assistant turn', () => {
    const travelLogistics = {
      schemaVersion: 1,
      transport: { airportsStatus: 'available', airports: [] },
      stays: {},
    };
    const next = upsertItineraryTurn([userMsg], {
      ...rev1Effect,
      response: { ...rev1Effect.response, travelLogistics },
    });

    expect(next[1].travelLogistics).toBe(travelLogistics);
  });

  it('carries the server-authored manifest with revision one', () => {
    const intent = { primaryIntent: 'simple_itinerary' };
    const presentation = {
      schemaVersion: 1,
      presentationKind: 'itinerary',
      refinement: { isRefinement: false, changes: [] },
      primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
      supportingModules: [],
      prosePolicy: 'supplemental_only',
      ending: { caveat: null, beforeYouGo: 'Check conditions.', followups: [] },
    };
    const next = upsertItineraryTurn([userMsg], {
      ...rev1Effect,
      response: { ...rev1Effect.response, intent, presentation },
    });

    expect(next[1]).toMatchObject({ intent, presentation });
  });

  it('replaces a live streaming placeholder rather than adding beside it', () => {
    const streaming = { id: 99, role: 'assistant', content: 'partial…', isStreaming: true };
    const next = upsertItineraryTurn([userMsg, streaming], rev1Effect);

    expect(next).toHaveLength(2);
    expect(next[1].responseId).toBe(RID);
    expect(next[1].isStreaming).toBe(false);
  });
});

describe('updateProseTurn', () => {
  const withCard = upsertItineraryTurn([userMsg], rev1Effect);

  it('fills content without changing conversation length', () => {
    const next = updateProseTurn(withCard, rev2Effect);

    expect(next).toHaveLength(withCard.length);
    expect(next[1].content).toBe('Here are your trip notes.');
    expect(next[1].pendingProse).toBe(false);
  });

  it('keeps the same assistant turn identity', () => {
    const next = updateProseTurn(withCard, rev2Effect);
    expect(next[1].id).toBe(withCard[1].id);
    expect(next[1].responseId).toBe(RID);
    expect(next[1].timestamp).toBe(withCard[1].timestamp);
  });

  it('cannot replace itinerary data or the card key', () => {
    const tampered = {
      ...rev2Effect,
      canonicalPlan: { responseId: RID, itineraryHash: 'other-hash', days: [{ day: 9 }] },
    };
    const next = updateProseTurn(withCard, tampered);

    expect(next[1].itineraryHash).toBe(ITIN_HASH);
    expect(next[1].itineraryPlan).toBe(withCard[1].itineraryPlan);
  });

  it('reuses the byte-equivalent stored plan object rather than a rebuilt one', () => {
    const equivalent = { ...rev2Effect, canonicalPlan: { ...rev1Effect.canonicalPlan } };
    const next = updateProseTurn(withCard, equivalent);
    expect(next[1].itineraryPlan).toBe(withCard[1].itineraryPlan);
  });

  it('never appends when the responseId is missing from the conversation', () => {
    const next = updateProseTurn([userMsg], rev2Effect);
    expect(next).toHaveLength(1);
    expect(next).toBe(next);
  });

  it('does not duplicate the user message', () => {
    const next = updateProseTurn(withCard, rev2Effect);
    expect(next.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('advances the stored revision to 2', () => {
    const next = updateProseTurn(withCard, rev2Effect);
    expect(next[1].responseRevision).toBe(2);
    expect(next[1].lifecycleStatus).toBe('prose_ready');
  });

  it('adds terminal travel logistics without replacing the itinerary', () => {
    const travelLogistics = {
      schemaVersion: 1,
      transport: { routeLegsStatus: 'available', routeLegs: [] },
      stays: {},
    };
    const next = updateProseTurn(withCard, {
      ...rev2Effect,
      response: { ...rev2Effect.response, travelLogistics },
    });

    expect(next[1].travelLogistics).toBe(travelLogistics);
    expect(next[1].itineraryPlan).toBe(withCard[1].itineraryPlan);
  });
});

describe('applyPendingLabel', () => {
  const withCard = upsertItineraryTurn([userMsg], rev1Effect);

  it('sets a presentation-only label on the matching turn', () => {
    const next = applyPendingLabel(withCard, { responseId: RID, label: 'Preparing trip notes…' });
    expect(next[1].pendingProseLabel).toBe('Preparing trip notes…');
    expect(next[1].content).toBe('');
  });

  it('leaves other turns untouched', () => {
    const next = applyPendingLabel(withCard, { responseId: 'someone-else', label: 'x' });
    expect(next).toBe(withCard);
  });
});

describe('resolveAssistantPresentation — stored revision-1 rendering', () => {
  it('shows the card with no incomplete-notes chrome and no empty prose bubble', () => {
    const stored = {
      role: 'assistant',
      responseId: RID,
      responseRevision: 1,
      lifecycleStatus: 'itinerary_ready',
      content: '',
      itineraryHash: ITIN_HASH,
    };

    expect(resolveAssistantPresentation(stored)).toEqual({
      showProseBubble: false,
      pendingLabel: null,
    });
  });

  it('preserves an in-flight preparing label when present', () => {
    const stored = {
      role: 'assistant',
      responseId: RID,
      responseRevision: 1,
      lifecycleStatus: 'itinerary_ready',
      content: '',
      itineraryHash: ITIN_HASH,
      pendingProseLabel: STORED_PROSE_PENDING_LABEL,
    };

    expect(resolveAssistantPresentation(stored)).toEqual({
      showProseBubble: false,
      pendingLabel: STORED_PROSE_PENDING_LABEL,
    });
  });

  it('renders a completed revision-2 response normally', () => {
    const stored = {
      role: 'assistant',
      responseId: RID,
      responseRevision: 2,
      lifecycleStatus: 'prose_ready',
      content: 'Full notes.',
    };

    expect(resolveAssistantPresentation(stored)).toEqual({
      showProseBubble: true,
      pendingLabel: null,
    });
  });

  it('renders a legacy response with no revision fields normally', () => {
    expect(resolveAssistantPresentation({ role: 'assistant', content: 'Legacy answer.' })).toEqual({
      showProseBubble: true,
      pendingLabel: null,
    });
  });

  it('prefers the live label while a turn is mid-flight', () => {
    const live = {
      role: 'assistant',
      responseId: RID,
      responseRevision: 1,
      lifecycleStatus: 'itinerary_ready',
      content: '',
      pendingProse: true,
      pendingProseLabel: 'Preparing trip notes…',
    };

    expect(resolveAssistantPresentation(live)).toEqual({
      showProseBubble: false,
      pendingLabel: 'Preparing trip notes…',
    });
  });

  it('never hides a bubble that has content, whatever the revision says', () => {
    const odd = {
      role: 'assistant',
      responseRevision: 1,
      lifecycleStatus: 'itinerary_ready',
      content: 'unexpected but present',
    };
    expect(resolveAssistantPresentation(odd).showProseBubble).toBe(true);
  });
});

describe('full-turn identity invariants', () => {
  it('one responseId yields one assistant turn and one plan across both revisions', () => {
    let messages = [userMsg];
    messages = upsertItineraryTurn(messages, rev1Effect);
    messages = applyPendingLabel(messages, { responseId: RID, label: 'Preparing trip notes…' });
    const lengthBeforeProse = messages.length;
    const cardBefore = messages[1].itineraryPlan;

    messages = updateProseTurn(messages, rev2Effect);

    expect(messages).toHaveLength(lengthBeforeProse);
    expect(messages.filter((m) => m.responseId === RID)).toHaveLength(1);
    expect(messages.filter((m) => m.itineraryPlan)).toHaveLength(1);
    expect(messages[1].itineraryPlan).toBe(cardBefore);
    expect(messages[1].itineraryHash).toBe(ITIN_HASH);
    expect(messages[1].pendingProseLabel).toBe(null);
  });
});
