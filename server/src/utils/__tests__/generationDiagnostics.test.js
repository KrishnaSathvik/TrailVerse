'use strict';

const {
  MAX_DAY_DIAGNOSTICS,
  MAX_ERRORS,
  MAX_IDENTITY_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_PATH_CHARS,
  boundedValidationDiagnostics,
  structuredOutputRepairInstructions,
} = require('../generationDiagnostics');

describe('generationDiagnostics bounded allowlist', () => {
  test('caps structural diagnostic count and every free-form field', () => {
    const diagnostics = boundedValidationDiagnostics({
      kind: 'structured_output',
      structuredStatus: 'malformed_tool',
      toolCallId: 'i'.repeat(500),
      rawToolArguments: 'RAW_TOOL_SECRET',
      structuralErrors: Array.from({ length: 20 }, (_, index) => ({
        code: 'invalid_type',
        path: `days.${index}.${'p'.repeat(500)}`,
        message: `Expected an array ${'m'.repeat(500)}`,
        stack: 'RAW_STACK_SECRET',
      })),
    });

    expect(diagnostics.structuralErrors).toHaveLength(MAX_ERRORS);
    expect(diagnostics.toolCallId.length).toBeLessThanOrEqual(MAX_IDENTITY_CHARS);
    for (const error of diagnostics.structuralErrors) {
      expect(error.path.length).toBeLessThanOrEqual(MAX_PATH_CHARS);
      expect(error.message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    }
    expect(JSON.stringify(diagnostics)).not.toMatch(/RAW_TOOL_SECRET|RAW_STACK_SECRET/);
  });

  test('caps semantic diagnostics and canonical experience identity', () => {
    const diagnostics = boundedValidationDiagnostics({
      kind: 'semantic_validation',
      prompt: 'RAW_PROMPT_SECRET',
      dayDiagnostics: Array.from({ length: 20 }, (_, index) => ({
        dayNumber: index + 1,
        codes: ['duplicate_base_experience'],
        duplicateExperienceConflicts: [{
          dayNumbers: [index + 1, index + 2],
          touchedDayNumbers: [index + 1],
          conflictType: 'touched_vs_untouched',
          experienceIdentity: 'x'.repeat(500),
          rawPlan: 'RAW_PLAN_SECRET',
        }],
      })),
    });

    expect(diagnostics.dayDiagnostics).toHaveLength(MAX_DAY_DIAGNOSTICS);
    expect(diagnostics.dayDiagnostics[0].duplicateExperienceConflicts[0].experienceIdentity.length)
      .toBeLessThanOrEqual(MAX_IDENTITY_CHARS);
    expect(JSON.stringify(diagnostics)).not.toMatch(/RAW_PROMPT_SECRET|RAW_PLAN_SECRET/);
  });

  test.each([
    ['incomplete_tool_arguments', /complete the tool arguments/i],
    ['truncated_tool_arguments', /complete itinerary tool arguments/i],
    ['no_tool_before_truncation', /call create_itinerary before the response limit/i],
  ])('projects %s into deterministic repair guidance', (code, expected) => {
    const instructions = structuredOutputRepairInstructions({
      kind: 'structured_output',
      structuredStatus: 'truncated',
      structuralErrors: [{ code }],
    });

    expect(instructions).toMatch(expected);
    expect(instructions).not.toContain(`- ${code}`);
  });
});
