import { describe, expect, it } from 'vitest';
import { derivePlanAiHeaderMeta, resolvePlanningParkName, PLAN_AI_ENTRY } from '@/lib/planAiHeaderMeta';

function assistantTurn(parkCode, parkName, activeContextAction) {
  return {
    role: 'assistant',
    activeTripPresentation: {
      destination: parkCode || parkName ? { parkCode, parkName } : null,
      activeContextAction,
    },
  };
}

describe('derivePlanAiHeaderMeta', () => {
  it('keeps a stable general title without Planning… subtitle', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.GENERAL,
      hasUserMessages: false,
    });

    expect(meta.title).toBe('Trailie');
    expect(meta.subtitle).toBeNull();
  });

  it('does not echo Planning in subtitle when a park is active', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.GENERAL,
      hasUserMessages: true,
      resolvedParkName: 'Yosemite National Park',
    });

    expect(meta.title).toBe('Planning Yosemite');
    expect(meta.subtitle).toBeNull();
  });

  it('uses trip dates as subtitle when available', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.PARK,
      parkName: 'Zion National Park',
      formData: { startDate: '2026-07-20', endDate: '2026-07-23' },
    });

    expect(meta.title).toBe('Planning Zion');
    expect(meta.subtitle).toMatch(/Jul/);
    expect(meta.subtitle).not.toMatch(/Planning/i);
  });

  it('keeps road-trip park hint instead of a Planning… status', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.ROAD_TRIP,
      suggestText: 'Yosemite to Sequoia',
    });

    expect(meta.title).toBe("Let's plan a road trip");
    expect(meta.subtitle).toBe('Yosemite to Sequoia');
  });

  it('uses chat-history title without Planning… subtitle', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.CHAT_HISTORY,
      resolvedParkName: 'Acadia National Park',
    });

    expect(meta.title).toBe('Planning Acadia');
    expect(meta.subtitle).toBeNull();
  });
});

/**
 * WP-TU Phase 3 Task 8 — bug 1: the traveler-facing header must reflect the
 * AUTHORITATIVE active-trip destination (`activeTripPresentation`, Task 7B),
 * not the sticky `selectedParkName`/URL/wizard prop. `selectedParkName` is a
 * fallback for the genuinely-empty-turn case only.
 */
describe('resolvePlanningParkName — authoritative destination over sticky selectedParkName', () => {
  // 1. selectedParkName=Redwood, authoritative active destination=Badlands -> Badlands
  it('case 1: an authoritative Badlands destination outranks selectedParkName=Redwood', () => {
    const result = resolvePlanningParkName({
      parkName: 'Redwood National Park',
      messages: [assistantTurn('badl', 'Badlands National Park', 'set')],
    });
    expect(result).toBe('Badlands National Park');
  });

  // 2. selectedParkName=Redwood, active destination=Redwood, current subject=Acadia -> Redwood
  it('case 2: a side-query about Acadia while Redwood is active keeps header Redwood', () => {
    const result = resolvePlanningParkName({
      parkName: 'Redwood National Park',
      // The backend already resolved this turn's activeTripPresentation to
      // Redwood (Task 7's preserve gating) even though the turn asked about
      // Acadia — the header never re-derives this itself.
      messages: [assistantTurn('redw', 'Redwood National Park', 'preserve')],
    });
    expect(result).toBe('Redwood National Park');
  });

  // 3. Acadia continuation ("What about November?") -> header still Redwood
  it('case 3: an Acadia continuation follow-up still keeps header Redwood', () => {
    const result = resolvePlanningParkName({
      parkName: 'Redwood National Park',
      messages: [
        assistantTurn('redw', 'Redwood National Park', 'preserve'),
        assistantTurn('redw', 'Redwood National Park', 'preserve'),
      ],
    });
    expect(result).toBe('Redwood National Park');
  });

  // 4. historical Redwood edit while Badlands active -> header Badlands
  it('case 4: a historical Redwood edit turn while Badlands is active keeps header Badlands', () => {
    const result = resolvePlanningParkName({
      parkName: 'Badlands National Park',
      messages: [assistantTurn('badl', 'Badlands National Park', 'preserve')],
    });
    expect(result).toBe('Badlands National Park');
  });

  // 5. no authoritative active destination yet + initial park CTA Zion -> Zion seeds header
  it('case 5: a genuinely empty turn (no messages) still seeds the header from selectedParkName', () => {
    const result = resolvePlanningParkName({ parkName: 'Zion National Park', messages: [] });
    expect(result).toBe('Zion National Park');
  });

  it('backward-compat: a restored/legacy message with no activeTripPresentation still resolves via parkName', () => {
    const result = resolvePlanningParkName({
      parkName: '',
      messages: [{ role: 'assistant', parkName: 'Glacier National Park' }],
    });
    expect(result).toBe('Glacier National Park');
  });

  it('backward-compat: legacy parkNames array (single entry) still resolves when nothing else is available', () => {
    const result = resolvePlanningParkName({
      parkName: '',
      messages: [{ role: 'assistant', parkNames: ['Denali National Park'] }],
    });
    expect(result).toBe('Denali National Park');
  });

  it('activeTripPresentation with destination:null on the latest turn falls through to an earlier authoritative turn', () => {
    const result = resolvePlanningParkName({
      parkName: '',
      messages: [
        assistantTurn('redw', 'Redwood National Park', 'set'),
        assistantTurn(null, null, 'preserve'),
      ],
    });
    expect(result).toBe('Redwood National Park');
  });

  // Regression sequence — proves genuine synchronization, not a different
  // sticky value: Redwood active -> ask Acadia -> header stays Redwood ->
  // "Plan Badlands instead" -> header changes to Badlands.
  it('regression sequence: Redwood -> Acadia side-query (stays Redwood) -> switch to Badlands (changes)', () => {
    const afterAcadiaSideQuery = resolvePlanningParkName({
      parkName: 'Redwood National Park',
      messages: [assistantTurn('redw', 'Redwood National Park', 'preserve')],
    });
    expect(afterAcadiaSideQuery).toBe('Redwood National Park');

    const afterSwitch = resolvePlanningParkName({
      parkName: 'Redwood National Park',
      messages: [
        assistantTurn('redw', 'Redwood National Park', 'preserve'),
        assistantTurn('badl', 'Badlands National Park', 'set'),
      ],
    });
    expect(afterSwitch).toBe('Badlands National Park');
  });
});

/**
 * WP-TU Phase 3 Task 8 — bug 2: raw `formData.groupSize` has no provenance
 * check. Reuses the EXISTING P0-4 mechanism (`formDataProvenance.js`) rather
 * than inventing a second one.
 */
describe('derivePlanAiHeaderMeta subtitle — traveler-count provenance (P0-4 reuse)', () => {
  // 6. raw default groupSize=2, not traveler-owned -> no "2 travelers"
  it('case 6: an un-owned default groupSize never renders as "N travelers"', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.PARK,
      parkName: 'Zion National Park',
      formData: { groupSize: 2, fieldProvenance: {} },
    });
    expect(meta.subtitle).toBeNull();
  });

  // 7. explicitly owned groupSize=2 -> "2 travelers"
  it('case 7: a traveler-owned groupSize renders as "N travelers"', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.PARK,
      parkName: 'Zion National Park',
      formData: { groupSize: 2, fieldProvenance: { groupSize: 'user' } },
    });
    expect(meta.subtitle).toBe('2 travelers');
  });

  // 8. restored traveler-owned party size survives restore
  it('case 8: restored form data with no provenance map (legacy/saved-trip shape) still shows the count', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.PARK,
      parkName: 'Zion National Park',
      formData: { groupSize: 3 },
    });
    expect(meta.subtitle).toBe('3 travelers');
  });

  // 9. destination switch must not wipe dates/subtitle/other legitimate fields
  it('case 9: a destination switch does not disturb an unrelated, legitimate date subtitle', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.PARK,
      resolvedParkName: 'Badlands National Park',
      formData: { startDate: '2026-07-20', endDate: '2026-07-23', groupSize: 2, fieldProvenance: {} },
    });
    expect(meta.title).toBe('Planning Badlands');
    expect(meta.subtitle).toMatch(/Jul/);
    expect(meta.subtitle).not.toMatch(/travelers/);
  });

  // 10. the subtitle logic uses synchronized/provenance-checked state, not
  // stale entry-seeded defaults, regardless of which destination is active.
  it('case 10: an entry-seeded (non-owned) groupSize stays excluded even when the active destination has since changed', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.PARK,
      resolvedParkName: 'Badlands National Park',
      formData: { groupSize: 2, fieldProvenance: {} },
    });
    expect(meta.title).toBe('Planning Badlands');
    expect(meta.subtitle).toBeNull();
  });
});
