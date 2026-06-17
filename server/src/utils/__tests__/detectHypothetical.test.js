const { detectHypothetical } = require('../constraintEngine');

describe('detectHypothetical', () => {
  test('Glacier backup plan for full parking is practical logistics, not scenario mode', () => {
    const msg =
      "I'm visiting Glacier in July with only one full day. What should I prioritize, and what's the backup plan if Logan Pass parking is full?";
    expect(detectHypothetical(msg)).toEqual({
      isHypothetical: false,
      scenarioDescription: null,
    });
  });

  test('what-if parking friction stays practical', () => {
    const msg = 'What if the Zion shuttle line is crazy long — what should we do instead?';
    expect(detectHypothetical(msg).isHypothetical).toBe(false);
  });

  test('what-if major closure stays hypothetical', () => {
    const msg =
      'What if Old Faithful and the Upper Geyser Basin were closed for maintenance? What would a 2-day Yellowstone trip look like?';
    const result = detectHypothetical(msg);
    expect(result.isHypothetical).toBe(true);
    expect(result.scenarioDescription).toMatch(/what if/i);
  });

  test('assuming road blocked stays hypothetical', () => {
    const msg = 'Assuming Going-to-the-Sun Road is blocked, how would you spend one day in Glacier?';
    expect(detectHypothetical(msg).isHypothetical).toBe(true);
  });

  test('backup plan for closed trail area stays hypothetical', () => {
    const msg = 'Backup plan if the Narrows trail is closed — what else is worth doing in Zion?';
    expect(detectHypothetical(msg).isHypothetical).toBe(true);
  });
});
