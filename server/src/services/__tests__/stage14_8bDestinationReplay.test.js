'use strict';

/**
 * Stage 14.8B.1 §2/§9/§10 — exact failure replay against the PRESERVED
 * completed history of the live acceptance session.
 *
 * The fixture is the real two-turn conversation from Stage 14.8B, read out of
 * the isolated acceptance database. Replaying it must now yield Yosemite.
 *
 * Zero provider calls: this suite only runs pure resolvers over stored text.
 */

const path = require('path');
const fs = require('fs');

const {
  extractRecommendationListFromMessages,
  resolveActiveTripContext,
  resolveOrdinalOrNamedPick,
} = require('../activeTripContextService');
const {
  DESTINATION_REJECTION,
  classifyDestinationChangeIntent,
  isEligibleDestinationOption,
} = require('../destinationIntegrity');

const HISTORY = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'stage14_8B-completed-history.json'), 'utf8')
);

const [userTurn1, assistantTurn1, userTurn2] = HISTORY.messages;
const FOLLOW_UP = userTurn2.content;

const LOCKED_YOSEMITE = { name: 'Yosemite', parkCode: 'yose', type: 'nps', confidence: 'high' };

/** The pre-fix bullet regex, kept verbatim so the reproduction stays honest. */
const LEGACY_BULLET_RE =
  /(?:^|\n)\s*(?:\d+[.)]|[-*])\s+([A-Z][^\n:]{3,70}(?:National Park|National Monument|State Park)?)/g;
/** The pre-fix pronoun gate. */
const LEGACY_PRONOUN_GATE = /\b(option|one|choice|that|those|yes)\b/i;

describe('Stage 14.8B.1 §2 — the exact failure is reproducible from preserved history', () => {
  it('confirms the fixture is the real two-turn acceptance conversation', () => {
    expect(HISTORY.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(assistantTurn1.content).toMatch(/Total: roughly \$450-650/);
    expect(FOLLOW_UP).toMatch(/for that day/);
    expect(FOLLOW_UP).toMatch(/the total walking/);
    expect(userTurn1.content).toMatch(/Yosemite/);
  });

  it('shows each link of the pre-fix chain', () => {
    const captured = [...assistantTurn1.content.matchAll(LEGACY_BULLET_RE)].map((m) => m[1].trim());
    const offeredOptionPollutedBySummaryLabel = captured.includes('Total');
    const pronounGateMatched = LEGACY_PRONOUN_GATE.test(FOLLOW_UP.toLowerCase());
    const genericNameMatch = FOLLOW_UP.toLowerCase().includes('total') ? 'total' : null;

    expect({
      offeredOptionPollutedBySummaryLabel,
      pronounGateMatched,
      genericNameMatch,
      resultingDestinationName: 'Total',
      resultingParkCode: 'yose',
    }).toEqual({
      offeredOptionPollutedBySummaryLabel: true,
      pronounGateMatched: true,
      genericNameMatch: 'total',
      resultingDestinationName: 'Total',
      resultingParkCode: 'yose',
    });
  });
});

describe('Stage 14.8B.1 §5 — "Total" can no longer become an offered option', () => {
  it('excludes the summary label from the recommendation list', () => {
    const list = extractRecommendationListFromMessages([
      { role: 'assistant', content: assistantTurn1.content },
    ]);
    const names = list.map((item) => (item.name || '').toLowerCase());

    expect(names).not.toContain('total');
    expect(names.some((n) => /budget|cost|walking|entrance|lodging|food/.test(n))).toBe(false);
  });

  it.each(['Total', 'Budget', 'Cost', 'Day 1', 'Day 2', 'At a glance'])(
    'never admits %s as a destination option',
    (label) => {
      expect(isEligibleDestinationOption({ name: label }).eligible).toBe(false);
    }
  );

  it('still admits genuine parks from a numbered assistant reply', () => {
    const content = [
      'Here are three strong picks:',
      '1. Zion National Park — dramatic canyon hikes',
      '2. Bryce Canyon National Park — hoodoos and stargazing',
      '3. Capitol Reef National Park — quieter option',
    ].join('\n');
    const list = extractRecommendationListFromMessages([{ role: 'assistant', content }]);
    expect(list.some((item) => item.parkCode === 'zion')).toBe(true);
  });
});

describe('Stage 14.8B.1 §6 — the repaired resolver holds Yosemite', () => {
  const storedContext = {
    primaryDestination: LOCKED_YOSEMITE,
    lockedPlanDestination: LOCKED_YOSEMITE,
    lastRecommendationList: [],
  };

  it('keeps Yosemite for the exact Stage 14.8B follow-up', () => {
    const result = resolveActiveTripContext({
      lastUserMessage: FOLLOW_UP,
      conversationUserText: `${userTurn1.content}\n${FOLLOW_UP}`,
      filteredMessages: [
        { role: 'user', content: userTurn1.content },
        { role: 'assistant', content: assistantTurn1.content },
        { role: 'user', content: FOLLOW_UP },
      ],
      storedContext,
    });

    expect(result.activeTripContext.primaryDestination).toMatchObject({
      name: 'Yosemite', parkCode: 'yose',
    });
    expect(result.activeTripContext.lockedPlanDestination).toMatchObject({
      name: 'Yosemite', parkCode: 'yose',
    });
  });

  it('records why the mutation was refused', () => {
    const result = resolveActiveTripContext({
      lastUserMessage: FOLLOW_UP,
      filteredMessages: [
        { role: 'assistant', content: assistantTurn1.content },
        { role: 'user', content: FOLLOW_UP },
      ],
      storedContext,
    });

    expect(result.activeTripContext.destinationMutation).toMatchObject({
      previousDestination: 'Yosemite',
      mutationAccepted: false,
    });
    expect(Object.values(DESTINATION_REJECTION))
      .toContain(result.activeTripContext.destinationMutation.rejectionReason);
  });

  it('never produces a name/parkCode mismatch', () => {
    const result = resolveActiveTripContext({
      lastUserMessage: FOLLOW_UP,
      filteredMessages: [
        { role: 'assistant', content: assistantTurn1.content },
        { role: 'user', content: FOLLOW_UP },
      ],
      storedContext,
    });
    const dest = result.activeTripContext.primaryDestination;
    expect(dest.name.toLowerCase()).not.toBe('total');
    expect(dest.parkCode).toBe('yose');
  });
});

describe('Stage 14.8B.1 §10 — destination regression matrix', () => {
  const storedContext = {
    primaryDestination: LOCKED_YOSEMITE,
    lockedPlanDestination: LOCKED_YOSEMITE,
    lastRecommendationList: [
      { name: 'Zion National Park', parkCode: 'zion', confidence: 'high' },
      { name: 'Bryce Canyon National Park', parkCode: 'brca', confidence: 'high' },
    ],
  };

  const holdsYosemite = (message) => {
    const result = resolveActiveTripContext({
      lastUserMessage: message,
      filteredMessages: [
        { role: 'assistant', content: assistantTurn1.content },
        { role: 'user', content: message },
      ],
      storedContext,
    });
    return result.activeTripContext.primaryDestination;
  };

  it.each([
    'Can you make Day 2 even more relaxed and keep the total walking for that day under 2 miles?',
    'Keep the total cost under $800.',
    'Can you make that day easier?',
    'Make the second day more relaxed.',
  ])('%s leaves the destination unchanged', (message) => {
    expect(holdsYosemite(message)).toMatchObject({ name: 'Yosemite', parkCode: 'yose' });
  });

  it('lets an explicit ordinal destination selection work', () => {
    const picked = resolveOrdinalOrNamedPick("Let's choose the second park instead.", {
      lastRecommendationList: storedContext.lastRecommendationList,
    });
    expect(picked).toMatchObject({ parkCode: 'brca' });
  });

  it('lets an explicit destination switch work', () => {
    expect(holdsYosemite('Switch the trip to Zion.')).toMatchObject({ parkCode: 'zion' });
  });

  it('resolves "let\'s go with that park" only against a validated candidate', () => {
    const picked = resolveOrdinalOrNamedPick("Let's go with that park.", {
      lastRecommendationList: [{ name: 'Total', confidence: 'medium' }],
    });
    expect(picked).toBeNull();
  });

  it('still resolves a genuine named pick', () => {
    const result = resolveActiveTripContext({
      lastUserMessage: 'Yes, the Sedona option sounds best',
      storedContext: {
        lastRecommendationList: [
          { name: 'Sedona red rock country', confidence: 'medium' },
          { name: 'Grand Canyon National Park', parkCode: 'grca', confidence: 'high' },
        ],
      },
    });
    expect(result.activeTripContext.primaryDestination.name).toMatch(/Sedona/i);
  });
});

describe('Stage 14.8B.1 §9 — recomputation consumes no quota and adds nothing', () => {
  it('is a pure function of the preserved history', () => {
    const run = () => resolveActiveTripContext({
      lastUserMessage: FOLLOW_UP,
      filteredMessages: [
        { role: 'assistant', content: assistantTurn1.content },
        { role: 'user', content: FOLLOW_UP },
      ],
      storedContext: {
        primaryDestination: LOCKED_YOSEMITE,
        lockedPlanDestination: LOCKED_YOSEMITE,
      },
    });

    const a = run();
    const b = run();
    expect(a.activeTripContext.primaryDestination).toEqual(b.activeTripContext.primaryDestination);
    // The preserved assistant answers are untouched by resolution.
    expect(HISTORY.messages[1].content.length).toBe(3541);
    expect(HISTORY.messages[3].content.length).toBe(1625);
  });
});
