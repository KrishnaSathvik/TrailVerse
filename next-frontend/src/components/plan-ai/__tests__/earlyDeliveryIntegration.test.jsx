import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import React, { useMemo, useRef, useState } from 'react';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';
import {
  upsertItineraryTurn,
  updateProseTurn,
  applyPendingLabel,
  resolveAssistantPresentation,
} from '@/utils/earlyRevisionMessages';
import { resolveItineraryOnlyTerminalPersistence } from '@/utils/itineraryOnlyTerminalPersistence';
import EarlyItineraryCard from '@/components/plan-ai/EarlyItineraryCard';

const RID = 'resp-integration';
const ITIN_HASH = 'itin-hash-integration';
const DAYS = [
  { id: 'd1', day: 1, title: 'Canyon floor', stops: [{ id: 's1', name: 'Visitor Center' }] },
  { id: 'd2', day: 2, title: 'Angels Landing', stops: [{ id: 's2', name: 'Scout Lookout' }] },
];

vi.mock('@/components/shared-trip/SharedTripDayCard', () => ({
  default: ({ day }) => <div data-testid="day">{day.title}</div>,
}));

const started = { type: 'response_started', responseId: RID, requiresStructuredItinerary: null };

const itineraryReady = () => ({
  type: 'itinerary_ready',
  response: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: 'itinerary_ready',
    content: '',
    contentHash: 'hash-empty',
    itineraryData: { days: DAYS },
    itineraryHash: ITIN_HASH,
  },
  canonicalPlan: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 1,
    itineraryHash: ITIN_HASH,
    parkName: 'Zion National Park',
    days: DAYS,
    feasibilityIssues: [],
  },
});

const proseReady = () => ({
  type: 'prose_ready',
  expectedPreviousRevision: 1,
  response: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 2,
    previousRevision: 1,
    lifecycleStatus: 'prose_ready',
    content: 'Two days in Zion, paced for a first visit.',
    contentHash: 'hash-prose',
    itineraryData: { days: DAYS },
    itineraryHash: ITIN_HASH,
  },
  canonicalPlan: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 2,
    itineraryHash: ITIN_HASH,
    parkName: 'Zion National Park',
    days: DAYS,
    feasibilityIssues: [],
  },
});

const doneEvent = () => ({
  type: 'done',
  responseId: RID,
  responseVersion: 1,
  content: 'Two days in Zion, paced for a first visit.',
  contentHash: 'hash-prose',
  itineraryHash: ITIN_HASH,
  canonicalPlan: proseReady().canonicalPlan,
});

/**
 * Mirrors exactly how TripPlannerChat wires the coordinator to the message list
 * and renders each turn, so what this test proves holds in the real component.
 */
function Harness({ writers, onCardMount, onMessages }) {
  const [messages, setMessages] = useState([{ id: 1, role: 'user', content: 'Plan 2 days in Zion' }]);
  const coordRef = useRef(null);

  const coordinator = useMemo(() => {
    if (coordRef.current) return coordRef.current;
    coordRef.current = createEarlyRevisionCoordinator({
      ...writers,
      view: {
        setTripId: () => {},
        revealItinerary: (effect) => setMessages((prev) => upsertItineraryTurn(prev, effect)),
        revealProse: (effect) => setMessages((prev) => updateProseTurn(prev, effect)),
        // Mirrors TripPlannerChat's revealTerminal exactly.
        revealTerminal: (effect) => {
          const done = effect.done || {};
          const lifecycle = done.lifecycleStatus || null;
          const isProseSuccessor = lifecycle === 'prose_ready' || lifecycle === 'fallback_complete';
          const turn = {
            mode: 'upsert',
            responseId: done.responseId,
            responseVersion: done.responseVersion,
            itineraryHash: done.itineraryHash,
            response: done,
            canonicalPlan: done.canonicalPlan,
          };
          setMessages((prev) => {
            const existing = prev.find(
              (m) => m.role === 'assistant' && m.responseId === done.responseId
            );
            if (
              existing?.responseRevision === 1
              && existing?.itineraryPlan
              && !isProseSuccessor
            ) {
              return applyPendingLabel(prev, { responseId: done.responseId, label: null });
            }
            return updateProseTurn(upsertItineraryTurn(prev, turn), {
              ...turn,
              mode: 'update',
              content: done.content ?? '',
              forceRevision2: Boolean((done.content || '').trim()),
            });
          });
        },
        setPendingLabel: (effect) => setMessages((prev) => applyPendingLabel(prev, effect)),
        onContractError: () => {},
        onComplete: () => {},
      },
    });
    return coordRef.current;
  }, [writers]);

  onMessages?.(messages);
  Harness.coordinator = coordinator;

  return (
    <div>
      {messages.map((message, index) => {
        const presentation = resolveAssistantPresentation(message);
        return (
          <React.Fragment key={message.id || index}>
            {presentation.showProseBubble ? (
              <p data-testid={`bubble-${message.role}`}>{message.content}</p>
            ) : null}
            {message.itineraryPlan ? (
              <EarlyItineraryCard
                key={message.itineraryHash}
                plan={message.itineraryPlan}
                pendingLabel={presentation.pendingLabel}
                onMount={onCardMount}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function setup({ persistRevision1, persistRevision2, persistTerminal } = {}) {
  const onCardMount = vi.fn();
  let latest = [];
  const writers = {
    persistRevision1: persistRevision1 || vi.fn(async () => ({ ok: true, tripId: 'trip-1' })),
    persistRevision2: persistRevision2 || vi.fn(async () => ({ ok: true })),
    // Default matches TripPlannerChat Fix Pass #3B: itinerary_only_complete is NO-OP.
    persistTerminal: persistTerminal || vi.fn(async (effect) => {
      const settled = resolveItineraryOnlyTerminalPersistence({
        reason: effect.reason,
        tripId: 'trip-1',
      });
      if (!settled.shouldWrite) return settled.result;
      return { ok: true, tripId: 'trip-1' };
    }),
    legacyTerminal: vi.fn(),
  };
  render(<Harness writers={writers} onCardMount={onCardMount} onMessages={(m) => { latest = m; }} />);
  return { coordinator: Harness.coordinator, onCardMount, writers, messages: () => latest };
}

describe('early delivery, end to end through the real reducers and card', () => {
  it('shows the card only after revision 1 is durable, and prose only after revision 2', async () => {
    const { coordinator, writers } = setup();

    await act(async () => {
      coordinator.handleEvent(started);
    });
    expect(screen.queryAllByTestId('day')).toHaveLength(0);

    await act(async () => {
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
    });

    expect(writers.persistRevision1).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.getByText('Preparing trip notes…')).toBeInTheDocument();
    expect(screen.queryByTestId('bubble-assistant')).not.toBeInTheDocument();

    await act(async () => {
      coordinator.handleEvent({ type: 'prose_generation_started', responseId: RID });
      coordinator.handleEvent(proseReady());
      await coordinator.drain();
    });

    expect(writers.persistRevision2).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('bubble-assistant')).toHaveTextContent(
      'Two days in Zion, paced for a first visit.'
    );
    expect(screen.queryByText('Preparing trip notes…')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('day')).toHaveLength(2);
  });

  it('does not remount the itinerary card when prose arrives', async () => {
    const { coordinator, onCardMount } = setup();

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
    });
    expect(onCardMount).toHaveBeenCalledTimes(1);

    await act(async () => {
      coordinator.handleEvent(proseReady());
      await coordinator.drain();
    });

    expect(onCardMount).toHaveBeenCalledTimes(1);
  });

  it('keeps the card after response_finalized arrives typed as done (v2 terminal)', async () => {
    const { coordinator, onCardMount, messages } = setup();

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
    });
    expect(onCardMount).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('day')).toHaveLength(2);

    // Mirror TripPlannerChat: spread transport payload then force type:'done'.
    const finalized = {
      type: 'response_finalized',
      responseId: RID,
      responseVersion: 1,
      content: 'Two days in Zion, paced for a first visit.',
      itineraryHash: ITIN_HASH,
      itineraryData: itineraryReady().canonicalPlan,
    };
    await act(async () => {
      coordinator.handleEvent({
        ...finalized,
        type: 'done',
        canonicalPlan: finalized.canonicalPlan || finalized.itineraryData || finalized.itinerary || null,
      });
      await coordinator.drain();
    });

    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(onCardMount).toHaveBeenCalledTimes(1);
    expect(messages().find((m) => m.itineraryPlan)?.itineraryPlan.days).toHaveLength(2);
  });

  it('rejects a thin v2 itinerary_ready envelope and does not mount the card', async () => {
    const { coordinator, onCardMount } = setup();

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent({
        type: 'itinerary_ready',
        response: { itineraryHash: ITIN_HASH },
        canonicalPlan: { days: DAYS },
      });
      await coordinator.drain();
    });

    expect(onCardMount).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId('day')).toHaveLength(0);
  });

  it('mounts the card when response identity/version match Stage-14 revision 1', async () => {
    const { coordinator, onCardMount } = setup();
    const ready = itineraryReady();
    ready.response.responseVersion = 4;
    ready.canonicalPlan.responseVersion = 4;

    await act(async () => {
      coordinator.handleEvent({ ...started, responseId: RID });
      // response_started already set responseId; version comes from itinerary_ready
      coordinator.handleEvent(ready);
      await coordinator.drain();
    });

    expect(onCardMount).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('day')).toHaveLength(2);
  });

  it('does not append a second assistant turn or duplicate the user message', async () => {
    const { coordinator, messages } = setup();

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
    });
    const afterCard = messages().length;

    await act(async () => {
      coordinator.handleEvent(proseReady());
      await coordinator.drain();
      coordinator.handleEvent(doneEvent());
      await coordinator.drain();
    });

    expect(messages()).toHaveLength(afterCard);
    expect(messages().filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(messages().filter((m) => m.role === 'user')).toHaveLength(1);
    expect(messages().filter((m) => m.itineraryPlan)).toHaveLength(1);
    expect(messages()[1].responseId).toBe(RID);
  });

  it('never shows the card when revision-1 persistence fails', async () => {
    const { coordinator } = setup({
      persistRevision1: vi.fn(async () => ({ ok: false, outcome: 'CONFLICT' })),
    });

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      coordinator.handleEvent(proseReady());
      await coordinator.drain();
    });

    expect(screen.queryAllByTestId('day')).toHaveLength(0);
    expect(screen.queryByTestId('bubble-assistant')).not.toBeInTheDocument();
  });

  it('keeps the card and hides prose when revision-2 persistence fails', async () => {
    const { coordinator } = setup({
      persistRevision2: vi.fn(async () => ({ ok: false, outcome: 'CONFLICT' })),
    });

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
      coordinator.handleEvent(proseReady());
      await coordinator.drain();
    });

    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.queryByTestId('bubble-assistant')).not.toBeInTheDocument();
  });

  it('settles itinerary_ready → response_finalized without prose_ready as complete success', async () => {
    const { coordinator } = setup();

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
      coordinator.handleEvent({
        type: 'done',
        ok: true,
        responseId: RID,
        responseVersion: 1,
        itineraryHash: ITIN_HASH,
        content: '',
        canonicalPlan: itineraryReady().canonicalPlan,
      });
      await coordinator.drain();
    });

    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.queryByText('Trip notes were not completed.')).not.toBeInTheDocument();
    expect(screen.queryByText('Preparing trip notes…')).not.toBeInTheDocument();
  });

  /**
   * Probe A retest shape (Fix Pass #3B):
   * response_started → itinerary_ready → content_delta display → response_finalized
   * with display content and NO contentHash / responseRevision on the terminal.
   * Pre-fix persistTerminal that mutates same-version identity left the pending
   * label stuck; NO-OP itinerary_only_complete settles cleanly.
   */
  it('Probe A replay: display-only response_finalized clears pending notes without a conflicting write', async () => {
    let writeCount = 0;
    const persistTerminal = vi.fn(async (effect) => {
      const settled = resolveItineraryOnlyTerminalPersistence({
        reason: effect.reason,
        tripId: 'trip-probe-a',
      });
      if (!settled.shouldWrite) return settled.result;
      writeCount += 1;
      // Simulate the pre-fix PUT conflict if a write were attempted.
      return { ok: false, outcome: 'conflict' };
    });
    const { coordinator, writers } = setup({ persistTerminal });

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
    });
    expect(screen.getByText('Preparing trip notes…')).toBeInTheDocument();
    expect(writers.persistRevision1).toHaveBeenCalledTimes(1);

    // Display-only content_delta is presentation; coordinator suppresses legacy chunks.
    expect(coordinator.shouldRenderLegacyChunk()).toBe(false);

    await act(async () => {
      coordinator.handleEvent({
        type: 'done',
        responseId: RID,
        responseVersion: 1,
        // Probe A: display text present, identity stamps absent (no contentHash / revision).
        content: '**At a glance**\nDay 1 · Las Vegas to Valley of Fire…',
        contentUnchanged: true,
        itineraryHash: ITIN_HASH,
        canonicalPlan: { days: DAYS, parkName: 'Valley of Fire State Park' },
      });
      await coordinator.drain();
    });

    expect(writers.persistTerminal).toHaveBeenCalledTimes(1);
    expect(writers.persistTerminal.mock.calls[0][0].reason).toBe('itinerary_only_complete');
    expect(writeCount).toBe(0);
    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.queryByText('Preparing trip notes…')).not.toBeInTheDocument();
    expect(screen.queryByText('Trip notes were not completed.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bubble-assistant')).not.toBeInTheDocument();
  });

  it('Probe A regression: conflicting terminal persist leaves Preparing trip notes visible', async () => {
    const persistTerminal = vi.fn(async () => ({ ok: false, outcome: 'conflict' }));
    const { coordinator } = setup({ persistTerminal });

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
      coordinator.handleEvent({
        type: 'done',
        responseId: RID,
        responseVersion: 1,
        content: 'Display-only finalize text',
        itineraryHash: ITIN_HASH,
        canonicalPlan: { days: DAYS },
      });
      await coordinator.drain();
    });

    expect(screen.getByText('Preparing trip notes…')).toBeInTheDocument();
    expect(screen.getAllByTestId('day')).toHaveLength(2);
  });

  it('shows a bounded incomplete label after a disconnect', async () => {
    const { coordinator } = setup();

    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
      coordinator.handleEvent({ type: 'stream_aborted' });
    });

    expect(screen.getByText('Trip notes were not completed.')).toBeInTheDocument();
    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.queryByTestId('bubble-assistant')).not.toBeInTheDocument();
  });
});

describe('restore compatibility', () => {
  function StoredTurn({ message }) {
    const presentation = resolveAssistantPresentation(message);
    return (
      <>
        {presentation.showProseBubble ? <p data-testid="bubble">{message.content}</p> : null}
        {message.itineraryPlan ? (
          <EarlyItineraryCard
            key={message.itineraryHash}
            plan={message.itineraryPlan}
            pendingLabel={presentation.pendingLabel}
          />
        ) : null}
      </>
    );
  }

  it('renders a stored revision-1 trip with its card and no empty prose bubble', () => {
    render(
      <StoredTurn
        message={{
          role: 'assistant',
          responseId: RID,
          responseRevision: 1,
          lifecycleStatus: 'itinerary_ready',
          content: '',
          itineraryHash: ITIN_HASH,
          itineraryPlan: itineraryReady().canonicalPlan,
        }}
      />
    );

    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.queryByTestId('bubble')).not.toBeInTheDocument();
    expect(screen.queryByText('Trip notes pending')).not.toBeInTheDocument();
    expect(screen.queryByText('Trip notes were not completed.')).not.toBeInTheDocument();
  });

  it('renders a stored revision-2 trip normally', () => {
    render(
      <StoredTurn
        message={{
          role: 'assistant',
          responseId: RID,
          responseRevision: 2,
          lifecycleStatus: 'prose_ready',
          content: 'Full notes.',
          itineraryHash: ITIN_HASH,
          itineraryPlan: proseReady().canonicalPlan,
        }}
      />
    );

    expect(screen.getByTestId('bubble')).toHaveTextContent('Full notes.');
    expect(screen.queryByText('Trip notes pending')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('day')).toHaveLength(2);
  });
});

// ── Stage 14.3A — legacy chunk boundary, driven through the real coordinator ──

describe('legacy chunk ownership boundary, end to end', () => {
  /** Mirrors TripPlannerChat's two gates exactly. */
  function streamTurn(coordinator, events) {
    const rendered = [];
    let finalized = false;
    for (const ev of events) {
      if (ev.type === 'chunk') {
        if (coordinator.shouldRenderLegacyChunk()) rendered.push(ev.content);
      } else if (ev.type === 'stream_end') {
        finalized = coordinator.shouldFinalizeLegacyStream();
      } else {
        coordinator.handleEvent(ev);
      }
    }
    return { rendered, finalized };
  }

  it('renders prose-only chunks when response_started arrived but no itinerary_ready did', async () => {
    const { coordinator, writers } = setup();

    const out = streamTurn(coordinator, [
      started,
      { type: 'thinking', stage: 'planning' },
      { type: 'chunk', content: 'Zion is ' },
      { type: 'chunk', content: 'busy in June.' },
      { type: 'stream_end' },
      doneEvent(),
    ]);
    await act(async () => {
      await coordinator.drain();
    });

    expect(out.rendered).toEqual(['Zion is ', 'busy in June.']);
    expect(out.finalized).toBe(true);
    expect(writers.legacyTerminal).toHaveBeenCalledTimes(1);
    expect(writers.persistRevision1).not.toHaveBeenCalled();
    expect(writers.persistTerminal).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId('day')).toHaveLength(0);
    expect(coordinator.getMetrics().suppressedLegacyChunkCount).toBe(0);
  });

  it('suppresses every chunk after a valid itinerary_ready, in real event order', async () => {
    const { coordinator, writers } = setup();
    let out;

    await act(async () => {
      out = streamTurn(coordinator, [
        started,
        itineraryReady(),
        { type: 'prose_generation_started', responseId: RID },
        { type: 'chunk', content: 'Two days ' },
        { type: 'chunk', content: 'in Zion.' },
        { type: 'stream_end' },
      ]);
      await coordinator.drain();
    });

    expect(out.rendered).toEqual([]);
    expect(out.finalized).toBe(false);
    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.queryByTestId('bubble-assistant')).not.toBeInTheDocument();

    await act(async () => {
      coordinator.handleEvent(proseReady());
      await coordinator.drain();
    });

    expect(screen.getByTestId('bubble-assistant')).toHaveTextContent(
      'Two days in Zion, paced for a first visit.'
    );
    expect(writers.persistRevision1).toHaveBeenCalledTimes(1);
    expect(writers.persistRevision2).toHaveBeenCalledTimes(1);
    expect(coordinator.getMetrics().suppressedLegacyChunkCount).toBe(2);
    expect(coordinator.getMetrics().suppressedLegacyStreamEndCount).toBe(1);
  });

  it('shows no prose bubble while chunks arrive during a slow revision-1 save', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const { coordinator } = setup({
      persistRevision1: vi.fn(async () => { await gate; return { ok: true, tripId: 'trip-1' }; }),
    });

    let out;
    await act(async () => {
      out = streamTurn(coordinator, [
        started,
        itineraryReady(),
        { type: 'chunk', content: 'Two days ' },
        { type: 'chunk', content: 'in Zion.' },
        { type: 'stream_end' },
        proseReady(),
        doneEvent(),
      ]);
    });

    expect(out.rendered).toEqual([]);
    expect(screen.queryAllByTestId('day')).toHaveLength(0);
    expect(screen.queryByTestId('bubble-assistant')).not.toBeInTheDocument();

    await act(async () => {
      release();
      await coordinator.drain();
    });

    expect(screen.getAllByTestId('day')).toHaveLength(2);
    expect(screen.getByTestId('bubble-assistant')).toBeInTheDocument();
  });

  it('keeps chunks suppressed after revision-1 persistence fails', async () => {
    const { coordinator, writers } = setup({
      persistRevision1: vi.fn(async () => ({ ok: false, outcome: 'CONFLICT' })),
    });

    let out;
    await act(async () => {
      coordinator.handleEvent(started);
      coordinator.handleEvent(itineraryReady());
      await coordinator.drain();
      out = streamTurn(coordinator, [
        { type: 'chunk', content: 'Two days ' },
        { type: 'stream_end' },
        doneEvent(),
      ]);
      await coordinator.drain();
    });

    expect(out.rendered).toEqual([]);
    expect(out.finalized).toBe(false);
    expect(writers.legacyTerminal).not.toHaveBeenCalled();
    expect(writers.persistTerminal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('bubble-assistant')).toBeInTheDocument();
  });

  it('fails closed on a malformed itinerary_ready: no chunks, one terminal write', async () => {
    const { coordinator, writers } = setup();
    const malformed = itineraryReady();
    malformed.response = { ...malformed.response, content: 'should have been empty' };

    let out;
    await act(async () => {
      out = streamTurn(coordinator, [
        started,
        malformed,
        { type: 'chunk', content: 'Two days ' },
        { type: 'stream_end' },
      ]);
    });

    expect(out.rendered).toEqual([]);
    expect(out.finalized).toBe(false);
    expect(screen.queryByTestId('bubble-assistant')).not.toBeInTheDocument();
    expect(writers.persistRevision1).not.toHaveBeenCalled();

    await act(async () => {
      coordinator.handleEvent(doneEvent());
      await coordinator.drain();
    });

    expect(writers.persistTerminal).toHaveBeenCalledTimes(1);
    expect(writers.legacyTerminal).not.toHaveBeenCalled();
    expect(screen.getByTestId('bubble-assistant')).toBeInTheDocument();
    expect(coordinator.getMetrics().invalidEarlyEventCount).toBe(1);
  });

  it('suppressed chunk text never reaches persisted revision content', async () => {
    const { coordinator, writers } = setup();

    await act(async () => {
      streamTurn(coordinator, [
        started,
        itineraryReady(),
        { type: 'chunk', content: 'UNPERSISTED-DRAFT-MARKER' },
        { type: 'stream_end' },
      ]);
      await coordinator.drain();
      coordinator.handleEvent(proseReady());
      await coordinator.drain();
    });

    const writes = [
      ...writers.persistRevision1.mock.calls,
      ...writers.persistRevision2.mock.calls,
    ];
    expect(writes).toHaveLength(2);
    for (const [payload] of writes) {
      expect(JSON.stringify(payload)).not.toContain('UNPERSISTED-DRAFT-MARKER');
    }
    expect(document.body.textContent).not.toContain('UNPERSISTED-DRAFT-MARKER');
  });
});
