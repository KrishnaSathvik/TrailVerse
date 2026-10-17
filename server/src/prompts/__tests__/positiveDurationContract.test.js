'use strict';

/**
 * POSITIVE DURATION — one invariant, stated before attempt 1.
 *
 * `zero_duration_stops` cost a full second inference worth ~40% of turn wall
 * clock, twice on the same prompt and 17 times across the captured corpus. The
 * cause was a contract contradiction, not model incapacity:
 *
 *   attempt 1 received  "when those fields are missing, do not invent precision"
 *   repair received     "duration ... must be greater than zero for every stop"
 *
 * and the one place the invariant was actually written down —
 * `formatItineraryToolInstruction` — had zero call sites. The model complied the
 * moment it was told, on attempt 2, every time.
 *
 * 15 of 17 affected attempts zeroed EVERY stop on the affected days. That is
 * field omission by a model that was not asked, not 122 bad duration judgments.
 *
 * These tests pin the COMPOSED contract a real attempt-1 receives. A constant
 * that is correct in isolation is exactly the bug being fixed.
 */

const { getTaskContractV2 } = require('../trailieTaskContractsV2');
const {
  POSITIVE_DURATION_INVARIANT,
  buildStructuralRepairInstructions,
} = require('../../utils/itineraryStructuralValidation');

/** What a day-by-day itinerary turn actually resolves to. */
const architectContract = () => getTaskContractV2('architect').text;

describe('A — one source of truth', () => {
  test('the invariant states every part of the rule', () => {
    const text = POSITIVE_DURATION_INVARIANT;
    expect(text).toMatch(/positive duration/i);
    expect(text).toMatch(/never|do not/i);
    expect(text).toMatch(/\b0\b|zero/i);
    expect(text).toMatch(/placeholder/i);
    expect(text).toMatch(/planning estimate/i);
  });

  test('attempt 1 and the repair carry the SAME rule, not two wordings', () => {
    const repair = buildStructuralRepairInstructions({
      reasonCodes: ['zero_duration_stops'],
      dayDiagnostics: [{ dayNumber: 2, codes: ['zero_duration_stops'], zeroDurationStopNames: ['Welcome Center'] }],
    });
    expect(architectContract()).toContain(POSITIVE_DURATION_INVARIANT);
    expect(repair).toContain(POSITIVE_DURATION_INVARIANT);
  });

  test('the repair still names the specific failing days and stops', () => {
    const repair = buildStructuralRepairInstructions({
      reasonCodes: ['zero_duration_stops'],
      dayDiagnostics: [{ dayNumber: 2, codes: ['zero_duration_stops'], zeroDurationStopNames: ['Welcome Center'] }],
    });
    expect(repair).toMatch(/Day 2/);
    expect(repair).toMatch(/Welcome Center/);
    // ...and must not rebuild the day, which is a repair-only instruction.
    expect(repair).toMatch(/same stops|same order|do not add stops/i);
  });
});

describe('C — the composed attempt-1 contract', () => {
  const contract = architectContract();

  test('it requires a positive duration on every stop', () => {
    expect(contract).toMatch(/positive duration/i);
  });

  test('it says zero is invalid and not a placeholder', () => {
    expect(contract).toMatch(/placeholder/i);
    expect(contract).toMatch(/\b0\b|zero/);
  });

  test('it says a missing source duration does not justify zero', () => {
    expect(contract).toMatch(/planning estimate/i);
  });
});

describe('B/F — evidence truth versus plan authorship', () => {
  const contract = architectContract();

  /**
   * The semantic trap, not the prose. "Do not invent precision" is correct for
   * external facts — road restrictions, permit rules, trail exposure, official
   * hours. Applied to a planning field it tells the model to leave the itinerary
   * unbuildable. If the contract keeps that phrase, it must also draw the line.
   */
  test('a precision prohibition may not stand without the planning-field carve-out', () => {
    const prohibits = /do not invent precision/i.test(contract);
    if (!prohibits) return;
    expect(contract).toMatch(/planning estimate/i);
    // The prohibition must be scoped to source facts, not left to cover everything.
    expect(contract).toMatch(/coordinates|drive relationships|access timing|operational context/i);
    // And duration must be named on the authored side of the line.
    const durationOnAuthoredSide = /duration[^.]*planning estimate|planning estimate[^.]*duration/i;
    expect(contract).toMatch(durationOnAuthoredSide);
  });

  test('the contract does not let an estimate be passed off as evidence', () => {
    expect(contract).toMatch(/do not (present|claim|describe)[^.]*(estimate|planning)[^.]*(evidence|official|source)|estimate[^.]*not[^.]*(official|evidence)/i);
  });
});

describe('G — the corpus replay, offline only', () => {
  /**
   * The old contract's exact wording, as captured before this change. This is a
   * statement about the CONTRACT, which is verifiable by reading it — never a
   * claim that the captured outputs would have differed. That needs a live turn.
   */
  const OLD_LINE = 'use supplied duration, coordinates, drive relationships, access timing, '
    + 'and operational context to build that day. When those fields are missing, do not invent '
    + 'precision; keep the sequence flexible and acknowledge the limitation';

  test('the old line prohibited exactly what the validator required', () => {
    expect(OLD_LINE).toMatch(/do not invent\s+precision/i);
    expect(OLD_LINE).not.toMatch(/positive duration/i);
    expect(OLD_LINE).not.toMatch(/planning estimate/i);
  });

  test('the contract in force now contains what the old line lacked', () => {
    const contract = architectContract();
    expect(contract).toMatch(/positive duration/i);
    expect(contract).toMatch(/planning estimate/i);
  });
});
